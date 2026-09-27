import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getVendor } from "./store";

// Simulated auth: a plain cookie holding the vendor id. Not secure; demo only.
const VENDOR = "vp_vendor";
const VERIFIED_PHONE = "vp_phone";

export async function currentVendor() {
  const id = (await cookies()).get(VENDOR)?.value;
  return id ? getVendor(id) : null;
}

export async function requireVendor() {
  const vendor = await currentVendor();
  if (!vendor) redirect("/vendor/start");
  return vendor;
}

export async function signIn(vendorId: string) {
  const jar = await cookies();
  jar.set(VENDOR, vendorId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  jar.delete(VERIFIED_PHONE);
}

export async function signOut() {
  (await cookies()).delete(VENDOR);
}

/** A phone that passed the (simulated) SMS check but has no stall yet. */
export async function setVerifiedPhone(phone: string) {
  (await cookies()).set(VERIFIED_PHONE, phone, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 30 });
}

export async function verifiedPhone() {
  return (await cookies()).get(VERIFIED_PHONE)?.value ?? null;
}
