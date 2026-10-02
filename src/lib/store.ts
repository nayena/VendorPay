import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { customerTag, money, STALE_HOURS } from "./format";
import { AppError } from "./i18n";
import { msSinceMidnight, seed } from "./seed";
import type { Category, Circle, CircleInvite, MenuItem, Transaction, TransactionKind, TrustStats, Vendor } from "./types";

// Data lives in Cloudflare D1 (SQLite). The schema is created (or upgraded) and the demo
// data seeded automatically the first time any request touches the database.

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

// Version 2: menus, ratings, refunds, duplicate-safe payments, auto-close, circle invites.
// Columns are added with ALTER TABLE so databases created by version 1 upgrade in place.
const SCHEMA_VERSION = 2;
const V2_COLUMNS = [
  `ALTER TABLE vendors ADD COLUMN last_active_at INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE vendors ADD COLUMN auto_closed INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE vendors ADD COLUMN approx_location INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE vendors ADD COLUMN demo INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE transactions ADD COLUMN customer_id TEXT`,
  `ALTER TABLE transactions ADD COLUMN note TEXT`,
  `ALTER TABLE transactions ADD COLUMN refund_of TEXT`,
  `ALTER TABLE transactions ADD COLUMN request_id TEXT`,
  `ALTER TABLE circle_members ADD COLUMN auto_pay INTEGER NOT NULL DEFAULT 0`,
];
const V2_TABLES = [
  // A retried payment carries the same request id, so it can only be recorded once.
  `CREATE UNIQUE INDEX IF NOT EXISTS transactions_request ON transactions (request_id)`,
  // At most one refund per payment.
  `CREATE UNIQUE INDEX IF NOT EXISTS transactions_refund ON transactions (refund_of)`,
  `CREATE TABLE IF NOT EXISTS menu_items (
    id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, name TEXT NOT NULL, price INTEGER NOT NULL, position INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS menu_items_vendor ON menu_items (vendor_id, position)`,
  `CREATE TABLE IF NOT EXISTS ratings (
    id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, tx_id TEXT NOT NULL UNIQUE, stars INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ratings_vendor ON ratings (vendor_id)`,
  `CREATE TABLE IF NOT EXISTS circle_invites (
    circle_id TEXT NOT NULL, phone TEXT NOT NULL, invited_by TEXT NOT NULL, created_at INTEGER NOT NULL,
    PRIMARY KEY (circle_id, phone))`,
];

// Re-check at most every 30s per worker instance, so a demo reset (which empties
// the tables; see scripts/reset-demo.sql) is re-seeded shortly afterwards. The same
// tick closes stalls that were left "open" with nobody around.
const RECHECK_MS = 30_000;
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;
let checkedAt = 0;
let checking: Promise<void> | null = null;

async function db(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  const database = env.DB;
  if (Date.now() - checkedAt > RECHECK_MS) {
    checking ??= housekeeping(database).finally(() => (checking = null));
    await checking;
    checkedAt = Date.now();
  }
  return database;
}

async function housekeeping(d: D1Database) {
  await ensureSchema(d);
  await ensureSeeded(d);
  // Demo stalls are exempt so the public demo map never empties overnight.
  await d
    .prepare(`UPDATE vendors SET is_open = 0, auto_closed = 1 WHERE is_open = 1 AND demo = 0 AND last_active_at < ?`)
    .bind(Date.now() - STALE_MS)
    .run();
}

async function metaValue(d: D1Database, key: string) {
  try {
    return (await d.prepare(`SELECT value FROM meta WHERE key = ?`).bind(key).first<{ value: string }>())?.value ?? null;
  } catch {
    return null; // tables don't exist yet
  }
}

const isSeeded = async (d: D1Database) => (await metaValue(d, "seeded")) !== null;

async function ensureSchema(d: D1Database) {
  if (Number(await metaValue(d, "schema")) >= SCHEMA_VERSION) return;
  await d.batch(SCHEMA.map((sql) => d.prepare(sql)));
  for (const sql of V2_COLUMNS) {
    try {
      await d.prepare(sql).run();
    } catch (e) {
      // Already added (an earlier or concurrent upgrade).
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
  await d.batch(V2_TABLES.map((sql) => d.prepare(sql)));
  if (await isSeeded(d)) await backfillV2(d);
  await d.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)`).bind(String(SCHEMA_VERSION)).run();
}

/** Brings data created by version 1 up to date. Safe to run more than once. */
async function backfillV2(d: D1Database) {
  const data = seed();
  const demoIds = data.vendors.map((v) => v.id);
  await d.batch([
    d.prepare(`UPDATE vendors SET last_active_at = ? WHERE last_active_at = 0`).bind(Date.now()),
    d.prepare(`UPDATE vendors SET demo = 1 WHERE id IN (${demoIds.map(() => "?").join(",")})`).bind(...demoIds),
    // Old payments had a random label per payment; use it as the customer id.
    d.prepare(`UPDATE transactions SET customer_id = from_tag WHERE kind = 'payment' AND customer_id IS NULL`),
    ...data.menuItems.map((m, i) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO menu_items (id, vendor_id, name, price, position)
           SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM vendors WHERE id = ?)`,
        )
        .bind(m.id, m.vendorId, m.name, m.price, i, m.vendorId),
    ),
  ]);
}

async function ensureSeeded(d: D1Database) {
  if (await isSeeded(d)) return;

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
        [
          "id", "phone", "name", "owner_name", "category", "spot", "lat", "lng", "is_open", "balance", "joined_at",
          "last_active_at", "auto_closed", "approx_location", "demo",
        ],
        data.vendors,
        (v) => [
          v.id, v.phone, v.name, v.ownerName, v.category, v.spot, v.lat, v.lng, v.isOpen ? 1 : 0, v.balance, v.joinedAt,
          v.lastActiveAt, 0, v.approxLocation ? 1 : 0, v.demo ? 1 : 0,
        ],
      ),
      ...insertMany(
        "transactions",
        ["id", "vendor_id", "kind", "amount", "created_at", "from_tag", "customer_id"],
        data.transactions,
        (t) => [t.id, t.vendorId, t.kind, t.amount, t.createdAt, t.from ?? null, t.customerId ?? null],
      ),
      ...insertMany("ratings", ["id", "vendor_id", "tx_id", "stars", "created_at"], data.ratings, (r) => [
        r.id,
        r.vendorId,
        r.txId,
        r.stars,
        r.createdAt,
      ]),
      ...insertMany("menu_items", ["id", "vendor_id", "name", "price", "position"], data.menuItems, (m) => [
        m.id,
        m.vendorId,
        m.name,
        m.price,
        data.menuItems.indexOf(m),
      ]),
      d
        .prepare(`INSERT INTO circles (id, name, contribution, round, cycle) VALUES (?, ?, ?, ?, ?)`)
        .bind(circle.id, circle.name, circle.contribution, circle.round, circle.cycle),
      ...insertMany("circle_members", ["circle_id", "vendor_id", "position", "auto_pay"], circle.memberIds, (id) => [
        circle.id,
        id,
        circle.memberIds.indexOf(id),
        circle.autoPayIds.includes(id) ? 1 : 0,
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
  last_active_at: number;
  auto_closed: number;
  approx_location: number;
  demo: number;
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
  lastActiveAt: r.last_active_at,
  autoClosed: r.auto_closed === 1,
  approxLocation: r.approx_location === 1,
  demo: r.demo === 1,
});

type TxRow = {
  id: string;
  vendor_id: string;
  kind: TransactionKind;
  amount: number;
  created_at: number;
  from_tag: string | null;
  customer_id: string | null;
  note: string | null;
  refund_of: string | null;
};

const toTx = (r: TxRow): Transaction => ({
  id: r.id,
  vendorId: r.vendor_id,
  kind: r.kind,
  amount: r.amount,
  createdAt: r.created_at,
  from: r.from_tag ?? undefined,
  customerId: r.customer_id ?? undefined,
  note: r.note ?? undefined,
  refundOf: r.refund_of ?? undefined,
});

// A payment counts toward trust unless it was the vendor paying themselves or it was refunded.
const COUNTED = `t.kind = 'payment' AND COALESCE(t.customer_id, '') <> 'self'
  AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.refund_of = t.id)`;
const STATS_COLS = `
  (SELECT COUNT(*) FROM transactions t WHERE t.vendor_id = v.id AND ${COUNTED}) AS sales,
  (SELECT COUNT(DISTINCT t.customer_id) FROM transactions t WHERE t.vendor_id = v.id AND ${COUNTED}) AS customers,
  (SELECT AVG(stars) FROM ratings g WHERE g.vendor_id = v.id) AS rating_avg,
  (SELECT COUNT(*) FROM ratings g WHERE g.vendor_id = v.id) AS rating_count`;
type StatsRow = { sales: number; customers: number; rating_avg: number | null; rating_count: number };
const toStats = (r: StatsRow): TrustStats => ({
  sales: r.sales,
  customers: r.customers,
  ratingAvg: r.rating_avg,
  ratingCount: r.rating_count,
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

/** Open stalls with their trust stats, for the map. */
export async function openVendorsWithStats() {
  const { results } = await (await db())
    .prepare(`SELECT v.*, ${STATS_COLS} FROM vendors v WHERE v.is_open = 1 ORDER BY v.joined_at`)
    .all<VendorRow & StatsRow>();
  return results.map((r) => ({ ...toVendor(r), stats: toStats(r) }));
}

export async function trustStats(vendorId: string): Promise<TrustStats> {
  const row = await (await db())
    .prepare(`SELECT ${STATS_COLS} FROM vendors v WHERE v.id = ?`)
    .bind(vendorId)
    .first<StatsRow>();
  return row ? toStats(row) : { sales: 0, customers: 0, ratingAvg: null, ratingCount: 0 };
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

/** Payments (and refunds) since a point in time, oldest first, for insights. */
export async function paymentsSince(vendorId: string, since: number) {
  const { results } = await (await db())
    .prepare(
      `SELECT * FROM transactions WHERE vendor_id = ? AND kind IN ('payment', 'refund') AND created_at >= ?
       ORDER BY created_at`,
    )
    .bind(vendorId, since)
    .all<TxRow>();
  return results.map(toTx);
}

/** Today's takings: payments minus refunds, in the city's time zone. */
export async function todaySales(vendorId: string) {
  const now = Date.now();
  const row = await (await db())
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount ELSE -amount END), 0) AS total,
         COALESCE(SUM(kind = 'payment'), 0) - COALESCE(SUM(kind = 'refund'), 0) AS count
       FROM transactions WHERE vendor_id = ? AND kind IN ('payment', 'refund') AND created_at >= ?`,
    )
    .bind(vendorId, now - msSinceMidnight(now))
    .first<{ total: number; count: number }>();
  return { total: row?.total ?? 0, count: row?.count ?? 0 };
}

// ---------- menu ----------

const MAX_MENU = 12;

export async function menuFor(vendorId: string): Promise<MenuItem[]> {
  const { results } = await (await db())
    .prepare(`SELECT id, vendor_id, name, price FROM menu_items WHERE vendor_id = ? ORDER BY position`)
    .bind(vendorId)
    .all<{ id: string; vendor_id: string; name: string; price: number }>();
  return results.map((r) => ({ id: r.id, vendorId: r.vendor_id, name: r.name, price: r.price }));
}

export async function addMenuItem(vendorId: string, rawName: string, price: number) {
  const name = rawName.trim().slice(0, 30);
  if (!name) throw new AppError("err.itemName");
  if (!Number.isInteger(price) || price < 1 || price > 5000) throw new AppError("err.itemPrice");
  // The count check and insert are one statement, so two quick taps can't pass 12.
  const res = await (await db())
    .prepare(
      `INSERT INTO menu_items (id, vendor_id, name, price, position)
       SELECT ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM menu_items WHERE vendor_id = ?)
       WHERE (SELECT COUNT(*) FROM menu_items WHERE vendor_id = ?) < ?`,
    )
    .bind(newId("m"), vendorId, name, price, vendorId, vendorId, MAX_MENU)
    .run();
  if (res.meta.changes !== 1) throw new AppError("err.menuFull");
}

export async function removeMenuItem(vendorId: string, itemId: string) {
  await (await db()).prepare(`DELETE FROM menu_items WHERE id = ? AND vendor_id = ?`).bind(itemId, vendorId).run();
}

// ---------- circles (reads) ----------

type CircleRow = { id: string; name: string; contribution: number; round: number; cycle: number };

async function loadCircle(row: CircleRow): Promise<Circle> {
  const d = await db();
  const [members, paid] = await d.batch<{ vendor_id: string; auto_pay?: number }>([
    d.prepare(`SELECT vendor_id, auto_pay FROM circle_members WHERE circle_id = ? ORDER BY position`).bind(row.id),
    d.prepare(`SELECT vendor_id FROM circle_paid WHERE circle_id = ?`).bind(row.id),
  ]);
  return {
    ...row,
    memberIds: members.results.map((r) => r.vendor_id),
    paidThisRound: paid.results.map((r) => r.vendor_id),
    autoPayIds: members.results.filter((r) => r.auto_pay === 1).map((r) => r.vendor_id),
  };
}

export async function circleFor(vendorId: string) {
  const row = await (await db())
    .prepare(`SELECT c.* FROM circles c JOIN circle_members m ON m.circle_id = c.id WHERE m.vendor_id = ?`)
    .bind(vendorId)
    .first<CircleRow>();
  return row ? loadCircle(row) : null;
}

/** Circles with at least one member, for vendors looking to join. */
export async function openCircles() {
  const { results } = await (await db())
    .prepare(`SELECT c.* FROM circles c WHERE EXISTS (SELECT 1 FROM circle_members m WHERE m.circle_id = c.id)`)
    .all<CircleRow>();
  return Promise.all(results.map(loadCircle));
}

async function getCircle(circleId: string) {
  const row = await (await db()).prepare(`SELECT * FROM circles WHERE id = ?`).bind(circleId).first<CircleRow>();
  if (!row) throw new AppError("err.circleMissing");
  return loadCircle(row);
}

export async function invitesFor(vendor: Vendor): Promise<CircleInvite[]> {
  const { results } = await (await db())
    .prepare(
      `SELECT i.circle_id, c.name AS circle_name, v.name AS invited_by FROM circle_invites i
       JOIN circles c ON c.id = i.circle_id JOIN vendors v ON v.id = i.invited_by
       WHERE i.phone = ? ORDER BY i.created_at DESC`,
    )
    .bind(vendor.phone)
    .all<{ circle_id: string; circle_name: string; invited_by: string }>();
  return results.map((r) => ({ circleId: r.circle_id, circleName: r.circle_name, invitedBy: r.invited_by }));
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
  if (await getVendorByPhone(input.phone)) throw new AppError("err.phoneTaken");
  const now = Date.now();
  const vendor: Vendor = {
    ...input,
    id: newId("v"),
    isOpen: true,
    balance: 0,
    joinedAt: now,
    lastActiveAt: now,
    autoClosed: false,
    approxLocation: false,
    demo: false,
  };
  await (await db())
    .prepare(
      `INSERT INTO vendors (id, phone, name, owner_name, category, spot, lat, lng, is_open, balance, joined_at, last_active_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
    )
    .bind(vendor.id, vendor.phone, vendor.name, vendor.ownerName, vendor.category, vendor.spot, vendor.lat, vendor.lng, now, now)
    .run();
  return vendor;
}

export async function setOpen(vendorId: string, isOpen: boolean) {
  await (await db())
    .prepare(`UPDATE vendors SET is_open = ?, auto_closed = 0, last_active_at = ? WHERE id = ?`)
    .bind(isOpen ? 1 : 0, Date.now(), vendorId)
    .run();
}

export async function setApproxLocation(vendorId: string, on: boolean) {
  await (await db()).prepare(`UPDATE vendors SET approx_location = ? WHERE id = ?`).bind(on ? 1 : 0, vendorId).run();
}

/** Records that the vendor is around. Writes at most every 5 minutes. */
export async function touchActive(vendorId: string) {
  const now = Date.now();
  await (await db())
    .prepare(`UPDATE vendors SET last_active_at = ? WHERE id = ? AND last_active_at < ?`)
    .bind(now, vendorId, now - 5 * 60_000)
    .run();
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

export type PayInput = {
  vendorId: string;
  /** Typed amount. Ignored when `items` is given. */
  amount?: number;
  /** Menu items; the price is always taken from the server's menu, never the client. */
  items?: { id: string; qty: number }[];
  /** Generated once per checkout by the client, so retries can't charge twice. */
  requestId: string;
  /** Stable simulated customer id, or "self" for a vendor's test payment. */
  customerId: string;
};

export async function pay(input: PayInput): Promise<Transaction> {
  const { vendorId, requestId, customerId } = input;
  let amount = input.amount ?? 0;
  let note: string | null = null;

  if (Array.isArray(input.items) && input.items.length) {
    const menu = new Map((await menuFor(vendorId)).map((m) => [m.id, m]));
    const lines: string[] = [];
    amount = 0;
    for (const { id, qty } of input.items) {
      const item = menu.get(id);
      if (!item || !Number.isInteger(qty) || qty < 1 || qty > 50) throw new AppError("err.cartChanged");
      amount += item.price * qty;
      lines.push(`${qty}× ${item.name}`);
    }
    note = lines.join(", ").slice(0, 200);
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) throw new AppError("err.amount");
  if (typeof requestId !== "string" || !/^[\w-]{8,64}$/.test(requestId)) throw new AppError("err.generic");

  const d = await db();
  const tx: Transaction = {
    id: newId("t"),
    vendorId,
    kind: "payment",
    amount,
    createdAt: Date.now(),
    from: customerId === "self" ? undefined : customerTag(customerId),
    customerId,
    note: note ?? undefined,
  };
  // Record first, then credit only if the record went in. A repeated request id or an
  // unknown vendor inserts nothing, so the balance is never touched twice.
  const [insert] = await d.batch([
    d
      .prepare(
        `INSERT OR IGNORE INTO transactions (id, vendor_id, kind, amount, created_at, from_tag, customer_id, note, request_id)
         SELECT ?, ?, 'payment', ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM vendors WHERE id = ?)`,
      )
      .bind(tx.id, vendorId, amount, tx.createdAt, tx.from ?? null, customerId, note, requestId, vendorId),
    d
      .prepare(`UPDATE vendors SET balance = balance + ?, last_active_at = ? WHERE id = ? AND changes() = 1`)
      .bind(amount, tx.createdAt, vendorId),
  ]);

  if (insert.meta.changes !== 1) {
    const earlier = await d.prepare(`SELECT * FROM transactions WHERE request_id = ?`).bind(requestId).first<TxRow>();
    if (earlier && earlier.vendor_id === vendorId) return toTx(earlier); // a retry of a payment that went through
    throw new AppError("err.vendor");
  }

  // A vendor who opted in pays their savings-circle share as soon as they can afford it.
  await autoContribute(vendorId).catch(() => {});
  return tx;
}

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export async function refund(vendorId: string, paymentId: string): Promise<Transaction> {
  const d = await db();
  const original = await d
    .prepare(`SELECT * FROM transactions WHERE id = ? AND vendor_id = ? AND kind = 'payment'`)
    .bind(paymentId, vendorId)
    .first<TxRow>();
  if (!original) throw new AppError("err.refundMissing");
  if (original.created_at < Date.now() - REFUND_WINDOW_MS) throw new AppError("err.refundOld");

  const tx: Transaction = {
    id: newId("t"),
    vendorId,
    kind: "refund",
    amount: original.amount,
    createdAt: Date.now(),
    from: original.from_tag ?? undefined,
    customerId: original.customer_id ?? undefined,
    refundOf: original.id,
  };
  const [debit] = await d.batch([
    d
      .prepare(
        `UPDATE vendors SET balance = balance - ? WHERE id = ? AND balance >= ?
         AND NOT EXISTS (SELECT 1 FROM transactions WHERE refund_of = ?)`,
      )
      .bind(tx.amount, vendorId, tx.amount, original.id),
    d
      .prepare(
        `INSERT INTO transactions (id, vendor_id, kind, amount, created_at, from_tag, customer_id, refund_of)
         SELECT ?, ?, 'refund', ?, ?, ?, ?, ? WHERE changes() = 1`,
      )
      .bind(tx.id, vendorId, tx.amount, tx.createdAt, tx.from ?? null, tx.customerId ?? null, original.id),
  ]);
  if (debit.meta.changes !== 1) {
    const done = await d.prepare(`SELECT 1 FROM transactions WHERE refund_of = ?`).bind(original.id).first();
    throw new AppError(done ? "err.refundDone" : "err.refundFunds");
  }
  return tx;
}

const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** One rating per payment, only by the customer who paid, within a day. */
export async function rate(paymentId: string, customerId: string, stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError("err.generic");
  const d = await db();
  const res = await d
    .prepare(
      `INSERT OR IGNORE INTO ratings (id, vendor_id, tx_id, stars, created_at)
       SELECT ?, vendor_id, id, ?, ? FROM transactions
       WHERE id = ? AND kind = 'payment' AND customer_id = ? AND customer_id <> 'self' AND created_at > ?`,
    )
    .bind(newId("r"), stars, Date.now(), paymentId, customerId, Date.now() - RATE_WINDOW_MS)
    .run();
  if (res.meta.changes !== 1) {
    const done = await d.prepare(`SELECT 1 FROM ratings WHERE tx_id = ?`).bind(paymentId).first();
    throw new AppError(done ? "err.rated" : "err.rateMissing");
  }
}

// ---------- savings circle (tanda) ----------

/** Pays one member's share. Atomic: the wallet check, debit and record happen together. */
async function contribute(c: Circle, vendorId: string) {
  if (!c.memberIds.includes(vendorId)) throw new AppError("err.notMember");
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
    if (!paid) throw new AppError("err.needFunds", { amount: money(c.contribution) });
  }
}

/**
 * When everyone has paid in, the pot goes to this round's member and the next round starts.
 * Every statement is guarded on the current round, so concurrent calls pay out only once.
 */
async function payoutIfComplete(circleId: string) {
  const c = await getCircle(circleId);
  if (c.memberIds.length === 0 || c.paidThisRound.length < c.memberIds.length) return;
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
  // Auto-pay members chip into the new round on their next sale, not right now: if
  // everyone were on auto-pay, paying here would roll through every round at once.
}

export async function contributeToCircle(circleId: string, vendorId: string) {
  await contribute(await getCircle(circleId), vendorId);
  await payoutIfComplete(circleId);
}

/** Pays the vendor's share if they're on auto-pay, haven't paid, and can afford it. */
async function autoContribute(vendorId: string) {
  const c = await circleFor(vendorId);
  if (!c || !c.autoPayIds.includes(vendorId) || c.paidThisRound.includes(vendorId)) return;
  const vendor = await getVendor(vendorId);
  if (!vendor || vendor.balance < c.contribution) return;
  await contributeToCircle(c.id, vendorId);
}

export async function setAutoPay(vendorId: string, on: boolean) {
  await (await db()).prepare(`UPDATE circle_members SET auto_pay = ? WHERE vendor_id = ?`).bind(on ? 1 : 0, vendorId).run();
  if (on) await autoContribute(vendorId).catch(() => {});
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

/** New members need a few real sales, unless another member vouched for them with an invite. */
async function requireTrustToJoin(vendorId: string) {
  if ((await trustStats(vendorId)).sales < 3) throw new AppError("err.needTrust");
}

async function addMember(circleId: string, vendor: Vendor) {
  if (await circleFor(vendor.id)) throw new AppError("err.inCircle");
  // Joins at the end of the payout order, so a newcomer pays in for several weeks
  // before receiving. vendor_id is UNIQUE, so double-joins fail.
  const d = await db();
  await d.batch([
    d
      .prepare(
        `INSERT INTO circle_members (circle_id, vendor_id, position)
         SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM circle_members WHERE circle_id = ?`,
      )
      .bind(circleId, vendor.id, circleId),
    d.prepare(`DELETE FROM circle_invites WHERE phone = ?`).bind(vendor.phone),
  ]);
}

export async function joinCircle(circleId: string, vendorId: string) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new AppError("err.vendor");
  await getCircle(circleId);
  await requireTrustToJoin(vendorId);
  await addMember(circleId, vendor);
}

export async function acceptInvite(circleId: string, vendorId: string) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new AppError("err.vendor");
  const invite = await (await db())
    .prepare(`SELECT 1 FROM circle_invites WHERE circle_id = ? AND phone = ?`)
    .bind(circleId, vendor.phone)
    .first();
  if (!invite) throw new AppError("err.noInvite");
  await addMember(circleId, vendor);
}

export async function createCircle(vendorId: string, rawName: string, contribution: number) {
  const name = rawName.trim().slice(0, 40);
  if (!name) throw new AppError("err.circleName");
  if (!Number.isInteger(contribution) || contribution < 50 || contribution > 2000) throw new AppError("err.contribution");
  if (await circleFor(vendorId)) throw new AppError("err.inCircle");
  await requireTrustToJoin(vendorId);
  const id = newId("c");
  const d = await db();
  await d.batch([
    d.prepare(`INSERT INTO circles (id, name, contribution, round, cycle) VALUES (?, ?, ?, 0, 1)`).bind(id, name, contribution),
    d.prepare(`INSERT INTO circle_members (circle_id, vendor_id, position) VALUES (?, ?, 0)`).bind(id, vendorId),
  ]);
  return id;
}

/** Invites another vendor by phone. Returns their stall name for the confirmation. */
export async function invite(circleId: string, fromVendorId: string, phone: string) {
  const c = await getCircle(circleId);
  if (!c.memberIds.includes(fromVendorId)) throw new AppError("err.notMember");
  const target = await getVendorByPhone(phone);
  if (!target) throw new AppError("err.noSuchPhone");
  if (c.memberIds.includes(target.id)) throw new AppError("err.inviteSelf");
  if (await circleFor(target.id)) throw new AppError("err.theyInCircle");
  await (await db())
    .prepare(`INSERT OR IGNORE INTO circle_invites (circle_id, phone, invited_by, created_at) VALUES (?, ?, ?, ?)`)
    .bind(circleId, phone, fromVendorId, Date.now())
    .run();
  return target.name;
}

/** Checks a reminder makes sense (same circle, not paid yet) and returns the name to show. */
export async function remindable(circleId: string, fromVendorId: string, memberId: string) {
  const c = await getCircle(circleId);
  if (!c.memberIds.includes(fromVendorId) || !c.memberIds.includes(memberId)) throw new AppError("err.notMember");
  const member = await getVendor(memberId);
  if (!member) throw new AppError("err.vendor");
  return member.name;
}
