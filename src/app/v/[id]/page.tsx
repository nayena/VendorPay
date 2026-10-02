import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ScanLine } from "lucide-react";
import { absoluteUrl, QrCode } from "@/components/QrCode";
import { CategoryChip, OpenDot, TopBar, TrustBadge } from "@/components/ui";
import { money, stallCode } from "@/lib/format";
import { getT } from "@/lib/lang";
import { getVendor, menuFor, trustStats } from "@/lib/store";

export default async function VendorProfile({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const [stats, menu, t] = await Promise.all([trustStats(vendor.id), menuFor(vendor.id), getT()]);
  const payPath = `/v/${vendor.id}/pay`;

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/map" />
      <div className="px-5 pb-10">
        <div className="flex animate-rise items-center gap-4">
          <CategoryChip category={vendor.category} big />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight">{vendor.name}</h1>
            <p className="text-ink-soft">
              {vendor.ownerName} · {t(`cat.${vendor.category}`)}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <OpenDot open={vendor.isOpen} />
          <TrustBadge stats={stats} />
        </div>
        <p className="mt-2 text-sm text-ink-soft">
          {t("trust.detail", { customers: stats.customers, ratings: stats.ratingCount })}
          {stats.ratingAvg !== null && ` · ★ ${stats.ratingAvg.toFixed(1)}`}
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-lg">
          <MapPin className="size-5 shrink-0 text-chili" strokeWidth={2.5} /> {vendor.approxLocation ? t("map.approx") : vendor.spot}
        </p>

        {/* Tapping the QR stands in for scanning it with a camera. */}
        <Link
          href={payPath}
          className="block-card mx-auto mt-6 block w-full max-w-[18rem] animate-pop p-4 [animation-delay:100ms]"
          aria-label={t("profile.pay", { name: vendor.name })}
        >
          <QrCode url={await absoluteUrl(payPath)} className="aspect-square" />
          <p className="mt-3 flex items-center justify-center gap-2 font-display text-lg">
            <ScanLine className="size-5" strokeWidth={2.5} /> {t("profile.tap")}
          </p>
          <p className="mt-1 text-center text-sm font-bold text-ink-soft">
            {t("profile.code")} <span className="font-display text-base tracking-widest text-ink">{stallCode(vendor.id)}</span>
          </p>
        </Link>

        {menu.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-display text-xl">{t("profile.menu")}</h2>
            <ul className="block-card divide-y-2 divide-ink/10 overflow-hidden">
              {menu.map((m) => (
                <li key={m.id} className="flex justify-between gap-3 px-4 py-2.5 text-lg">
                  <span>{m.name}</span>
                  <span className="font-bold tabular-nums">{money(m.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link href={payPath} className="btn mt-6 w-full bg-chili text-white">
          {t("profile.pay", { name: vendor.name.split(" ")[0] })}
        </Link>
      </div>
    </main>
  );
}
