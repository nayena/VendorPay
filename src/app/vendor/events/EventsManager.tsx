"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarPlus, LoaderCircle, LocateFixed, Megaphone, Pencil, Trash2 } from "lucide-react";
import { boostEvent, createEvent, deleteEvent, updateEvent } from "@/app/actions";
import { InterestPicker } from "@/components/discover";
import { useT } from "@/components/I18n";
import { PickSpotMap } from "@/components/maps";
import { eventWhen } from "@/lib/city";
import { EVENT_KINDS } from "@/lib/feed";
import type { Category, EventKind, Interest, VendorEvent } from "@/lib/types";

type Home = { category: Category; spot: string; lat: number; lng: number };

export function EventsManager({ events, vendor }: { events: VendorEvent[]; vendor: Home }) {
  const t = useT();
  // null: list; "new": creating; an event: editing it.
  const [editing, setEditing] = useState<VendorEvent | "new" | null>(events.length === 0 ? "new" : null);
  const [now] = useState(() => Date.now());

  if (editing) {
    return (
      <EventForm
        key={editing === "new" ? "new" : editing.id}
        event={editing === "new" ? null : editing}
        home={vendor}
        onDone={() => setEditing(null)}
        canCancel={events.length > 0 || editing !== "new"}
      />
    );
  }

  return (
    <div className="grid gap-4 px-4 pb-10">
      <p className="text-lg">{t("ev.intro")}</p>
      <button onClick={() => setEditing("new")} className="btn w-full bg-chili text-white">
        <CalendarPlus className="size-7" strokeWidth={2.5} /> {t("ev.new")}
      </button>
      <ul className="grid gap-3">
        {events.map((e) => (
          <EventRow key={e.id} event={e} now={now} onEdit={() => setEditing(e)} />
        ))}
      </ul>
    </div>
  );
}

function EventRow({ event: e, now, onEdit }: { event: VendorEvent; now: number; onEdit: () => void }) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const boosted = e.boostUntil > now;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError("");
      const res = await fn();
      if (!res.ok) setError(res.error ?? "");
    });

  return (
    <li className="block-card p-4">
      <div className="flex items-start gap-3">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-2xl border-[2.5px] border-ink text-3xl"
          style={{ backgroundColor: EVENT_KINDS[e.kind].color + "33" }}
          aria-hidden
        >
          {EVENT_KINDS[e.kind].emoji}
        </span>
        <Link href={`/e/${e.id}`} className="min-w-0 flex-1">
          <span className="block text-lg leading-tight font-bold">{e.title}</span>
          <span className="block text-sm font-bold text-ink-soft">{eventWhen(t, e.startsAt, e.endsAt, now)}</span>
        </Link>
      </div>
      <button
        role="switch"
        aria-checked={boosted}
        disabled={pending}
        onClick={() => run(() => boostEvent(e.id, !boosted))}
        className={`mt-3 flex w-full items-center gap-3 rounded-2xl border-[2.5px] border-ink p-3 text-left ${boosted ? "bg-marigold" : "bg-white"}`}
      >
        <Megaphone className="size-6 shrink-0" strokeWidth={2.5} />
        <span className="flex-1">
          <span className="block font-bold">{boosted ? t("ev.boosted") : t("ev.boost")}</span>
          <span className="block text-sm">{t("ev.boostSub")}</span>
        </span>
      </button>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onEdit} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[2.5px] border-ink bg-white font-bold">
          <Pencil className="size-5" strokeWidth={2.5} /> {t("ev.edit")}
        </button>
        {confirming ? (
          <button
            onClick={() => run(() => deleteEvent(e.id))}
            disabled={pending}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[2.5px] border-ink bg-chili font-bold text-white"
          >
            {t("ev.deleteYes")}
          </button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[2.5px] border-ink bg-white font-bold"
          >
            <Trash2 className="size-5" strokeWidth={2.5} /> {t("ev.delete")}
          </button>
        )}
      </div>
      {error && (
        <p className="mt-2 font-bold text-chili" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/** "2026-10-18T19:00" in the phone's time zone, for <input type="datetime-local">. */
function toLocalInput(ts: number) {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nextHour() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.getTime();
}

function EventForm({ event, home, onDone, canCancel }: { event: VendorEvent | null; home: Home; onDone: () => void; canCancel: boolean }) {
  const t = useT();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "popup");
  const [tags, setTags] = useState<Interest[]>(event?.tags ?? [home.category]);
  const [spot, setSpot] = useState(event?.spot ?? home.spot);
  const [pos, setPos] = useState<[number, number]>(event ? [event.lat, event.lng] : [home.lat, home.lng]);
  const [start, setStart] = useState(() => toLocalInput(event?.startsAt ?? nextHour()));
  const [end, setEnd] = useState(() => toLocalInput(event?.endsAt ?? nextHour() + 3 * 60 * 60 * 1000));
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [pending, startTransition] = useTransition();

  function locateMe() {
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

  function save() {
    setError("");
    const input = {
      title,
      description,
      kind,
      tags,
      spot,
      lat: pos[0],
      lng: pos[1],
      startsAt: new Date(start).getTime(),
      endsAt: new Date(end).getTime(),
    };
    startTransition(async () => {
      const res = event ? await updateEvent(event.id, input) : await createEvent(input);
      if (res.ok) onDone();
      else setError(res.error);
    });
  }

  const field =
    "w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-4 text-lg font-bold outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky";

  return (
    <div className="grid animate-rise gap-5 px-4 pb-10">
      <h2 className="font-display text-3xl">{event ? t("ev.editTitle") : t("ev.new")}</h2>

      <label className="grid gap-1.5">
        <span className="font-bold">{t("ev.name")}</span>
        <input value={title} maxLength={50} onChange={(e) => setTitle(e.target.value)} placeholder={t("ev.namePh")} className={`h-14 ${field}`} />
      </label>

      <div className="grid gap-2">
        <span className="font-bold">{t("ev.kind")}</span>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("ev.kind")}>
          {(Object.keys(EVENT_KINDS) as EventKind[]).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => setKind(k)}
              className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border-[2.5px] border-ink text-sm font-bold ${
                kind === k ? "bg-marigold shadow-block-sm" : "bg-white"
              }`}
            >
              <span className="text-2xl" aria-hidden>
                {EVENT_KINDS[k].emoji}
              </span>
              {t(`kind.${k}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1.5">
          <span className="font-bold">{t("ev.starts")}</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={`h-14 px-2 text-base ${field}`} />
        </label>
        <label className="grid gap-1.5">
          <span className="font-bold">{t("ev.ends")}</span>
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={`h-14 px-2 text-base ${field}`} />
        </label>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{t("ev.where")}</span>
          <button
            type="button"
            onClick={locateMe}
            disabled={locating}
            className="flex min-h-11 items-center gap-1.5 rounded-full border-[2.5px] border-ink bg-white px-3 font-bold shadow-block-sm"
          >
            {locating ? <LoaderCircle className="size-5 animate-spin" strokeWidth={2.5} /> : <LocateFixed className="size-5" strokeWidth={2.5} />}
            {t("setup.gps")}
          </button>
        </div>
        <div className="h-56 overflow-hidden rounded-[1.25rem] border-[2.5px] border-ink">
          <PickSpotMap value={pos} category={home.category} onPick={(lat, lng) => setPos([lat, lng])} />
        </div>
        <p className="text-sm text-ink-soft">{t("setup.tapMap")}</p>
        <input value={spot} maxLength={60} onChange={(e) => setSpot(e.target.value)} placeholder={t("setup.spotPh")} className={`h-14 ${field}`} />
      </div>

      <label className="grid gap-1.5">
        <span className="font-bold">
          {t("ev.about")} <span className="font-normal text-ink-soft">{t("optional")}</span>
        </span>
        <textarea
          value={description}
          maxLength={280}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("ev.aboutPh")}
          className={`py-3 font-normal ${field}`}
        />
      </label>

      <div className="grid gap-2">
        <span className="font-bold">{t("ev.tags")}</span>
        <span className="-mt-1 text-sm text-ink-soft">{t("ev.tagsSub")}</span>
        <InterestPicker value={tags} onChange={(v) => setTags(v.slice(0, 6))} />
      </div>

      {error && (
        <p className="font-bold text-chili" role="alert">
          {error}
        </p>
      )}
      <button onClick={save} disabled={pending || !title.trim()} className="btn w-full bg-chili text-white">
        {event ? t("ev.save") : t("ev.publish")}
      </button>
      {canCancel && (
        <button onClick={onDone} className="btn w-full bg-white">
          {t("cancel")}
        </button>
      )}
    </div>
  );
}
