import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "بوت تداول الذهب XAU/USD | تحليل احترافي — سكالبينج ويومي",
  description:
    "روبوت تحليل ذهب احترافي: توصيات سكالبينج وتداول يومي مبنيّة على 7 أعمدة تحليل موزونة — اتجاه متعدد الأطر، زخم، دعم ومقاومة، حركة سعر، ارتباط كللي، جلسات، وتقلب. مع نسبة ثقة مدروسة ومدققة.",
  keywords: ["تداول الذهب", "XAUUSD", "سكالبينج", "تحليل فني", "بوت تداول", "ذهب", "توصيات ذهب"],
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='0.9em' font-size='90'%3E🥇%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${plexArabic.variable} font-sans antialiased bg-[#09090b] text-zinc-100`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
