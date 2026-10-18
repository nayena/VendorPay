"use client";

import { VendorMap } from "@/components/maps";
import type { MapSpot } from "@/components/LeafletMaps";

export function EventMap({ spot }: { spot: MapSpot }) {
  return <VendorMap vendors={[]} spots={[spot]} center={[spot.lat, spot.lng]} zoom={16} selectedId={null} onSelect={() => {}} />;
}
