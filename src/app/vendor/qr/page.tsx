import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { absoluteUrl, QrCode } from "@/components/QrCode";
import { CategoryChip, PapelPicado, TopBar } from "@/components/ui";
import { requireVendor } from "@/lib/session";

export default async function MyQrPage({ searchParams }: PageProps<"/vendor/qr">) {
  const vendor = await requireVendor();
  const isNew = (await searchParams).new === "1";
  const payPath = `/v/${vendor.id}/pay`;

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title="My QR code" />
      <div className="flex flex-1 flex-col px-5 pb-8">
        {isNew && (
          <div className="mb-5 flex animate-pop items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-marigold p-4 shadow-block">
            <PartyPopper className="size-8 shrink-0" strokeWidth={2.5} />
            <p className="text-lg font-bold leading-snug">Your stall is open! Show this code to get paid.</p>
          </div>
        )}

        <div className="block-card relative overflow-hidden px-5 pt-3 pb-6 text-center">
          <PapelPicado count={8} className="-mx-5 mb-4" />
          <div className="flex items-center justify-center gap-3">
            <CategoryChip category={vendor.category} />
            <h1 className="font-display text-3xl leading-tight">{vendor.name}</h1>
          </div>
          <QrCode url={await absoluteUrl(payPath)} className="mx-auto mt-5 aspect-square w-full max-w-72" />
          <p className="mt-4 font-display text-2xl text-chili">Scan to pay me</p>
        </div>

        <div className="mt-auto grid gap-3 pt-6">
          <Link href={payPath} className="btn w-full bg-white">
            Test it: pay myself
          </Link>
          <Link href="/vendor" className="btn w-full bg-marigold">
            Go to my stall
          </Link>
        </div>
      </div>
    </main>
  );
}
