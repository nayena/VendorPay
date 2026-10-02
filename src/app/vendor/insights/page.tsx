import { TopBar } from "@/components/ui";
import { money } from "@/lib/format";
import { getT } from "@/lib/lang";
import { CITY, msSinceMidnight } from "@/lib/seed";
import { requireVendor } from "@/lib/session";
import { paymentsSince } from "@/lib/store";
import { WeekChart } from "./WeekChart";

const DAY = 24 * 60 * 60 * 1000;

async function loadInsights(vendorId: string, locale: string) {
  const now = Date.now();
  const todayStart = now - msSinceMidnight(now);
  const txs = await paymentsSince(vendorId, todayStart - 29 * DAY);
  // Test payments to your own stall aren't real sales.
  const real = txs.filter((tx) => tx.customerId !== "self");

  // Net takings (payments minus refunds) for each of the last 7 days, in the city's time zone.
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: CITY.timeZone });
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = todayStart - (6 - i) * DAY;
    const total = real
      .filter((tx) => tx.createdAt >= start && tx.createdAt < start + DAY)
      .reduce((s, tx) => s + (tx.kind === "payment" ? tx.amount : -tx.amount), 0);
    return { label: weekday.format(start + DAY / 2), total: Math.max(0, total), today: i === 6 };
  });
  const weekTotal = days.reduce((s, d) => s + d.total, 0);

  const payments = real.filter((tx) => tx.kind === "payment");
  const hourOf = new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: CITY.timeZone });
  const byHour = new Map<number, number>();
  for (const tx of payments) {
    const h = Number(hourOf.format(tx.createdAt));
    byHour.set(h, (byHour.get(h) ?? 0) + tx.amount);
  }
  const bestHours = [...byHour.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const bestMax = bestHours[0]?.[1] ?? 0;

  const perCustomer = new Map<string, number>();
  for (const tx of payments) if (tx.customerId) perCustomer.set(tx.customerId, (perCustomer.get(tx.customerId) ?? 0) + 1);
  const regulars = [...perCustomer.values()].filter((n) => n >= 2).length;
  const avg = payments.length ? payments.reduce((s, tx) => s + tx.amount, 0) / payments.length : 0;
  return { days, weekTotal, payments, bestHours, bestMax, regulars, avg };
}

export default async function InsightsPage() {
  const vendor = await requireVendor();
  const t = await getT();
  const { days, weekTotal, payments, bestHours, bestMax, regulars, avg } = await loadInsights(vendor.id, t.lang === "es" ? "es-MX" : "en-US");

  const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title={t("ins.title")} />
      <div className="grid gap-5 px-4 pb-10">
        {payments.length < 3 ? (
          <p className="block-card p-5 text-lg">{t("ins.noData")}</p>
        ) : (
          <>
            <section className="block-card p-4">
              <h2 className="font-display text-xl">{t("ins.week")}</h2>
              <p className="text-3xl font-bold">{t("ins.weekTotal", { amount: money(weekTotal) })}</p>
              <WeekChart days={days} label={t("ins.chartLabel")} />
            </section>

            <div className="grid grid-cols-2 gap-3">
              <div className="block-card p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t("ins.avg")}</p>
                <p className="text-3xl font-bold">{money(avg)}</p>
              </div>
              <div className="block-card p-4">
                <p className="text-sm font-bold uppercase tracking-wide text-ink-soft">{t("ins.regulars")}</p>
                <p className="text-3xl font-bold">{regulars}</p>
                <p className="text-sm leading-tight text-ink-soft">{t("ins.regularsSub")}</p>
              </div>
            </div>

            <section className="block-card p-4">
              <h2 className="font-display text-xl">{t("ins.best")}</h2>
              <p className="mb-3 text-sm text-ink-soft">{t("ins.bestSub")}</p>
              <ol className="grid gap-3">
                {bestHours.map(([h, total]) => (
                  <li key={h}>
                    <div className="flex justify-between font-bold">
                      <span>{hourLabel(h)}</span>
                      <span>{money(total)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-paper-2">
                      <div className="h-full rounded-full bg-nopal" style={{ width: `${(total / bestMax) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
