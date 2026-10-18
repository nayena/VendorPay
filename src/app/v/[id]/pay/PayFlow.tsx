"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Delete, Keyboard, LoaderCircle, Minus, ShieldCheck, Star, TriangleAlert, UtensilsCrossed } from "lucide-react";
import { payVendor, ratePayment, type Reward } from "@/app/actions";
import { RewardToast } from "@/components/discover";
import { useT } from "@/components/I18n";
import { CategoryChip, Simulated } from "@/components/ui";
import { money } from "@/lib/format";
import type { Category, MenuItem } from "@/lib/types";

const MAX = 10_000;
const QUICK = [20, 50, 100];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "back"] as const;

type Step = "amount" | "confirm" | "done";

/** Works on plain-http LAN addresses too, where crypto.randomUUID is unavailable. */
function newRequestId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function PayFlow({
  vendorId,
  name,
  category,
  menu,
  isOpen,
  code,
  isSelf,
}: {
  vendorId: string;
  name: string;
  category: Category;
  menu: MenuItem[];
  isOpen: boolean;
  code: string;
  isSelf: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<"menu" | "keypad">(menu.length ? "menu" : "keypad");
  const [digits, setDigits] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [step, setStep] = useState<Step>("amount");
  // One id per checkout. Kept across retries so a payment that went through
  // (but whose reply was lost) is never charged twice.
  const [requestId, setRequestId] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; label: string; at: number; amount: number } | null>(null);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<(Reward & { at: number }) | null>(null);
  const [pending, startTransition] = useTransition();

  const cartLines = menu.filter((m) => cart[m.id]).map((m) => ({ ...m, qty: cart[m.id] }));
  const cartCount = cartLines.reduce((n, l) => n + l.qty, 0);
  const amount = mode === "menu" ? cartLines.reduce((s, l) => s + l.price * l.qty, 0) : Number(digits || "0");

  const changed = () => {
    setError("");
    setRequestId(null);
  };

  function press(key: (typeof KEYS)[number]) {
    changed();
    if (key === "C") return setDigits("");
    if (key === "back") return setDigits((d) => d.slice(0, -1));
    setDigits((d) => {
      const next = (d + key).replace(/^0+/, "");
      return Number(next) > MAX ? d : next;
    });
  }

  function bump(id: string, by: 1 | -1) {
    changed();
    setCart((c) => {
      const qty = Math.max(0, Math.min(50, (c[id] ?? 0) + by));
      const next = { ...c, [id]: qty };
      if (!qty) delete next[id];
      return next;
    });
  }

  function toConfirm() {
    setRequestId((id) => id ?? newRequestId());
    setStep("confirm");
  }

  function confirm() {
    if (!requestId) return;
    startTransition(async () => {
      const res = await payVendor({
        vendorId,
        requestId,
        ...(mode === "menu" ? { items: cartLines.map((l) => ({ id: l.id, qty: l.qty })) } : { amount }),
      });
      if (!res.ok) {
        setError(res.error);
        setStep("amount");
        return;
      }
      setReceipt({ id: res.id, label: res.receipt, at: res.at, amount: res.amount });
      if (res.points) setReward({ points: res.points, badges: res.badges, at: Date.now() });
      setStep("done");
    });
  }

  if (step === "done" && receipt) {
    return (
      <div className="flex flex-1 flex-col items-center px-5 pt-8 pb-8 text-center">
        <div className="grid size-28 animate-pop place-items-center rounded-full border-[3px] border-ink bg-nopal text-white shadow-block">
          <Check className="size-16" strokeWidth={3.5} />
        </div>
        <p className="mt-6 font-display text-5xl">{money(receipt.amount)}</p>
        <p className="mt-1 text-xl">
          {t("pay.paidTo")} <strong>{name}</strong>
        </p>
        {!isSelf && <RateIt paymentId={receipt.id} />}
        <RewardToast reward={reward} />
        <div className="block-card mt-6 w-full animate-rise p-4 text-left [animation-delay:150ms]">
          {mode === "menu" && cartLines.length > 0 && (
            <ul className="mb-2 border-b-2 border-dashed border-ink/20 pb-2">
              {cartLines.map((l) => (
                <li key={l.id} className="flex justify-between py-0.5">
                  <span>
                    {l.qty}× {l.name}
                  </span>
                  <span className="tabular-nums">{money(l.price * l.qty)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">{t("pay.receipt")}</span>
            <span className="font-bold">{receipt.label}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">{t("pay.time")}</span>
            <span className="font-bold">
              {new Date(receipt.at).toLocaleTimeString(t.lang === "es" ? "es-MX" : "en-US", { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-2 border-t-2 border-dashed border-ink/20 pt-2 text-sm text-ink-soft">{t("pay.simNote")}</p>
        </div>
        <Link href="/map" className="btn mt-auto w-full bg-marigold">
          {t("pay.done")}
        </Link>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-1 flex-col px-5 pt-6 pb-8">
        <div className="flex flex-col items-center text-center">
          <CategoryChip category={category} big />
          <p className="mt-4 text-xl">{t("pay.youPay")}</p>
          <p className="font-display text-6xl text-chili">{money(amount)}</p>
          <p className="mt-1 text-xl">
            {t("pay.to")} <strong>{name}</strong>
          </p>
          {mode === "menu" && <p className="mt-1 text-ink-soft">{cartLines.map((l) => `${l.qty}× ${l.name}`).join(", ")}</p>}
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-paper-2 px-3 py-2 text-left text-sm font-bold">
            <ShieldCheck className="size-5 shrink-0 text-nopal" strokeWidth={2.5} />
            {t("pay.verify", { code })}
          </p>
          <Simulated className="mt-4" />
        </div>
        <div className="mt-auto grid gap-3 pt-6">
          <button onClick={confirm} disabled={pending} className="btn w-full bg-nopal text-white">
            {pending ? (
              <>
                <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> {t("pay.sending")}
              </>
            ) : (
              t("pay.now")
            )}
          </button>
          <button onClick={() => setStep("amount")} disabled={pending} className="btn w-full bg-white">
            {t("pay.change")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-6">
      <div className="flex items-center gap-3">
        <CategoryChip category={category} />
        <p className="text-lg leading-tight">
          {t("pay.payTo")} <strong>{name}</strong>
        </p>
      </div>

      {!isOpen && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl border-[2.5px] border-chili bg-white p-3 font-bold text-chili" role="status">
          <TriangleAlert className="size-5 shrink-0" strokeWidth={2.5} /> {t("pay.closed")}
        </p>
      )}
      {isSelf && <p className="mt-3 rounded-2xl bg-paper-2 p-3 text-sm font-bold">{t("pay.self")}</p>}

      <output
        aria-live="polite"
        className={`mt-4 block text-center font-display text-7xl tabular-nums ${amount ? "text-ink" : "text-ink/25"}`}
      >
        {money(amount)}
      </output>
      {mode === "menu" && (
        <p className="text-center font-bold text-ink-soft">{t.n("pay.items", cartCount)}</p>
      )}
      <p className="mt-1 min-h-6 text-center font-bold text-chili" role="alert">
        {error}
      </p>

      {mode === "menu" ? (
        <ul className="mt-2 grid gap-2.5">
          {menu.map((m) => {
            const qty = cart[m.id] ?? 0;
            return (
              <li key={m.id} className="flex items-stretch gap-2">
                <button
                  onClick={() => bump(m.id, 1)}
                  aria-label={t("pay.add", { name: m.name })}
                  className={`flex min-h-16 flex-1 items-center gap-3 rounded-2xl border-[2.5px] border-ink px-4 text-left shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                    qty ? "bg-marigold" : "bg-white"
                  }`}
                >
                  {qty > 0 && (
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ink font-display text-lg text-white">{qty}</span>
                  )}
                  <span className="min-w-0 flex-1 text-lg font-bold leading-tight">{m.name}</span>
                  <span className="font-display text-xl tabular-nums">{money(m.price)}</span>
                </button>
                {qty > 0 && (
                  <button
                    onClick={() => bump(m.id, -1)}
                    aria-label={t("pay.removeOne", { name: m.name })}
                    className="grid w-14 place-items-center rounded-2xl border-[2.5px] border-ink bg-white shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                  >
                    <Minus className="size-6" strokeWidth={3} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          <div className="mt-1 flex justify-center gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                onClick={() => {
                  changed();
                  setDigits(String(q));
                }}
                className="min-h-11 rounded-full border-[2.5px] border-ink bg-paper-2 px-4 text-lg font-bold active:bg-marigold"
              >
                {money(q)}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {KEYS.map((k) => (
              <button
                key={k}
                onClick={() => press(k)}
                aria-label={k === "back" ? t("pay.delete") : k === "C" ? t("pay.clear") : k}
                className="grid h-16 place-items-center rounded-2xl border-[2.5px] border-ink bg-white font-display text-3xl shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:bg-paper-2 active:shadow-none"
              >
                {k === "back" ? <Delete className="size-8" strokeWidth={2.5} /> : k}
              </button>
            ))}
          </div>
        </>
      )}

      {menu.length > 0 && (
        <button
          onClick={() => {
            changed();
            setMode(mode === "menu" ? "keypad" : "menu");
          }}
          className="mt-4 flex min-h-11 items-center justify-center gap-2 font-bold text-ink-soft underline"
        >
          {mode === "menu" ? <Keyboard className="size-5" strokeWidth={2.5} /> : <UtensilsCrossed className="size-5" strokeWidth={2.5} />}
          {mode === "menu" ? t("pay.typeAmount") : t("pay.useMenu")}
        </button>
      )}

      <button onClick={toConfirm} disabled={amount < 1} className="btn mt-4 w-full bg-chili text-white">
        {t("continue")}
      </button>
    </div>
  );
}

function RateIt({ paymentId }: { paymentId: string }) {
  const t = useT();
  const [stars, setStars] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const rate = (n: number) =>
    startTransition(async () => {
      setStars(n);
      setError("");
      const res = await ratePayment(paymentId, n);
      if (res.ok) setDone(true);
      else setError(res.error);
    });

  return (
    <div className="mt-5 w-full animate-rise [animation-delay:100ms]">
      <p className="font-display text-xl">{done ? t("pay.thanks") : t("pay.rate")}</p>
      <div className="mt-2 flex justify-center gap-1" role="group" aria-label={t("pay.rate")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => rate(n)}
            disabled={pending || done}
            aria-label={t.n("pay.stars", n)}
            aria-pressed={stars === n}
            className="grid size-12 place-items-center rounded-full active:scale-90 disabled:cursor-default"
          >
            <Star
              className={`size-10 ${n <= stars ? "fill-marigold text-ink" : "text-ink/30"}`}
              strokeWidth={2}
            />
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-1 font-bold text-chili" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
