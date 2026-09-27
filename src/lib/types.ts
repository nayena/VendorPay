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
}

export type TransactionKind = "payment" | "tanda-in" | "tanda-out";

export interface Transaction {
  id: string;
  vendorId: string;
  kind: TransactionKind;
  /** Always positive; direction comes from `kind`. */
  amount: number;
  createdAt: number;
  /** Masked customer label for payments, e.g. "•• 4821". */
  from?: string;
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
}
