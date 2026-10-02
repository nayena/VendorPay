"use client";

import Link from "next/link";
import { useTransition } from "react";
import { ArrowLeft, BadgeCheck, Languages, Sprout, Star } from "lucide-react";
import { setLang } from "@/app/actions";
import { CATEGORIES, trust } from "@/lib/format";
import type { Category, TrustStats } from "@/lib/types";
import { useT } from "./I18n";

const FLAG_COLORS = ["#c0360c", "#f5a524", "#d1206a", "#1d6b43", "#0e6e8c", "#7b3fa0"];

/** Papel picado: a string of cut-paper flags, the app's recurring motif. */
export function PapelPicado({ count = 9, className = "" }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={`relative flex justify-between px-1 ${className}`}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-ink/70" />
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-9 w-7 origin-top animate-sway"
          style={{
            animationDelay: `${(i % 4) * -0.8}s`,
            backgroundColor: FLAG_COLORS[i % FLAG_COLORS.length],
            backgroundImage:
              "radial-gradient(circle at 50% 38%, var(--color-paper) 0 3px, transparent 3.5px), radial-gradient(circle at 25% 62%, var(--color-paper) 0 2px, transparent 2.5px), radial-gradient(circle at 75% 62%, var(--color-paper) 0 2px, transparent 2.5px)",
            clipPath:
              "polygon(0 0,100% 0,100% 78%,87.5% 100%,75% 78%,62.5% 100%,50% 78%,37.5% 100%,25% 78%,12.5% 100%,0 78%)",
          }}
        />
      ))}
    </div>
  );
}

export function TopBar({ back, title, right }: { back?: string; title?: string; right?: React.ReactNode }) {
  const t = useT();
  return (
    <header className="sticky top-0 z-[1000] flex h-16 items-center gap-3 bg-paper/95 px-4 backdrop-blur">
      {back && (
        <Link
          href={back}
          aria-label={t("back")}
          className="grid size-12 shrink-0 place-items-center rounded-full border-[2.5px] border-ink bg-white shadow-block-sm active:translate-x-0.5 active:translate-y-0.5"
        >
          <ArrowLeft className="size-6" strokeWidth={2.75} />
        </Link>
      )}
      {title && <h1 className="flex-1 truncate font-display text-2xl">{title}</h1>}
      {right}
    </header>
  );
}

export function Simulated({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <span
      className={`inline-flex items-center rounded-full border-2 border-dashed border-ink-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink-soft ${className}`}
    >
      {t("simulated")}
    </span>
  );
}

/** Switches between Spanish and English. Shows the language you'd switch *to*. */
export function LangToggle({ className = "" }: { className?: string }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  return (
    <button
      onClick={() => startTransition(() => setLang(t.lang === "es" ? "en" : "es"))}
      disabled={pending}
      aria-label={t("lang.aria")}
      lang={t.lang === "es" ? "en" : "es"}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink bg-white px-3 font-bold shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60 ${className}`}
    >
      <Languages className="size-5" strokeWidth={2.5} /> {t("lang.switch")}
    </button>
  );
}

export function TrustBadge({ stats, size = "md" }: { stats: TrustStats; size?: "sm" | "md" }) {
  const t = useT();
  const tr = trust(stats);
  const small = size === "sm";
  const pad = small ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const icon = small ? "size-3.5" : "size-4";
  if (tr.score === null) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-paper-2 font-bold text-ink ${pad}`}>
        <Sprout className={icon} strokeWidth={2.5} /> {t("trust.new")}
      </span>
    );
  }
  const trusted = tr.level === "trusted";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold ${trusted ? "bg-nopal text-white" : "bg-marigold text-ink"} ${pad}`}
      title={t("trust.detail", { customers: stats.customers, ratings: stats.ratingCount })}
    >
      {trusted ? <BadgeCheck className={icon} strokeWidth={2.5} /> : <Star className={icon} strokeWidth={2.5} />}
      {tr.score.toFixed(1)}
      <span className="font-normal opacity-85">· {t.n("trust.sales", stats.sales)}</span>
    </span>
  );
}

export function CategoryChip({ category, big = false }: { category: Category; big?: boolean }) {
  const t = useT();
  const c = CATEGORIES[category];
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink ${big ? "size-20 text-5xl" : "size-14 text-3xl"}`}
      style={{ backgroundColor: c.color + "22" }}
      aria-label={t(`cat.${category}`)}
      role="img"
    >
      {c.emoji}
    </span>
  );
}

export function OpenDot({ open }: { open: boolean }) {
  const t = useT();
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${open ? "text-nopal" : "text-ink-soft"}`}>
      <span className={`size-2.5 rounded-full ${open ? "bg-nopal shadow-[0_0_0_3px_rgb(29_107_67/0.25)]" : "bg-ink-soft/50"}`} />
      {open ? t("open.now") : t("open.closed")}
    </span>
  );
}
