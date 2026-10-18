"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { addMenuItem, removeMenuItem } from "@/app/actions";
import { useT } from "@/components/I18n";
import { money } from "@/lib/format";
import type { MenuItem } from "@/lib/types";

export function MenuEditor({ items }: { items: MenuItem[] }) {
  const t = useT();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await addMenuItem(name, Number(price));
      if (!res.ok) return setError(res.error);
      setName("");
      setPrice("");
    });
  };

  const remove = (id: string) => {
    setRemoving(id);
    startTransition(async () => {
      await removeMenuItem(id);
      setRemoving(null);
    });
  };

  return (
    <div className="grid gap-5 px-4 pb-10">
      {items.length === 0 ? (
        <p className="block-card p-5 text-lg">{t("menu.empty")}</p>
      ) : (
        <ul className="block-card divide-y-2 divide-ink/10 overflow-hidden">
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
              <span className="min-w-0 flex-1 text-lg font-bold">{m.name}</span>
              <span className="font-display text-xl tabular-nums">{money(m.price)}</span>
              <button
                onClick={() => remove(m.id)}
                disabled={pending}
                aria-label={t("menu.remove", { name: m.name })}
                className="grid size-12 place-items-center rounded-full text-chili active:bg-paper-2 disabled:opacity-50"
              >
                {removing === m.id ? <LoaderCircle className="size-6 animate-spin" strokeWidth={2.5} /> : <Trash2 className="size-6" strokeWidth={2.5} />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="-mt-3 px-1 text-sm font-bold text-ink-soft">{t("menu.count", { n: items.length })}</p>

      <form onSubmit={add} className="block-card grid gap-3 p-4">
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <label className="grid gap-1">
            <span className="font-bold">{t("menu.item")}</span>
            <input
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("menu.itemPh")}
              className="h-14 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-3 text-lg outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky"
            />
          </label>
          <label className="grid gap-1">
            <span className="font-bold">{t("menu.price")}</span>
            <span className="flex h-14 items-center rounded-2xl border-[2.5px] border-ink bg-white px-3 focus-within:outline-3 focus-within:outline-sky">
              <span className="text-lg font-bold text-ink-soft">$</span>
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="20"
                className="w-full min-w-0 bg-transparent pl-1 text-lg font-bold outline-none placeholder:text-ink/25"
              />
            </span>
          </label>
        </div>
        {error && (
          <p className="font-bold text-chili" role="alert">
            {error}
          </p>
        )}
        <button disabled={pending || !name.trim() || !price} className="btn w-full bg-nopal text-white">
          {pending && !removing ? <LoaderCircle className="size-6 animate-spin" strokeWidth={3} /> : <Plus className="size-6" strokeWidth={3} />}
          {t("menu.add")}
        </button>
      </form>
    </div>
  );
}
