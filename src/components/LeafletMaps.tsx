"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CATEGORIES, trust } from "@/lib/format";
import type { Category } from "@/lib/types";

export interface MapVendor {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  sales: number;
}

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(v: MapVendor, selected: boolean) {
  const c = CATEGORIES[v.category];
  const t = trust(v.sales);
  const rating = t.score === null ? "New" : `★ ${t.score.toFixed(1)}`;
  const size = selected ? 56 : 46;
  const shortName = v.name.length > 16 ? v.name.slice(0, 15) + "…" : v.name;
  return L.divIcon({
    className: "vp-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;${selected ? "z-index:10" : ""}">
        <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          background:${c.color};border:3px solid #22150d;box-shadow:3px 3px 0 #22150d;display:grid;place-items:center">
          <span style="transform:rotate(45deg);font-size:${selected ? 28 : 22}px;line-height:1">${c.emoji}</span>
        </div>
        <div style="position:absolute;top:${size + 6}px;left:50%;transform:translateX(-50%);white-space:nowrap;
          background:${selected ? "#22150d" : "#fff"};color:${selected ? "#fff" : "#22150d"};border:2px solid #22150d;
          border-radius:999px;padding:1px 8px;font:700 12px/1.4 var(--font-atkinson),sans-serif">
          ${escape(shortName)} · ${rating}
        </div>
      </div>`,
  });
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, Math.max(map.getZoom(), 16), { duration: 0.6 });
  }, [map, target]);
  return null;
}

export function VendorMap({
  vendors,
  center,
  selectedId,
  onSelect,
}: {
  vendors: MapVendor[];
  center: [number, number];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = vendors.find((v) => v.id === selectedId);
  return (
    <MapContainer center={center} zoom={15} zoomControl={false} className="size-full" attributionControl>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <ClickAway onClick={() => onSelect(null)} />
      <FlyTo target={selected ? [selected.lat, selected.lng] : null} />
      {vendors.map((v) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lng]}
          icon={pinIcon(v, v.id === selectedId)}
          zIndexOffset={v.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(v.id) }}
          title={v.name}
        />
      ))}
    </MapContainer>
  );
}

function ClickAway({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick });
  return null;
}

function PickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Map for choosing where a stall is: tap to move the pin. */
export function PickSpotMap({
  value,
  category,
  onPick,
}: {
  value: [number, number];
  category: Category;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer center={value} zoom={16} zoomControl={false} className="size-full">
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <PickHandler onPick={onPick} />
      <Marker
        position={value}
        icon={pinIcon({ id: "me", name: "My stall", category, lat: value[0], lng: value[1], sales: 0 }, true)}
      />
    </MapContainer>
  );
}
