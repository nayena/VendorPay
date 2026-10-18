import { describe, expect, it } from "vitest";
import { LEVELS, levelFor, newBadges, statsFrom, type CheckinFact, type ExplorerStats } from "./gamify";

const TZ = "America/Mexico_City";
const ZERO: ExplorerStats = { checkins: 0, vendors: 0, festivals: 0, markets: 0, reviews: 0, saves: 0, earlyBird: 0, weekend: 0 };

describe("levelFor", () => {
  it("starts at the first level", () => {
    const l = levelFor(0);
    expect(l.level.key).toBe("curious");
    expect(l.next?.key).toBe("explorer");
    expect(l.progress).toBe(0);
  });

  it("moves up exactly at each threshold", () => {
    for (const [i, lvl] of LEVELS.entries()) {
      expect(levelFor(lvl.min).index).toBe(i);
      if (i > 0) expect(levelFor(lvl.min - 1).index).toBe(i - 1);
    }
  });

  it("reports progress toward the next level", () => {
    expect(levelFor(25).progress).toBeCloseTo(0.5);
  });

  it("tops out at the last level", () => {
    const l = levelFor(10_000);
    expect(l.level.key).toBe("legend");
    expect(l.next).toBeNull();
    expect(l.progress).toBe(1);
  });
});

describe("statsFrom", () => {
  // 2026-10-17 is a Saturday. Mexico City is UTC-6.
  const at = (iso: string) => Date.parse(iso);
  const facts: CheckinFact[] = [
    { vendorId: "a", createdAt: at("2026-10-17T14:00:00Z"), eventKind: "festival" }, // Sat 8:00 local
    { vendorId: "a", createdAt: at("2026-10-18T20:00:00Z"), eventKind: "market" }, // Sun 14:00
    { vendorId: "b", createdAt: at("2026-10-19T20:00:00Z"), eventKind: null }, // Mon 14:00
  ];

  it("counts visits, distinct stalls and event kinds", () => {
    const s = statsFrom(facts, { reviews: 2, saves: 7 }, TZ);
    expect(s).toMatchObject({ checkins: 3, vendors: 2, festivals: 1, markets: 1, reviews: 2, saves: 7 });
  });

  it("uses the city's clock for early-bird and weekend visits", () => {
    const s = statsFrom(facts, { reviews: 0, saves: 0 }, TZ);
    expect(s.earlyBird).toBe(1);
    expect(s.weekend).toBe(2);
  });
});

describe("newBadges", () => {
  it("gives nothing for no activity", () => {
    expect(newBadges(ZERO, [])).toEqual([]);
  });

  it("awards the first check-in once", () => {
    const s = { ...ZERO, checkins: 1, vendors: 1 };
    expect(newBadges(s, [])).toEqual(["firstCheckin"]);
    expect(newBadges(s, ["firstCheckin"])).toEqual([]);
  });

  it("awards several badges at once", () => {
    const s = { ...ZERO, checkins: 5, vendors: 5, festivals: 1, reviews: 1, saves: 10 };
    expect(newBadges(s, []).sort()).toEqual(["collector", "firstCheckin", "firstFestival", "firstReview", "fiveVendors"]);
  });
});
