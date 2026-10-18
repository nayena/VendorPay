import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, Trophy } from "lucide-react";
import { ShopperNav } from "@/components/discover";
import { CategoryChip, LangToggle, TopBar } from "@/components/ui";
import { explorerNo, timeAgo } from "@/lib/format";
import { BADGES, levelFor, LEVELS } from "@/lib/gamify";
import { getT } from "@/lib/lang";
import { currentCustomerId } from "@/lib/session";
import { explorerProfile } from "@/lib/store";
import { ProfileEditor } from "./ProfileEditor";

async function load() {
  const customerId = await currentCustomerId();
  return { customerId, profile: await explorerProfile(customerId), now: Date.now() };
}

export default async function MePage() {
  await connection(); // live data: render per request
  const [{ customerId, profile, now }, t] = await Promise.all([load(), getT()]);
  const points = profile?.explorer.points ?? 0;
  const { level, next, progress } = levelFor(points);
  const earned = new Set(profile?.badges.map((b) => b.id));

  return (
    <main className="flex flex-1 flex-col pb-24">
      <TopBar title={t("me.title")} right={<LangToggle />} />
      <div className="grid gap-6 px-4">
        <section className="block-card animate-rise overflow-hidden">
          <div className="flex items-center gap-4 bg-marigold p-4">
            <span className="grid size-20 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-white text-5xl" aria-hidden>
              {level.emoji}
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-2xl leading-tight">
                {profile?.explorer.nickname ?? (customerId ? t("me.anon", { n: explorerNo(customerId) }) : t("me.newbie"))}
              </p>
              <p className="font-bold">{t(`lvl.${level.key}`)}</p>
              {profile && <p className="text-sm font-bold">{t("me.rank", { n: profile.rank })}</p>}
            </div>
          </div>
          <div className="p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-4xl tabular-nums">{points}</span>
              <span className="text-sm font-bold text-ink-soft">
                {next ? t("me.toNext", { n: next.min - points, level: t(`lvl.${next.key}`) }) : t("me.maxLevel")}
              </span>
            </div>
            <div
              className="mt-2 h-4 overflow-hidden rounded-full border-[2.5px] border-ink bg-paper-2"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              aria-label={t("me.progress")}
            >
              <div className="h-full bg-chili" style={{ width: `${progress * 100}%` }} />
            </div>
            <ol className="mt-3 flex justify-between text-xs font-bold text-ink-soft">
              {LEVELS.map((l) => (
                <li key={l.key} className={points >= l.min ? "text-ink" : ""}>
                  {l.emoji} {l.min}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Link
          href="/leaderboard"
          className="block-card flex items-center gap-3 p-4 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-sky text-white">
            <Trophy className="size-6" strokeWidth={2.5} />
          </span>
          <span className="flex-1 font-display text-xl">{t("lb.title")}</span>
          <ChevronRight className="size-6 shrink-0" strokeWidth={2.5} />
        </Link>

        <section>
          <h2 className="mb-3 font-display text-xl">
            {t("me.badges")} <span className="text-ink-soft">· {earned.size}/{BADGES.length}</span>
          </h2>
          <ul className="grid grid-cols-3 gap-3">
            {BADGES.map((b) => {
              const has = earned.has(b.id);
              return (
                <li
                  key={b.id}
                  className={`flex flex-col items-center gap-1 rounded-2xl border-[2.5px] p-2 text-center ${
                    has ? "border-ink bg-white shadow-block-sm" : "border-dashed border-ink/30"
                  }`}
                >
                  <span className={`text-4xl ${has ? "" : "opacity-30 grayscale"}`} aria-hidden>
                    {b.emoji}
                  </span>
                  <span className="text-sm leading-tight font-bold">{t(`badge.${b.id}`)}</span>
                  <span className="text-xs leading-tight text-ink-soft">{has ? t("me.earned") : t(`badge.${b.id}.how`)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl">{t("me.visits")}</h2>
          {profile && profile.recent.length > 0 ? (
            <ul className="block-card divide-y-2 divide-ink/10 overflow-hidden">
              {profile.recent.map((c) => (
                <li key={c.id}>
                  <Link href={`/v/${c.vendorId}`} className="flex items-center gap-3 p-3">
                    <CategoryChip category={c.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.vendorName}</span>
                      <span className="block truncate text-sm text-ink-soft">
                        {c.eventTitle ? `${c.eventTitle} · ` : ""}
                        {timeAgo(c.at, t, now)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="block-card p-4">{t("me.noVisits")}</p>
          )}
        </section>

        <ProfileEditor nickname={profile?.explorer.nickname ?? ""} interests={profile?.explorer.interests ?? []} />
      </div>
      <ShopperNav />
    </main>
  );
}
