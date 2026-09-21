import type { Metadata } from "next";

import { SensorProvider } from "@/components/SensorProvider";
import { Sidebar } from "@/components/Sidebar";

import "./globals.css";

export const metadata: Metadata = {
  title: "AirSense — Kualitas Udara",
  description:
    "Monitoring dan prediksi kualitas udara: PM2.5, PM10, CO, NO₂, dan O₃.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen antialiased">
        <SensorProvider>
          <Sidebar />
          <div className="lg:pl-60">
            <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:pb-10">
              {children}
            </main>
          </div>
        </SensorProvider>
      </body>
    </html>
  );
}
