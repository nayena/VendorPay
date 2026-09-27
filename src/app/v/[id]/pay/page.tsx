import { notFound } from "next/navigation";
import { Simulated, TopBar } from "@/components/ui";
import { getVendor } from "@/lib/store";
import { PayFlow } from "./PayFlow";

export default async function PayPage({ params }: PageProps<"/v/[id]/pay">) {
  const { id } = await params;
  const vendor = await getVendor(id);
  if (!vendor) notFound();

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back={`/v/${vendor.id}`} title="Pay" right={<Simulated />} />
      <PayFlow vendorId={vendor.id} name={vendor.name} category={vendor.category} />
    </main>
  );
}
