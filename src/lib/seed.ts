import { CITY } from "./city";
import { customerTag } from "./format";
import type { Circle, Explorer, MenuItem, Transaction, Vendor, VendorEvent } from "./types";

export { CITY, cityDay } from "./city";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type SeedVendor = Omit<Vendor, "joinedAt" | "balance" | "lastActiveAt" | "autoClosed" | "approxLocation" | "demo"> & {
  sales: number; // completed payments in the last 30 days
  avgTicket: number;
  todaySales: number;
};

const vendors: SeedVendor[] = [
  {
    id: "lupe",
    phone: "5512340001",
    name: "Tacos Doña Lupe",
    ownerName: "Guadalupe Hernández",
    category: "food",
    spot: "Corner of Madero & Bolívar",
    lat: 19.4339,
    lng: -99.1383,
    isOpen: true,
    sales: 96,
    avgTicket: 65,
    todaySales: 7,
  },
  {
    id: "beto",
    phone: "5512340002",
    name: "Elotes Don Beto",
    ownerName: "Alberto Ramírez",
    category: "snacks",
    spot: "Outside Metro Zócalo, north exit",
    lat: 19.4331,
    lng: -99.1318,
    isOpen: true,
    sales: 54,
    avgTicket: 40,
    todaySales: 5,
  },
  {
    id: "paty",
    phone: "5512340003",
    name: "Jugos Paty",
    ownerName: "Patricia Morales",
    category: "drinks",
    spot: "Plaza Santo Domingo, by the fountain",
    lat: 19.4378,
    lng: -99.1339,
    isOpen: true,
    sales: 71,
    avgTicket: 35,
    todaySales: 6,
  },
  {
    id: "xochitl",
    phone: "5512340004",
    name: "Artesanías Xóchitl",
    ownerName: "Xóchitl Cruz",
    category: "crafts",
    spot: "Calle Moneda, blue tarp",
    lat: 19.4344,
    lng: -99.1296,
    isOpen: true,
    sales: 18,
    avgTicket: 180,
    todaySales: 2,
  },
  {
    id: "guera",
    phone: "5512340005",
    name: "Frutas La Güera",
    ownerName: "Rosa Jiménez",
    category: "produce",
    spot: "Mercado San Juan, side entrance",
    lat: 19.4302,
    lng: -99.1433,
    isOpen: false,
    sales: 38,
    avgTicket: 55,
    todaySales: 3,
  },
  {
    id: "mercedes",
    phone: "5512340006",
    name: "Flores Mercedes",
    ownerName: "Mercedes Ortiz",
    category: "flowers",
    spot: "Alameda Central, east gate",
    lat: 19.4357,
    lng: -99.1427,
    isOpen: true,
    sales: 4,
    avgTicket: 90,
    todaySales: 1,
  },
];

// Small deterministic PRNG so the seeded history looks the same every run.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const MENUS: Record<string, [string, number][]> = {
  lupe: [["Taco al pastor", 18], ["Taco de suadero", 18], ["Gringa", 45], ["Agua de horchata", 25]],
  beto: [["Elote", 35], ["Esquite chico", 30], ["Esquite grande", 45]],
  paty: [["Jugo de naranja", 30], ["Licuado de plátano", 40], ["Verde", 35]],
  xochitl: [["Pulsera tejida", 80], ["Muñeca de trapo", 220], ["Bolsa bordada", 350]],
  guera: [["Fruta picada", 40], ["Mango con chile", 35], ["Kilo de jitomate", 28]],
  mercedes: [["Ramo chico", 80], ["Ramo de cempasúchil", 120]],
};

export interface Rating {
  id: string;
  vendorId: string;
  txId: string;
  stars: number;
  createdAt: number;
}

export function seed(now = Date.now()) {
  const rand = rng(42);
  const allTx: Transaction[] = [];
  const allVendors: Vendor[] = [];
  const ratings: Rating[] = [];
  const menuItems: MenuItem[] = [];
  let txN = 0;

  // Keep "today" sales inside today even when the server starts early in the morning.
  const todayWindow = Math.min(9 * 60 * 60 * 1000, msSinceMidnight(now) - 60_000);

  for (const v of vendors) {
    const { sales, avgTicket, todaySales, ...vendor } = v;
    let balance = 0;
    // A pool of customers with a few regulars, so "different customers" < sales.
    const pool = Math.max(3, Math.round(sales * 0.55));
    const regulars = Math.max(1, Math.round(pool * 0.2));
    for (let i = 0; i < sales; i++) {
      const isToday = i < todaySales && todayWindow > 0;
      // Earlier days: a random day in the last 29, during market hours (8:00–20:00).
      const age = isToday
        ? rand() * todayWindow
        : msSinceMidnight(now) + Math.floor(rand() * 29) * DAY + (16 - rand() * 12) * HOUR;
      const amount = Math.max(10, Math.round((avgTicket * (0.5 + rand())) / 5) * 5);
      balance += amount;
      // The first few sales go to distinct customers, so even a tiny stall has a real count.
      const customer = i < 3 ? i : Math.floor(rand() * (rand() < 0.4 ? regulars : pool));
      const customerId = `c-${v.id}-${customer}`;
      const tx: Transaction = {
        id: `t${++txN}`,
        vendorId: v.id,
        kind: "payment",
        amount,
        createdAt: now - age,
        from: customerTag(customerId),
        customerId,
      };
      allTx.push(tx);
      if (rand() < 0.3) {
        const r = rand();
        const stars = r < 0.6 ? 5 : r < 0.9 ? 4 : r < 0.97 ? 3 : 2;
        ratings.push({ id: `r${ratings.length + 1}`, vendorId: v.id, txId: tx.id, stars, createdAt: tx.createdAt + 120_000 });
      }
    }
    (MENUS[v.id] ?? []).forEach(([name, price], i) => menuItems.push({ id: `m-${v.id}-${i}`, vendorId: v.id, name, price }));
    // Vendors cash out regularly; the wallet holds roughly the last few days of sales.
    allVendors.push({
      ...vendor,
      balance: Math.round(balance * 0.18),
      joinedAt: now - 45 * DAY,
      lastActiveAt: now,
      autoClosed: false,
      approxLocation: false,
      demo: true,
    });
  }

  const circle: Circle = {
    id: "tanda-centro",
    name: "Tanda del Centro",
    contribution: 200,
    memberIds: ["lupe", "beto", "paty", "xochitl"],
    round: 1, // Lupe took last week's pot; Beto is up now
    cycle: 1,
    paidThisRound: ["lupe", "paty"],
    autoPayIds: ["paty"],
  };

  // Last round's history: everyone paid in, Lupe received the pot.
  const lastRound = now - 7 * DAY;
  for (const id of circle.memberIds) {
    allTx.push({ id: `t${++txN}`, vendorId: id, kind: "tanda-in", amount: circle.contribution, createdAt: lastRound });
  }
  allTx.push({
    id: `t${++txN}`,
    vendorId: "lupe",
    kind: "tanda-out",
    amount: circle.contribution * circle.memberIds.length,
    createdAt: lastRound + 60_000,
  });
  // This round's contributions so far.
  for (const id of circle.paidThisRound) {
    allTx.push({ id: `t${++txN}`, vendorId: id, kind: "tanda-in", amount: circle.contribution, createdAt: now - 2 * DAY });
  }

  allTx.sort((a, b) => b.createdAt - a.createdAt);
  return { vendors: allVendors, transactions: allTx, circles: [circle], ratings, menuItems, ...discovery(now) };
}

// ---------- discovery demo data ----------

type SeedEvent = Omit<VendorEvent, "createdAt" | "startsAt" | "endsAt" | "boostUntil"> & {
  startH: number; // hours from now
  hours: number;
  boosted?: boolean;
};

// Times are relative to seeding. Demo events roll forward a day at a time once they
// end (see housekeeping in store.ts), so the demo always has something on.
const EVENTS: SeedEvent[] = [
  {
    id: "ev-antojitos",
    vendorId: "lupe",
    title: "Noche de Antojitos",
    description: "Tacos, elotes and aguas frescas under the lights of Madero. Bring friends.",
    kind: "market",
    tags: ["food", "snacks", "drinks"],
    spot: "Calle Madero, pedestrian block",
    lat: 19.4336,
    lng: -99.1366,
    startH: -1,
    hours: 5,
    boosted: true,
  },
  {
    id: "ev-jugos",
    vendorId: "paty",
    title: "Pop-up de Jugos Verdes",
    description: "Free tasting of three new green juices. First 30 cups half price.",
    kind: "popup",
    tags: ["drinks", "produce"],
    spot: "Plaza Santo Domingo, arcade",
    lat: 19.4375,
    lng: -99.1335,
    startH: 2,
    hours: 3,
  },
  {
    id: "ev-elotes",
    vendorId: "beto",
    title: "Música y Elotes en la Plaza",
    description: "Live son jarocho next to the cart. Esquites all night.",
    kind: "music",
    tags: ["snacks", "music"],
    spot: "Zócalo, northeast corner",
    lat: 19.4334,
    lng: -99.1312,
    startH: 5,
    hours: 3,
  },
  {
    id: "ev-muertos",
    vendorId: "mercedes",
    title: "Festival de Cempasúchil",
    description: "Day of the Dead flowers, ofrenda building and papel picado workshop for kids.",
    kind: "festival",
    tags: ["flowers", "crafts", "art", "music"],
    spot: "Alameda Central, Hemiciclo a Juárez",
    lat: 19.4353,
    lng: -99.1418,
    startH: 20,
    hours: 10,
    boosted: true,
  },
  {
    id: "ev-artesanias",
    vendorId: "xochitl",
    title: "Tianguis de Artesanías",
    description: "Twenty artisans from Oaxaca and Chiapas: textiles, alebrijes, barro negro.",
    kind: "market",
    tags: ["crafts", "art"],
    spot: "Calle Moneda, in front of the museum",
    lat: 19.4346,
    lng: -99.13,
    startH: 26,
    hours: 8,
  },
  {
    id: "ev-frutas",
    vendorId: "guera",
    title: "Mercadito de Fruta de Temporada",
    description: "Guava, tejocote and sugar cane for your ofrenda, by the kilo.",
    kind: "popup",
    tags: ["produce", "food"],
    spot: "Mercado San Juan, side entrance",
    lat: 19.4304,
    lng: -99.143,
    startH: 48,
    hours: 6,
  },
];

const EXPLORERS: { id: string; nickname: string; interests: Explorer["interests"]; visits: string[] }[] = [
  { id: "x-ana", nickname: "Ana Antojitos", interests: ["food", "snacks"], visits: ["lupe", "beto", "paty", "xochitl", "mercedes", "guera"] },
  { id: "x-memo", nickname: "Memo Mercados", interests: ["market", "crafts"], visits: ["xochitl", "lupe", "beto", "paty"] },
  { id: "x-sofi", nickname: "Sofi Flores", interests: ["flowers", "festival"], visits: ["mercedes", "paty", "guera"] },
  { id: "x-dani", nickname: "Dani del Centro", interests: ["drinks", "music"], visits: ["paty", "beto"] },
  { id: "x-lu", nickname: "Lu Exploradora", interests: ["art"], visits: ["xochitl"] },
];

const REVIEWS: [explorer: string, vendor: string, stars: number, text: string][] = [
  ["x-ana", "lupe", 5, "Best pastor on Madero. Ask for extra piña."],
  ["x-memo", "lupe", 4, "Quick and friendly, the line moves fast."],
  ["x-ana", "beto", 5, "Esquite with chile piquín is perfect after work."],
  ["x-dani", "paty", 5, "The green juice is so fresh. Paty remembers your order."],
  ["x-memo", "xochitl", 5, "Beautiful embroidered bags, fair prices."],
  ["x-sofi", "mercedes", 4, "Gorgeous cempasúchil bunches for the ofrenda."],
];

export interface SeedCheckin {
  id: string;
  customerId: string;
  vendorId: string;
  createdAt: number;
}
export interface SeedReview {
  id: string;
  customerId: string;
  vendorId: string;
  stars: number;
  text: string;
  createdAt: number;
}
export interface SeedPoints {
  id: string;
  customerId: string;
  reason: string;
  ref: string;
  amount: number;
  createdAt: number;
}

function discovery(now: number) {
  // Events start on the hour, like real ones.
  const hour = Math.floor(now / HOUR) * HOUR;
  const events: VendorEvent[] = EVENTS.map(({ startH, hours, boosted, ...e }) => ({
    ...e,
    startsAt: hour + startH * HOUR,
    endsAt: hour + (startH + hours) * HOUR,
    createdAt: now - DAY,
    boostUntil: boosted ? now + DAY : 0,
  }));

  // Recent visits, so the explorer and stall leaderboards aren't empty on day one.
  const checkins: SeedCheckin[] = [];
  const reviews: SeedReview[] = [];
  const points: SeedPoints[] = [];
  const explorers: Explorer[] = EXPLORERS.map((x, xi) => {
    let total = 0;
    x.visits.forEach((vendorId, i) => {
      const createdAt = now - (i * 9 + xi * 3 + 2) * HOUR;
      const id = `ci-${x.id}-${vendorId}`;
      checkins.push({ id, customerId: x.id, vendorId, createdAt });
      points.push({ id: `p-${id}`, customerId: x.id, reason: "checkin", ref: id, amount: 20, createdAt });
      total += 20;
    });
    for (const [who, vendorId, stars, text] of REVIEWS) {
      if (who !== x.id) continue;
      const createdAt = now - (xi + 1) * HOUR;
      const id = `rv-${x.id}-${vendorId}`;
      reviews.push({ id, customerId: x.id, vendorId, stars, text, createdAt });
      points.push({ id: `p-${id}`, customerId: x.id, reason: "review", ref: vendorId, amount: 10, createdAt });
      total += 10;
    }
    return { id: x.id, nickname: x.nickname, interests: x.interests, points: total, createdAt: now - 20 * DAY };
  });

  return { events, explorers, checkins, reviews, points };
}

/** Milliseconds since local midnight in the app's city. */
export function msSinceMidnight(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CITY.timeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + (now % 1000);
}
