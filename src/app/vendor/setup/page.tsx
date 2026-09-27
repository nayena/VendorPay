import { redirect } from "next/navigation";
import { Simulated, TopBar } from "@/components/ui";
import { CITY } from "@/lib/seed";
import { currentVendor, verifiedPhone } from "@/lib/session";
import { SetupWizard } from "./SetupWizard";

export default async function SetupPage() {
  if (await currentVendor()) redirect("/vendor");
  if (!(await verifiedPhone())) redirect("/vendor/start");

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor/start" right={<Simulated />} />
      <SetupWizard center={CITY.center} />
    </main>
  );
}
