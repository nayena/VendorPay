"use client";

import { useState, useTransition } from "react";
import { saveInterests, setNickname } from "@/app/actions";
import { InterestPicker } from "@/components/discover";
import { useT } from "@/components/I18n";
import type { Interest } from "@/lib/types";

export function ProfileEditor({ nickname, interests }: { nickname: string; interests: Interest[] }) {
  const t = useT();
  const [name, setName] = useState(nickname);
  const [picked, setPicked] = useState(interests);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setMessage(null);
      if (name.trim() !== nickname) {
        const res = await setNickname(name);
        if (!res.ok) return setMessage({ ok: false, text: res.error });
      }
      const res = await saveInterests(picked);
      setMessage(res.ok ? { ok: true, text: t("me.saved") } : { ok: false, text: res.error });
    });

  return (
    <section className="block-card grid gap-4 p-4">
      <h2 className="font-display text-xl">{t("me.edit")}</h2>
      <label className="grid gap-1.5">
        <span className="font-bold">{t("me.nickname")}</span>
        <input
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("me.nicknamePh")}
          className="h-14 w-full min-w-0 rounded-2xl border-[2.5px] border-ink bg-white px-4 text-xl font-bold outline-none placeholder:text-ink/25 focus:outline-3 focus:outline-sky"
        />
        <span className="text-sm text-ink-soft">{t("me.nicknameHint")}</span>
      </label>
      <div className="grid gap-2">
        <span className="font-bold">{t("int.title")}</span>
        <InterestPicker value={picked} onChange={setPicked} />
      </div>
      <button onClick={save} disabled={pending} className="btn w-full bg-chili text-white">
        {t("me.save")}
      </button>
      {message && (
        <p className={`font-bold ${message.ok ? "text-nopal" : "text-chili"}`} role={message.ok ? "status" : "alert"}>
          {message.text}
        </p>
      )}
    </section>
  );
}
