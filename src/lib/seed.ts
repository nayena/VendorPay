import { customerTag } from "./format";
import type { Circle, MenuItem, Transaction, Vendor } from "./types";

// Centro Histórico, Mexico City.
export const CITY = {
  name: "Mexico City",
  center: [19.4326, -99.1332] as [number, number],
  timeZone: "America/Mexico_City",
};

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
  return { vendors: allVendors, transactions: allTx, circles: [circle], ratings, menuItems };
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
