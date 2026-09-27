import type { Category } from "./types";

export const CATEGORIES: Record<Category, { label: string; emoji: string; color: string }> = {
  food: { label: "Food", emoji: "🌮", color: "#C0360C" },
  produce: { label: "Fruit & veg", emoji: "🍉", color: "#1D6B43" },
  drinks: { label: "Drinks", emoji: "🥤", color: "#0E6E8C" },
  snacks: { label: "Snacks", emoji: "🌽", color: "#B7791F" },
  crafts: { label: "Crafts", emoji: "🧶", color: "#7B3FA0" },
  flowers: { label: "Flowers", emoji: "💐", color: "#D1206A" },
};

export const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/**
 * Trust score out of 5, built only from completed (simulated) sales.
 * It rises quickly over the first few dozen sales, then levels off near 5.
 */
export function trust(sales: number) {
  if (sales < 3) return { score: null, label: "New", sales };
  const score = Math.max(1, Math.round(50 * (1 - Math.exp(-sales / 35))) / 10);
  return { score, label: score >= 4 ? "Trusted" : "Growing", sales };
}

export function timeAgo(ts: number, now = Date.now()) {
  const min = Math.round((now - ts) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export const normalizePhone = (s: string) => s.replace(/\D/g, "").slice(-10);
