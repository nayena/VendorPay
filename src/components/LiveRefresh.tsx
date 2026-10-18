"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches the page while it's on screen, so changes from other phones appear on their own. */
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
