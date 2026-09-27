import "server-only";
import { CITY, seed } from "./seed";
import type { Category, Circle, Transaction, Vendor } from "./types";

// In-memory "database", seeded when the server starts. Kept on globalThis so it
// survives dev hot reloads and is shared by every route and server action.
type DB = ReturnType<typeof seed> & {
  otps: Map<string, { code: string; expires: number }>;
};

const g = globalThis as unknown as { __vendorpay?: DB };
const db: DB = (g.__vendorpay ??= { ...seed(), otps: new Map() });

let idN = 0;
const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(++idN).toString(36)}`;

// ---------- reads ----------

export function getVendor(id: string) {
  return db.vendors.find((v) => v.id === id) ?? null;
}

export function getVendorByPhone(phone: string) {
  return db.vendors.find((v) => v.phone === phone) ?? null;
}

export function listVendors() {
  return db.vendors;
}

export function transactionsFor(vendorId: string, limit = Infinity) {
  return db.transactions.filter((t) => t.vendorId === vendorId).slice(0, limit);
}

export function completedSales(vendorId: string) {
  return db.transactions.filter((t) => t.vendorId === vendorId && t.kind === "payment").length;
}

const dayKey = (ts: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CITY.timeZone }).format(ts);

export function todaySales(vendorId: string) {
  const today = dayKey(Date.now());
  const sales = db.transactions.filter(
    (t) => t.vendorId === vendorId && t.kind === "payment" && dayKey(t.createdAt) === today,
  );
  return { total: sales.reduce((s, t) => s + t.amount, 0), count: sales.length };
}

export function circleFor(vendorId: string) {
  return db.circles.find((c) => c.memberIds.includes(vendorId)) ?? null;
}

export function openCircles() {
  return db.circles;
}

// ---------- vendor writes ----------

export function createVendor(input: {
  phone: string;
  name: string;
  ownerName: string;
  category: Category;
  spot: string;
  lat: number;
  lng: number;
}): Vendor {
  if (getVendorByPhone(input.phone)) throw new Error("This phone number already has a stall.");
  const vendor: Vendor = { ...input, id: newId("v"), isOpen: true, balance: 0, joinedAt: Date.now() };
  db.vendors.push(vendor);
  return vendor;
}

export function setOpen(vendorId: string, isOpen: boolean) {
  const v = getVendor(vendorId);
  if (!v) throw new Error("Vendor not found.");
  v.isOpen = isOpen;
}

// ---------- simulated SMS one-time codes ----------

export function issueOtp(phone: string) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.otps.set(phone, { code, expires: Date.now() + 10 * 60_000 });
  return code;
}

export function checkOtp(phone: string, code: string) {
  const entry = db.otps.get(phone);
  if (!entry || entry.expires < Date.now() || entry.code !== code) return false;
  db.otps.delete(phone);
  return true;
}

// ---------- simulated payments ----------

function record(tx: Omit<Transaction, "id" | "createdAt">): Transaction {
  const full = { ...tx, id: newId("t"), createdAt: Date.now() };
  db.transactions.unshift(full);
  return full;
}

export function pay(vendorId: string, amount: number) {
  const v = getVendor(vendorId);
  if (!v) throw new Error("Vendor not found.");
  if (!Number.isInteger(amount) || amount < 1 || amount > 10_000) throw new Error("Enter an amount between $1 and $10,000.");
  v.balance += amount;
  return record({
    vendorId,
    kind: "payment",
    amount,
    from: "•• " + String(Math.floor(1000 + Math.random() * 9000)),
  });
}

// ---------- savings circle (tanda) ----------

function getCircle(circleId: string): Circle {
  const c = db.circles.find((c) => c.id === circleId);
  if (!c) throw new Error("Savings circle not found.");
  return c;
}

/** When everyone has paid in, the pot goes to this round's member and the next round starts. */
function payoutIfComplete(c: Circle) {
  if (c.paidThisRound.length < c.memberIds.length) return;
  const recipient = getVendor(c.memberIds[c.round]);
  const pot = c.contribution * c.memberIds.length;
  if (recipient) {
    recipient.balance += pot;
    record({ vendorId: recipient.id, kind: "tanda-out", amount: pot });
  }
  c.paidThisRound = [];
  c.round = (c.round + 1) % c.memberIds.length;
  if (c.round === 0) c.cycle += 1;
}

function contribute(c: Circle, vendorId: string) {
  const v = getVendor(vendorId);
  if (!v || !c.memberIds.includes(vendorId)) throw new Error("Not a member of this circle.");
  if (c.paidThisRound.includes(vendorId)) return;
  if (v.balance < c.contribution) throw new Error(`You need $${c.contribution} in your wallet to chip in.`);
  v.balance -= c.contribution;
  c.paidThisRound.push(vendorId);
  record({ vendorId, kind: "tanda-in", amount: c.contribution });
}

export function contributeToCircle(circleId: string, vendorId: string) {
  const c = getCircle(circleId);
  contribute(c, vendorId);
  payoutIfComplete(c);
}

/** Demo helper: every other member pays their share (skipping anyone short on funds). */
export function simulateOthersContribute(circleId: string, vendorId: string) {
  const c = getCircle(circleId);
  for (const id of c.memberIds) {
    if (id === vendorId || c.paidThisRound.includes(id)) continue;
    try {
      contribute(c, id);
    } catch {
      // A member without funds just hasn't paid yet.
    }
  }
  payoutIfComplete(c);
}

export function joinCircle(circleId: string, vendorId: string) {
  const c = getCircle(circleId);
  if (circleFor(vendorId)) throw new Error("You're already in a savings circle.");
  c.memberIds.push(vendorId); // joins at the end of the payout order
}
