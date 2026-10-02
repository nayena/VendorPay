import { notFound } from "next/navigation";
import { Simulated, TopBar } from "@/components/ui";
import { stallCode } from "@/lib/format";
import { getT } from "@/lib/lang";
import { currentVendor } from "@/lib/session";
import { getVendor, menuFor } from "@/lib/store";
import { PayFlow } from "./PayFlow";

export default async function PayPage({ params }: PageProps<"/v/[id]/pay">) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();
  const [menu, me, t] = await Promise.all([menuFor(vendor.id), currentVendor(), getT()]);

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back={`/v/${vendor.id}`} title={t("pay.title")} right={<Simulated />} />
      <PayFlow
        vendorId={vendor.id}
        name={vendor.name}
        category={vendor.category}
        menu={menu}
        isOpen={vendor.isOpen}
        code={stallCode(vendor.id)}
        isSelf={me?.id === vendor.id}
      />
    </main>
  );
}
