import { notFound } from "next/navigation";
import { CategoryChip, PapelPicado, TopBar } from "@/components/ui";
import { getT } from "@/lib/lang";
import { getVendor } from "@/lib/store";
import { QrCheckIn } from "./QrCheckIn";

/** Where a stall's check-in QR lands. Checking in is a tap, so link previews can't do it. */
export default async function CheckInPage({ params, searchParams }: PageProps<"/v/[id]/checkin">) {
  const { id } = await params;
  const { code } = await searchParams;
  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const t = await getT();

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back={`/v/${vendor.id}`} title={t("checkin.title")} />
      <div className="flex flex-1 flex-col px-5 pb-8">
        <div className="block-card overflow-hidden px-5 pt-3 pb-6 text-center">
          <PapelPicado count={8} className="-mx-5 mb-5" />
          <div className="flex items-center justify-center gap-3">
            <CategoryChip category={vendor.category} />
            <h1 className="font-display text-3xl leading-tight">{vendor.name}</h1>
          </div>
          <p className="mt-3 text-lg">{t("checkin.qrSub")}</p>
          <QrCheckIn vendorId={vendor.id} code={typeof code === "string" ? code : ""} />
        </div>
      </div>
    </main>
  );
}
