import Link from "next/link";
import { connection } from "next/server";
import { Heart, MapPin } from "lucide-react";
import { ShopperNav } from "@/components/discover";
import { CategoryChip, TopBar } from "@/components/ui";
import { levelFor } from "@/lib/gamify";
import { getT } from "@/lib/lang";
import { currentCustomerId } from "@/lib/session";
import { topExplorers, topVendors } from "@/lib/store";

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  await connection(); // live data: render per request
  const tab = (await searchParams).tab === "stalls" ? "stalls" : "explorers";
  const [customerId, t] = await Promise.all([currentCustomerId(), getT()]);

  return (
    <main className="flex flex-1 flex-col pb-24">
      <TopBar back="/me" title={t("lb.title")} />
      <div className="px-4">
        <div className="mb-4 flex rounded-full border-[2.5px] border-ink bg-white p-0.5 shadow-block-sm" role="tablist">
          {(["explorers", "stalls"] as const).map((k) => (
            <Link
              key={k}
              href={k === "explorers" ? "/leaderboard" : "/leaderboard?tab=stalls"}
              role="tab"
              aria-selected={tab === k}
              replace
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full font-bold ${tab === k ? "bg-ink text-white" : ""}`}
            >
              {t(k === "explorers" ? "lb.explorers" : "lb.stalls")}
            </Link>
          ))}
        </div>
        {tab === "explorers" ? <Explorers me={customerId} /> : <Stalls />}
      </div>
      <ShopperNav />
    </main>
  );
}

async function Explorers({ me }: { me: string | null }) {
  const [rows, t] = await Promise.all([topExplorers(), getT()]);
  if (rows.length === 0) return <p className="block-card p-5">{t("lb.empty")}</p>;
  return (
    <>
      <p className="mb-3 text-sm text-ink-soft">{t("lb.explorersSub")}</p>
      <ol className="grid gap-2">
        {rows.map((r, i) => {
          const { level } = levelFor(r.points);
          const mine = r.id === me;
          return (
            <li
              key={r.id}
              className={`flex items-center gap-3 rounded-2xl border-[2.5px] border-ink p-3 ${mine ? "bg-marigold shadow-block" : "bg-white"}`}
            >
              <span className="w-8 text-center font-display text-xl">{MEDALS[i] ?? i + 1}</span>
              <span className="text-2xl" aria-hidden>
                {level.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {r.nickname ?? t("me.anon", { n: r.no })}
                  {mine && <span className="font-normal"> {t("tanda.you")}</span>}
                </span>
                <span className="block text-sm text-ink-soft">{t(`lvl.${level.key}`)}</span>
              </span>
              <span className="font-display text-xl tabular-nums">{r.points}</span>
            </li>
          );
        })}
      </ol>
    </>
  );
}

async function Stalls() {
  const [rows, t] = await Promise.all([topVendors(), getT()]);
  if (rows.length === 0) return <p className="block-card p-5">{t("lb.emptyStalls")}</p>;
  return (
    <>
      <p className="mb-3 text-sm text-ink-soft">{t("lb.stallsSub")}</p>
      <ol className="grid gap-2">
        {rows.map((r, i) => (
          <li key={r.id}>
            <Link href={`/v/${r.id}`} className="flex items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-white p-3">
              <span className="w-8 text-center font-display text-xl">{MEDALS[i] ?? i + 1}</span>
              <CategoryChip category={r.category} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{r.name}</span>
                <span className="flex gap-3 text-sm text-ink-soft">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-4" strokeWidth={2.5} /> {t.n("lb.visits", r.checkins)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="size-4" strokeWidth={2.5} /> {t.n("lb.saves", r.saves)}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
