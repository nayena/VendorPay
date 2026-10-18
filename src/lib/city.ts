import { SPEECH_LANG, type T } from "./i18n";

// Centro Histórico, Mexico City.
export const CITY = {
  name: "Mexico City",
  center: [19.4326, -99.1332] as [number, number],
  timeZone: "America/Mexico_City",
};

/** The calendar day (YYYY-MM-DD) in the app's city, for once-a-day limits. */
export function cityDay(now: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CITY.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const DAY = 24 * 60 * 60 * 1000;
const dayIndex = (ts: number) => Math.round(Date.parse(cityDay(ts)) / DAY);

/** "Live · until 9:00 PM", "Today 7:00 PM", "Tomorrow 10:00 AM", "Saturday 6:00 PM". */
export function eventWhen(t: T, startsAt: number, endsAt: number, now = Date.now()) {
  const locale = SPEECH_LANG[t.lang];
  const time = (ts: number) => new Intl.DateTimeFormat(locale, { timeZone: CITY.timeZone, hour: "numeric", minute: "2-digit" }).format(ts);
  if (startsAt <= now && now < endsAt) return t("when.live", { time: time(endsAt) });
  if (endsAt <= now) return t("when.ended");
  const days = dayIndex(startsAt) - dayIndex(now);
  if (days === 0) return t("when.today", { time: time(startsAt) });
  if (days === 1) return t("when.tomorrow", { time: time(startsAt) });
  const day = new Intl.DateTimeFormat(locale, { timeZone: CITY.timeZone, weekday: "long", day: "numeric", month: "short" }).format(startsAt);
  return t("when.day", { day, time: time(startsAt) });
}
