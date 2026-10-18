"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORIES, normalizePhone } from "@/lib/format";
import type { BadgeId } from "@/lib/gamify";
import { AppError, LANG_COOKIE, type Lang } from "@/lib/i18n";
import { getT } from "@/lib/lang";
import * as session from "@/lib/session";
import * as store from "@/lib/store";
import type { Category } from "@/lib/types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function fail(e: unknown): Promise<{ ok: false; error: string }> {
  const t = await getT();
  if (e instanceof AppError) return { ok: false, error: t(e.key, e.vars) };
  console.error(e);
  return { ok: false, error: t("err.generic") };
}

const refreshAll = () => revalidatePath("/", "layout");

// ---------- language ----------

export async function setLang(lang: Lang) {
  if (lang !== "es" && lang !== "en") return;
  (await cookies()).set(LANG_COOKIE, lang, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  refreshAll();
}

// ---------- sign in / sign up (simulated SMS) ----------

export async function sendCode(rawPhone: string): Promise<Result<{ code: string; phone: string }>> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return fail(new AppError("err.phone"));
  // A real app would text this code. Here it is returned so the UI can show a fake SMS.
  return { ok: true, phone, code: await store.issueOtp(phone) };
}

export async function verifyCode(phone: string, code: string): Promise<Result> {
  if (!(await store.checkOtp(phone, code.trim()))) return fail(new AppError("err.code"));
  const existing = await store.getVendorByPhone(phone);
  if (existing) {
    await session.signIn(existing.id);
    redirect("/vendor");
  }
  await session.setVerifiedPhone(phone);
  redirect("/vendor/setup");
}

export async function demoSignIn(vendorId: string) {
  if (!(await store.getVendor(vendorId))) return;
  await session.signIn(vendorId);
  redirect("/vendor");
}

export async function signOut() {
  await session.signOut();
  redirect("/");
}

export async function createStall(input: {
  name: string;
  ownerName: string;
  category: string;
  spot: string;
  lat: number;
  lng: number;
}): Promise<Result> {
  const phone = await session.verifiedPhone();
  if (!phone) return fail(new AppError("err.phoneExpired"));
  const name = input.name.trim().slice(0, 40);
  if (!name) return fail(new AppError("err.name"));
  if (!(input.category in CATEGORIES)) return fail(new AppError("err.category"));
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return fail(new AppError("err.spot"));
  const t = await getT();
  let id: string;
  try {
    id = (
      await store.createVendor({
        phone,
        name,
        ownerName: input.ownerName.trim().slice(0, 40) || name,
        category: input.category as Category,
        spot: input.spot.trim().slice(0, 60) || t("setup.defaultSpot"),
        lat: input.lat,
        lng: input.lng,
      })
    ).id;
  } catch (e) {
    return fail(e);
  }
  await session.signIn(id);
  refreshAll();
  redirect("/vendor/qr?new=1");
}

// ---------- vendor dashboard ----------

/** Runs `fn` for the signed-in vendor and refreshes every page. */
async function withVendor<T extends object = object>(fn: (vendorId: string) => Promise<T | void>): Promise<Result<T>> {
  const vendor = await session.currentVendor();
  if (!vendor) return fail(new AppError("err.signIn"));
  let out: T | void;
  try {
    out = await fn(vendor.id);
  } catch (e) {
    return fail(e);
  }
  refreshAll();
  return { ok: true, ...(out as T) };
}

export async function toggleOpen(isOpen: boolean) {
  return withVendor((id) => store.setOpen(id, isOpen));
}

export async function setApproxLocation(on: boolean) {
  return withVendor((id) => store.setApproxLocation(id, on));
}

export async function refundPayment(paymentId: string) {
  return withVendor((id) => store.refund(id, paymentId).then(() => {}));
}

export async function addMenuItem(name: string, price: number) {
  return withVendor((id) => store.addMenuItem(id, name, price));
}

export async function removeMenuItem(itemId: string) {
  return withVendor((id) => store.removeMenuItem(id, itemId));
}

export async function createEvent(input: store.EventInput) {
  return withVendor((id) => store.createEvent(id, input).then(() => {}));
}

export async function updateEvent(eventId: string, input: store.EventInput) {
  return withVendor((id) => store.updateEvent(id, eventId, input));
}

export async function deleteEvent(eventId: string) {
  return withVendor((id) => store.deleteEvent(id, eventId));
}

export async function boostEvent(eventId: string, on: boolean) {
  return withVendor((id) => store.boostEvent(id, eventId, on));
}

/** Opens the stall wherever the vendor's phone is right now. */
export async function goLiveHere(lat: number, lng: number) {
  return withVendor((id) => store.goLiveHere(id, lat, lng));
}

// ---------- customer payment (simulated) ----------

export async function payVendor(input: {
  vendorId: string;
  amount?: number;
  items?: { id: string; qty: number }[];
  requestId: string;
}): Promise<Result<{ id: string; receipt: string; at: number; amount: number } & Reward>> {
  try {
    // A vendor paying their own stall is a test: it moves money but never counts toward trust.
    const me = await session.currentVendor();
    const customerId = me?.id === input.vendorId ? "self" : await session.customerId();
    // Pretend we're talking to a payment network.
    await new Promise((r) => setTimeout(r, 900));
    const tx = await store.pay({
      vendorId: input.vendorId,
      amount: input.amount,
      items: input.items,
      requestId: input.requestId,
      customerId,
    });
    // Paying through VendorPay is part of the explorer game too.
    const reward =
      customerId === "self" ? { points: 0, badges: [] } : await store.awardPayment(customerId, tx.id).catch(() => ({ points: 0, badges: [] }));
    refreshAll();
    return { ok: true, id: tx.id, receipt: tx.id.toUpperCase(), at: tx.createdAt, amount: tx.amount, ...reward };
  } catch (e) {
    return fail(e);
  }
}

export async function ratePayment(paymentId: string, stars: number): Promise<Result> {
  try {
    await store.rate(paymentId, await session.customerId(), stars);
  } catch (e) {
    return fail(e);
  }
  refreshAll();
  return { ok: true };
}

// ---------- discovery (shoppers) ----------

/** Points and newly earned badge ids, for the celebration toast. */
export type Reward = { points: number; badges: BadgeId[] };

/** Runs `fn` for this browser's shopper id (creating it if needed) and refreshes every page. */
async function asShopper<T extends object>(fn: (customerId: string) => Promise<T>): Promise<Result<T>> {
  let out: T;
  try {
    out = await fn(await session.customerId());
  } catch (e) {
    return fail(e);
  }
  refreshAll();
  return { ok: true, ...out };
}

export async function swipe(type: "vendor" | "event", id: string, dir: "save" | "skip") {
  return asShopper((cid) => store.recordSwipe(cid, type, id, dir));
}

export async function saveInterests(interests: string[]) {
  return asShopper((cid) => store.saveInterests(cid, interests).then(() => ({})));
}

export async function setNickname(name: string) {
  return asShopper((cid) => store.setNickname(cid, name).then(() => ({})));
}

/** Vendors can't check in at (or review) their own stall. */
async function notOwnStall(vendorId: string) {
  if ((await session.currentVendor())?.id === vendorId) throw new AppError("err.ownStall");
}

export async function checkInGps(vendorId: string, lat: number, lng: number, eventId?: string) {
  return asShopper(async (cid) => {
    await notOwnStall(vendorId);
    return store.checkIn(cid, vendorId, { method: "gps", lat, lng, eventId });
  });
}

export async function checkInQr(vendorId: string, code: string) {
  return asShopper(async (cid) => {
    await notOwnStall(vendorId);
    return store.checkIn(cid, vendorId, { method: "qr", code });
  });
}

export async function submitReview(vendorId: string, stars: number, text: string) {
  return asShopper(async (cid) => {
    await notOwnStall(vendorId);
    return store.upsertReview(cid, vendorId, stars, text);
  });
}

// ---------- savings circle ----------

export async function chipIn(circleId: string) {
  return withVendor((id) => store.contributeToCircle(circleId, id));
}

export async function simulateOthers(circleId: string) {
  return withVendor((id) => store.simulateOthersContribute(circleId, id));
}

export async function joinCircle(circleId: string) {
  return withVendor((id) => store.joinCircle(circleId, id));
}

export async function acceptInvite(circleId: string) {
  return withVendor((id) => store.acceptInvite(circleId, id));
}

export async function setAutoPay(on: boolean) {
  return withVendor((id) => store.setAutoPay(id, on));
}

export async function createCircle(name: string, contribution: number) {
  return withVendor((id) => store.createCircle(id, name, contribution).then(() => {}));
}

export async function inviteToCircle(circleId: string, rawPhone: string): Promise<Result<{ message: string }>> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return fail(new AppError("err.phone"));
  const t = await getT();
  return withVendor(async (id) => ({ message: t("tanda.invited", { name: await store.invite(circleId, id, phone) }) }));
}

/** Simulated SMS reminder to a member who hasn't paid in. Nothing is sent. */
export async function remindMember(circleId: string, memberId: string): Promise<Result<{ message: string }>> {
  const t = await getT();
  return withVendor(async (id) => ({ message: t("tanda.reminded", { name: await store.remindable(circleId, id, memberId) }) }));
}
