import { connection } from "next/server";
import { ShopperNav } from "@/components/discover";
import { LiveRefresh } from "@/components/LiveRefresh";
import { TopBar } from "@/components/ui";
import { CITY } from "@/lib/city";
import { getT } from "@/lib/lang";
import { currentCustomerId } from "@/lib/session";
import { savedCards } from "@/lib/store";
import { PlansScreen } from "./PlansScreen";

async function load() {
  const customerId = await currentCustomerId();
  return { cards: customerId ? await savedCards(customerId) : [], now: Date.now() };
}

export default async function PlansPage() {
  await connection(); // live data: render per request
  const [{ cards, now }, t] = await Promise.all([load(), getT()]);

  return (
    <main className="flex flex-1 flex-col pb-24">
      <LiveRefresh every={30_000} />
      <TopBar title={t("plans.title")} />
      <PlansScreen cards={cards} now={now} center={CITY.center} />
      <ShopperNav />
    </main>
  );
}
