"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, MessageSquareText, Phone } from "lucide-react";
import { sendCode, verifyCode } from "@/app/actions";
import { useT } from "@/components/I18n";

export function PhoneSignIn() {
  const t = useT();
  const [phone, setPhone] = useState("");
  const [sent, setSent] = useState<{ phone: string; code: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submitPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await sendCode(phone);
      if (!res.ok) return setError(res.error);
      setSent({ phone: res.phone, code: res.code });
      setCode("");
    });
  };

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sent) return;
    setError("");
    startTransition(async () => {
      const res = await verifyCode(sent.phone, code);
      if (res && !res.ok) setError(res.error); // success redirects
    });
  };

  if (!sent) {
    return (
      <form onSubmit={submitPhone} className="grid gap-4">
        <label className="grid gap-2">
          <span className="font-display text-xl">{t("phone.label")}</span>
          <span className="flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-white px-4 shadow-block-sm focus-within:outline-3 focus-within:outline-sky">
            <Phone className="size-6 shrink-0 text-ink-soft" strokeWidth={2.5} />
            <span className="text-xl font-bold text-ink-soft">+52</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="55 1234 5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-16 w-full min-w-0 bg-transparent text-2xl font-bold tracking-wide outline-none placeholder:text-ink/25"
            />
          </span>
        </label>
        {error && <p className="font-bold text-chili" role="alert">{error}</p>}
        <button disabled={pending} className="btn w-full bg-chili text-white">
          {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : t("phone.send")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submitCode} className="grid gap-4">
      {/* Stand-in for a real SMS arriving on the phone. */}
      <div className="flex animate-pop items-start gap-3 rounded-2xl border-[2.5px] border-ink bg-ink p-4 text-white shadow-block">
        <MessageSquareText className="mt-0.5 size-6 shrink-0 text-marigold" strokeWidth={2.5} />
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-marigold">{t("phone.sms")}</p>
          <p className="text-lg">
            {t("phone.smsBody")} <strong className="font-display text-2xl tracking-widest">{sent.code}</strong>
          </p>
        </div>
      </div>

      <label className="grid gap-2">
        <span className="font-display text-xl">{t("phone.codeLabel")}</span>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          className="h-16 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white text-center font-display text-4xl tracking-[0.4em] shadow-block-sm outline-none focus:outline-3 focus:outline-sky"
          autoFocus
        />
      </label>
      {error && <p className="font-bold text-chili" role="alert">{error}</p>}
      <button disabled={pending || code.length !== 6} className="btn w-full bg-chili text-white">
        {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : t("continue")}
      </button>
      <button type="button" onClick={() => setSent(null)} className="text-center font-bold text-ink-soft underline">
        {t("phone.other")}
      </button>
    </form>
  );
}
