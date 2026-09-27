"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CATEGORIES, normalizePhone } from "@/lib/format";
import * as session from "@/lib/session";
import * as store from "@/lib/store";
import type { Category } from "@/lib/types";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Something went wrong.",
});

const refreshAll = () => revalidatePath("/", "layout");

// ---------- sign in / sign up (simulated SMS) ----------

export async function sendCode(rawPhone: string): Promise<Result<{ code: string; phone: string }>> {
  const phone = normalizePhone(rawPhone);
  if (phone.length !== 10) return { ok: false, error: "Enter a 10-digit phone number." };
  // A real app would text this code. Here it is returned so the UI can show a fake SMS.
  return { ok: true, phone, code: store.issueOtp(phone) };
}

export async function verifyCode(phone: string, code: string): Promise<Result> {
  if (!store.checkOtp(phone, code.trim())) return { ok: false, error: "That code doesn't match. Try again." };
  const existing = store.getVendorByPhone(phone);
  if (existing) {
    await session.signIn(existing.id);
    redirect("/vendor");
  }
  await session.setVerifiedPhone(phone);
  redirect("/vendor/setup");
}

export async function demoSignIn(vendorId: string) {
  if (!store.getVendor(vendorId)) return;
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
  if (!phone) return { ok: false, error: "Your phone check expired. Please start again." };
  const name = input.name.trim().slice(0, 40);
  if (!name) return { ok: false, error: "Give your stall a name." };
  if (!(input.category in CATEGORIES)) return { ok: false, error: "Pick what you sell." };
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) return { ok: false, error: "Tap the map to set your spot." };
  let id: string;
  try {
    id = store.createVendor({
      phone,
      name,
      ownerName: input.ownerName.trim().slice(0, 40) || name,
      category: input.category as Category,
      spot: input.spot.trim().slice(0, 60) || "Ask around. I'm nearby!",
      lat: input.lat,
      lng: input.lng,
    }).id;
  } catch (e) {
    return fail(e);
  }
  await session.signIn(id);
  refreshAll();
  redirect("/vendor/qr?new=1");
}

// ---------- vendor dashboard ----------

export async function toggleOpen(isOpen: boolean): Promise<Result> {
  const vendor = await session.currentVendor();
  if (!vendor) return { ok: false, error: "Please sign in again." };
  store.setOpen(vendor.id, isOpen);
  refreshAll();
  return { ok: true };
}

// ---------- customer payment (simulated) ----------

export async function payVendor(vendorId: string, amount: number): Promise<Result<{ receipt: string; at: number }>> {
  try {
    // Pretend we're talking to a payment network.
    await new Promise((r) => setTimeout(r, 900));
    const tx = store.pay(vendorId, amount);
    refreshAll();
    return { ok: true, receipt: tx.id.toUpperCase(), at: tx.createdAt };
  } catch (e) {
    return fail(e);
  }
}

// ---------- savings circle ----------

async function withVendor(fn: (vendorId: string) => void): Promise<Result> {
  const vendor = await session.currentVendor();
  if (!vendor) return { ok: false, error: "Please sign in again." };
  try {
    fn(vendor.id);
  } catch (e) {
    return fail(e);
  }
  refreshAll();
  return { ok: true };
}

export async function chipIn(circleId: string) {
  return withVendor((id) => store.contributeToCircle(circleId, id));
}

export async function simulateOthers(circleId: string) {
  return withVendor((id) => store.simulateOthersContribute(circleId, id));
}

export async function joinCircle(circleId: string) {
  return withVendor((id) => store.joinCircle(circleId, id));
}
