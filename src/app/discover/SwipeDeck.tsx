"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronRight, Heart, LoaderCircle, LocateFixed, MapPin, Megaphone, PartyPopper, X } from "lucide-react";
import { saveInterests, swipe, type Reward } from "@/app/actions";
import { InterestPicker, RewardToast, Stars } from "@/components/discover";
import { useT } from "@/components/I18n";
import { LangToggle } from "@/components/ui";
import { eventWhen } from "@/lib/city";
import { distanceM, formatDistance } from "@/lib/format";
import { cardArt, cardHref, cardKey, interestEmoji, interestLabel, isLive, rankFeed, type Card } from "@/lib/feed";
import { levelFor } from "@/lib/gamify";
import type { Interest } from "@/lib/types";

/** Farther than this from the city center, distances are measured from the center instead. */
const FAR_M = 30_000;
/** How far a card has to be dragged to count as a swipe. */
const SWIPE_PX = 110;

type Dir = "save" | "skip";

export function SwipeDeck({
  cards,
  center,
  interests: savedInterests,
  points,
  now,
}: {
  cards: Card[];
  center: [number, number];
  /** Null when the shopper hasn't picked any yet. */
  interests: Interest[] | null;
  points: number;
  /** Server time of this render, for "live now" and "starts in…". */
  now: number;
}) {
  const t = useT();
  const [origin, setOrigin] = useState<[number, number]>(center);
  const [locate, setLocate] = useState<"idle" | "locating" | "done" | "failed" | "far">("idle");
  const [interests, setInterests] = useState<Interest[]>(savedInterests ?? []);
  const [picking, setPicking] = useState(savedInterests === null);
  // Swiped this visit. The server stops sending them too, but only after the action returns.
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  const [reward, setReward] = useState<(Reward & { at: number }) | null>(null);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const ranked = useMemo(
    () => rankFeed(cards.filter((c) => !gone.has(cardKey(c))), { origin, interests, now }),
    [cards, gone, origin, interests, now],
  );
  // The card on top stays on top when fresh data re-ranks the rest underneath it.
  const [holdKey, setHoldKey] = useState<string | null>(null);
  const deck = useMemo(() => {
    const i = holdKey ? ranked.findIndex((c) => cardKey(c) === holdKey) : -1;
    return i <= 0 ? ranked : [ranked[i], ...ranked.slice(0, i), ...ranked.slice(i + 1)];
  }, [ranked, holdKey]);
  const top = deck[0] ?? null;
  if (top && cardKey(top) !== holdKey) setHoldKey(cardKey(top));

  // ---------- dragging ----------
  const [drag, setDrag] = useState<{ dx: number; dy: number; leaving: Dir | null }>({ dx: 0, dy: 0, leaving: null });
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function commit(dir: Dir) {
    if (!top || drag.leaving) return;
    const card = top;
    setDrag({ dx: dir === "save" ? 520 : -520, dy: drag.dy, leaving: dir });
    navigator.vibrate?.(dir === "save" ? 30 : 10);
    setTimeout(() => {
      setGone((g) => new Set(g).add(cardKey(card)));
      setHoldKey(null);
      setDrag({ dx: 0, dy: 0, leaving: null });
    }, 220);
    startTransition(async () => {
      const res = await swipe(card.type, card.id, dir);
      if (!res.ok) return setError(res.error);
      setError("");
      if (res.points || res.badges.length) setReward({ points: res.points, badges: res.badges, at: Date.now() });
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (drag.leaving) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - s.x, dy: (e.clientY - s.y) * 0.3, leaving: null });
  }
  function onPointerUp() {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    if (Math.abs(drag.dx) > SWIPE_PX) commit(drag.dx > 0 ? "save" : "skip");
    else setDrag({ dx: 0, dy: 0, leaving: null });
  }

  // Arrow keys work like the buttons.
  const commitRef = useRef(commit);
  useEffect(() => {
    commitRef.current = commit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") commitRef.current("save");
      if (e.key === "ArrowLeft") commitRef.current("skip");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function findMe() {
    if (!("geolocation" in navigator)) return setLocate("failed");
    setLocate("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const me: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const far = distanceM(me, center) > FAR_M;
        setOrigin(far ? center : me);
        setLocate(far ? "far" : "done");
        setHoldKey(null); // re-rank from the new spot, top card included
      },
      () => setLocate("failed"),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  function finishPicking() {
    setPicking(false);
    setHoldKey(null);
    startTransition(async () => {
      await saveInterests(interests);
    });
  }

  const { level } = levelFor(points);
  const tilt = drag.dx / 18;
  const stamp = Math.min(1, Math.abs(drag.dx) / SWIPE_PX);

  return (
    <>
      <header className="flex items-center gap-2 px-4 pt-4 pb-2">
        <h1 className="font-display text-3xl text-chili">{t("disc.title")}</h1>
        <Link
          href="/me"
          className="ml-auto flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink bg-marigold px-3 font-bold shadow-block-sm"
          aria-label={t("disc.myPoints", { n: points })}
        >
          <span aria-hidden>{level.emoji}</span> {points}
        </Link>
        <LangToggle className="px-2.5" />
      </header>

      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          onClick={findMe}
          disabled={locate === "locating"}
          aria-pressed={locate === "done"}
          className={`flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink px-3 font-bold shadow-block-sm ${
            locate === "done" ? "bg-sky text-white" : "bg-white"
          }`}
        >
          {locate === "locating" ? (
            <LoaderCircle className="size-5 animate-spin" strokeWidth={2.5} />
          ) : (
            <LocateFixed className="size-5" strokeWidth={2.5} />
          )}
          {locate === "locating" ? t("map.locating") : t("map.nearMe")}
        </button>
        <button onClick={() => setPicking(true)} className="flex min-h-11 items-center gap-1 rounded-full px-2 font-bold text-ink-soft underline">
          {interests.length ? t("disc.interestsN", { n: interests.length }) : t("disc.interests")}
        </button>
      </div>
      {(locate === "failed" || locate === "far") && (
        <p className="mx-4 mb-3 rounded-2xl bg-paper-2 px-4 py-2 text-sm font-bold" role="status">
          {locate === "failed" ? t("map.noLocation") : t("map.far")}
        </p>
      )}

      <section className="relative mx-4 flex-1" aria-roledescription={t("disc.deck")} aria-label={t("disc.deck")}>
        {top ? (
          <div className="relative h-[min(30rem,62dvh)]">
            {deck
              .slice(0, 3)
              .reverse()
              .map((c, i, arr) => {
                const depth = arr.length - 1 - i; // 0 = top card
                const isTop = depth === 0;
                return (
                  <article
                    key={cardKey(c)}
                    aria-hidden={!isTop}
                    onPointerDown={isTop ? onPointerDown : undefined}
                    onPointerMove={isTop ? onPointerMove : undefined}
                    onPointerUp={isTop ? onPointerUp : undefined}
                    onPointerCancel={isTop ? onPointerUp : undefined}
                    className={`block-card absolute inset-0 flex touch-none flex-col overflow-hidden select-none ${isTop ? "cursor-grab active:cursor-grabbing" : ""}`}
                    style={
                      isTop
                        ? {
                            transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${tilt}deg)`,
                            transition: dragging ? "none" : "transform 0.22s ease-out",
                          }
                        : { transform: `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`, transition: "transform 0.22s ease-out" }
                    }
                  >
                    <CardFace card={c} origin={origin} now={now} />
                    {isTop && (
                      <>
                        <Stamp show={drag.dx > 0 ? stamp : 0} className="left-5 rotate-[-14deg] border-nopal text-nopal">
                          {t("disc.save")}
                        </Stamp>
                        <Stamp show={drag.dx < 0 ? stamp : 0} className="right-5 rotate-[14deg] border-chili text-chili">
                          {t("disc.skip")}
                        </Stamp>
                      </>
                    )}
                  </article>
                );
              })}
          </div>
        ) : (
          <div className="block-card grid animate-rise place-items-center gap-3 p-8 text-center">
            <PartyPopper className="size-12 text-rosa" strokeWidth={2.5} />
            <h2 className="font-display text-2xl">{t("disc.empty")}</h2>
            <p className="text-ink-soft">{t("disc.emptySub")}</p>
            <div className="mt-2 grid w-full gap-3">
              <Link href="/discover/plans" className="btn bg-rosa text-white">
                {t("nav.plans")}
              </Link>
              <Link href="/map" className="btn bg-white">
                {t("nav.map")}
              </Link>
            </div>
          </div>
        )}

        {top && (
          <div className="mt-5 flex items-center justify-center gap-6">
            <button
              onClick={() => commit("skip")}
              aria-label={t("disc.skipAria", { name: top.title })}
              className="grid size-16 place-items-center rounded-full border-[3px] border-ink bg-white shadow-block active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <X className="size-9 text-chili" strokeWidth={3} />
            </button>
            <Link
              href={cardHref(top)}
              className="grid size-12 place-items-center rounded-full border-[2.5px] border-ink bg-white shadow-block-sm"
              aria-label={t("disc.details", { name: top.title })}
            >
              <ChevronRight className="size-6" strokeWidth={2.75} />
            </Link>
            <button
              onClick={() => commit("save")}
              aria-label={t("disc.saveAria", { name: top.title })}
              className="grid size-16 place-items-center rounded-full border-[3px] border-ink bg-rosa shadow-block active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
            >
              <Heart className="size-9 fill-white text-white" strokeWidth={2.5} />
            </button>
          </div>
        )}
        {top && <p className="mt-3 text-center text-sm text-ink-soft">{t("disc.hint")}</p>}
        {error && (
          <p className="mt-2 text-center font-bold text-chili" role="alert">
            {error}
          </p>
        )}
      </section>

      {picking && (
        <div className="fixed inset-0 z-[1200] flex items-end bg-ink/50" role="dialog" aria-modal aria-labelledby="int-title">
          <div className="mx-auto w-full max-w-md animate-rise rounded-t-3xl border-t-[3px] border-ink bg-paper p-5 pb-8">
            <h2 id="int-title" className="font-display text-3xl">
              {t("int.title")}
            </h2>
            <p className="mt-1 mb-4 text-ink-soft">{t("int.sub")}</p>
            <InterestPicker value={interests} onChange={setInterests} />
            <button onClick={finishPicking} className="btn mt-6 w-full bg-chili text-white">
              {interests.length ? t("int.done") : t("int.skip")}
            </button>
          </div>
        </div>
      )}

      <RewardToast reward={reward} />
    </>
  );
}

function Stamp({ show, className, children }: { show: number; className: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-6 rounded-xl border-4 bg-white/90 px-3 py-1 font-display text-3xl uppercase ${className}`}
      style={{ opacity: show }}
    >
      {children}
    </span>
  );
}

function CardFace({ card: c, origin, now }: { card: Card; origin: [number, number]; now: number }) {
  const t = useT();
  const art = cardArt(c);
  const live = isLive(c, now);
  const distance = distanceM(origin, [c.lat, c.lng]);
  return (
    <>
      <div className="relative grid h-[42%] shrink-0 place-items-center border-b-[2.5px] border-ink" style={{ backgroundColor: art.color }}>
        <span className="text-[6.5rem] leading-none drop-shadow-[3px_3px_0_rgb(34_21_13/0.35)]" aria-hidden>
          {art.emoji}
        </span>
        <div className="absolute top-3 left-3 flex flex-wrap gap-2">
          {live ? (
            <span className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-sm font-bold text-chili">
              <span className="size-2.5 animate-pulse rounded-full bg-chili" /> {t("disc.live")}
            </span>
          ) : (
            c.startsAt !== null &&
            c.endsAt !== null && (
              <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-sm font-bold">{eventWhen(t, c.startsAt, c.endsAt, now)}</span>
            )
          )}
          {c.boostUntil > now && (
            <span className="flex items-center gap-1 rounded-full border-2 border-ink bg-marigold px-2.5 py-0.5 text-sm font-bold">
              <Megaphone className="size-4" strokeWidth={2.5} /> {t("disc.boosted")}
            </span>
          )}
        </div>
        <span className="absolute right-3 bottom-3 rounded-full border-2 border-ink bg-ink px-2.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
          {c.type === "vendor" ? t("disc.stall") : t(`kind.${c.kind!}`)}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-4">
        <h2 className="font-display text-[1.9rem] leading-[1.05]">{c.title}</h2>
        <p className="mt-1 truncate font-bold text-ink-soft">
          {c.type === "event" ? t("disc.by", { name: c.subtitle }) : c.subtitle}
        </p>
        {c.type === "event" && live && c.endsAt !== null && (
          <p className="text-sm font-bold text-chili">{eventWhen(t, c.startsAt!, c.endsAt, now)}</p>
        )}
        <p className="mt-2 flex items-center gap-1.5">
          <MapPin className="size-5 shrink-0 text-chili" strokeWidth={2.5} />
          <strong>{formatDistance(distance)}</strong>
          <span className="truncate text-ink-soft">· {c.spot ?? t("map.approx")}</span>
        </p>
        {c.blurb && <p className="mt-2 line-clamp-3 leading-snug">{c.blurb}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <Stars value={c.stars} className="mr-1" />
          {c.tags.slice(0, 4).map((tag) => (
            <span key={tag} className="rounded-full bg-paper-2 px-2.5 py-1 text-sm font-bold">
              {interestEmoji(tag)} {t(interestLabel(tag))}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
