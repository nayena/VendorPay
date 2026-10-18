"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return (
    <button onClick={() => window.print()} className="btn w-full bg-white">
      <Printer className="size-6" strokeWidth={2.5} /> {label}
    </button>
  );
}
