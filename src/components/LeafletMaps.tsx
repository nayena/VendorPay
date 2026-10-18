"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Fragment, useEffect } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { CATEGORIES, trust } from "@/lib/format";
import type { Category, TrustStats } from "@/lib/types";
import { useT } from "./I18n";

export interface MapVendor {
  id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  stats: TrustStats;
  /** The pin is a fuzzed point; draw it as an area. */
  approx?: boolean;
}

/** A non-stall pin (an event, or a saved place): a square badge instead of a teardrop. */
export interface MapSpot {
  /** Unique among everything on the map, e.g. "event:abc". */
  key: string;
  title: string;
  emoji: string;
  color: string;
  lat: number;
  lng: number;
  live?: boolean;
}

const NO_STATS: TrustStats = { sales: 0, customers: 0, ratingAvg: null, ratingCount: 0 };

const TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function pinIcon(v: MapVendor, selected: boolean, newLabel: string) {
  const c = CATEGORIES[v.category];
  const t = trust(v.stats);
  const rating = t.score === null ? escape(newLabel) : `★ ${t.score.toFixed(1)}`;
  const size = selected ? 56 : 46;
  const shortName = v.name.length > 16 ? v.name.slice(0, 15) + "…" : v.name;
  return L.divIcon({
    className: "vp-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;${selected ? "z-index:10" : ""}">
        <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
          background:${c.color};border:3px ${v.approx ? "dashed" : "solid"} #22150d;${v.approx ? "opacity:.85;" : ""}box-shadow:3px 3px 0 #22150d;display:grid;place-items:center">
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

function spotIcon(s: MapSpot, selected: boolean, liveLabel: string) {
  const size = selected ? 52 : 44;
  const shortName = s.title.length > 18 ? s.title.slice(0, 17) + "…" : s.title;
  return L.divIcon({
    className: "vp-pin",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px">
        <div style="width:${size}px;height:${size}px;border-radius:14px;transform:rotate(8deg);background:${s.color};
          border:3px solid #22150d;box-shadow:3px 3px 0 #22150d${s.live ? ",0 0 0 6px rgb(192 54 12 / .35)" : ""};display:grid;place-items:center">
          <span style="transform:rotate(-8deg);font-size:${selected ? 26 : 21}px;line-height:1">${s.emoji}</span>
        </div>
        <div style="position:absolute;top:${size + 6}px;left:50%;transform:translateX(-50%);white-space:nowrap;
          background:${selected ? "#22150d" : "#fff"};color:${selected ? "#fff" : "#22150d"};border:2px solid #22150d;
          border-radius:999px;padding:1px 8px;font:700 12px/1.4 var(--font-atkinson),sans-serif">
          ${s.live ? `<span style="color:${selected ? "#f5a524" : "#c0360c"}">● ${escape(liveLabel)}</span> · ` : ""}${escape(shortName)}
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
  spots = [],
  center,
  zoom = 15,
  selectedId,
  onSelect,
}: {
  vendors: MapVendor[];
  spots?: MapSpot[];
  center: [number, number];
  zoom?: number;
  /** A vendor id or a spot key. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const selected = vendors.find((v) => v.id === selectedId) ?? spots.find((s) => s.key === selectedId);
  return (
    <MapContainer center={center} zoom={zoom} zoomControl={false} className="size-full" attributionControl>
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <ClickAway onClick={() => onSelect(null)} />
      <FlyTo target={selected ? [selected.lat, selected.lng] : null} />
      {vendors.map((v) => (
        <Fragment key={v.id}>
          {v.approx && (
            <Circle
              center={[v.lat, v.lng]}
              radius={150}
              pathOptions={{ color: "#22150d", weight: 2, dashArray: "6 6", fillColor: CATEGORIES[v.category].color, fillOpacity: 0.12 }}
              interactive={false}
            />
          )}
          <Marker
            position={[v.lat, v.lng]}
            icon={pinIcon(v, v.id === selectedId, t("trust.new"))}
            zIndexOffset={v.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(v.id) }}
            title={v.name}
          />
        </Fragment>
      ))}
      {spots.map((s) => (
        <Marker
          key={s.key}
          position={[s.lat, s.lng]}
          icon={spotIcon(s, s.key === selectedId, t("disc.live"))}
          zIndexOffset={s.key === selectedId ? 1000 : 500}
          eventHandlers={{ click: () => onSelect(s.key) }}
          title={s.title}
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

/** Keeps the pin in view when it moves from outside the map (e.g. "I'm here now"). */
function Follow({ value }: { value: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (!map.getBounds().contains(value)) map.setView(value, map.getZoom());
  }, [map, value]);
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
  const t = useT();
  return (
    <MapContainer center={value} zoom={16} zoomControl={false} className="size-full">
      <TileLayer url={TILES} attribution={ATTRIBUTION} />
      <PickHandler onPick={onPick} />
      <Follow value={value} />
      <Marker
        position={value}
        icon={pinIcon({ id: "me", name: t(`cat.${category}`), category, lat: value[0], lng: value[1], stats: NO_STATS }, true, t("trust.new"))}
      />
    </MapContainer>
  );
}
