import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { absoluteUrl, QrCode } from "@/components/QrCode";
import { CategoryChip, PapelPicado, TopBar } from "@/components/ui";
import { stallCode } from "@/lib/format";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import { PrintButton } from "./PrintButton";

export default async function MyQrPage({ searchParams }: PageProps<"/vendor/qr">) {
  const vendor = await requireVendor();
  const isNew = (await searchParams).new === "1";
  const t = await getT();
  const payPath = `/v/${vendor.id}/pay`;

  return (
    <main className="flex flex-1 flex-col">
      <div className="print:hidden">
        <TopBar back="/vendor" title={t("qr.title")} />
      </div>
      <div className="flex flex-1 flex-col px-5 pb-8">
        {isNew && (
          <div className="mb-5 flex animate-pop items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-marigold p-4 shadow-block print:hidden">
            <PartyPopper className="size-8 shrink-0" strokeWidth={2.5} />
            <p className="text-lg font-bold leading-snug">{t("qr.new")}</p>
          </div>
        )}

        <div className="block-card relative overflow-hidden px-5 pt-3 pb-6 text-center">
          <PapelPicado count={8} className="-mx-5 mb-4" />
          <div className="flex items-center justify-center gap-3">
            <CategoryChip category={vendor.category} />
            <h1 className="font-display text-3xl leading-tight">{vendor.name}</h1>
          </div>
          <QrCode url={await absoluteUrl(payPath)} className="mx-auto mt-5 aspect-square w-full max-w-72" />
          <p className="mt-4 font-display text-2xl text-chili">{t("qr.scan")}</p>
          {/* Customers compare this with the code on the pay screen, which catches fake QR stickers. */}
          <p className="mt-1 font-bold text-ink-soft">
            {t("profile.code")} <span className="font-display text-xl tracking-widest text-ink">{stallCode(vendor.id)}</span>
          </p>
        </div>

        <div className="mt-auto grid gap-3 pt-6 print:hidden">
          <PrintButton label={t("qr.print")} />
          <Link href={payPath} className="btn w-full bg-white">
            {t("qr.test")}
          </Link>
          <Link href="/vendor" className="btn w-full bg-marigold">
            {t("qr.go")}
          </Link>
        </div>
      </div>
    </main>
  );
}
