"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { checkInQr, type Reward } from "@/app/actions";
import { RewardToast } from "@/components/discover";
import { useT } from "@/components/I18n";

export function QrCheckIn({ vendorId, code }: { vendorId: string; code: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [result, setResult] = useState<(Reward & { at: number; eventTitle: string | null }) | null>(null);

  const go = () =>
    startTransition(async () => {
      setError("");
      const res = await checkInQr(vendorId, code);
      if (!res.ok) return setError(res.error);
      setResult({ points: res.points, badges: res.badges, eventTitle: res.eventTitle, at: Date.now() });
    });

  if (result) {
    return (
      <div className="mt-6 animate-pop">
        <p className="font-display text-5xl text-nopal">+{result.points}</p>
        <p className="mt-1 text-lg font-bold">{t("checkin.thanks")}</p>
        {result.eventTitle && <p className="text-ink-soft">{t("checkin.atEvent", { name: result.eventTitle })}</p>}
        <div className="mt-5 grid gap-3">
          <Link href="/me" className="btn w-full bg-marigold">
            {t("checkin.seeProfile")}
          </Link>
          <Link href={`/v/${vendorId}`} className="btn w-full bg-white">
            {t("checkin.review")}
          </Link>
        </div>
        <RewardToast reward={result} />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <button onClick={go} disabled={pending} className="btn w-full bg-nopal text-white">
        {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={2.5} /> : <MapPin className="size-6" strokeWidth={2.5} />}
        {t("checkin.btn")}
      </button>
      {error && (
        <p className="mt-3 font-bold text-chili" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
