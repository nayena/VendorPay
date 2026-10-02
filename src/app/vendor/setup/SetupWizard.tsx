"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, LocateFixed } from "lucide-react";
import { createStall } from "@/app/actions";
import { useT } from "@/components/I18n";
import { PickSpotMap } from "@/components/maps";
import { CATEGORIES } from "@/lib/format";
import type { Category } from "@/lib/types";

const STEPS = ["setup.step1", "setup.step2", "setup.step3"] as const;

export function SetupWizard({ center }: { center: [number, number] }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [spot, setSpot] = useState("");
  // Start the pin a little off-center so new stalls don't stack on one point.
  const [pos, setPos] = useState<[number, number]>(() => [
    center[0] + (Math.random() - 0.5) * 0.004,
    center[1] + (Math.random() - 0.5) * 0.004,
  ]);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();

  function locateMe() {
    setError("");
    if (!("geolocation" in navigator)) return setError(t("setup.gpsFail"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        setPos([p.coords.latitude, p.coords.longitude]);
      },
      () => {
        setLocating(false);
        setError(t("setup.gpsFail"));
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const canNext = step === 0 ? name.trim().length > 0 : step === 1 ? category !== null : true;

  function finish() {
    setError("");
    startTransition(async () => {
      const res = await createStall({ name, ownerName, category: category!, spot, lat: pos[0], lng: pos[1] });
      if (res && !res.ok) setError(res.error); // success redirects
    });
  }

  return (
    <div className="flex flex-1 flex-col px-5 pb-8">
      <ol className="mb-6 flex gap-2" aria-label={t("setup.progress")}>
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={`h-2.5 flex-1 rounded-full border-2 border-ink ${i <= step ? "bg-chili" : "bg-white"}`}
          >
            <span className="sr-only">{t(s)}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div key="name" className="grid animate-rise gap-5">
          <h1 className="font-display text-4xl">{t("setup.nameQ")}</h1>
          <input
            autoFocus
            maxLength={40}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tamales Mary"
            className="h-16 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-4 text-2xl font-bold shadow-block-sm outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky"
          />
          <label className="grid gap-2">
            <span className="text-lg font-bold">
              {t("setup.owner")} <span className="font-normal text-ink-soft">{t("optional")}</span>
            </span>
            <input
              maxLength={40}
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="h-14 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-4 text-xl outline-none focus:outline-3 focus:outline-sky"
            />
          </label>
        </div>
      )}

      {step === 1 && (
        <div key="cat" className="animate-rise">
          <h1 className="mb-5 font-display text-4xl">{t("setup.whatQ")}</h1>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(CATEGORIES) as Category[]).map((c) => {
              const on = category === c;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  aria-pressed={on}
                  className={`flex aspect-[5/4] flex-col items-center justify-center gap-1 rounded-2xl border-[2.5px] border-ink transition ${
                    on ? "bg-marigold shadow-none translate-x-[3px] translate-y-[3px]" : "bg-white shadow-block"
                  }`}
                >
                  <span className="text-5xl">{CATEGORIES[c].emoji}</span>
                  <span className="text-lg font-bold">{t(`cat.${c}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && category && (
        <div key="where" className="grid animate-rise gap-4">
          <h1 className="font-display text-4xl">{t("setup.whereQ")}</h1>
          <p className="-mt-2 text-lg">{t("setup.tapMap")}</p>
          <div className="h-64 overflow-hidden rounded-2xl border-[2.5px] border-ink shadow-block">
            <PickSpotMap value={pos} category={category} onPick={(lat, lng) => setPos([lat, lng])} />
          </div>
          <button type="button" onClick={locateMe} disabled={locating} className="btn w-full bg-white">
            {locating ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : <LocateFixed className="size-6" strokeWidth={2.5} />}
            {t("setup.gps")}
          </button>
          <label className="grid gap-2">
            <span className="text-lg font-bold">
              {t("setup.findYou")} <span className="font-normal text-ink-soft">{t("optional")}</span>
            </span>
            <input
              maxLength={60}
              value={spot}
              onChange={(e) => setSpot(e.target.value)}
              placeholder={t("setup.spotPh")}
              className="h-14 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-4 text-xl outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky"
            />
          </label>
        </div>
      )}

      {error && <p className="mt-4 font-bold text-chili" role="alert">{error}</p>}

      <div className="mt-auto grid grid-cols-[auto_1fr] gap-3 pt-8">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} disabled={pending} className="btn bg-white">
            {t("back")}
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep(step + 1)} disabled={!canNext} className="btn bg-chili text-white">
            {t("setup.next")}
          </button>
        ) : (
          <button onClick={finish} disabled={pending} className="btn bg-nopal text-white">
            {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : t("setup.open")}
          </button>
        )}
      </div>
    </div>
  );
}
