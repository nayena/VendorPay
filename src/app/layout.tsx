import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Lilita_One } from "next/font/google";
import "./globals.css";

// Lilita One reads like a hand-painted stall sign; Atkinson Hyperlegible was
// designed for low-vision readers, which suits small screens in bright sun.
const lilita = Lilita_One({ variable: "--font-lilita", weight: "400", subsets: ["latin"] });
const atkinson = Atkinson_Hyperlegible({ variable: "--font-atkinson", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VendorPay",
  description: "Cashless payments and a live map for street vendors. Prototype with simulated money.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c0360c",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${lilita.variable} ${atkinson.variable} h-full antialiased`}>
      <body className="min-h-full">
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
      </body>
    </html>
  );
}
