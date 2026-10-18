import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { approxPoint, customerTag, distanceM, explorerNo, money, STALE_HOURS } from "./format";
import { EVENT_KINDS, isInterest, type Card } from "./feed";
import { newBadges, POINTS, statsFrom, type BadgeId, type CheckinFact, type PointReason } from "./gamify";
import { AppError } from "./i18n";
import { CITY, cityDay, msSinceMidnight, seed } from "./seed";
import type {
  Category,
  Circle,
  CircleInvite,
  EventKind,
  Explorer,
  Interest,
  MenuItem,
  Review,
  Transaction,
  TransactionKind,
  TrustStats,
  Vendor,
  VendorEvent,
} from "./types";

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

// Version 3: discovery. Events vendors promote, shopper swipes and saves, check-ins,
// written reviews, and the points and badges that make exploring a game.
const SCHEMA_VERSION = 3;
const V3_COLUMNS = [`ALTER TABLE vendors ADD COLUMN checkin_code TEXT`];
const V3_TABLES = [
  `CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, kind TEXT NOT NULL,
    tags TEXT NOT NULL, spot TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL, created_at INTEGER NOT NULL, boost_until INTEGER NOT NULL DEFAULT 0,
    demo INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS events_time ON events (ends_at, starts_at)`,
  `CREATE INDEX IF NOT EXISTS events_vendor ON events (vendor_id, starts_at)`,
  `CREATE TABLE IF NOT EXISTS explorers (
    id TEXT PRIMARY KEY, nickname TEXT, interests TEXT NOT NULL DEFAULT '', points INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS swipes (
    customer_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, dir TEXT NOT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY (customer_id, target_type, target_id))`,
  `CREATE INDEX IF NOT EXISTS swipes_target ON swipes (target_type, target_id, dir)`,
  // At most one check-in per shopper, per stall, per day.
  `CREATE TABLE IF NOT EXISTS checkins (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, vendor_id TEXT NOT NULL, event_id TEXT, event_kind TEXT,
    method TEXT NOT NULL, day TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (customer_id, vendor_id, day))`,
  `CREATE INDEX IF NOT EXISTS checkins_vendor ON checkins (vendor_id, created_at)`,
  // One review per shopper per stall; writing again edits it.
  `CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, vendor_id TEXT NOT NULL, stars INTEGER NOT NULL,
    text TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (customer_id, vendor_id))`,
  `CREATE INDEX IF NOT EXISTS reviews_vendor ON reviews (vendor_id, created_at DESC)`,
  // The same action (reason + ref) can only ever earn points once.
  `CREATE TABLE IF NOT EXISTS points_ledger (
    id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, reason TEXT NOT NULL, ref TEXT NOT NULL, amount INTEGER NOT NULL,
    created_at INTEGER NOT NULL, UNIQUE (customer_id, reason, ref))`,
  `CREATE TABLE IF NOT EXISTS explorer_badges (
    customer_id TEXT NOT NULL, badge TEXT NOT NULL, earned_at INTEGER NOT NULL, PRIMARY KEY (customer_id, badge))`,
];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

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
  // Demo events that have ended come back a day later (and promoted ones stay promoted).
  const now = Date.now();
  const shift = `((? - ends_at) / ${DAY_MS} + 1) * ${DAY_MS}`;
  await d
    .prepare(
      `UPDATE events SET starts_at = starts_at + ${shift}, ends_at = ends_at + ${shift},
       boost_until = CASE WHEN boost_until > 0 THEN ? ELSE 0 END
       WHERE demo = 1 AND ends_at <= ?`,
    )
    .bind(now, now, now + DAY_MS, now)
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
  const from = Number(await metaValue(d, "schema"));
  if (from >= SCHEMA_VERSION) return;
  await d.batch(SCHEMA.map((sql) => d.prepare(sql)));
  for (const sql of [...V2_COLUMNS, ...V3_COLUMNS]) {
    try {
      await d.prepare(sql).run();
    } catch (e) {
      // Already added (an earlier or concurrent upgrade).
      if (!/duplicate column/i.test(String(e))) throw e;
    }
  }
  await d.batch([...V2_TABLES, ...V3_TABLES].map((sql) => d.prepare(sql)));
  if (await isSeeded(d)) {
    if (from < 2) await backfillV2(d);
    if (from < 3) await d.batch(discoveryRows(d, seed(), true));
  }
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

// D1 allows at most 100 bound parameters per statement, so insert in chunks.
function insertMany<T>(
  d: D1Database,
  table: string,
  cols: string[],
  rows: T[],
  values: (r: T) => unknown[],
  orIgnore = false,
) {
  const per = Math.floor(100 / cols.length);
  const out: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per);
    const placeholders = chunk.map(() => `(${cols.map(() => "?").join(",")})`).join(",");
    out.push(
      d
        .prepare(`INSERT ${orIgnore ? "OR IGNORE " : ""}INTO ${table} (${cols.join(",")}) VALUES ${placeholders}`)
        .bind(...chunk.flatMap(values)),
    );
  }
  return out;
}

/** Demo events, explorers and their visits. `orIgnore` when adding them to an older database. */
function discoveryRows(d: D1Database, data: ReturnType<typeof seed>, orIgnore = false) {
  return [
    ...insertMany(
      d,
      "events",
      ["id", "vendor_id", "title", "description", "kind", "tags", "spot", "lat", "lng", "starts_at", "ends_at", "created_at", "boost_until", "demo"],
      data.events,
      (e) => [e.id, e.vendorId, e.title, e.description, e.kind, e.tags.join(","), e.spot, e.lat, e.lng, e.startsAt, e.endsAt, e.createdAt, e.boostUntil, 1],
      orIgnore,
    ),
    ...insertMany(
      d,
      "explorers",
      ["id", "nickname", "interests", "points", "created_at"],
      data.explorers,
      (x) => [x.id, x.nickname, x.interests.join(","), x.points, x.createdAt],
      orIgnore,
    ),
    ...insertMany(
      d,
      "checkins",
      ["id", "customer_id", "vendor_id", "method", "day", "created_at"],
      data.checkins,
      (c) => [c.id, c.customerId, c.vendorId, "qr", cityDay(c.createdAt), c.createdAt],
      orIgnore,
    ),
    ...insertMany(
      d,
      "reviews",
      ["id", "customer_id", "vendor_id", "stars", "text", "created_at"],
      data.reviews,
      (r) => [r.id, r.customerId, r.vendorId, r.stars, r.text, r.createdAt],
      orIgnore,
    ),
    ...insertMany(
      d,
      "points_ledger",
      ["id", "customer_id", "reason", "ref", "amount", "created_at"],
      data.points,
      (p) => [p.id, p.customerId, p.reason, p.ref, p.amount, p.createdAt],
      orIgnore,
    ),
  ];
}

async function ensureSeeded(d: D1Database) {
  if (await isSeeded(d)) return;

  const data = seed();
  const circle = data.circles[0];

  try {
    // One transaction. The plain INSERT into meta fails if another request seeded
    // first, which rolls this whole batch back, so the demo data is never doubled.
    await d.batch([
      d.prepare(`INSERT INTO meta (key, value) VALUES ('seeded', ?)`).bind(String(Date.now())),
      ...insertMany(
        d,
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
        d,
        "transactions",
        ["id", "vendor_id", "kind", "amount", "created_at", "from_tag", "customer_id"],
        data.transactions,
        (t) => [t.id, t.vendorId, t.kind, t.amount, t.createdAt, t.from ?? null, t.customerId ?? null],
      ),
      ...insertMany(d, "ratings", ["id", "vendor_id", "tx_id", "stars", "created_at"], data.ratings, (r) => [
        r.id,
        r.vendorId,
        r.txId,
        r.stars,
        r.createdAt,
      ]),
      ...insertMany(d, "menu_items", ["id", "vendor_id", "name", "price", "position"], data.menuItems, (m) => [
        m.id,
        m.vendorId,
        m.name,
        m.price,
        data.menuItems.indexOf(m),
      ]),
      d
        .prepare(`INSERT INTO circles (id, name, contribution, round, cycle) VALUES (?, ?, ?, ?, ?)`)
        .bind(circle.id, circle.name, circle.contribution, circle.round, circle.cycle),
      ...insertMany(d, "circle_members", ["circle_id", "vendor_id", "position", "auto_pay"], circle.memberIds, (id) => [
        circle.id,
        id,
        circle.memberIds.indexOf(id),
        circle.autoPayIds.includes(id) ? 1 : 0,
      ]),
      ...insertMany(d, "circle_paid", ["circle_id", "vendor_id"], circle.paidThisRound, (id) => [circle.id, id]),
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

// ---------- discovery: events ----------

type EventRow = {
  id: string;
  vendor_id: string;
  title: string;
  description: string;
  kind: EventKind;
  tags: string;
  spot: string;
  lat: number;
  lng: number;
  starts_at: number;
  ends_at: number;
  created_at: number;
  boost_until: number;
};

const splitInterests = (s: string) => s.split(",").filter(isInterest);

const toEvent = (r: EventRow): VendorEvent => ({
  id: r.id,
  vendorId: r.vendor_id,
  title: r.title,
  description: r.description,
  kind: r.kind,
  tags: splitInterests(r.tags),
  spot: r.spot,
  lat: r.lat,
  lng: r.lng,
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  createdAt: r.created_at,
  boostUntil: r.boost_until,
});

/** Events show up in the deck and on the map from this long before they start. */
const EVENT_WINDOW_MS = 72 * HOUR_MS;
const MAX_EVENTS = 10;

export type EventInput = {
  title: string;
  description: string;
  kind: string;
  tags: string[];
  spot: string;
  lat: number;
  lng: number;
  startsAt: number;
  endsAt: number;
};

function cleanEvent(input: EventInput, now: number, isNew: boolean) {
  const title = String(input.title ?? "").trim().slice(0, 50);
  if (!title) throw new AppError("err.eventTitle");
  if (!(input.kind in EVENT_KINDS)) throw new AppError("err.eventKind");
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng) || Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    throw new AppError("err.spot");
  }
  const { startsAt, endsAt } = input;
  if (!Number.isInteger(startsAt) || !Number.isInteger(endsAt) || endsAt <= startsAt || endsAt <= now) {
    throw new AppError("err.eventTime");
  }
  if (endsAt - startsAt > 3 * DAY_MS) throw new AppError("err.eventLong");
  if (startsAt > now + 60 * DAY_MS || (isNew && startsAt < now - HOUR_MS)) throw new AppError("err.eventTime");
  const tags = [...new Set((Array.isArray(input.tags) ? input.tags : []).filter(isInterest))].slice(0, 6);
  return {
    title,
    description: String(input.description ?? "").trim().slice(0, 280),
    kind: input.kind as EventKind,
    tags: tags.join(","),
    spot: String(input.spot ?? "").trim().slice(0, 60),
    lat: input.lat,
    lng: input.lng,
    startsAt,
    endsAt,
  };
}

export async function createEvent(vendorId: string, input: EventInput) {
  const now = Date.now();
  const e = cleanEvent(input, now, true);
  const id = newId("e");
  // The count check and insert are one statement, so quick double taps can't pass the limit.
  const res = await (await db())
    .prepare(
      `INSERT INTO events (id, vendor_id, title, description, kind, tags, spot, lat, lng, starts_at, ends_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM events WHERE vendor_id = ? AND ends_at > ?) < ?`,
    )
    .bind(id, vendorId, e.title, e.description, e.kind, e.tags, e.spot, e.lat, e.lng, e.startsAt, e.endsAt, now, vendorId, now, MAX_EVENTS)
    .run();
  if (res.meta.changes !== 1) throw new AppError("err.eventsFull");
  return id;
}

export async function updateEvent(vendorId: string, eventId: string, input: EventInput) {
  const e = cleanEvent(input, Date.now(), false);
  const res = await (await db())
    .prepare(
      `UPDATE events SET title = ?, description = ?, kind = ?, tags = ?, spot = ?, lat = ?, lng = ?, starts_at = ?, ends_at = ?
       WHERE id = ? AND vendor_id = ?`,
    )
    .bind(e.title, e.description, e.kind, e.tags, e.spot, e.lat, e.lng, e.startsAt, e.endsAt, eventId, vendorId)
    .run();
  if (res.meta.changes !== 1) throw new AppError("err.eventMissing");
}

export async function deleteEvent(vendorId: string, eventId: string) {
  await (await db()).prepare(`DELETE FROM events WHERE id = ? AND vendor_id = ?`).bind(eventId, vendorId).run();
}

/** Promoting puts an event near the top of nearby shoppers' decks for a day. Free in this prototype. */
export async function boostEvent(vendorId: string, eventId: string, on: boolean) {
  const res = await (await db())
    .prepare(`UPDATE events SET boost_until = ? WHERE id = ? AND vendor_id = ? AND ends_at > ?`)
    .bind(on ? Date.now() + DAY_MS : 0, eventId, vendorId, Date.now())
    .run();
  if (res.meta.changes !== 1) throw new AppError("err.eventMissing");
}

/** A vendor's events that haven't ended, soonest first. */
export async function eventsForVendor(vendorId: string) {
  const { results } = await (await db())
    .prepare(`SELECT * FROM events WHERE vendor_id = ? AND ends_at > ? ORDER BY starts_at`)
    .bind(vendorId, Date.now())
    .all<EventRow>();
  return results.map(toEvent);
}

export async function getEvent(id: string) {
  const row = await (await db()).prepare(`SELECT * FROM events WHERE id = ?`).bind(id).first<EventRow>();
  return row ? toEvent(row) : null;
}

/** Vendors move: "I'm open here now" opens the stall at the phone's location. */
export async function goLiveHere(vendorId: string, lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new AppError("err.spot");
  await (await db())
    .prepare(`UPDATE vendors SET is_open = 1, auto_closed = 0, lat = ?, lng = ?, last_active_at = ? WHERE id = ?`)
    .bind(lat, lng, Date.now(), vendorId)
    .run();
}

// ---------- discovery: cards ----------

// Average of payment ratings and written reviews together.
const STARS_COL = `(
  (COALESCE((SELECT SUM(stars) FROM ratings g WHERE g.vendor_id = v.id), 0)
   + COALESCE((SELECT SUM(stars) FROM reviews w WHERE w.vendor_id = v.id), 0)) * 1.0
  / NULLIF((SELECT COUNT(*) FROM ratings g WHERE g.vendor_id = v.id) + (SELECT COUNT(*) FROM reviews w WHERE w.vendor_id = v.id), 0)
) AS stars`;

const notSwiped = (type: "vendor" | "event", col: string) =>
  `NOT EXISTS (SELECT 1 FROM swipes s WHERE s.customer_id = ? AND s.target_type = '${type}' AND s.target_id = ${col})`;

type VendorCardRow = VendorRow & { stars: number | null };
type EventCardRow = EventRow & { host_name: string; host_category: Category; stars: number | null };

function vendorCard(r: VendorCardRow): Card {
  const v = toVendor(r);
  // Stalls that share only an approximate area never send their exact spot to the browser.
  const [lat, lng] = v.approxLocation ? approxPoint(v.id, v.lat, v.lng) : [v.lat, v.lng];
  return {
    type: "vendor",
    id: v.id,
    title: v.name,
    subtitle: v.ownerName,
    blurb: null,
    category: v.category,
    kind: null,
    tags: [v.category],
    lat,
    lng,
    spot: v.approxLocation ? null : v.spot,
    approx: v.approxLocation,
    isOpen: v.isOpen,
    startsAt: null,
    endsAt: null,
    boostUntil: 0,
    stars: r.stars,
  };
}

function eventCard(r: EventCardRow): Card {
  const e = toEvent(r);
  return {
    type: "event",
    id: e.id,
    title: e.title,
    subtitle: r.host_name,
    blurb: e.description || null,
    category: r.host_category,
    kind: e.kind,
    tags: [...new Set<Interest>([e.kind, r.host_category, ...e.tags])],
    lat: e.lat,
    lng: e.lng,
    spot: e.spot || null,
    approx: false,
    isOpen: false,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    boostUntil: e.boostUntil,
    stars: r.stars,
  };
}

const EVENT_CARD_SQL = `SELECT e.*, v.name AS host_name, v.category AS host_category, ${STARS_COL}
  FROM events e JOIN vendors v ON v.id = e.vendor_id`;

/**
 * Everything the deck could show this shopper: open stalls, plus events on now or
 * starting within three days, minus what they've already swiped. The browser ranks them.
 */
export async function discoverCards(customerId: string | null): Promise<Card[]> {
  const d = await db();
  const now = Date.now();
  const who = customerId ?? "";
  const [vendors, events] = await Promise.all([
    d.prepare(`SELECT v.*, ${STARS_COL} FROM vendors v WHERE v.is_open = 1 AND ${notSwiped("vendor", "v.id")}`).bind(who).all<VendorCardRow>(),
    d
      .prepare(`${EVENT_CARD_SQL} WHERE e.ends_at > ? AND e.starts_at < ? AND ${notSwiped("event", "e.id")}`)
      .bind(now, now + EVENT_WINDOW_MS, who)
      .all<EventCardRow>(),
  ]);
  return [...vendors.results.map(vendorCard), ...events.results.map(eventCard)];
}

/** Events for the map: on now or starting within three days. */
export async function mapEventCards(): Promise<Card[]> {
  const now = Date.now();
  const { results } = await (await db())
    .prepare(`${EVENT_CARD_SQL} WHERE e.ends_at > ? AND e.starts_at < ? ORDER BY e.starts_at`)
    .bind(now, now + EVENT_WINDOW_MS)
    .all<EventCardRow>();
  return results.map(eventCard);
}

export async function eventCardFor(eventId: string) {
  const row = await (await db()).prepare(`${EVENT_CARD_SQL} WHERE e.id = ?`).bind(eventId).first<EventCardRow>();
  return row ? eventCard(row) : null;
}

/** "Mis planes": what the shopper saved, newest first. Ended events drop off. */
export async function savedCards(customerId: string): Promise<Card[]> {
  const d = await db();
  const [vendors, events] = await Promise.all([
    d
      .prepare(
        `SELECT v.*, ${STARS_COL}, s.created_at AS saved_at FROM swipes s JOIN vendors v ON v.id = s.target_id
         WHERE s.customer_id = ? AND s.target_type = 'vendor' AND s.dir = 'save'`,
      )
      .bind(customerId)
      .all<VendorCardRow & { saved_at: number }>(),
    d
      .prepare(
        `SELECT e.*, v.name AS host_name, v.category AS host_category, ${STARS_COL}, s.created_at AS saved_at
         FROM swipes s JOIN events e ON e.id = s.target_id JOIN vendors v ON v.id = e.vendor_id
         WHERE s.customer_id = ? AND s.target_type = 'event' AND s.dir = 'save' AND e.ends_at > ?`,
      )
      .bind(customerId, Date.now())
      .all<EventCardRow & { saved_at: number }>(),
  ]);
  return [
    ...vendors.results.map((r) => ({ card: vendorCard(r), at: r.saved_at })),
    ...events.results.map((r) => ({ card: eventCard(r), at: r.saved_at })),
  ]
    .sort((a, b) => b.at - a.at)
    .map((x) => x.card);
}

export async function isSaved(customerId: string | null, type: "vendor" | "event", id: string) {
  if (!customerId) return false;
  const row = await (await db())
    .prepare(`SELECT 1 FROM swipes WHERE customer_id = ? AND target_type = ? AND target_id = ? AND dir = 'save'`)
    .bind(customerId, type, id)
    .first();
  return row !== null;
}

/** Records a swipe (or a change of mind). Saving earns a point the first time. */
export async function recordSwipe(customerId: string, type: "vendor" | "event", id: string, dir: "save" | "skip") {
  if ((type !== "vendor" && type !== "event") || (dir !== "save" && dir !== "skip")) throw new AppError("err.generic");
  const d = await db();
  const exists =
    type === "vendor"
      ? await d.prepare(`SELECT 1 FROM vendors WHERE id = ?`).bind(id).first()
      : await d.prepare(`SELECT 1 FROM events WHERE id = ? AND ends_at > ?`).bind(id, Date.now()).first();
  if (!exists) throw new AppError(type === "vendor" ? "err.vendor" : "err.eventMissing");
  await d
    .prepare(
      `INSERT INTO swipes (customer_id, target_type, target_id, dir, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (customer_id, target_type, target_id) DO UPDATE SET dir = excluded.dir, created_at = excluded.created_at`,
    )
    .bind(customerId, type, id, dir, Date.now())
    .run();
  if (dir === "skip") return { points: 0, badges: [] as BadgeId[] };
  const points = await award(customerId, "save", `${type}:${id}`);
  return { points, badges: points ? await refreshBadges(customerId) : [] };
}

// ---------- discovery: explorers, points and badges ----------

type ExplorerRow = { id: string; nickname: string | null; interests: string; points: number; created_at: number };

const toExplorer = (r: ExplorerRow): Explorer => ({
  id: r.id,
  nickname: r.nickname,
  interests: splitInterests(r.interests),
  points: r.points,
  createdAt: r.created_at,
});

const ensureExplorer = (d: D1Database, customerId: string) =>
  d.prepare(`INSERT OR IGNORE INTO explorers (id, nickname, interests, points, created_at) VALUES (?, NULL, '', 0, ?)`).bind(customerId, Date.now());

export async function getExplorer(customerId: string | null) {
  if (!customerId) return null;
  const row = await (await db()).prepare(`SELECT * FROM explorers WHERE id = ?`).bind(customerId).first<ExplorerRow>();
  return row ? toExplorer(row) : null;
}

export async function saveInterests(customerId: string, interests: string[]) {
  const clean = [...new Set((Array.isArray(interests) ? interests : []).filter(isInterest))];
  const d = await db();
  await d.batch([
    ensureExplorer(d, customerId),
    d.prepare(`UPDATE explorers SET interests = ? WHERE id = ?`).bind(clean.join(","), customerId),
  ]);
}

export async function setNickname(customerId: string, raw: string) {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (name.length < 2) throw new AppError("err.nickname");
  const d = await db();
  await d.batch([ensureExplorer(d, customerId), d.prepare(`UPDATE explorers SET nickname = ? WHERE id = ?`).bind(name, customerId)]);
}

/** Adds points once per (reason, ref). Returns the points added: 0 if this was already counted. */
async function award(customerId: string, reason: PointReason, ref: string) {
  const amount = POINTS[reason];
  const d = await db();
  const [, ledger] = await d.batch([
    ensureExplorer(d, customerId),
    d
      .prepare(`INSERT OR IGNORE INTO points_ledger (id, customer_id, reason, ref, amount, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(newId("p"), customerId, reason, ref, amount, Date.now()),
    d.prepare(`UPDATE explorers SET points = points + ? WHERE id = ? AND changes() = 1`).bind(amount, customerId),
  ]);
  return ledger.meta.changes === 1 ? amount : 0;
}

/** Points for paying through VendorPay. Never blocks the payment. */
export async function awardPayment(customerId: string, paymentId: string) {
  const points = await award(customerId, "pay", paymentId);
  return { points, badges: points ? await refreshBadges(customerId) : [] };
}

async function explorerFacts(customerId: string) {
  const d = await db();
  const [checkins, counts, badges] = await Promise.all([
    d
      .prepare(`SELECT vendor_id, created_at, event_kind FROM checkins WHERE customer_id = ?`)
      .bind(customerId)
      .all<{ vendor_id: string; created_at: number; event_kind: EventKind | null }>(),
    d
      .prepare(
        `SELECT (SELECT COUNT(*) FROM reviews WHERE customer_id = ?1) AS reviews,
                (SELECT COUNT(*) FROM swipes WHERE customer_id = ?1 AND dir = 'save') AS saves`,
      )
      .bind(customerId)
      .first<{ reviews: number; saves: number }>(),
    d
      .prepare(`SELECT badge, earned_at FROM explorer_badges WHERE customer_id = ? ORDER BY earned_at`)
      .bind(customerId)
      .all<{ badge: string; earned_at: number }>(),
  ]);
  const facts: CheckinFact[] = checkins.results.map((c) => ({ vendorId: c.vendor_id, createdAt: c.created_at, eventKind: c.event_kind }));
  const stats = statsFrom(facts, counts ?? { reviews: 0, saves: 0 }, CITY.timeZone);
  return { stats, badges: badges.results.map((b) => ({ id: b.badge, earnedAt: b.earned_at })) };
}

/** Grants any badges the explorer has newly qualified for, and returns them. */
async function refreshBadges(customerId: string): Promise<BadgeId[]> {
  const { stats, badges } = await explorerFacts(customerId);
  const fresh = newBadges(
    stats,
    badges.map((b) => b.id),
  );
  if (fresh.length) {
    const d = await db();
    const now = Date.now();
    await d.batch(
      fresh.map((b) =>
        d.prepare(`INSERT OR IGNORE INTO explorer_badges (customer_id, badge, earned_at) VALUES (?, ?, ?)`).bind(customerId, b, now),
      ),
    );
  }
  return fresh;
}

/** Everything the "Yo" page shows. */
export async function explorerProfile(customerId: string | null) {
  const explorer = await getExplorer(customerId);
  if (!customerId || !explorer) return null;
  const d = await db();
  const [{ stats, badges }, rank, recent] = await Promise.all([
    explorerFacts(customerId),
    d
      .prepare(`SELECT COUNT(*) + 1 AS n FROM explorers WHERE points > ?`)
      .bind(explorer.points)
      .first<{ n: number }>(),
    d
      .prepare(
        `SELECT c.id, c.vendor_id, c.created_at, v.name AS vendor_name, v.category, e.title AS event_title
         FROM checkins c JOIN vendors v ON v.id = c.vendor_id LEFT JOIN events e ON e.id = c.event_id
         WHERE c.customer_id = ? ORDER BY c.created_at DESC LIMIT 10`,
      )
      .bind(customerId)
      .all<{ id: string; vendor_id: string; created_at: number; vendor_name: string; category: Category; event_title: string | null }>(),
  ]);
  return {
    explorer,
    stats,
    badges,
    rank: rank?.n ?? 1,
    recent: recent.results.map((r) => ({
      id: r.id,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      category: r.category,
      eventTitle: r.event_title,
      at: r.created_at,
    })),
  };
}

// ---------- discovery: check-ins ----------

const CHECKIN_RADIUS_M = 150;
// Stalls that hide their exact spot are checked against their public, fuzzed point,
// with more slack, so failed check-ins can't be used to find the real one.
const CHECKIN_RADIUS_APPROX_M = 350;

/** The secret in a stall's check-in QR. Created the first time it's needed. */
export async function checkinCode(vendorId: string) {
  const d = await db();
  await d
    .prepare(`UPDATE vendors SET checkin_code = ? WHERE id = ? AND checkin_code IS NULL`)
    .bind(crypto.randomUUID().replace(/-/g, "").slice(0, 12), vendorId)
    .run();
  const row = await d.prepare(`SELECT checkin_code FROM vendors WHERE id = ?`).bind(vendorId).first<{ checkin_code: string | null }>();
  return row?.checkin_code ?? null;
}

export type CheckinProof = { method: "gps"; lat: number; lng: number; eventId?: string } | { method: "qr"; code: string };

export async function checkIn(customerId: string, vendorId: string, proof: CheckinProof) {
  const vendor = await getVendor(vendorId);
  if (!vendor) throw new AppError("err.vendor");
  const now = Date.now();
  const d = await db();
  const { results } = await d
    .prepare(`SELECT * FROM events WHERE vendor_id = ? AND starts_at <= ? AND ends_at > ? ORDER BY starts_at DESC`)
    .bind(vendorId, now, now)
    .all<EventRow>();
  const live = results.map(toEvent);

  let event: VendorEvent | null = null;
  if (proof.method === "qr") {
    if (typeof proof.code !== "string" || proof.code !== (await checkinCode(vendorId))) throw new AppError("err.checkinCode");
    event = live[0] ?? null;
  } else if (proof.method === "gps") {
    if (!Number.isFinite(proof.lat) || !Number.isFinite(proof.lng)) throw new AppError("err.generic");
    const here: [number, number] = [proof.lat, proof.lng];
    event = live.find((e) => (!proof.eventId || e.id === proof.eventId) && distanceM(here, [e.lat, e.lng]) <= CHECKIN_RADIUS_M) ?? null;
    const stall: [number, number] = vendor.approxLocation ? approxPoint(vendor.id, vendor.lat, vendor.lng) : [vendor.lat, vendor.lng];
    const atStall = vendor.isOpen && distanceM(here, stall) <= (vendor.approxLocation ? CHECKIN_RADIUS_APPROX_M : CHECKIN_RADIUS_M);
    if (!event && !atStall) throw new AppError("err.checkinFar");
  } else {
    throw new AppError("err.generic");
  }

  const id = newId("ci");
  const [insert, before] = await d.batch<{ n: number }>([
    d
      .prepare(
        `INSERT OR IGNORE INTO checkins (id, customer_id, vendor_id, event_id, event_kind, method, day, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, customerId, vendorId, event?.id ?? null, event?.kind ?? null, proof.method, cityDay(now), now),
    d.prepare(`SELECT COUNT(*) AS n FROM checkins WHERE customer_id = ? AND vendor_id = ?`).bind(customerId, vendorId),
  ]);
  if (insert.meta.changes !== 1) throw new AppError("err.checkedIn");
  const first = before.results[0]?.n === 1;
  let points = await award(customerId, first ? "checkin" : "checkinRepeat", id);
  if (event?.kind === "festival") points += await award(customerId, "festival", event.id);
  return { points, badges: await refreshBadges(customerId), first, eventTitle: event?.title ?? null };
}

// ---------- discovery: reviews ----------

/** Shoppers can review a stall they've checked in at or paid (and not been refunded). */
export async function canReview(customerId: string | null, vendorId: string) {
  if (!customerId) return false;
  const row = await (await db())
    .prepare(
      `SELECT EXISTS (SELECT 1 FROM checkins WHERE customer_id = ?1 AND vendor_id = ?2)
           OR EXISTS (SELECT 1 FROM transactions t WHERE t.customer_id = ?1 AND t.vendor_id = ?2 AND ${COUNTED}) AS ok`,
    )
    .bind(customerId, vendorId)
    .first<{ ok: number }>();
  return row?.ok === 1;
}

export async function upsertReview(customerId: string, vendorId: string, stars: number, rawText: string) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new AppError("err.stars");
  const text = String(rawText ?? "").trim().slice(0, 280);
  if (!(await canReview(customerId, vendorId))) throw new AppError("err.reviewFirst");
  await (await db())
    .prepare(
      `INSERT INTO reviews (id, customer_id, vendor_id, stars, text, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (customer_id, vendor_id) DO UPDATE SET stars = excluded.stars, text = excluded.text, created_at = excluded.created_at`,
    )
    .bind(newId("rv"), customerId, vendorId, stars, text, Date.now())
    .run();
  const points = await award(customerId, "review", vendorId);
  return { points, badges: await refreshBadges(customerId) };
}

export async function reviewsFor(vendorId: string, viewer: string | null, limit = 20): Promise<Review[]> {
  const { results } = await (await db())
    .prepare(
      `SELECT r.id, r.customer_id, r.vendor_id, r.stars, r.text, r.created_at, x.nickname
       FROM reviews r LEFT JOIN explorers x ON x.id = r.customer_id
       WHERE r.vendor_id = ? ORDER BY r.created_at DESC LIMIT ?`,
    )
    .bind(vendorId, limit)
    .all<{ id: string; customer_id: string; vendor_id: string; stars: number; text: string; created_at: number; nickname: string | null }>();
  return results.map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    stars: r.stars,
    text: r.text,
    createdAt: r.created_at,
    author: r.nickname,
    authorNo: explorerNo(r.customer_id),
    mine: r.customer_id === viewer,
  }));
}

// ---------- discovery: leaderboards and vendor stats ----------

export async function topExplorers(limit = 20) {
  const { results } = await (await db())
    .prepare(`SELECT id, nickname, points FROM explorers WHERE points > 0 ORDER BY points DESC, created_at LIMIT ?`)
    .bind(limit)
    .all<{ id: string; nickname: string | null; points: number }>();
  return results.map((r) => ({ id: r.id, nickname: r.nickname, no: explorerNo(r.id), points: r.points }));
}

// A stall's saves count its own card and its events' cards.
const SAVES_SINCE = `(SELECT COUNT(*) FROM swipes s WHERE s.dir = 'save' AND s.created_at >= ?1 AND (
  (s.target_type = 'vendor' AND s.target_id = v.id)
  OR (s.target_type = 'event' AND s.target_id IN (SELECT id FROM events WHERE vendor_id = v.id))))`;
const CHECKINS_SINCE = `(SELECT COUNT(*) FROM checkins c WHERE c.vendor_id = v.id AND c.created_at >= ?1)`;

/** Stalls ranked by how much people discovered them this week. A visit counts more than a save. */
export async function topVendors(sinceMs = 7 * DAY_MS, limit = 10) {
  const { results } = await (await db())
    .prepare(
      `SELECT * FROM (SELECT v.id, v.name, v.category, ${CHECKINS_SINCE} AS checkins, ${SAVES_SINCE} AS saves FROM vendors v)
       WHERE checkins + saves > 0 ORDER BY checkins * 3 + saves DESC, name LIMIT ?2`,
    )
    .bind(Date.now() - sinceMs, limit)
    .all<{ id: string; name: string; category: Category; checkins: number; saves: number }>();
  return results;
}

/** For the vendor dashboard: how discoverable the stall was this week. */
export async function vendorWeek(vendorId: string) {
  const since = Date.now() - 7 * DAY_MS;
  const row = await (await db())
    .prepare(
      `SELECT ${CHECKINS_SINCE} AS checkins, ${SAVES_SINCE} AS saves,
              (SELECT COUNT(*) FROM reviews r WHERE r.vendor_id = v.id AND r.created_at >= ?1) AS reviews
       FROM vendors v WHERE v.id = ?2`,
    )
    .bind(since, vendorId)
    .first<{ checkins: number; saves: number; reviews: number }>();
  return row ?? { checkins: 0, saves: 0, reviews: 0 };
}
