import Link from "next/link";
import { ChevronRight, LogOut, PiggyBank, QrCode } from "lucide-react";
import { signOut } from "@/app/actions";
import { TransactionList } from "@/components/TransactionList";
import { Simulated, TopBar, TrustBadge } from "@/components/ui";
import { money } from "@/lib/format";
import { requireVendor } from "@/lib/session";
import { circleFor, completedSales, getVendor, todaySales, transactionsFor } from "@/lib/store";
import { LiveRefresh, OpenToggle } from "./DashboardClient";

export default async function Dashboard() {
  const vendor = await requireVendor();
  const today = todaySales(vendor.id);
  const circle = circleFor(vendor.id);

  return (
    <main className="flex flex-1 flex-col">
      <LiveRefresh />
      <TopBar
        title={vendor.name}
        right={
          <form action={signOut}>
            <button aria-label="Sign out" className="grid size-12 place-items-center rounded-full text-ink-soft active:bg-paper-2">
              <LogOut className="size-6" strokeWidth={2.5} />
            </button>
          </form>
        }
      />

      <div className="grid gap-5 px-4 pb-10">
        <div className="-mt-2 flex items-center gap-2">
          <TrustBadge sales={completedSales(vendor.id)} />
          <Simulated />
        </div>

        <OpenToggle isOpen={vendor.isOpen} />

        <div className="grid grid-cols-2 gap-3">
          <div className="block-card bg-marigold p-4">
            <p className="text-sm font-bold uppercase tracking-wide">Today</p>
            <p className="font-display text-4xl tabular-nums">{money(today.total)}</p>
            <p className="text-sm font-bold">
              {today.count} {today.count === 1 ? "sale" : "sales"}
            </p>
          </div>
          <div className="block-card bg-ink p-4 text-white">
            <p className="text-sm font-bold uppercase tracking-wide text-marigold">Wallet</p>
            <p className="font-display text-4xl tabular-nums">{money(vendor.balance)}</p>
            <p className="text-sm opacity-80">pretend pesos</p>
          </div>
        </div>

        <Link href="/vendor/qr" className="btn w-full bg-chili text-white">
          <QrCode className="size-7" strokeWidth={2.5} /> Show my QR code
        </Link>

        <Link
          href="/vendor/tanda"
          className="block-card flex items-center gap-3 p-4 active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-rosa text-white">
            <PiggyBank className="size-6" strokeWidth={2.5} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl leading-tight">Savings circle</span>
            <span className="block text-sm font-bold text-ink-soft">
              {circle ? circleStatus(circle, vendor.id) : "Save together with other vendors"}
            </span>
          </span>
          <ChevronRight className="size-6 shrink-0" strokeWidth={2.5} />
        </Link>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-xl">
            Recent
            <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-nopal">
              <span className="size-2 animate-pulse rounded-full bg-nopal" /> live
            </span>
          </h2>
          <TransactionList items={transactionsFor(vendor.id, 12)} />
        </section>
      </div>
    </main>
  );
}

function circleStatus(circle: NonNullable<ReturnType<typeof circleFor>>, vendorId: string) {
  const recipient = getVendor(circle.memberIds[circle.round]);
  if (circle.memberIds[circle.round] === vendorId) return "It's your turn to get the pot!";
  if (!circle.paidThisRound.includes(vendorId)) return `Chip in ${money(circle.contribution)} this week`;
  return `You're paid up · ${recipient?.name.split(" ")[0] ?? "Next"} gets the pot`;
}
