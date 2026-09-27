"use client";

import { useState, useTransition } from "react";
import { LoaderCircle } from "lucide-react";
import { chipIn, joinCircle, simulateOthers, type Result } from "@/app/actions";

type Action = "chip" | "others" | "join";
const ACTIONS: Record<Action, (circleId: string) => Promise<Result>> = {
  chip: chipIn,
  others: simulateOthers,
  join: joinCircle,
};

export function CircleButton({
  circleId,
  action,
  children,
  className,
}: {
  circleId: string;
  action: Action;
  children: React.ReactNode;
  className: string;
}) {
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-2">
      <button
        disabled={pending}
        className={className}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const res = await ACTIONS[action](circleId);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : children}
      </button>
      {error && (
        <p className="text-center font-bold text-chili" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
