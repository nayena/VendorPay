import { Check, Clock, Crown } from "lucide-react";
import { CategoryChip, Simulated, TopBar } from "@/components/ui";
import { money } from "@/lib/format";
import { requireVendor } from "@/lib/session";
import { circleFor, getVendor, openCircles } from "@/lib/store";
import { CircleButton } from "./CircleActions";

export default async function TandaPage() {
  const vendor = await requireVendor();
  const circle = circleFor(vendor.id);

  if (!circle) {
    const available = openCircles();
    return (
      <main className="flex flex-1 flex-col">
        <TopBar back="/vendor" title="Savings circle" right={<Simulated />} />
        <div className="grid gap-5 px-5 pb-10">
          <Explainer />
          {available.map((c) => (
            <div key={c.id} className="block-card p-4">
              <h2 className="font-display text-2xl">{c.name}</h2>
              <p className="mt-1 text-lg">
                {c.memberIds.length} vendors · {money(c.contribution)} a week
              </p>
              <div className="mt-4">
                <CircleButton circleId={c.id} action="join" className="btn w-full bg-rosa text-white">
                  Join this circle
                </CircleButton>
              </div>
            </div>
          ))}
        </div>
      </main>
    );
  }

  const members = circle.memberIds.map((id) => getVendor(id)).filter((v) => v !== null);
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
          <p className="text-sm font-bold uppercase tracking-wider">Week {circle.round + 1} pot</p>
          <p className="font-display text-6xl tabular-nums">{money(pot)}</p>
          <p className="mt-1 text-lg font-bold">
            {myTurn ? "goes to you this week!" : `goes to ${recipient?.name ?? "—"}`}
          </p>
          <div className="mx-auto mt-4 h-4 max-w-64 overflow-hidden rounded-full border-2 border-ink bg-white">
            <div className="h-full bg-nopal transition-all" style={{ width: `${(paidCount / members.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-sm font-bold">
            {paidCount} of {members.length} paid in
          </p>
        </div>

        {iPaid ? (
          <p className="flex items-center justify-center gap-2 rounded-2xl border-[2.5px] border-nopal bg-white p-4 text-lg font-bold text-nopal">
            <Check className="size-6" strokeWidth={3} /> You&apos;ve paid this week
          </p>
        ) : (
          <CircleButton circleId={circle.id} action="chip" className="btn w-full bg-nopal text-white">
            Chip in {money(circle.contribution)}
          </CircleButton>
        )}

        <section>
          <h2 className="mb-3 font-display text-xl">Turn order</h2>
          <ol className="block-card divide-y-2 divide-ink/10 overflow-hidden">
            {members.map((m, i) => {
              const paid = circle.paidThisRound.includes(m.id);
              const current = i === circle.round;
              return (
                <li key={m.id} className={`flex items-center gap-3 px-3 py-3 ${current ? "bg-marigold/40" : ""}`}>
                  <span className="w-5 text-center font-display text-lg text-ink-soft">{i + 1}</span>
                  <CategoryChip category={m.category} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {m.name}
                      {m.id === vendor.id && <span className="font-normal text-ink-soft"> (you)</span>}
                    </span>
                    <span className="text-sm text-ink-soft">
                      {current ? (
                        <span className="inline-flex items-center gap-1 font-bold text-ink">
                          <Crown className="size-4" strokeWidth={2.5} /> Gets the pot now
                        </span>
                      ) : i < circle.round ? (
                        "Already got theirs"
                      ) : (
                        `Turn in ${i - circle.round} ${i - circle.round === 1 ? "week" : "weeks"}`
                      )}
                    </span>
                  </span>
                  {paid ? (
                    <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-nopal text-white" aria-label="Paid">
                      <Check className="size-5" strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full border-2 border-dashed border-ink-soft text-ink-soft" aria-label="Not paid yet">
                      <Clock className="size-5" strokeWidth={2.5} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 px-1 text-sm text-ink-soft">
            Everyone puts in {money(circle.contribution)} each week. Round {circle.cycle}.
          </p>
        </section>

        {paidCount < members.length && (
          <div className="rounded-2xl border-2 border-dashed border-ink-soft p-4">
            <p className="mb-3 text-sm font-bold text-ink-soft">DEMO ONLY: fast-forward the week</p>
            <CircleButton circleId={circle.id} action="others" className="btn w-full bg-white text-lg">
              Everyone else pays in
            </CircleButton>
          </div>
        )}

        <Explainer />
      </div>
    </main>
  );
}

function Explainer() {
  return (
    <div className="flex gap-3 rounded-2xl bg-paper-2 p-4">
      <span className="text-3xl" aria-hidden>🤝</span>
      <p className="leading-snug">
        <strong>How it works:</strong> a group of vendors each chips in the same amount every week. Each week, one
        person takes the whole pot, until everyone has had a turn.
      </p>
    </div>
  );
}
