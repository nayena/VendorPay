import { CATEGORIES, distanceM } from "./format";
import type { MapSpot } from "@/components/LeafletMaps";
import type { Key } from "./i18n";
import type { Category, EventKind, Interest } from "./types";

// The discovery deck. Pure, so the browser can re-rank as soon as it knows where the
// shopper is, and so it can be unit-tested without a database.

export const EVENT_KINDS: Record<EventKind, { emoji: string; color: string }> = {
  popup: { emoji: "⛺", color: "#D1206A" },
  festival: { emoji: "🎉", color: "#7B3FA0" },
  market: { emoji: "🏮", color: "#C0360C" },
  food: { emoji: "🍲", color: "#B7791F" },
  music: { emoji: "🎶", color: "#0E6E8C" },
  art: { emoji: "🎨", color: "#1D6B43" },
};

/** Every interest a shopper can pick. "food" is both a category and an event kind; it appears once. */
export const INTERESTS: Interest[] = [
  ...(Object.keys(CATEGORIES) as Category[]),
  ...(Object.keys(EVENT_KINDS) as EventKind[]).filter((k) => !(k in CATEGORIES)),
];

export const isInterest = (s: string): s is Interest => (INTERESTS as string[]).includes(s);

export const interestEmoji = (i: Interest) => (i in CATEGORIES ? CATEGORIES[i as Category].emoji : EVENT_KINDS[i as EventKind].emoji);

/** Labels reuse the category names ("cat.*") and add event kinds ("kind.*"). */
export const interestLabel = (i: Interest): Key => (i in CATEGORIES ? `cat.${i as Category}` : `kind.${i as EventKind}`);

/** A card in the deck: an open stall or an upcoming event. */
export interface Card {
  type: "vendor" | "event";
  id: string;
  title: string;
  /** Owner name for stalls, host stall name for events. */
  subtitle: string;
  /** The event's description; null for stalls. */
  blurb: string | null;
  /** The stall's category, or the host stall's category for events. */
  category: Category;
  kind: EventKind | null;
  tags: Interest[];
  lat: number;
  lng: number;
  /** Landmark text, or null when the stall only shares an approximate area. */
  spot: string | null;
  approx: boolean;
  /** Stalls: open right now. Events use startsAt/endsAt instead. */
  isOpen: boolean;
  startsAt: number | null;
  endsAt: number | null;
  boostUntil: number;
  /** Average stars from ratings and reviews, or null when there are none. */
  stars: number | null;
}

export const cardKey = (c: Pick<Card, "type" | "id">) => `${c.type}:${c.id}`;
export const cardHref = (c: Pick<Card, "type" | "id">) => (c.type === "vendor" ? `/v/${c.id}` : `/e/${c.id}`);

export function isLive(c: Card, now: number) {
  if (c.type === "vendor") return c.isOpen;
  return c.startsAt !== null && c.endsAt !== null && c.startsAt <= now && now < c.endsAt;
}

/** The big emoji and color for a card: the event kind, or the stall's category. */
export function cardArt(c: Pick<Card, "kind" | "category">) {
  return c.kind ? EVENT_KINDS[c.kind] : CATEGORIES[c.category];
}

export function cardSpot(c: Card, now: number): MapSpot {
  const art = cardArt(c);
  return { key: cardKey(c), title: c.title, emoji: art.emoji, color: art.color, lat: c.lat, lng: c.lng, live: isLive(c, now) };
}

/** Walking directions in whatever maps app the phone uses. */
export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lng.toFixed(5)}&travelmode=walking`;

export interface FeedContext {
  origin: [number, number];
  interests: Interest[];
  now: number;
}

const HOUR = 60 * 60 * 1000;

/** Higher is better. Every part is bounded, so no single signal can swamp the rest. */
export function scoreCard(c: Card, { origin, interests, now }: FeedContext) {
  const d = distanceM(origin, [c.lat, c.lng]);
  let s = 40 * Math.exp(-d / 1500); // a 10-minute walk keeps about half the points
  if (interests.length > 0 && c.tags.some((t) => interests.includes(t))) s += 25;
  if (isLive(c, now)) s += 20;
  else if (c.startsAt !== null && c.startsAt > now) s += 15 * Math.exp(-(c.startsAt - now) / (12 * HOUR));
  if (c.stars !== null) s += (c.stars - 3) * 4;
  if (c.boostUntil > now) s += 15;
  return s;
}

/**
 * Sorts by score, then never lets three of the same type run in a row (when there is
 * another type left to show), so stalls and events stay mixed.
 */
export function rankFeed(cards: Card[], ctx: FeedContext): Card[] {
  const queue = cards
    .map((c) => ({ c, s: scoreCard(c, ctx) }))
    .sort((a, b) => b.s - a.s || a.c.id.localeCompare(b.c.id))
    .map((x) => x.c);
  const out: Card[] = [];
  while (queue.length) {
    const n = out.length;
    const streak = n >= 2 && out[n - 1].type === out[n - 2].type ? out[n - 1].type : null;
    const i = streak ? queue.findIndex((c) => c.type !== streak) : 0;
    out.push(queue.splice(i === -1 ? 0 : i, 1)[0]);
  }
  return out;
}
