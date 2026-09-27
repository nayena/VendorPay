"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` on import, so the maps only load in the browser.
const Loading = () => <div className="size-full animate-pulse bg-paper-2" />;

export const VendorMap = dynamic(() => import("./LeafletMaps").then((m) => m.VendorMap), {
  ssr: false,
  loading: Loading,
});

export const PickSpotMap = dynamic(() => import("./LeafletMaps").then((m) => m.PickSpotMap), {
  ssr: false,
  loading: Loading,
});
