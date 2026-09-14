import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AirSense — Monitoring Kualitas Udara",
  description: "Dashboard real-time monitoring & prediksi kualitas udara (PM2.5, PM10, CO, NO2, O3)",
};

const navLink =
  "text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-lg font-bold tracking-tight">AirSense</span>
            </div>
            <nav className="flex items-center gap-5">
              <Link href="/" className={navLink}>Overview</Link>
              <Link href="/predict" className={navLink}>Forecast</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
