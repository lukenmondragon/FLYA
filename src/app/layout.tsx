import type { Metadata, Viewport } from "next";
import "./globals.css";
import { t } from "@/lib/i18n/es";

export const metadata: Metadata = {
  title: `${t.appName} · buscador de vuelos con IA`,
  description: t.tagline,
};

export const viewport: Viewport = { themeColor: "#323438", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
