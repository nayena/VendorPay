import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, ScanLine } from "lucide-react";
import { absoluteUrl, QrCode } from "@/components/QrCode";
import { CategoryChip, OpenDot, TopBar, TrustBadge } from "@/components/ui";
import { CATEGORIES } from "@/lib/format";
import { completedSales, getVendor } from "@/lib/store";

export default async function VendorProfile({ params }: PageProps<"/v/[id]">) {
  const { id } = await params;
  const vendor = getVendor(id);
  if (!vendor) notFound();
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
              {vendor.ownerName} · {CATEGORIES[vendor.category].label}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <OpenDot open={vendor.isOpen} />
          <TrustBadge sales={completedSales(vendor.id)} />
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-lg">
          <MapPin className="size-5 shrink-0 text-chili" strokeWidth={2.5} /> {vendor.spot}
        </p>

        {/* Tapping the QR stands in for scanning it with a camera. */}
        <Link
          href={payPath}
          className="block-card mx-auto mt-6 block w-full max-w-[18rem] animate-pop p-4 [animation-delay:100ms]"
          aria-label={`Pay ${vendor.name}`}
        >
          <QrCode url={await absoluteUrl(payPath)} className="aspect-square" />
          <p className="mt-3 flex items-center justify-center gap-2 font-display text-lg">
            <ScanLine className="size-5" strokeWidth={2.5} /> Tap or scan to pay
          </p>
        </Link>

        <Link href={payPath} className="btn mt-6 w-full bg-chili text-white">
          Pay {vendor.name.split(" ")[0]}
        </Link>
      </div>
    </main>
  );
}
