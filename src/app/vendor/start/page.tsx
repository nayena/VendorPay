import { redirect } from "next/navigation";
import { demoSignIn } from "@/app/actions";
import { CategoryChip, Simulated, TopBar } from "@/components/ui";
import { getT } from "@/lib/lang";
import { currentVendor } from "@/lib/session";
import { getVendors } from "@/lib/store";
import { PhoneSignIn } from "./PhoneSignIn";

const DEMO_IDS = ["lupe", "beto", "mercedes"];

export default async function StartPage() {
  if (await currentVendor()) redirect("/vendor");
  const [demos, t] = await Promise.all([getVendors(DEMO_IDS), getT()]);

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/" right={<Simulated />} />
      <div className="px-5 pb-10">
        <h1 className="animate-rise font-display text-4xl leading-tight">
          {t("start.title1")} <span className="text-chili">{t("start.title2")}</span>
        </h1>
        <p className="mt-2 text-lg">{t("start.sub")}</p>

        <div className="mt-8">
          <PhoneSignIn />
        </div>

        <div className="mt-12">
          <h2 className="font-display text-xl">{t("start.demo")}</h2>
          <div className="mt-3 grid gap-3">
            {demos.map((v) => (
              <form key={v.id} action={demoSignIn.bind(null, v.id)}>
                <button className="block-card flex w-full items-center gap-3 p-3 text-left active:translate-x-[3px] active:translate-y-[3px] active:shadow-none">
                  <CategoryChip category={v.category} />
                  <span>
                    <span className="block text-lg font-bold">{v.name}</span>
                    <span className="text-sm text-ink-soft">{v.ownerName}</span>
                  </span>
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
