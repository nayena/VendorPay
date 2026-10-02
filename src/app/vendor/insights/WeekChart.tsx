"use client";

import { useState } from "react";
import { money } from "@/lib/format";

type Day = { label: string; total: number; today: boolean };

/**
 * One series, so one hue and no legend. Tapping a bar shows its value in the readout
 * above (defaults to today), so no value is reachable only by hover; a table backs it
 * up for screen readers.
 */
export function WeekChart({ days, label }: { days: Day[]; label: string }) {
  const [active, setActive] = useState(days.length - 1);
  const max = Math.max(1, ...days.map((d) => d.total));
  const shown = days[active];

  return (
    <figure className="mt-3">
      <p className="h-6 text-sm font-bold text-ink-soft" aria-hidden>
        {shown.label}: <span className="text-ink">{money(shown.total)}</span>
      </p>
      <div className="relative mt-2 h-40" aria-hidden>
        {/* Recessive guides at half and full scale. */}
        <div className="absolute inset-x-0 top-0 border-t border-ink/10" />
        <div className="absolute inset-x-0 top-1/2 border-t border-ink/10" />
        <div className="absolute inset-0 flex items-end gap-[2px] border-b-2 border-ink/40">
          {days.map((d, i) => (
            <button
              key={i}
              tabIndex={-1}
              onClick={() => setActive(i)}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                className={`block w-3/5 rounded-t-[4px] transition-colors ${i === active ? "bg-nopal" : "bg-nopal/45"}`}
                style={{ height: `${Math.max(d.total ? 2 : 0, (d.total / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden>
        {days.map((d, i) => (
          <span key={i} className={`flex-1 text-center text-xs capitalize ${d.today ? "font-bold text-ink" : "text-ink-soft"}`}>
            {d.label.replace(".", "")}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {days.map((d, i) => (
            <tr key={i}>
              <th scope="row">{d.label}</th>
              <td>{money(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
