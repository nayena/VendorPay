import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import { LangToggle, PapelPicado, Simulated } from "@/components/ui";
import { getT } from "@/lib/lang";
import { countOpenVendors } from "@/lib/store";
import { connection } from "next/server";

export default async function Home() {
  await connection(); // live data: render per request
  const [openCount, t] = await Promise.all([countOpenVendors(), getT()]);

  return (
    <main className="flex flex-1 flex-col px-5 pb-8">
      <PapelPicado className="-mx-5 mb-8" count={11} />

      <div className="animate-rise">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-ink-soft">
            {t("home.place")} <Simulated />
          </p>
          <LangToggle />
        </div>
        <h1 className="font-display text-[3.4rem] leading-[0.95] text-chili">
          Vendor<span className="text-ink">Pay</span>
        </h1>
        <p className="mt-3 max-w-[18rem] text-xl leading-snug">
          {t("home.tagline")}
        </p>
      </div>

      <div className="mt-10 grid gap-5">
        <Link
          href="/map"
          className="block-card group flex animate-rise items-center gap-4 bg-marigold p-5 [animation-delay:120ms] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink bg-white">
            <MapPin className="size-9 text-chili" strokeWidth={2.5} />
          </span>
          <span>
            <span className="block font-display text-3xl leading-none">{t("home.buying")}</span>
            <span className="mt-1 block text-base font-bold">
              {t.n("home.open", openCount)}
            </span>
          </span>
        </Link>

        <Link
          href="/vendor"
          className="block-card flex animate-rise items-center gap-4 bg-chili p-5 text-white [animation-delay:220ms] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink bg-white">
            <Store className="size-9 text-nopal" strokeWidth={2.5} />
          </span>
          <span>
            <span className="block font-display text-3xl leading-none">{t("home.selling")}</span>
            <span className="mt-1 block text-base font-bold">{t("home.sellingSub")}</span>
          </span>
        </Link>
      </div>

      <p className="mt-auto pt-10 text-center text-sm text-ink-soft">
        {t("home.footer")}
      </p>
    </main>
  );
}
