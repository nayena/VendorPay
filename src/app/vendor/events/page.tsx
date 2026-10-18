import { TopBar } from "@/components/ui";
import { getT } from "@/lib/lang";
import { requireVendor } from "@/lib/session";
import { eventsForVendor } from "@/lib/store";
import { EventsManager } from "./EventsManager";

export default async function MyEventsPage() {
  const vendor = await requireVendor();
  const [events, t] = await Promise.all([eventsForVendor(vendor.id), getT()]);
  return (
    <main className="flex flex-1 flex-col">
      <TopBar back="/vendor" title={t("ev.title")} />
      <EventsManager
        events={events}
        vendor={{ category: vendor.category, spot: vendor.approxLocation ? "" : vendor.spot, lat: vendor.lat, lng: vendor.lng }}
      />
    </main>
  );
}
