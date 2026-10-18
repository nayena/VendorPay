"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useOptimistic, useState, useTransition } from "react";
import { Compass, Heart, LoaderCircle, MapPin, Map as MapIcon, Sparkles, Star, User } from "lucide-react";
import { checkInGps, swipe, type Reward } from "@/app/actions";
import { INTERESTS, interestEmoji, interestLabel } from "@/lib/feed";
import { badgeInfo } from "@/lib/gamify";
import type { Interest } from "@/lib/types";
import { useT } from "./I18n";

export function Stars({ value, className = "" }: { value: number | null; className?: string }) {
  if (value === null) return null;
  return (
    <span className={`inline-flex items-center gap-1 font-bold ${className}`}>
      <Star className="size-4 fill-marigold text-ink" strokeWidth={2} /> {value.toFixed(1)}
    </span>
  );
}

/** "+20 points" and any new badges, popping up from the bottom for a few seconds. */
export function RewardToast({ reward, message }: { reward: (Reward & { at: number }) | null; message?: string }) {
  const t = useT();
  const [shown, setShown] = useState(reward);
  if (reward && reward.at !== shown?.at) setShown(reward);

  useEffect(() => {
    if (!shown) return;
    if (shown.badges.length) navigator.vibrate?.([80, 60, 80]);
    const id = setTimeout(() => setShown(null), shown.badges.length ? 5000 : 2600);
    return () => clearTimeout(id);
  }, [shown]);

  if (!shown || (shown.points === 0 && shown.badges.length === 0 && !message)) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[1100] mx-auto grid max-w-md gap-2 px-4">
      {(shown.points > 0 || message) && (
        <div key={shown.at} className="flex animate-pop items-center gap-3 rounded-2xl border-[3px] border-ink bg-marigold p-3 shadow-block">
          <Sparkles className="size-7 shrink-0" strokeWidth={2.5} />
          <span className="font-bold leading-tight">
            {message && <span className="block">{message}</span>}
            {shown.points > 0 && <span className="font-display text-2xl">{t("reward.points", { n: shown.points })}</span>}
          </span>
        </div>
      )}
      {shown.badges.map((id, i) => {
        const b = badgeInfo(id);
        if (!b) return null;
        return (
          <div
            key={id}
            className="flex animate-pop items-center gap-3 rounded-2xl border-[3px] border-ink bg-rosa p-3 text-white shadow-block"
            style={{ animationDelay: `${150 + i * 150}ms` }}
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-white text-3xl">{b.emoji}</span>
            <span>
              <span className="block text-xs font-bold uppercase tracking-wider">{t("reward.badge")}</span>
              <span className="font-display text-xl leading-tight">{t(`badge.${id}`)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function InterestPicker({ value, onChange }: { value: Interest[]; onChange: (v: Interest[]) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("int.title")}>
      {INTERESTS.map((i) => {
        const on = value.includes(i);
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i])}
            className={`flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink px-3 font-bold ${
              on ? "bg-marigold shadow-block-sm" : "bg-white"
            }`}
          >
            <span aria-hidden>{interestEmoji(i)}</span> {t(interestLabel(i))}
          </button>
        );
      })}
    </div>
  );
}

/** Checks in by GPS: the shopper has to be standing near the stall or event. */
export function CheckInButton({ vendorId, eventId, className = "" }: { vendorId: string; eventId?: string; className?: string }) {
  const t = useT();
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [reward, setReward] = useState<(Reward & { at: number }) | null>(null);
  const [done, setDone] = useState(false);

  function go() {
    setError("");
    if (!("geolocation" in navigator)) return setError(t("checkin.noGps"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        startTransition(async () => {
          const res = await checkInGps(vendorId, pos.coords.latitude, pos.coords.longitude, eventId);
          if (!res.ok) return setError(res.error);
          setDone(true);
          setReward({ points: res.points, badges: res.badges, at: Date.now() });
        });
      },
      () => {
        setLocating(false);
        setError(t("checkin.noGps"));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  const busy = locating || pending;
  return (
    <div className={className}>
      <button onClick={go} disabled={busy || done} className="btn w-full bg-nopal text-white">
        {busy ? <LoaderCircle className="size-6 animate-spin" strokeWidth={2.5} /> : <MapPin className="size-6" strokeWidth={2.5} />}
        {done ? t("checkin.done") : locating ? t("map.locating") : t("checkin.btn")}
      </button>
      {error && (
        <p className="mt-2 font-bold text-chili" role="alert">
          {error}
        </p>
      )}
      {!done && !error && <p className="mt-2 text-center text-sm text-ink-soft">{t("checkin.hint")}</p>}
      <RewardToast reward={reward} message={done ? t("checkin.thanks") : undefined} />
    </div>
  );
}

/** Heart toggle for saving a stall or event to "My plans" outside the deck. */
export function SaveButton({ type, id, saved }: { type: "vendor" | "event"; id: string; saved: boolean }) {
  const t = useT();
  const [on, setOn] = useOptimistic(saved);
  const [, startTransition] = useTransition();
  const [reward, setReward] = useState<(Reward & { at: number }) | null>(null);
  const flip = () =>
    startTransition(async () => {
      setOn(!on);
      const res = await swipe(type, id, on ? "skip" : "save");
      if (res.ok && res.points) setReward({ points: res.points, badges: res.badges, at: Date.now() });
    });
  return (
    <>
      <button
        onClick={flip}
        aria-pressed={on}
        aria-label={on ? t("save.remove") : t("save.add")}
        className={`grid size-14 shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
          on ? "bg-rosa text-white" : "bg-white"
        }`}
      >
        <Heart className={`size-7 ${on ? "fill-white" : ""}`} strokeWidth={2.5} />
      </button>
      <RewardToast reward={reward} />
    </>
  );
}

const NAV = [
  { href: "/discover", icon: Compass, key: "nav.discover" },
  { href: "/map", icon: MapIcon, key: "nav.map" },
  { href: "/discover/plans", icon: Heart, key: "nav.plans" },
  { href: "/me", icon: User, key: "nav.me" },
] as const;

/** Bottom tabs for the shopper side. Pages that show it leave room at the bottom (pb-24). */
export function ShopperNav() {
  const t = useT();
  const path = usePathname();
  return (
    <nav
      aria-label={t("nav.label")}
      className="fixed inset-x-0 bottom-0 z-[1050] mx-auto max-w-md border-t-[2.5px] border-ink bg-paper/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur print:hidden"
    >
      <ul className="grid grid-cols-4">
        {NAV.map(({ href, icon: Icon, key }) => {
          const on = path === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-xs font-bold ${on ? "text-chili" : "text-ink-soft"}`}
              >
                <span className={`grid h-8 w-12 place-items-center rounded-full ${on ? "bg-chili text-white" : ""}`}>
                  <Icon className="size-5" strokeWidth={2.5} />
                </span>
                {t(key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
