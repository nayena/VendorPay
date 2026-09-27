import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { msSinceMidnight, seed } from "./seed";
import type { Category, Circle, Transaction, TransactionKind, Vendor } from "./types";

// Data lives in Cloudflare D1 (SQLite). The schema is created and the demo data
// seeded automatically the first time any request touches the database.

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS vendors (
    id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, name TEXT NOT NULL, owner_name TEXT NOT NULL,
    category TEXT NOT NULL, spot TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL,
    is_open INTEGER NOT NULL, balance INTEGER NOT NULL, joined_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, kind TEXT NOT NULL, amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL, from_tag TEXT)`,
  `CREATE INDEX IF NOT EXISTS transactions_vendor ON transactions (vendor_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS circles (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, contribution INTEGER NOT NULL,
    round INTEGER NOT NULL, cycle INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS circle_members (
    circle_id TEXT NOT NULL, vendor_id TEXT NOT NULL UNIQUE, position INTEGER NOT NULL,
    PRIMARY KEY (circle_id, vendor_id))`,
  `CREATE TABLE IF NOT EXISTS circle_paid (
    circle_id TEXT NOT NULL, vendor_id TEXT NOT NULL, PRIMARY KEY (circle_id, vendor_id))`,
  `CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
];

// Re-check at most every 30s per worker instance, so a demo reset (which empties
// the tables; see scripts/reset-demo.sql) is re-seeded shortly afterwards.
const RECHECK_MS = 30_000;
let checkedAt = 0;
let checking: Promise<void> | null = null;

async function db(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const database = env.DB;
  if (Date.now() - checkedAt > RECHECK_MS) {
    checking ??= ensureSeeded(database).finally(() => (checking = null));
    await checking;
    checkedAt = Date.now();
  }
  return database;
}

async function isSeeded(d: D1Database) {
  try {
    return !!(await d.prepare(`SELECT 1 FROM meta WHERE key = 'seeded'`).first());
  } catch {
    return false; // tables don't exist yet
  }
}

async function ensureSeeded(d: D1Database) {
  if (await isSeeded(d)) return;
  await d.batch(SCHEMA.map((sql) => d.prepare(sql)));

  const data = seed();
  // D1 allows at most 100 bound parameters per statement, so insert in chunks.
  const insertMany = <T>(table: string, cols: string[], rows: T[], values: (r: T) => unknown[]) => {
    const per = Math.floor(100 / cols.length);
    const out: D1PreparedStatement[] = [];
    for (let i = 0; i < rows.length; i += per) {
      const chunk = rows.slice(i, i + per);
      const placeholders = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
      out.push(d.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES ${placeholders}`).bind(...chunk.flatMap(values)));
    }
    return out;
  };
  const circle = data.circles[0];

  try {
    // One transaction. The plain INSERT into meta fails if another request seeded
    // first, which rolls this whole batch back, so the demo data is never doubled.
    await d.batch([
      d.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', ?)`).bind(String(Date.now())),
      ...insertMany(
        "vendors",
        ["id", "phone", "name", "owner_name", "category", "spot", "lat", "lng", "is_open", "balance", "joined_at"],
        data.vendors,
        (v) => [v.id, v.phone, v.name, v.ownerName, v.category, v.spot, v.lat, v.lng, v.isOpen ? 1 : 0, v.balance, v.joinedAt],
      ),
      ...insertMany(
        "transactions",
        ["id", "vendor_id", "kind", "amount", "created_at", "from_tag"],
        data.transactions,
        (t) => [t.id, t.vendorId, t.kind, t.amount, t.createdAt, t.from ?? null],
      ),
      d
        .prepare(`INSERT INTO circles (id, name, contribution, round, cycle) VALUES (?, ?, ?, ?, ?)`)
        .bind(circle.id, circle.name, circle.contribution, circle.round, circle.cycle),
      ...insertMany("circle_members", ["circle_id", "vendor_id", "position"], circle.memberIds, (id) => [
        circle.id,
        id,
        circle.memberIds.indexOf(id),
      ]),
      ...insertMany("circle_paid", ["circle_id", "vendor_id"], circle.paidThisRound, (id) => [circle.id, id]),
    ]);
  } catch (e) {
    if (!(await isSeeded(d))) throw e;
  }
}

const newId = (prefix: string) => prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 10);

// ---------- row mapping ----------

type VendorRow = {
  id: string;
  phone: string;
  name: string;
  owner_name: string;
  category: Category;
  spot: string;
  lat: number;
  lng: number;
  is_open: number;
  balance: number;
  joined_at: number;
};

const toVendor = (r: VendorRow): Vendor => ({
  id: r.id,
  phone: r.phone,
  name: r.name,
  ownerName: r.owner_name,
  category: r.category,
  spot: r.spot,
  lat: r.lat,
  lng: r.lng,
  isOpen: r.is_open === 1,
  balance: r.balance,
  joinedAt: r.joined_at,
});

type TxRow = { id: string; vendor_id: string; kind: TransactionKind; amount: number; created_at: number; from_tag: string | null };

const toTx = (r: TxRow): Transaction => ({
  id: r.id,
  vendorId: r.vendor_id,
  kind: r.kind,
  amount: r.amount,
  createdAt: r.created_at,
  from: r.from_tag ?? undefined,
});

// ---------- reads ----------

export async function getVendor(id: string) {
  const row = await (await db()).prepare(`SELECT * FROM vendors WHERE id = ?`).bind(id).first<VendorRow>();
  return row ? toVendor(row) : null;
}

export async function getVendorByPhone(phone: string) {
  const row = await (await db()).prepare(`SELECT * FROM vendors WHERE phone = ?`).bind(phone).first<VendorRow>();
  return row ? toVendor(row) : null;
}

export async function getVendors(ids: string[]) {
  const vendors = await Promise.all(ids.map(getVendor));
  return vendors.filter((v) => v !== null);
}

/** Open stalls with their completed-sale counts, for the map. */
export async function openVendorsWithSales() {
  const { results } = await (await db())
    .prepare(
      `SELECT v.*, (SELECT COUNT(*) FROM transactions t WHERE t.vendor_id = v.id AND t.kind = 'payment') AS sales
       FROM vendors v WHERE v.is_open = 1 ORDER BY v.joined_at`,
    )
    .all<VendorRow & { sales: number }>();
  return results.map((r) => ({ ...toVendor(r), sales: r.sales }));
}

export async function countOpenVendors() {
  const row = await (await db()).prepare(`SELECT COUNT(*) AS n FROM vendors WHERE is_open = 1`).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function transactionsFor(vendorId: string, limit = 50) {
  const { results } = await (await db())
    .prepare(`SELECT * FROM transactions WHERE vendor_id = ? ORDER BY created_at DESC LIMIT ?`)
    .bind(vendorId, limit)
    .all<TxRow>();
  return results.map(toTx);
}

export async function completedSales(vendorId: string) {
  const row = await (await db())
    .prepare(`SELECT COUNT(*) AS n FROM transactions WHERE vendor_id = ? AND kind = 'payment'`)
    .bind(vendorId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function todaySales(vendorId: string) {
  const now = Date.now();
  const row = await (await db())
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM transactions
       WHERE vendor_id = ? AND kind = 'payment' AND created_at >= ?`,
    )
    .bind(vendorId, now - msSinceMidnight(now))
    .first<{ total: number; count: number }>();
  return { total: row?.total ?? 0, count: row?.count ?? 0 };
}

async function loadCircle(row: { id: string; name: string; contribution: number; round: number; cycle: number }): Promise<Circle> {
  const d = await db();
  const [members, paid] = await d.batch<{ vendor_id: string }>([
    d.prepare(`SELECT vendor_id FROM circle_members WHERE circle_id = ? ORDER BY position`).bind(row.id),
    d.prepare(`SELECT vendor_id FROM circle_paid WHERE circle_id = ?`).bind(row.id),
  ]);
  return {
    ...row,
    memberIds: members.results.map((r) => r.vendor_id),
    paidThisRound: paid.results.map((r) => r.vendor_id),
  };
}

type CircleRow = { id: string; name: string; contribution: number; round: number; cycle: number };

export async function circleFor(vendorId: string) {
  const row = await (await db())
    .prepare(`SELECT c.* FROM circles c JOIN circle_members m ON m.circle_id = c.id WHERE m.vendor_id = ?`)
    .bind(vendorId)
    .first<CircleRow>();
  return row ? loadCircle(row) : null;
}

export async function openCircles() {
  const { results } = await (await db()).prepare(`SELECT * FROM circles`).all<CircleRow>();
  return Promise.all(results.map(loadCircle));
}

async function getCircle(circleId: string) {
  const row = await (await db()).prepare(`SELECT * FROM circles WHERE id = ?`).bind(circleId).first<CircleRow>();
  if (!row) throw new Error("Savings circle not found.");
  return loadCircle(row);
}

// ---------- vendor writes ----------

export async function createVendor(input: {
  phone: string;
  name: string;
  ownerName: string;
  category: Category;
  spot: string;
  lat: number;
  lng: number;
}): Promise<Vendor> {
  if (await getVendorByPhone(input.phone)) throw new Error("This phone number already has a stall.");
  const vendor: Vendor = { ...input, id: newId("v"), isOpen: true, balance: 0, joinedAt: Date.now() };
  await (await db())
    .prepare(
      `INSERT INTO vendors (id, phone, name, owner_name, category, spot, lat, lng, is_open, balance, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`,
    )
    .bind(vendor.id, vendor.phone, vendor.name, vendor.ownerName, vendor.category, vendor.spot, vendor.lat, vendor.lng, vendor.joinedAt)
    .run();
  return vendor;
}

export async function setOpen(vendorId: string, isOpen: boolean) {
  await (await db()).prepare(`UPDATE vendors SET is_open = ? WHERE id = ?`).bind(isOpen ? 1 : 0, vendorId).run();
}

// ---------- simulated SMS one-time codes ----------

export async function issueOtp(phone: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await (await db())
    .prepare(`INSERT OR REPLACE INTO otps (phone, code, expires) VALUES (?, ?, ?)`)
    .bind(phone, code, Date.now() + 10 * 60_000)
    .run();
  return code;
}

export async function checkOtp(phone: string, code: string) {
  // Deleting only a matching, unexpired code makes each code single-use.
  const res = await (await db())
    .prepare(`DELETE FROM otps WHERE phone = ? AND code = ? AND expires > ?`)
    .bind(phone, code, Date.now())
    .run();
  return res.meta.changes === 1;
}

// ---------- simulated payments ----------

export async function pay(vendorId: string, amount: number): Promise<Transaction> {
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) throw new Error("Enter an amount between $1 and $10,000.");
  const d = await db();
  const tx: Transaction = {
    id: newId("t"),
    vendorId,
    kind: "payment",
    amount,
    createdAt: Date.now(),
    from: "•• " + String(Math.floor(1000 + Math.random() * 9000)),
  };
  const [credit] = await d.batch([
    d.prepare(`UPDATE vendors SET balance = balance + ? WHERE id = ?`).bind(amount, vendorId),
    d
      .prepare(`INSERT INTO transactions (id, vendor_id, kind, amount, created_at, from_tag) SELECT ?, ?, 'payment', ?, ?, ? WHERE changes() = 1`)
      .bind(tx.id, vendorId, amount, tx.createdAt, tx.from),
  ]);
  if (credit.meta.changes !== 1) throw new Error("Vendor not found.");
  return tx;
}

// ---------- savings circle (tanda) ----------

/** Pays one member's share. Atomic: the wallet check, debit and record happen together. */
async function contribute(c: Circle, vendorId: string) {
  if (!c.memberIds.includes(vendorId)) throw new Error("Not a member of this circle.");
  if (c.paidThisRound.includes(vendorId)) return;
  const d = await db();
  const [debit] = await d.batch([
    d
      .prepare(
        `UPDATE vendors SET balance = balance - ? WHERE id = ? AND balance >= ?
         AND NOT EXISTS (SELECT 1 FROM circle_paid WHERE circle_id = ? AND vendor_id = ?)`,
      )
      .bind(c.contribution, vendorId, c.contribution, c.id, vendorId),
    d.prepare(`INSERT INTO circle_paid (circle_id, vendor_id) SELECT ?, ? WHERE changes() = 1`).bind(c.id, vendorId),
    d
      .prepare(`INSERT INTO transactions (id, vendor_id, kind, amount, created_at) SELECT ?, ?, 'tanda-in', ?, ? WHERE changes() = 1`)
      .bind(newId("t"), vendorId, c.contribution, Date.now()),
  ]);
  if (debit.meta.changes === 0) {
    const paid = await d.prepare(`SELECT 1 FROM circle_paid WHERE circle_id = ? AND vendor_id = ?`).bind(c.id, vendorId).first();
    if (!paid) throw new Error(`You need $${c.contribution} in your wallet to chip in.`);
  }
}

/**
 * When everyone has paid in, the pot goes to this round's member and the next round starts.
 * Every statement is guarded on the current round, so concurrent calls pay out only once.
 */
async function payoutIfComplete(circleId: string) {
  const c = await getCircle(circleId);
  if (c.paidThisRound.length < c.memberIds.length) return;
  const recipientId = c.memberIds[c.round];
  const pot = c.contribution * c.memberIds.length;
  const nextRound = (c.round + 1) % c.memberIds.length;
  const nextCycle = nextRound === 0 ? c.cycle + 1 : c.cycle;
  const stillThisRound = `(SELECT round = ? AND cycle = ? FROM circles WHERE id = ?)`;
  const d = await db();
  await d.batch([
    d.prepare(`UPDATE vendors SET balance = balance + ? WHERE id = ? AND ${stillThisRound}`).bind(pot, recipientId, c.round, c.cycle, c.id),
    d
      .prepare(`INSERT INTO transactions (id, vendor_id, kind, amount, created_at) SELECT ?, ?, 'tanda-out', ?, ? WHERE changes() = 1`)
      .bind(newId("t"), recipientId, pot, Date.now()),
    d.prepare(`DELETE FROM circle_paid WHERE circle_id = ? AND ${stillThisRound}`).bind(c.id, c.round, c.cycle, c.id),
    d
      .prepare(`UPDATE circles SET round = ?, cycle = ? WHERE id = ? AND round = ? AND cycle = ?`)
      .bind(nextRound, nextCycle, c.id, c.round, c.cycle),
  ]);
}

export async function contributeToCircle(circleId: string, vendorId: string) {
  await contribute(await getCircle(circleId), vendorId);
  await payoutIfComplete(circleId);
}

/** Demo helper: every other member pays their share (skipping anyone short on funds). */
export async function simulateOthersContribute(circleId: string, vendorId: string) {
  const c = await getCircle(circleId);
  for (const id of c.memberIds) {
    if (id === vendorId) continue;
    try {
      await contribute(c, id);
    } catch {
      // A member without funds just hasn't paid yet.
    }
  }
  await payoutIfComplete(circleId);
}

export async function joinCircle(circleId: string, vendorId: string) {
  if (await circleFor(vendorId)) throw new Error("You're already in a savings circle.");
  await getCircle(circleId);
  // Joins at the end of the payout order. vendor_id is UNIQUE, so double-joins fail.
  await (await db())
    .prepare(
      `INSERT INTO circle_members (circle_id, vendor_id, position)
       SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM circle_members WHERE circle_id = ?`,
    )
    .bind(circleId, vendorId, circleId)
    .run();
}
