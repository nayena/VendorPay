import { LogOut } from "lucide-react";
import { signOut } from "@/app/actions";
import { LangToggle, TopBar } from "@/components/ui";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import { ApproxToggle } from "./ApproxToggle";

export default async function SettingsPage() {
  const vendor = await requireVendor();
  const t = await getT();
  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title={t("settings.title")} />
      <div className="grid gap-5 px-4 pb-10">
        <div className="block-card flex items-center justify-between gap-3 p-4">
          <span className="font-display text-xl">{t("settings.lang")}</span>
          <LangToggle />
        </div>
        <ApproxToggle on={vendor.approxLocation} />
        <form action={signOut}>
          <button className="btn w-full bg-white">
            <LogOut className="size-6" strokeWidth={2.5} /> {t("dash.signOut")}
          </button>
        </form>
      </div>
    </main>
  );
}
