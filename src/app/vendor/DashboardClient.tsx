"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";
import { toggleOpen } from "@/app/actions";

/** Re-fetches the dashboard so payments from other phones appear on their own. */
export function LiveRefresh({ every = 4000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}

export function OpenToggle({ isOpen }: { isOpen: boolean }) {
  const [open, setOpen] = useOptimistic(isOpen);
  const [, startTransition] = useTransition();

  const flip = () =>
    startTransition(async () => {
      setOpen(!open);
      await toggleOpen(!open);
    });

  return (
    <button
      role="switch"
      aria-checked={open}
      onClick={flip}
      className={`block-card flex w-full items-center gap-4 p-4 text-left transition-colors active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${
        open ? "bg-nopal text-white" : "bg-white"
      }`}
    >
      <span
        className={`relative h-10 w-[4.5rem] shrink-0 rounded-full border-[2.5px] border-ink transition-colors ${open ? "bg-marigold" : "bg-paper-2"}`}
      >
        <span
          className={`absolute top-1/2 size-7 -translate-y-1/2 rounded-full border-[2.5px] border-ink bg-white transition-all ${open ? "left-[calc(100%-2rem)]" : "left-1"}`}
        />
      </span>
      <span>
        <span className="block font-display text-2xl leading-none">{open ? "I'm open" : "I'm closed"}</span>
        <span className="mt-1 block text-sm font-bold opacity-90">
          {open ? "Customers can see you on the map" : "Hidden from the map"}
        </span>
      </span>
    </button>
  );
}
