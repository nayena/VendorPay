import type { T } from "./i18n";
import type { Category, TrustStats } from "./types";

// Labels live in i18n.ts as "cat.<category>".
export const CATEGORIES: Record<Category, { emoji: string; color: string }> = {
  food: { emoji: "🌮", color: "#C0360C" },
  produce: { emoji: "🍉", color: "#1D6B43" },
  drinks: { emoji: "🥤", color: "#0E6E8C" },
  snacks: { emoji: "🌽", color: "#B7791F" },
  crafts: { emoji: "🧶", color: "#7B3FA0" },
  flowers: { emoji: "💐", color: "#D1206A" },
};

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Open stalls with no sign of the vendor for this long are closed automatically. */
export const STALE_HOURS = 6;

/**
 * Trust score out of 5. Built from how many *different* customers paid (so a vendor
 * can't pump it by paying themselves), blended with star ratings once there are a few.
 */
export function trust(s: TrustStats) {
  if (s.customers < 3) return { score: null, level: "new" as const };
  const volume = 5 * (1 - Math.exp(-s.customers / 25));
  const raw = s.ratingCount >= 3 && s.ratingAvg !== null ? 0.6 * volume + 0.4 * s.ratingAvg : volume;
  const score = Math.max(1, Math.round(raw * 10) / 10);
  return { score, level: score >= 4 ? ("trusted" as const) : ("growing" as const) };
}

export function timeAgo(ts: number, t: T, now = Date.now()) {
  const min = Math.round((now - ts) / 60_000);
  if (min < 1) return t("time.now");
  if (min < 60) return t("time.min", { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t("time.h", { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? t("time.yesterday") : t("time.days", { n: d });
}

export const normalizePhone = (s: string) => s.replace(/\D/g, "").slice(-10);

function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Short code printed on a stall's sign and shown on its pay page. If someone sticks a
 * fake QR over the real one, the codes won't match.
 */
export function stallCode(vendorId: string) {
  const alphabet = "ACDEFHJKMNPRTUVWXY34679"; // no look-alikes (0/O, 1/I, 5/S…)
  let h = hash("stall:" + vendorId);
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length);
  }
  return out;
}

/** A fixed per-vendor offset of up to ~130 m. Fixed, so averaging many views can't undo it. */
export function approxPoint(vendorId: string, lat: number, lng: number): [number, number] {
  const h = hash("approx:" + vendorId);
  const dx = ((h & 0xffff) / 0xffff - 0.5) * 0.0024;
  const dy = ((h >>> 16) / 0xffff - 0.5) * 0.0024;
  return [lat + dy, lng + dx];
}

/** Customer id → the masked label vendors see. Stable, so regulars look the same each time. */
export const customerTag = (customerId: string) => "•• " + String(1000 + (hash("cust:" + customerId) % 9000));

export function distanceM(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(x));
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`);
