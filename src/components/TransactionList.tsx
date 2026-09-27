import { ArrowDownLeft, ArrowUpRight, PiggyBank } from "lucide-react";
import { money, timeAgo } from "@/lib/format";
import type { Transaction } from "@/lib/types";

const KIND = {
  payment: { label: "Payment", icon: ArrowDownLeft, tint: "bg-nopal text-white", sign: "+" },
  "tanda-in": { label: "Savings circle", icon: ArrowUpRight, tint: "bg-rosa text-white", sign: "−" },
  "tanda-out": { label: "Circle payout!", icon: PiggyBank, tint: "bg-marigold text-ink", sign: "+" },
} as const;

export function TransactionList({ items }: { items: Transaction[] }) {
  if (items.length === 0) {
    return <p className="block-card p-5 text-lg">No payments yet. Show customers your QR code to get started!</p>;
  }
  return (
    <ul className="block-card divide-y-2 divide-ink/10 overflow-hidden">
      {items.map((t) => {
        const k = KIND[t.kind];
        const Icon = k.icon;
        return (
          <li key={t.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink ${k.tint}`}>
              <Icon className="size-5" strokeWidth={2.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">{k.label}</span>
              <span className="text-sm text-ink-soft">
                {t.from ? `${t.from} · ` : ""}
                {timeAgo(t.createdAt)}
              </span>
            </span>
            <span className={`font-display text-xl tabular-nums ${t.kind === "tanda-in" ? "text-rosa" : "text-nopal"}`}>
              {k.sign}
              {money(t.amount)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
