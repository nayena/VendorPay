"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronRight, List, LoaderCircle, LocateFixed, Map as MapIcon, MapPin, QrCode } from "lucide-react";
import { useT } from "@/components/I18n";
import { VendorMap } from "@/components/maps";
import type { MapVendor } from "@/components/LeafletMaps";
import { CategoryChip, TrustBadge } from "@/components/ui";
import { CATEGORIES, distanceM, formatDistance } from "@/lib/format";
import type { Category } from "@/lib/types";

export type ScreenVendor = MapVendor & { spot: string | null };

/** Farther than this from the city center, "near me" measures from the center instead. */
const FAR_M = 30_000;

type Locate = { state: "idle" | "locating" | "failed" } | { state: "done"; origin: [number, number]; far: boolean };

export function MapScreen({ vendors, center }: { vendors: ScreenVendor[]; center: [number, number] }) {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [locate, setLocate] = useState<Locate>({ state: "idle" });

  const categories = useMemo(
    () => (Object.keys(CATEGORIES) as Category[]).filter((c) => vendors.some((v) => v.category === c)),
    [vendors],
  );

  const shown = useMemo(() => {
    const list = vendors
      .filter((v) => !category || v.category === category)
      .map((v) => ({ ...v, distance: locate.state === "done" ? distanceM(locate.origin, [v.lat, v.lng]) : null }));
    if (locate.state === "done") list.sort((a, b) => a.distance! - b.distance!);
    return list;
  }, [vendors, category, locate]);

  const selected = shown.find((v) => v.id === selectedId);

  function findMe() {
    if (!("geolocation" in navigator)) return setLocate({ state: "failed" });
    setLocate({ state: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const me: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        const far = distanceM(me, center) > FAR_M;
        setLocate({ state: "done", origin: far ? center : me, far });
      },
      () => setLocate({ state: "failed" }),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex rounded-full border-[2.5px] border-ink bg-white p-0.5 shadow-block-sm" role="group">
          {(["map", "list"] as const).map((v) => {
            const Icon = v === "map" ? MapIcon : List;
            const on = view === v;
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={on}
                className={`flex min-h-10 items-center gap-1.5 rounded-full px-3 font-bold ${on ? "bg-ink text-white" : ""}`}
              >
                <Icon className="size-5" strokeWidth={2.5} /> {t(v === "map" ? "map.map" : "map.list")}
              </button>
            );
          })}
        </div>
        <button
          onClick={findMe}
          disabled={locate.state === "locating"}
          aria-pressed={locate.state === "done"}
          className={`ml-auto flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink px-3 font-bold shadow-block-sm active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
            locate.state === "done" ? "bg-sky text-white" : "bg-white"
          }`}
        >
          {locate.state === "locating" ? (
            <LoaderCircle className="size-5 animate-spin" strokeWidth={2.5} />
          ) : (
            <LocateFixed className="size-5" strokeWidth={2.5} />
          )}
          {locate.state === "locating" ? t("map.locating") : t("map.nearMe")}
        </button>
      </div>

      {categories.length > 1 && (
        <div className="-mt-1 flex gap-2 overflow-x-auto px-4 pb-3" role="group" aria-label={t("map.filter")}>
          {[null, ...categories].map((c) => {
            const on = category === c;
            return (
              <button
                key={c ?? "all"}
                onClick={() => {
                  setCategory(c);
                  setSelectedId(null);
                }}
                aria-pressed={on}
                className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[2.5px] border-ink px-3 font-bold ${
                  on ? "bg-marigold" : "bg-white"
                }`}
              >
                {c && <span aria-hidden>{CATEGORIES[c].emoji}</span>}
                {c ? t(`cat.${c}`) : t("map.all")}
              </button>
            );
          })}
        </div>
      )}

      {(locate.state === "failed" || (locate.state === "done" && locate.far)) && (
        <p className="mx-4 mb-3 rounded-2xl bg-paper-2 px-4 py-2 text-sm font-bold" role="status">
          {locate.state === "failed" ? t("map.noLocation") : t("map.far")}
        </p>
      )}

      {view === "map" && (
        <div className="relative h-[46dvh] overflow-hidden border-y-[2.5px] border-ink">
          <VendorMap vendors={shown} center={center} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      )}

      <section className="flex-1 px-4 pt-5 pb-8">
        {selected ? (
          <div key={selected.id} className="block-card animate-rise p-4">
            <div className="flex items-start gap-3">
              <CategoryChip category={selected.category} />
              <div className="min-w-0">
                <h2 className="font-display text-2xl leading-tight">{selected.name}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
                  <MapPin className="size-4 shrink-0" /> {selected.spot ?? t("map.approx")}
                  {selected.distance !== null && <strong className="ml-1 text-ink">· {formatDistance(selected.distance)}</strong>}
                </p>
                <div className="mt-2">
                  <TrustBadge stats={selected.stats} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
              <Link href={`/v/${selected.id}/pay`} className="btn bg-chili text-white">
                {t("map.pay")}
              </Link>
              <Link href={`/v/${selected.id}`} className="btn bg-white px-4" aria-label={t("map.profile")}>
                <QrCode className="size-7" strokeWidth={2.5} />
              </Link>
            </div>
            {view === "list" && (
              <button onClick={() => setSelectedId(null)} className="mt-3 w-full text-center font-bold text-ink-soft underline">
                {t("back")}
              </button>
            )}
          </div>
        ) : (
          <>
            <h2 className="mb-3 font-display text-xl">
              {t("map.openNow")} <span className="text-ink-soft">· {shown.length}</span>
            </h2>
            {shown.length === 0 && (
              <p className="block-card p-5 text-lg">{vendors.length === 0 ? t("map.none") : t("map.noneHere")}</p>
            )}
            <ul className="grid gap-3">
              {shown.map((v, i) => (
                <li key={v.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className="block-card flex w-full items-center gap-3 p-3 text-left active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                  >
                    <CategoryChip category={v.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold">{v.name}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <TrustBadge stats={v.stats} size="sm" />
                        {v.distance !== null && <span className="text-sm font-bold text-ink-soft">{formatDistance(v.distance)}</span>}
                      </span>
                    </span>
                    <ChevronRight className="size-6 shrink-0" strokeWidth={2.5} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
