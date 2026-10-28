"use client";

import { SensorProvider } from "@/components/SensorProvider";
import { Sidebar } from "@/components/Sidebar";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SensorProvider>
      {/* Bungkus utama dengan background gambar awan */}
      <div
        className="flex min-h-screen relative text-white"
        style={{
          backgroundImage: "url('/cloud-bg.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Lapisan overlay gelap semi-transparan */}
        <div className="absolute inset-0 bg-slate-950/50 -z-0 pointer-events-none"></div>

        <Sidebar />

        <main className="min-w-0 flex-1 relative z-10">
          <div className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 sm:pb-24 lg:pb-8 text-slate-100">
            {children}
          </div>
        </main>
      </div>
    </SensorProvider>
  );
}
