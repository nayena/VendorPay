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

// Simulated customer identity: an anonymous id per browser. It stands in for the paying
// account (card, wallet) in a real system, so trust can count *different* customers and
// only the customer who paid can rate that payment.
const CUSTOMER = "vp_customer";

/** Only call from a Server Function: it may need to set the cookie. */
export async function customerId() {
  const jar = await cookies();
  const existing = jar.get(CUSTOMER)?.value;
  if (existing && /^c[a-f0-9]{16}$/.test(existing)) return existing;
  const id = "c" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  jar.set(CUSTOMER, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

/** The customer id if this browser has one already. Safe to call while rendering: never sets the cookie. */
export async function currentCustomerId() {
  const existing = (await cookies()).get(CUSTOMER)?.value;
  return existing && /^c[a-f0-9]{16}$/.test(existing) ? existing : null;
}
