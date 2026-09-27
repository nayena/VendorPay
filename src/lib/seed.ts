import type { Circle, Transaction, Vendor } from "./types";

// Centro Histórico, Mexico City.
export const CITY = {
  name: "Mexico City",
  center: [19.4326, -99.1332] as [number, number],
  timeZone: "America/Mexico_City",
};

const DAY = 24 * 60 * 60 * 1000;

type SeedVendor = Omit<Vendor, "joinedAt" | "balance"> & {
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

function customerTag(rand: () => number) {
  return "•• " + String(Math.floor(1000 + rand() * 9000));
}

export function seed(now = Date.now()) {
  const rand = rng(42);
  const allTx: Transaction[] = [];
  const allVendors: Vendor[] = [];
  let txN = 0;

  // Keep "today" sales inside today even when the server starts early in the morning.
  const todayWindow = Math.min(9 * 60 * 60 * 1000, msSinceMidnight(now) - 60_000);

  for (const v of vendors) {
    const { sales, avgTicket, todaySales, ...vendor } = v;
    let balance = 0;
    for (let i = 0; i < sales; i++) {
      const isToday = i < todaySales && todayWindow > 0;
      const age = isToday ? rand() * todayWindow : todayWindow + rand() * 29 * DAY;
      const amount = Math.max(10, Math.round((avgTicket * (0.5 + rand())) / 5) * 5);
      balance += amount;
      allTx.push({
        id: `t${++txN}`,
        vendorId: v.id,
        kind: "payment",
        amount,
        createdAt: now - age,
        from: customerTag(rand),
      });
    }
    // Vendors cash out regularly; the wallet holds roughly the last few days of sales.
    allVendors.push({ ...vendor, balance: Math.round(balance * 0.18), joinedAt: now - 45 * DAY });
  }

  const circle: Circle = {
    id: "tanda-centro",
    name: "Tanda del Centro",
    contribution: 200,
    memberIds: ["lupe", "beto", "paty", "xochitl"],
    round: 1, // Lupe took last week's pot; Beto is up now
    cycle: 1,
    paidThisRound: ["lupe", "paty"],
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
  return { vendors: allVendors, transactions: allTx, circles: [circle] };
}

function msSinceMidnight(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CITY.timeZone,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")!.value);
  const m = Number(parts.find((p) => p.type === "minute")!.value);
  return (h * 60 + m) * 60_000;
}
