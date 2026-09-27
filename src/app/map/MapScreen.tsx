"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronRight, MapPin, QrCode } from "lucide-react";
import { VendorMap } from "@/components/maps";
import type { MapVendor } from "@/components/LeafletMaps";
import { CategoryChip, TrustBadge } from "@/components/ui";

export type ScreenVendor = MapVendor & { spot: string };

export function MapScreen({ vendors, center }: { vendors: ScreenVendor[]; center: [number, number] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = vendors.find((v) => v.id === selectedId);

  return (
    <>
      <div className="relative h-[52dvh] overflow-hidden border-y-[2.5px] border-ink">
        <VendorMap vendors={vendors} center={center} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      <section className="flex-1 px-4 pt-5 pb-8">
        {selected ? (
          <div key={selected.id} className="block-card animate-rise p-4">
            <div className="flex items-start gap-3">
              <CategoryChip category={selected.category} />
              <div className="min-w-0">
                <h2 className="font-display text-2xl leading-tight">{selected.name}</h2>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-soft">
                  <MapPin className="size-4 shrink-0" /> {selected.spot}
                </p>
                <div className="mt-2">
                  <TrustBadge sales={selected.sales} />
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
              <Link href={`/v/${selected.id}/pay`} className="btn bg-chili text-white">
                Pay
              </Link>
              <Link href={`/v/${selected.id}`} className="btn bg-white px-4" aria-label="See QR code and profile">
                <QrCode className="size-7" strokeWidth={2.5} />
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="mb-3 font-display text-xl">
              Open now <span className="text-ink-soft">· {vendors.length}</span>
            </h2>
            {vendors.length === 0 && (
              <p className="block-card p-5 text-lg">No stalls are open right now. Check back soon!</p>
            )}
            <ul className="grid gap-3">
              {vendors.map((v, i) => (
                <li key={v.id} className="animate-rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    onClick={() => setSelectedId(v.id)}
                    className="block-card flex w-full items-center gap-3 p-3 text-left active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
                  >
                    <CategoryChip category={v.category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-bold">{v.name}</span>
                      <TrustBadge sales={v.sales} size="sm" />
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
