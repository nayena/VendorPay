import QRCode from "qrcode";
import { headers } from "next/headers";

/** Absolute URL for the current host, so a phone camera scanning the QR lands on this app. */
export async function absoluteUrl(path: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

export async function QrCode({ url, className = "" }: { url: string; className?: string }) {
  const svg = await QRCode.toString(url, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#22150d", light: "#ffffff" },
  });
  // Library-generated SVG markup (no user input beyond the encoded URL).
  return <div className={`[&>svg]:block [&>svg]:size-full ${className}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
