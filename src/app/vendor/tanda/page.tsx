import { Check, Clock, Crown, TriangleAlert } from "lucide-react";
import { CategoryChip, Simulated, TopBar } from "@/components/ui";
import { money } from "@/lib/format";
import type { T } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import { circleFor, getVendors, invitesFor, openCircles, trustStats } from "@/lib/store";
import { AutoPayToggle, CircleButton, CreateCircleForm, InviteForm, RemindButton } from "./CircleActions";

export default async function TandaPage() {
  const vendor = await requireVendor();
  const [circle, t] = await Promise.all([circleFor(vendor.id), getT()]);

  if (!circle) {
    const [available, invites, stats] = await Promise.all([openCircles(), invitesFor(vendor), trustStats(vendor.id)]);
    const trusted = stats.sales >= 3;
    return (
      <main className="flex flex-1 flex-col">
        <TopBar back="/vendor" title={t("tanda.title")} right={<Simulated />} />
        <div className="grid gap-5 px-5 pb-10">
          <Explainer t={t} />

          {invites.map((inv) => (
            <div key={inv.circleId} className="block-card animate-pop bg-marigold p-4">
              <p className="text-sm font-bold uppercase tracking-wide">{t("tanda.invites")}</p>
              <h2 className="font-display text-2xl">{inv.circleName}</h2>
              <p className="mb-3">{t("tanda.invitedBy", { name: inv.invitedBy })}</p>
              <CircleButton circleId={inv.circleId} action="accept" className="btn w-full bg-rosa text-white">
                {t("tanda.accept")}
              </CircleButton>
            </div>
          ))}

          {!trusted && (
            <p className="flex items-start gap-2 rounded-2xl bg-paper-2 p-4 font-bold">
              <TriangleAlert className="size-5 shrink-0" strokeWidth={2.5} /> {t("tanda.needTrust")}
            </p>
          )}

          {available.map((c) => (
            <div key={c.id} className="block-card p-4">
              <h2 className="font-display text-2xl">{c.name}</h2>
              <p className="mt-1 text-lg">{t("tanda.members", { n: c.memberIds.length, amount: money(c.contribution) })}</p>
              {trusted && (
                <div className="mt-4">
                  <CircleButton circleId={c.id} action="join" className="btn w-full bg-rosa text-white">
                    {t("tanda.join")}
                  </CircleButton>
                </div>
              )}
            </div>
          ))}

          {trusted && <CreateCircleForm />}
        </div>
      </main>
    );
  }

  const members = await getVendors(circle.memberIds);
  const recipient = members[circle.round];
  const pot = circle.contribution * members.length;
  const iPaid = circle.paidThisRound.includes(vendor.id);
  const myTurn = recipient?.id === vendor.id;
  const paidCount = circle.paidThisRound.length;

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title={circle.name} right={<Simulated />} />
      <div className="grid gap-5 px-4 pb-10">
        {/* The pot, and who gets it this round. */}
        <div className={`block-card animate-rise p-5 text-center ${myTurn ? "bg-marigold" : "bg-rosa text-white"}`}>
          <p className="text-sm font-bold uppercase tracking-wider">{t("tanda.weekPot", { n: circle.round + 1 })}</p>
          <p className="font-display text-6xl tabular-nums">{money(pot)}</p>
          <p className="mt-1 text-lg font-bold">{myTurn ? t("tanda.toYou") : t("tanda.toName", { name: recipient?.name ?? "—" })}</p>
          <div className="mx-auto mt-4 h-4 max-w-64 overflow-hidden rounded-full border-2 border-ink bg-white">
            <div className="h-full bg-nopal transition-all" style={{ width: `${(paidCount / members.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-bold">{t("tanda.paidOf", { paid: paidCount, total: members.length })}</p>
        </div>

        {iPaid ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl border-[2.5px] border-nopal bg-white p-4 text-lg font-bold text-nopal">
            <Check className="size-6" strokeWidth={3} /> {t("tanda.youPaid")}
          </p>
        ) : (
          <CircleButton circleId={circle.id} action="chip" className="btn w-full bg-nopal text-white">
            {t("tanda.chip", { amount: money(circle.contribution) })}
          </CircleButton>
        )}

        <AutoPayToggle on={circle.autoPayIds.includes(vendor.id)} />

        <section>
          <h2 className="mb-3 font-display text-xl">{t("tanda.order")}</h2>
          <ol className="block-card divide-y-2 divide-ink/10 overflow-hidden">
            {members.map((m, i) => {
              const paid = circle.paidThisRound.includes(m.id);
              const current = i === circle.round;
              // Took the pot earlier this cycle but hasn't paid this week: the classic tanda risk.
              const owes = i < circle.round && !paid;
              const ahead = i - circle.round;
              return (
                <li key={m.id} className={`flex items-center gap-3 px-3 py-3 ${current ? "bg-marigold/40" : owes ? "bg-chili/10" : ""}`}>
                  <span className="w-5 text-center font-display text-lg text-ink-soft">{i + 1}</span>
                  <CategoryChip category={m.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {m.name}
                      {m.id === vendor.id && <span className="font-normal text-ink-soft"> {t("tanda.you")}</span>}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {current ? (
                        <span className="inline-flex items-center gap-1 font-bold text-ink">
                          <Crown className="size-4" strokeWidth={2.5} /> {t("tanda.getsNow")}
                        </span>
                      ) : owes ? (
                        <span className="inline-flex items-center gap-1 font-bold text-chili">
                          <TriangleAlert className="size-4" strokeWidth={2.5} /> {t("tanda.owes")}
                        </span>
                      ) : i < circle.round ? (
                        t("tanda.got")
                      ) : (
                        t.n("tanda.turnIn", ahead)
                      )}
                    </span>
                  </span>
                  {paid ? (
                    <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-nopal text-white" aria-label={t("tanda.paid")}>
                      <Check className="size-5" strokeWidth={3} />
                    </span>
                  ) : m.id !== vendor.id ? (
                    <RemindButton circleId={circle.id} memberId={m.id} />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full border-2 border-dashed border-ink-soft text-ink-soft" aria-label={t("tanda.notPaid")}>
                      <Clock className="size-5" strokeWidth={2.5} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 px-1 text-sm text-ink-soft">
            {t("tanda.everyone", { amount: money(circle.contribution), n: circle.cycle })} {t("tanda.orderNote")}
          </p>
        </section>

        <InviteForm circleId={circle.id} />

        {paidCount < members.length && (
          <div className="rounded-2xl border-2 border-dashed border-ink-soft p-4">
            <p className="mb-3 text-sm font-bold text-ink-soft">{t("tanda.demo")}</p>
            <CircleButton circleId={circle.id} action="others" className="btn w-full bg-white text-lg">
              {t("tanda.others")}
            </CircleButton>
          </div>
        )}

        <Explainer t={t} />
      </div>
    </main>
  );
}

function Explainer({ t }: { t: T }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-paper-2 p-4">
      <span className="text-3xl" aria-hidden>
        🤝
      </span>
      <p className="leading-snug">
        <strong>{t("tanda.how")}</strong> {t("tanda.howBody")}
      </p>
    </div>
  );
}
