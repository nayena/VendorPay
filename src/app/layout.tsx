import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Lilita_One } from "next/font/google";
import { I18nProvider } from "@/components/I18n";
import { getLang } from "@/lib/lang";
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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${lilita.variable} ${atkinson.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider lang={lang}>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">{children}</div>
        </I18nProvider>
      </body>
    </html>
  );
}
