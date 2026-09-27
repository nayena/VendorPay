import { connection } from "next/server";
import { Simulated, TopBar } from "@/components/ui";
import { CITY } from "@/lib/seed";
import { completedSales, listVendors } from "@/lib/store";
import { MapScreen, type ScreenVendor } from "./MapScreen";

export default async function MapPage() {
  await connection();
  const vendors: ScreenVendor[] = listVendors()
    .filter((v) => v.isOpen)
    .map((v) => ({
      id: v.id,
      name: v.name,
      category: v.category,
      lat: v.lat,
      lng: v.lng,
      spot: v.spot,
      sales: completedSales(v.id),
    }));

  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/" title="Stalls near you" right={<Simulated />} />
      <MapScreen vendors={vendors} center={CITY.center} />
    </main>
  );
}
