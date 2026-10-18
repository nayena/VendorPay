"use client";

import { useOptimistic, useState, useTransition } from "react";
import { BellRing, Check, LoaderCircle, Phone, Repeat, TriangleAlert } from "lucide-react";
import {
  acceptInvite,
  chipIn,
  createCircle,
  inviteToCircle,
  joinCircle,
  remindMember,
  setAutoPay,
  simulateOthers,
  type Result,
} from "@/app/actions";
import { useT } from "@/components/I18n";

type Action = "chip" | "others" | "join" | "accept";
const ACTIONS: Record<Action, (circleId: string) => Promise<Result>> = {
  chip: chipIn,
  others: simulateOthers,
  join: joinCircle,
  accept: acceptInvite,
};

function Feedback({ error, message }: { error?: string; message?: string }) {
  if (error)
    return (
      <p className="text-center font-bold text-chili" role="alert">
        {error}
      </p>
    );
  if (message)
    return (
      <p className="text-center font-bold text-nopal" role="status">
        {message}
      </p>
    );
  return null;
}

export function CircleButton({
  circleId,
  action,
  children,
  className,
}: {
  circleId: string;
  action: Action;
  children: React.ReactNode;
  className: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <button
        disabled={pending}
        className={className}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const res = await ACTIONS[action](circleId);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : children}
      </button>
      <Feedback error={error} />
    </div>
  );
}

/** Simulated SMS nudge for a member who hasn't paid in this week. */
export function RemindButton({ circleId, memberId }: { circleId: string; memberId: string }) {
  const t = useT();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  if (result)
    return (
      <span
        role="status"
        title={result.text}
        className={`flex min-h-11 shrink-0 items-center gap-1 px-2 text-sm font-bold ${result.ok ? "text-nopal" : "text-chili"}`}
      >
        {result.ok ? <Check className="size-4" strokeWidth={3} /> : <TriangleAlert className="size-4" strokeWidth={2.5} />}
        {result.ok ? t("tanda.remindedShort") : "!"}
        <span className="sr-only">{result.text}</span>
      </span>
    );
  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await remindMember(circleId, memberId);
          setResult(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
        })
      }
      className="flex min-h-11 shrink-0 items-center gap-1 rounded-full border-2 border-ink bg-white px-3 text-sm font-bold active:bg-paper-2"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" strokeWidth={3} /> : <BellRing className="size-4" strokeWidth={2.5} />}
      {t("tanda.remind")}
    </button>
  );
}

export function AutoPayToggle({ on }: { on: boolean }) {
  const t = useT();
  const [value, setValue] = useOptimistic(on);
  const [, startTransition] = useTransition();
  const flip = () =>
    startTransition(async () => {
      setValue(!value);
      await setAutoPay(!value);
    });
  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={flip}
      className="block-card flex w-full items-center gap-4 p-4 text-left active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      <Repeat className="size-7 shrink-0 text-rosa" strokeWidth={2.5} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight">{t("tanda.autoPay")}</span>
        <span className="mt-1 block text-sm font-bold text-ink-soft">{t("tanda.autoPaySub")}</span>
      </span>
      <span className={`relative h-9 w-16 shrink-0 rounded-full border-[2.5px] border-ink transition-colors ${value ? "bg-nopal" : "bg-paper-2"}`}>
        <span
          className={`absolute top-1/2 size-6 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-white transition-all ${value ? "left-[calc(100%-1.75rem)]" : "left-1"}`}
        />
      </span>
    </button>
  );
}

const inputClass =
  "h-14 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-3 text-lg outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky";

export function CreateCircleForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("200");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="block-card grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        startTransition(async () => {
          const res = await createCircle(name, Number(amount));
          if (!res.ok) setError(res.error);
        });
      }}
    >
      <h2 className="font-display text-2xl">{t("tanda.create")}</h2>
      <label className="grid gap-1">
        <span className="font-bold">{t("tanda.name")}</span>
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("tanda.namePh")} className={inputClass} />
      </label>
      <label className="grid gap-1">
        <span className="font-bold">{t("tanda.weekly")}</span>
        <span className="flex h-14 items-center rounded-2xl border-[2.5px] border-ink bg-white px-3 focus-within:outline-3 focus-within:outline-sky">
          <span className="text-lg font-bold text-ink-soft">$</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full min-w-0 bg-transparent pl-1 text-lg font-bold outline-none"
          />
        </span>
      </label>
      <Feedback error={error} />
      <button disabled={pending || !name.trim() || !amount} className="btn w-full bg-rosa text-white">
        {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : t("tanda.createBtn")}
      </button>
    </form>
  );
}

export function InviteForm({ circleId }: { circleId: string }) {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="block-card grid gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setMessage("");
        startTransition(async () => {
          const res = await inviteToCircle(circleId, phone);
          if (!res.ok) return setError(res.error);
          setMessage(res.message);
          setPhone("");
        });
      }}
    >
      <h2 className="font-display text-xl">{t("tanda.invite")}</h2>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <span className="flex h-14 items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-white px-3 focus-within:outline-3 focus-within:outline-sky">
          <Phone className="size-5 shrink-0 text-ink-soft" strokeWidth={2.5} />
          <input
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="55 1234 5678"
            aria-label={t("phone.label")}
            className="w-full min-w-0 bg-transparent text-lg font-bold outline-none placeholder:text-ink/25"
          />
        </span>
        <button disabled={pending || !phone.trim()} className="btn min-h-14 bg-rosa px-4 text-lg text-white">
          {pending ? <LoaderCircle className="size-5 animate-spin" strokeWidth={3} /> : t("tanda.inviteBtn")}
        </button>
      </div>
      <Feedback error={error} message={message} />
    </form>
  );
}
