import { TopBar } from "@/components/ui";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import { menuFor } from "@/lib/store";
import { MenuEditor } from "./MenuEditor";

export default async function MenuPage() {
  const vendor = await requireVendor();
  const [menu, t] = await Promise.all([menuFor(vendor.id), getT()]);
  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title={t("menu.title")} />
      <MenuEditor items={menu} />
    </main>
  );
}
