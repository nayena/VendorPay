import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, translator, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const value = (await cookies()).get(LANG_COOKIE)?.value;
  return value === "en" || value === "es" ? value : DEFAULT_LANG;
}

export async function getT() {
  return translator(await getLang());
}
