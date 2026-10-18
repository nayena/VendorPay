"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Compass, Navigation, Trash2 } from "lucide-react";
import { swipe } from "@/app/actions";
import { Stars } from "@/components/discover";
import { useT } from "@/components/I18n";
import { VendorMap } from "@/components/maps";
import { OpenDot } from "@/components/ui";
import { eventWhen } from "@/lib/city";
import { cardArt, cardHref, cardKey, cardSpot, directionsUrl, isLive, type Card } from "@/lib/feed";

export function PlansScreen({ cards, now, center }: { cards: Card[]; now: number; center: [number, number] }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [, startTransition] = useTransition();

  const shown = cards.filter((c) => !removed.has(cardKey(c)));
  // Live things first, then soonest events, then stalls that are closed right now.
  const sorted = [...shown].sort((a, b) => rank(a, now) - rank(b, now));

  const remove = (c: Card) =>
    startTransition(async () => {
      setRemoved((r) => new Set(r).add(cardKey(c)));
      await swipe(c.type, c.id, "skip");
    });

  if (shown.length === 0) {
    return (
      <div className="mx-4 block-card grid animate-rise place-items-center gap-3 p-8 text-center">
        <Compass className="size-12 text-chili" strokeWidth={2.5} />
        <h2 className="font-display text-2xl">{t("plans.empty")}</h2>
        <p className="text-ink-soft">{t("plans.emptySub")}</p>
        <Link href="/discover" className="btn mt-2 w-full bg-chili text-white">
          {t("nav.discover")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="relative h-[34dvh] overflow-hidden border-y-[2.5px] border-ink">
        <VendorMap vendors={[]} spots={sorted.map((c) => cardSpot(c, now))} center={center} selectedId={selected} onSelect={setSelected} />
      </div>
      <ul className="grid gap-3 px-4 pt-5">
        {sorted.map((c, i) => {
          const art = cardArt(c);
          const key = cardKey(c);
          return (
            <li
              key={key}
              className={`block-card animate-rise p-3 ${selected === key ? "outline-3 outline-sky" : ""}`}
              style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => setSelected(key)}
                  className="grid size-14 shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink text-3xl"
                  style={{ backgroundColor: art.color + "33" }}
                  aria-label={t("plans.showOnMap", { name: c.title })}
                >
                  {art.emoji}
                </button>
                <Link href={cardHref(c)} className="min-w-0 flex-1">
                  <span className="block truncate text-lg font-bold leading-tight">{c.title}</span>
                  <span className="block truncate text-sm text-ink-soft">{c.type === "event" ? t("disc.by", { name: c.subtitle }) : c.subtitle}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    {c.type === "vendor" ? (
                      <OpenDot open={c.isOpen} />
                    ) : (
                      <span className={`font-bold ${isLive(c, now) ? "text-chili" : ""}`}>{eventWhen(t, c.startsAt!, c.endsAt!, now)}</span>
                    )}
                    <Stars value={c.stars} />
                  </span>
                </Link>
              </div>
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                <a
                  href={directionsUrl(c.lat, c.lng)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[2.5px] border-ink bg-sky font-bold text-white"
                >
                  <Navigation className="size-5" strokeWidth={2.5} /> {c.approx ? t("plans.area") : t("plans.directions")}
                </a>
                <button
                  onClick={() => remove(c)}
                  aria-label={t("plans.remove", { name: c.title })}
                  className="grid min-h-12 w-12 place-items-center rounded-xl border-[2.5px] border-ink bg-white"
                >
                  <Trash2 className="size-5" strokeWidth={2.5} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function rank(c: Card, now: number) {
  if (isLive(c, now)) return 0;
  if (c.type === "event") return 1 + (c.startsAt! - now) / 1e12;
  return 3;
}
