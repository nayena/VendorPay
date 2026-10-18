export type Category = "food" | "produce" | "drinks" | "snacks" | "crafts" | "flowers";

export interface Vendor {
  id: string;
  phone: string; // digits only
  name: string;
  ownerName: string;
  category: Category;
  spot: string; // landmark description customers can find
  lat: number;
  lng: number;
  isOpen: boolean;
  balance: number; // whole pesos, simulated wallet
  joinedAt: number;
  /** Last sign of life (dashboard open, payment, toggle). Stale open stalls close automatically. */
  lastActiveAt: number;
  /** True when the stall was closed automatically for inactivity, until the vendor opens it again. */
  autoClosed: boolean;
  /** Customers see a fuzzed pin and no landmark text. */
  approxLocation: boolean;
  /** Seeded demo stalls never auto-close, so the public demo map is never empty. */
  demo: boolean;
}

export type TransactionKind = "payment" | "refund" | "tanda-in" | "tanda-out";

export interface Transaction {
  id: string;
  vendorId: string;
  kind: TransactionKind;
  /** Always positive; direction comes from `kind`. */
  amount: number;
  createdAt: number;
  /** Masked customer label for payments, e.g. "•• 4821". */
  from?: string;
  /** Stable (simulated) customer id, used to count distinct customers. "self" marks a vendor's test payment. */
  customerId?: string;
  /** What was bought, e.g. "2× Taco al pastor". */
  note?: string;
  /** For refunds: the payment being returned. */
  refundOf?: string;
}

export interface MenuItem {
  id: string;
  vendorId: string;
  name: string;
  price: number;
}

/** Inputs to the trust score. Self-payments and refunded payments are excluded. */
export interface TrustStats {
  sales: number;
  customers: number;
  ratingAvg: number | null;
  ratingCount: number;
}

/** A rotating savings circle ("tanda"): everyone chips in each round, one member takes the pot. */
export interface Circle {
  id: string;
  name: string;
  contribution: number;
  memberIds: string[]; // payout order
  round: number; // index into memberIds: who receives this round
  cycle: number;
  paidThisRound: string[];
  /** Members whose share is paid automatically from incoming sales. */
  autoPayIds: string[];
}

export interface CircleInvite {
  circleId: string;
  circleName: string;
  invitedBy: string;
}

// ---------- discovery ----------

export type EventKind = "popup" | "festival" | "market" | "food" | "music" | "art";

/** What shoppers can say they're into: anything a stall sells or an event is about. */
export type Interest = Category | EventKind;

/** A pop-up, festival or market a vendor is promoting. */
export interface VendorEvent {
  id: string;
  vendorId: string;
  title: string;
  description: string;
  kind: EventKind;
  tags: Interest[];
  spot: string;
  lat: number;
  lng: number;
  startsAt: number;
  endsAt: number;
  createdAt: number;
  /** Promoted events rank higher in the feed until this time. 0 when not promoted. */
  boostUntil: number;
}

/** A shopper's discovery profile. Keyed by the anonymous customer id. */
export interface Explorer {
  id: string;
  /** Null until the shopper picks one; a numbered default is shown instead. */
  nickname: string | null;
  interests: Interest[];
  points: number;
  createdAt: number;
}

export interface Review {
  id: string;
  vendorId: string;
  stars: number;
  text: string;
  createdAt: number;
  /** The reviewer's nickname, or null to show "Explorer #authorNo". */
  author: string | null;
  authorNo: number;
  mine: boolean;
}
