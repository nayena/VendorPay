"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { submitReview, type Reward } from "@/app/actions";
import { RewardToast } from "@/components/discover";
import { useT } from "@/components/I18n";
import { timeAgo } from "@/lib/format";
import type { Review } from "@/lib/types";

export function ReviewList({ reviews, now, className = "" }: { reviews: Review[]; now: number; className?: string }) {
  const t = useT();
  return (
    <ul className={`grid gap-3 ${className}`}>
      {reviews.map((r) => (
        <li key={r.id} className="block-card p-4">
          <div className="flex items-center gap-2">
            <span className="font-bold">
              {r.author ?? t("me.anon", { n: r.authorNo })}
              {r.mine && <span className="font-normal text-ink-soft"> {t("tanda.you")}</span>}
            </span>
            <span className="ml-auto flex" aria-label={t.n("pay.stars", r.stars)} role="img">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`size-4 ${n <= r.stars ? "fill-marigold text-ink" : "text-ink/25"}`} strokeWidth={2} />
              ))}
            </span>
          </div>
          {r.text && <p className="mt-1.5 leading-snug">{r.text}</p>}
          <p className="mt-1 text-xs text-ink-soft">{timeAgo(r.createdAt, t, now)}</p>
        </li>
      ))}
    </ul>
  );
}

/** Write (or edit) a review. Only open to shoppers who checked in or paid here. */
export function ReviewForm({ vendorId, mine }: { vendorId: string; mine: Review | null }) {
  const t = useT();
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [text, setText] = useState(mine?.text ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [reward, setReward] = useState<(Reward & { at: number }) | null>(null);
  const [pending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      setError("");
      const res = await submitReview(vendorId, stars, text);
      if (!res.ok) return setError(res.error);
      setSaved(true);
      setReward({ points: res.points, badges: res.badges, at: Date.now() });
    });

  return (
    <div className="block-card p-4">
      <p className="font-display text-xl">{mine ? t("review.edit") : t("review.write")}</p>
      <div className="mt-2 flex gap-1" role="group" aria-label={t("pay.rate")}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => {
              setStars(n);
              setSaved(false);
            }}
            aria-label={t.n("pay.stars", n)}
            aria-pressed={stars === n}
            className="grid size-12 place-items-center rounded-full active:scale-90"
          >
            <Star className={`size-9 ${n <= stars ? "fill-marigold text-ink" : "text-ink/30"}`} strokeWidth={2} />
          </button>
        ))}
      </div>
      <label className="mt-2 block">
        <span className="sr-only">{t("review.text")}</span>
        <textarea
          value={text}
          maxLength={280}
          rows={3}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder={t("review.ph")}
          className="w-full rounded-2xl border-[2.5px] border-ink bg-white p-3 text-lg outline-none focus:outline-3 focus:outline-sky"
        />
      </label>
      <div className="mt-1 flex items-center justify-between text-sm text-ink-soft">
        <span>{t("review.points")}</span>
        <span className="tabular-nums">{text.length}/280</span>
      </div>
      <button onClick={send} disabled={pending || stars === 0 || saved} className="btn mt-3 w-full bg-chili text-white">
        {saved ? t("review.saved") : t("review.send")}
      </button>
      {error && (
        <p className="mt-2 font-bold text-chili" role="alert">
          {error}
        </p>
      )}
      <RewardToast reward={reward} />
    </div>
  );
}
