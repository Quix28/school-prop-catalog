import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getSettings } from "@/lib/settings";
import { SettingsProvider } from "./settings-provider";
import "./globals.css";

// Settings are edited live from the admin panel, so render on each request.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  return {
    title: getSettings().site_name,
    description: "Robert College, Robert Kolej, Costume and Prop Catalog, Kostüm Odasi, Kostüm ve Dekor Kataloğu",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const settings = getSettings();
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SettingsProvider value={settings}>
          {settings.announcement && (
            <div role="status" className="bg-amber-100 border-b border-amber-200 px-6 py-2 text-center text-sm text-amber-900 whitespace-pre-line">
              {settings.announcement}
            </div>
          )}
          {children}
        </SettingsProvider>
      </body>
    </html>
  );
}
