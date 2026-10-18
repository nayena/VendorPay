import { describe, expect, it } from "vitest";
import { cardKey, isLive, rankFeed, scoreCard, type Card } from "./feed";

const NOW = Date.UTC(2026, 9, 18, 18, 0);
const HOUR = 60 * 60 * 1000;
const HERE: [number, number] = [19.4326, -99.1332];

function card(over: Partial<Card> & Pick<Card, "id">): Card {
  return {
    type: "vendor",
    title: over.id,
    subtitle: "",
    blurb: null,
    category: "food",
    kind: null,
    tags: ["food"],
    lat: HERE[0],
    lng: HERE[1],
    spot: null,
    approx: false,
    isOpen: true,
    startsAt: null,
    endsAt: null,
    boostUntil: 0,
    stars: null,
    ...over,
  };
}

const event = (id: string, startH: number, hours: number, over: Partial<Card> = {}) =>
  card({ id, type: "event", kind: "market", isOpen: false, startsAt: NOW + startH * HOUR, endsAt: NOW + (startH + hours) * HOUR, ...over });

const ctx = { origin: HERE, interests: [], now: NOW };

describe("isLive", () => {
  it("is the open flag for stalls and the time window for events", () => {
    expect(isLive(card({ id: "a", isOpen: true }), NOW)).toBe(true);
    expect(isLive(card({ id: "b", isOpen: false }), NOW)).toBe(false);
    expect(isLive(event("on", -1, 2), NOW)).toBe(true);
    expect(isLive(event("later", 1, 2), NOW)).toBe(false);
    expect(isLive(event("over", -3, 2), NOW)).toBe(false);
  });
});

describe("scoreCard", () => {
  it("prefers closer cards", () => {
    const near = card({ id: "near" });
    const far = card({ id: "far", lat: HERE[0] + 0.03 }); // ~3.3 km north
    expect(scoreCard(near, ctx)).toBeGreaterThan(scoreCard(far, ctx));
  });

  it("boosts cards matching the shopper's interests", () => {
    const crafts = card({ id: "c", category: "crafts", tags: ["crafts"] });
    expect(scoreCard(crafts, { ...ctx, interests: ["crafts"] })).toBeGreaterThan(scoreCard(crafts, { ...ctx, interests: ["drinks"] }));
  });

  it("ranks an event on now above the same event next week", () => {
    expect(scoreCard(event("now", -1, 3), ctx)).toBeGreaterThan(scoreCard(event("later", 7 * 24, 3), ctx));
  });

  it("ranks soon above later for upcoming events", () => {
    expect(scoreCard(event("soon", 1, 2), ctx)).toBeGreaterThan(scoreCard(event("tomorrow", 26, 2), ctx));
  });

  it("only counts a promotion while it lasts", () => {
    const base = scoreCard(event("e", 2, 2), ctx);
    expect(scoreCard(event("e", 2, 2, { boostUntil: NOW + HOUR }), ctx)).toBeGreaterThan(base);
    expect(scoreCard(event("e", 2, 2, { boostUntil: NOW - HOUR }), ctx)).toBe(base);
  });

  it("uses stars both ways", () => {
    const base = scoreCard(card({ id: "x" }), ctx);
    expect(scoreCard(card({ id: "x", stars: 5 }), ctx)).toBeGreaterThan(base);
    expect(scoreCard(card({ id: "x", stars: 1 }), ctx)).toBeLessThan(base);
  });
});

describe("rankFeed", () => {
  it("puts the best card first", () => {
    const ranked = rankFeed([card({ id: "far", lat: HERE[0] + 0.05 }), card({ id: "near" })], ctx);
    expect(ranked.map((c) => c.id)).toEqual(["near", "far"]);
  });

  it("never shows three of a kind in a row when the other kind is available", () => {
    const stalls = ["a", "b", "c", "d"].map((id) => card({ id, stars: 5 }));
    const events = [event("x", 30, 2), event("y", 40, 2)];
    const ranked = rankFeed([...stalls, ...events], ctx);
    for (let i = 2; i < ranked.length; i++) {
      const run = [ranked[i - 2], ranked[i - 1], ranked[i]].map((c) => c.type);
      const othersLeft = ranked.slice(i).some((c) => c.type !== run[0]);
      if (othersLeft) expect(new Set(run).size).toBeGreaterThan(1);
    }
    expect(ranked).toHaveLength(6);
  });

  it("keeps every card exactly once", () => {
    const cards = [card({ id: "a" }), event("b", 1, 1), card({ id: "c", lat: 19.5 }), event("d", 50, 1)];
    const keys = rankFeed(cards, ctx).map(cardKey).sort();
    expect(keys).toEqual(cards.map(cardKey).sort());
  });
});
