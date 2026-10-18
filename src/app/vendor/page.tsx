import Link from "next/link";
import { BarChart3, CalendarDays, ChevronRight, Clock, Heart, LogOut, MapPin, MessageSquare, PiggyBank, QrCode, Settings, UtensilsCrossed } from "lucide-react";
import { signOut } from "@/app/actions";
import { TransactionList } from "@/components/TransactionList";
import { Simulated, TopBar, TrustBadge } from "@/components/ui";
import { money, STALE_HOURS } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import type { Circle } from "@/lib/types";
import { LiveRefresh } from "@/components/LiveRefresh";
import { circleFor, getVendor, todaySales, touchActive, transactionsFor, trustStats, vendorWeek } from "@/lib/store";
import { BalanceCard, GoLiveHere, OpenToggle, PaymentAlerts } from "./DashboardClient";

export default async function Dashboard() {
  const vendor = await requireVendor();
  // Having the dashboard open counts as being at the stall, which keeps it from auto-closing.
  const [today, circle, stats, recent, week, t] = await Promise.all([
    todaySales(vendor.id),
    circleFor(vendor.id),
    trustStats(vendor.id),
    transactionsFor(vendor.id, 12),
    vendorWeek(vendor.id),
    getT(),
    touchActive(vendor.id),
  ]);
  const recipient = circle ? await getVendor(circle.memberIds[circle.round]) : null;
  const latest = recent.find((tx) => tx.kind === "payment") ?? null;

  return (
    <main className="flex flex-1 flex-col">
      <LiveRefresh />
      <TopBar
        title={vendor.name}
        right={
          <form action={signOut}>
            <button aria-label={t("dash.signOut")} className="grid size-12 place-items-center rounded-full text-ink-soft active:bg-paper-2">
              <LogOut className="size-6" strokeWidth={2.5} />
            </button>
          </form>
        }
      />

      <div className="grid gap-5 px-4 pb-24">
        <div className="flex flex-wrap items-center gap-2">
          <TrustBadge stats={stats} />
          <Simulated />
        </div>

        {vendor.autoClosed && (
          <p className="flex items-start gap-3 rounded-2xl border-[2.5px] border-ink bg-paper-2 p-4 font-bold" role="status">
            <Clock className="size-6 shrink-0" strokeWidth={2.5} />
            {t("dash.autoClosed", { h: STALE_HOURS })}
          </p>
        )}

        <OpenToggle isOpen={vendor.isOpen} />
        <GoLiveHere />

        <div className="grid grid-cols-2 gap-3">
          <div className="block-card bg-marigold p-4">
            <p className="text-sm font-bold uppercase tracking-wide">{t("dash.today")}</p>
            <p className="font-display text-4xl tabular-nums">{money(today.total)}</p>
            <p className="text-sm font-bold">{t.n("trust.sales", today.count)}</p>
          </div>
          <BalanceCard balance={vendor.balance} />
        </div>

        <Link href="/vendor/qr" className="btn w-full bg-chili text-white">
          <QrCode className="size-7" strokeWidth={2.5} /> {t("dash.qr")}
        </Link>

        <div className="grid grid-cols-2 gap-3">
          <Tile href="/vendor/events" icon={<CalendarDays className="size-7" strokeWidth={2.5} />} label={t("dash.events")} />
          <Tile href="/vendor/menu" icon={<UtensilsCrossed className="size-7" strokeWidth={2.5} />} label={t("dash.menu")} />
          <Tile href="/vendor/insights" icon={<BarChart3 className="size-7" strokeWidth={2.5} />} label={t("dash.insights")} />
          <Tile href="/vendor/settings" icon={<Settings className="size-7" strokeWidth={2.5} />} label={t("dash.settings")} />
        </div>

        <section className="block-card p-4">
          <h2 className="font-display text-xl">{t("dash.discovered")}</h2>
          <p className="text-sm text-ink-soft">{t("dash.discoveredSub")}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              { icon: <Heart className="size-5" strokeWidth={2.5} />, n: week.saves, label: t("dash.saves") },
              { icon: <MapPin className="size-5" strokeWidth={2.5} />, n: week.checkins, label: t("dash.visits") },
              { icon: <MessageSquare className="size-5" strokeWidth={2.5} />, n: week.reviews, label: t("dash.reviews") },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-paper-2 p-2">
                <dt className="flex items-center justify-center gap-1 text-xs font-bold uppercase tracking-wide">
                  {s.icon} {s.label}
                </dt>
                <dd className="font-display text-3xl tabular-nums">{s.n}</dd>
              </div>
            ))}
          </dl>
          <Link href={`/v/${vendor.id}`} className="mt-3 block text-center font-bold text-ink-soft underline">
            {t("dash.seeProfile")}
          </Link>
        </section>

        <Link
          href="/vendor/tanda"
          className="block-card flex items-center gap-3 p-4 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-rosa text-white">
            <PiggyBank className="size-6" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl leading-tight">{t("dash.circle")}</span>
            <span className="block text-sm font-bold text-ink-soft">
              {circle ? circleStatus(t, circle, vendor.id, recipient?.name) : t("dash.circleJoin")}
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0" strokeWidth={2.5} />
        </Link>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl">
            {t("dash.recent")}
            <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-nopal">
              <span className="size-2 animate-pulse rounded-full bg-nopal" /> {t("dash.live")}
            </span>
            <span className="ml-auto font-sans">
              <PaymentAlerts latest={latest && { id: latest.id, amount: latest.amount }} />
            </span>
          </h2>
          <TransactionList items={recent} refundable />
        </section>
      </div>
    </main>
  );
}

function Tile({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="block-card flex min-h-24 flex-col items-center justify-center gap-1.5 p-2 text-center font-bold leading-tight active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      {icon}
      {label}
    </Link>
  );
}

function circleStatus(t: T, circle: Circle, vendorId: string, recipientName?: string) {
  if (circle.memberIds[circle.round] === vendorId) return t("dash.circleTurn");
  if (!circle.paidThisRound.includes(vendorId)) return t("dash.circleChip", { amount: money(circle.contribution) });
  return t("dash.circlePaid", { name: recipientName?.split(" ")[0] ?? "—" });
}
