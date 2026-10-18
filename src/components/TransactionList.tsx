"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, PiggyBank, Undo2 } from "lucide-react";
import { refundPayment } from "@/app/actions";
import { money, timeAgo } from "@/lib/format";
import type { Key } from "@/lib/i18n";
import type { Transaction, TransactionKind } from "@/lib/types";
import { useT } from "./I18n";

const KIND: Record<TransactionKind, { label: Key; icon: typeof ArrowDownLeft; tint: string; sign: string; color: string }> = {
  payment: { label: "tx.payment", icon: ArrowDownLeft, tint: "bg-nopal text-white", sign: "+", color: "text-nopal" },
  refund: { label: "tx.refund", icon: Undo2, tint: "bg-white text-chili", sign: "−", color: "text-chili" },
  "tanda-in": { label: "tx.tandaIn", icon: ArrowUpRight, tint: "bg-rosa text-white", sign: "−", color: "text-rosa" },
  "tanda-out": { label: "tx.tandaOut", icon: PiggyBank, tint: "bg-marigold text-ink", sign: "+", color: "text-nopal" },
};

const REFUND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** `refundable`: the vendor's own list, where tapping a recent payment offers a refund. */
export function TransactionList({ items, refundable = false }: { items: Transaction[]; refundable?: boolean }) {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  // Refunds are always newer than their payment, so any refund of a listed payment is listed too.
  const refunded = new Set(items.filter((i) => i.refundOf).map((i) => i.refundOf));
  // Ticks so "5 min ago" stays right on a dashboard left open all day.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (items.length === 0) {
    return <p className="block-card p-5 text-lg">{t("tx.empty")}</p>;
  }
  return (
    <ul className="block-card divide-y-2 divide-ink/10 overflow-hidden">
      {items.map((tx) => {
        const k = KIND[tx.kind];
        const Icon = k.icon;
        const isRefunded = refunded.has(tx.id);
        const canRefund = refundable && tx.kind === "payment" && !isRefunded && now - tx.createdAt < REFUND_WINDOW_MS;
        const label = tx.kind === "payment" && tx.customerId === "self" ? t("tx.test") : t(k.label);
        const row = (
          <>
            <span className={`grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink ${k.tint}`}>
              <Icon className="size-5" strokeWidth={2.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold">
                {label}
                {isRefunded && <span className="ml-2 rounded-full bg-paper-2 px-2 py-0.5 text-xs uppercase">{t("tx.refunded")}</span>}
              </span>
              {tx.note && <span className="block truncate text-sm">{tx.note}</span>}
              <span className="text-sm text-ink-soft" suppressHydrationWarning>
                {tx.from ? `${tx.from} · ` : ""}
                {timeAgo(tx.createdAt, t, now)}
              </span>
            </span>
            <span className={`font-display text-xl tabular-nums ${k.color} ${isRefunded ? "line-through opacity-50" : ""}`}>
              {k.sign}
              {money(tx.amount)}
            </span>
          </>
        );
        return (
          <li key={tx.id}>
            {canRefund ? (
              <button
                onClick={() => setOpenId(openId === tx.id ? null : tx.id)}
                aria-expanded={openId === tx.id}
                className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-paper-2"
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">{row}</div>
            )}
            {canRefund && openId === tx.id && <RefundPanel tx={tx} onClose={() => setOpenId(null)} />}
          </li>
        );
      })}
    </ul>
  );
}

function RefundPanel({ tx, onClose }: { tx: Transaction; onClose: () => void }) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const doRefund = () =>
    startTransition(async () => {
      setError("");
      const res = await refundPayment(tx.id);
      if (res.ok) onClose();
      else setError(res.error);
    });

  return (
    <div className="grid gap-2 bg-paper-2/60 px-4 pb-3">
      {asking ? (
        <>
          <p className="pt-2 text-center font-bold">{t("tx.refundAsk", { amount: money(tx.amount) })}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setAsking(false)} disabled={pending} className="btn min-h-12 bg-white text-lg">
              {t("cancel")}
            </button>
            <button onClick={doRefund} disabled={pending} className="btn min-h-12 bg-chili text-lg text-white">
              {pending ? <LoaderCircle className="size-5 animate-spin" strokeWidth={3} /> : t("tx.refundYes")}
            </button>
          </div>
        </>
      ) : (
        <button onClick={() => setAsking(true)} className="btn mt-1 min-h-12 w-full bg-white text-lg">
          <Undo2 className="size-5" strokeWidth={2.75} /> {t("tx.refundBtn", { amount: money(tx.amount) })}
        </button>
      )}
      {error && (
        <p className="text-center font-bold text-chili" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
