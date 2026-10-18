import { connection } from "next/server";
import { ShopperNav } from "@/components/discover";
import { LiveRefresh } from "@/components/LiveRefresh";
import { Simulated, TopBar } from "@/components/ui";
import { approxPoint } from "@/lib/format";
import { getT } from "@/lib/lang";
import { CITY } from "@/lib/seed";
import { mapEventCards, openVendorsWithStats } from "@/lib/store";
import { MapScreen, type ScreenVendor } from "./MapScreen";

async function load() {
  const [open, events] = await Promise.all([openVendorsWithStats(), mapEventCards()]);
  return { open, events, now: Date.now() };
}

export default async function MapPage() {
  await connection(); // live data: render per request
  const [{ open, events, now }, t] = await Promise.all([load(), getT()]);
  // Vendors who asked for an approximate location never have their exact spot sent to the browser.
  const vendors: ScreenVendor[] = open.map((v) => {
    const [lat, lng] = v.approxLocation ? approxPoint(v.id, v.lat, v.lng) : [v.lat, v.lng];
    return {
      id: v.id,
      name: v.name,
      category: v.category,
      lat,
      lng,
      approx: v.approxLocation,
      spot: v.approxLocation ? null : v.spot,
      stats: v.stats,
    };
  });

  return (
    <main className="flex flex-1 flex-col pb-20">
      {/* Stalls open, close and move during the day; keep the map current. */}
      <LiveRefresh every={30_000} />
      <TopBar back="/" title={t("map.title")} right={<Simulated />} />
      <MapScreen vendors={vendors} events={events} now={now} center={CITY.center} />
      <ShopperNav />
    </main>
  );
}
