import type { EventKind } from "./types";

// Points, levels and badges for shoppers. Pure: the store gathers the raw rows and
// these functions decide what they're worth.

export const POINTS = {
  save: 1,
  checkin: 20, // first visit to a stall
  checkinRepeat: 5,
  review: 10,
  festival: 25, // on top of the check-in
  pay: 5,
} as const;

export type PointReason = keyof typeof POINTS;

// Labels live in i18n.ts as "lvl.<key>".
export const LEVELS = [
  { key: "curious", min: 0, emoji: "👀" },
  { key: "explorer", min: 50, emoji: "🧭" },
  { key: "hunter", min: 150, emoji: "🌮" },
  { key: "legend", min: 400, emoji: "👑" },
] as const;

export type LevelKey = (typeof LEVELS)[number]["key"];

/** The level for a points total, and how far along the way to the next one (0–1). */
export function levelFor(points: number) {
  let i = 0;
  while (i + 1 < LEVELS.length && points >= LEVELS[i + 1].min) i++;
  const level = LEVELS[i];
  const next = LEVELS[i + 1] ?? null;
  const progress = next ? (points - level.min) / (next.min - level.min) : 1;
  return { level, index: i, next, progress: Math.max(0, Math.min(1, progress)) };
}

/** One check-in, as the store reads it back. */
export interface CheckinFact {
  vendorId: string;
  createdAt: number;
  eventKind: EventKind | null;
}

export interface ExplorerStats {
  checkins: number;
  vendors: number;
  festivals: number;
  markets: number;
  reviews: number;
  saves: number;
  earlyBird: number;
  weekend: number;
}

/** Hour (0–23) and weekday (0 = Sunday) in the city's time zone. */
function localTime(ts: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23", weekday: "short" }).formatToParts(ts);
  const hour = Number(parts.find((p) => p.type === "hour")!.value);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.find((p) => p.type === "weekday")!.value);
  return { hour, weekday };
}

export function statsFrom(
  checkins: CheckinFact[],
  counts: { reviews: number; saves: number },
  timeZone: string,
): ExplorerStats {
  let earlyBird = 0;
  let weekend = 0;
  for (const c of checkins) {
    const { hour, weekday } = localTime(c.createdAt, timeZone);
    if (hour < 9) earlyBird++;
    if (weekday === 0 || weekday === 6) weekend++;
  }
  return {
    checkins: checkins.length,
    vendors: new Set(checkins.map((c) => c.vendorId)).size,
    festivals: checkins.filter((c) => c.eventKind === "festival").length,
    markets: checkins.filter((c) => c.eventKind === "market").length,
    reviews: counts.reviews,
    saves: counts.saves,
    earlyBird,
    weekend,
  };
}

// Labels live in i18n.ts as "badge.<id>" and "badge.<id>.how".
export const BADGES = [
  { id: "firstCheckin", emoji: "📍", check: (s: ExplorerStats) => s.checkins >= 1 },
  { id: "firstFestival", emoji: "🎉", check: (s: ExplorerStats) => s.festivals >= 1 },
  { id: "fiveVendors", emoji: "🏅", check: (s: ExplorerStats) => s.vendors >= 5 },
  { id: "marketRegular", emoji: "🏮", check: (s: ExplorerStats) => s.markets >= 3 },
  { id: "firstReview", emoji: "✍️", check: (s: ExplorerStats) => s.reviews >= 1 },
  { id: "earlyBird", emoji: "🌅", check: (s: ExplorerStats) => s.earlyBird >= 1 },
  { id: "weekend", emoji: "🎪", check: (s: ExplorerStats) => s.weekend >= 3 },
  { id: "collector", emoji: "❤️", check: (s: ExplorerStats) => s.saves >= 10 },
] as const;

export type BadgeId = (typeof BADGES)[number]["id"];

export const badgeInfo = (id: string) => BADGES.find((b) => b.id === id);

/** Badges the stats now qualify for that the explorer doesn't have yet. */
export const newBadges = (stats: ExplorerStats, have: readonly string[]): BadgeId[] =>
  BADGES.filter((b) => !have.includes(b.id) && b.check(stats)).map((b) => b.id);
