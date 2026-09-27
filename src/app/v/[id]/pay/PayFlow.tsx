"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Delete, LoaderCircle } from "lucide-react";
import { payVendor } from "@/app/actions";
import { CategoryChip, Simulated } from "@/components/ui";
import { money } from "@/lib/format";
import type { Category } from "@/lib/types";

const MAX = 10_000;
const QUICK = [20, 50, 100];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "back"] as const;

type Step = "amount" | "confirm" | "done";

export function PayFlow({ vendorId, name, category }: { vendorId: string; name: string; category: Category }) {
  const [digits, setDigits] = useState("");
  const [step, setStep] = useState<Step>("amount");
  const [receipt, setReceipt] = useState<{ id: string; at: number } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const amount = Number(digits || "0");

  function press(key: (typeof KEYS)[number]) {
    setError("");
    if (key === "C") return setDigits("");
    if (key === "back") return setDigits((d) => d.slice(0, -1));
    setDigits((d) => {
      const next = (d + key).replace(/^0+/, "");
      return Number(next) > MAX ? d : next;
    });
  }

  function confirm() {
    startTransition(async () => {
      const res = await payVendor(vendorId, amount);
      if (!res.ok) {
        setError(res.error);
        setStep("amount");
        return;
      }
      setReceipt({ id: res.receipt, at: res.at });
      setStep("done");
    });
  }

  if (step === "done" && receipt) {
    return (
      <div className="flex flex-1 flex-col items-center px-5 pt-10 pb-8 text-center">
        <div className="grid size-28 animate-pop place-items-center rounded-full border-[3px] border-ink bg-nopal text-white shadow-block">
          <Check className="size-16" strokeWidth={3.5} />
        </div>
        <p className="mt-6 font-display text-5xl">{money(amount)}</p>
        <p className="mt-1 text-xl">
          paid to <strong>{name}</strong>
        </p>
        <div className="block-card mt-8 w-full animate-rise p-4 text-left [animation-delay:150ms]">
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">Receipt</span>
            <span className="font-bold">{receipt.id}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-ink-soft">Time</span>
            <span className="font-bold">
              {new Date(receipt.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </div>
          <p className="mt-2 border-t-2 border-dashed border-ink/20 pt-2 text-sm text-ink-soft">
            Simulated payment. No real money moved.
          </p>
        </div>
        <Link href="/map" className="btn mt-auto w-full bg-marigold">
          Done
        </Link>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="flex flex-1 flex-col px-5 pt-6 pb-8">
        <div className="flex flex-col items-center text-center">
          <CategoryChip category={category} big />
          <p className="mt-4 text-xl">You&apos;re paying</p>
          <p className="font-display text-6xl text-chili">{money(amount)}</p>
          <p className="mt-1 text-xl">
            to <strong>{name}</strong>
          </p>
          <Simulated className="mt-4" />
        </div>
        <div className="mt-auto grid gap-3">
          <button onClick={confirm} disabled={pending} className="btn w-full bg-nopal text-white">
            {pending ? (
              <>
                <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> Sending…
              </>
            ) : (
              "Pay now"
            )}
          </button>
          <button onClick={() => setStep("amount")} disabled={pending} className="btn w-full bg-white">
            Change amount
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
          Pay <strong>{name}</strong>
        </p>
      </div>

      <output
        aria-live="polite"
        className={`mt-5 block text-center font-display text-7xl tabular-nums ${amount ? "text-ink" : "text-ink/25"}`}
      >
        {money(amount)}
      </output>
      <p className="mt-1 h-6 text-center font-bold text-chili" role="alert">
        {error}
      </p>

      <div className="mt-2 flex justify-center gap-2">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => {
              setError("");
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
            aria-label={k === "back" ? "Delete" : k === "C" ? "Clear" : k}
            className="grid h-16 place-items-center rounded-2xl border-[2.5px] border-ink bg-white font-display text-3xl shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:bg-paper-2 active:shadow-none"
          >
            {k === "back" ? <Delete className="size-8" strokeWidth={2.5} /> : k}
          </button>
        ))}
      </div>

      <button onClick={() => setStep("confirm")} disabled={amount < 1} className="btn mt-5 w-full bg-chili text-white">
        Continue
      </button>
    </div>
  );
}
