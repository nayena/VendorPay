"use client";

import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useState, useSyncExternalStore, useTransition } from "react";
import { BellRing, Eye, EyeOff, Volume2, VolumeX } from "lucide-react";
import { toggleOpen } from "@/app/actions";
import { useT } from "@/components/I18n";
import { money } from "@/lib/format";
import { SPEECH_LANG } from "@/lib/i18n";

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
  const t = useT();
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
        <span className="block font-display text-2xl leading-none">{open ? t("toggle.open") : t("toggle.closed")}</span>
        <span className="mt-1 block text-sm font-bold opacity-90">{open ? t("toggle.openSub") : t("toggle.closedSub")}</span>
      </span>
    </button>
  );
}

/** Hidden until tapped, and hides itself again, so a balance isn't on show to passers-by. */
export function BalanceCard({ balance }: { balance: number }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const id = setTimeout(() => setShown(false), 10_000);
    return () => clearTimeout(id);
  }, [shown]);

  return (
    <button
      onClick={() => setShown(!shown)}
      aria-label={shown ? t("dash.hide") : t("dash.show")}
      aria-pressed={shown}
      className="block-card bg-ink p-4 text-left text-white active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      <span className="flex items-center justify-between text-sm font-bold uppercase tracking-wide text-marigold">
        {t("dash.wallet")}
        {shown ? <EyeOff className="size-5" strokeWidth={2.5} /> : <Eye className="size-5" strokeWidth={2.5} />}
      </span>
      <span className="block font-display text-4xl tabular-nums">{shown ? money(balance) : "$ • • •"}</span>
      <span className="block text-sm opacity-80">{t("dash.pretend")}</span>
    </button>
  );
}

// ---------- payment announcements ----------

// Per-device preference, so it lives in localStorage. Every access is guarded:
// storage can be blocked (private mode, previews).
const SOUND_KEY = "vp_sound";
const soundListeners = new Set<() => void>();
function readSound() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
function writeSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {}
  soundListeners.forEach((l) => l());
}
const subscribeSound = (l: () => void) => {
  soundListeners.add(l);
  return () => soundListeners.delete(l);
};

/**
 * Says each new payment out loud and buzzes the phone, so a vendor serving food
 * doesn't need to look at the screen. Browsers only allow speech after the page
 * has been tapped once; the sound toggle doubles as that first tap.
 */
export function PaymentAlerts({ latest }: { latest: { id: string; amount: number } | null }) {
  const t = useT();
  const soundOn = useSyncExternalStore(subscribeSound, readSound, () => false);
  const [seenId, setSeenId] = useState(latest?.id ?? null);
  const [toast, setToast] = useState<{ id: string; amount: number } | null>(null);

  // A different newest payment than last render means one just arrived.
  if (latest && latest.id !== seenId) {
    setSeenId(latest.id);
    setToast(latest);
  }

  useEffect(() => {
    if (!toast) return;
    if (readSound()) {
      speak(t("alert.speak", { amount: toast.amount }), SPEECH_LANG[t.lang]);
      navigator.vibrate?.([200, 100, 200]);
    }
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast, t]);

  const toggle = () => {
    writeSound(!soundOn);
    if (!soundOn) speak(t("dash.soundOn"), SPEECH_LANG[t.lang]);
  };

  return (
    <>
      <button
        onClick={toggle}
        aria-pressed={soundOn}
        className="flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3 text-sm font-bold active:bg-paper-2"
      >
        {soundOn ? <Volume2 className="size-5" strokeWidth={2.5} /> : <VolumeX className="size-5" strokeWidth={2.5} />}
        {soundOn ? t("dash.soundOn") : t("dash.soundOff")}
      </button>
      <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-4 z-[1100] mx-auto max-w-md px-4">
        {toast && (
          <div key={toast.id} className="flex animate-pop items-center gap-3 rounded-2xl border-[3px] border-ink bg-nopal p-4 text-white shadow-block">
            <BellRing className="size-8 shrink-0" strokeWidth={2.5} />
            <span>
              <span className="block text-sm font-bold uppercase tracking-wide">{t("dash.newPayment")}</span>
              <span className="font-display text-4xl tabular-nums">+{money(toast.amount)}</span>
            </span>
          </div>
        )}
      </div>
    </>
  );
}

function speak(text: string, lang: string) {
  try {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}
