"use client";

import { useOptimistic, useTransition } from "react";
import { MapPinned } from "lucide-react";
import { setApproxLocation } from "@/app/actions";
import { useT } from "@/components/I18n";

export function ApproxToggle({ on }: { on: boolean }) {
  const t = useT();
  const [value, setValue] = useOptimistic(on);
  const [, startTransition] = useTransition();

  const flip = () =>
    startTransition(async () => {
      setValue(!value);
      await setApproxLocation(!value);
    });

  return (
    <button
      role="switch"
      aria-checked={value}
      onClick={flip}
      className="block-card flex w-full items-center gap-4 p-4 text-left active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      <MapPinned className="size-8 shrink-0 text-sky" strokeWidth={2.5} />
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight">{t("settings.approx")}</span>
        <span className="mt-1 block text-sm font-bold text-ink-soft">{t("settings.approxSub")}</span>
      </span>
      <span className={`relative h-9 w-16 shrink-0 rounded-full border-[2.5px] border-ink transition-colors ${value ? "bg-nopal" : "bg-paper-2"}`}>
        <span
          className={`absolute top-1/2 size-6 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-white transition-all ${value ? "left-[calc(100%-1.75rem)]" : "left-1"}`}
        />
      </span>
    </button>
  );
}
