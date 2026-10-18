import { connection } from "next/server";
import { ShopperNav } from "@/components/discover";
import { LiveRefresh } from "@/components/LiveRefresh";
import { CITY } from "@/lib/city";
import { currentCustomerId } from "@/lib/session";
import { discoverCards, getExplorer } from "@/lib/store";
import { SwipeDeck } from "./SwipeDeck";

async function load() {
  const customerId = await currentCustomerId();
  const [cards, explorer] = await Promise.all([discoverCards(customerId), getExplorer(customerId)]);
  return { cards, explorer, now: Date.now() };
}

export default async function DiscoverPage() {
  await connection(); // live data: render per request
  const { cards, explorer, now } = await load();

  return (
    <main className="flex flex-1 flex-col pb-24">
      {/* Stalls open and close all day; pick that up without a reload. */}
      <LiveRefresh every={30_000} />
      <SwipeDeck
        cards={cards}
        center={CITY.center}
        interests={explorer && explorer.interests.length ? explorer.interests : null}
        points={explorer?.points ?? 0}
        now={now}
      />
      <ShopperNav />
    </main>
  );
}
