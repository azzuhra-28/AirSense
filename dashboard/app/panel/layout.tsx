"use client";

import { useCallback, useEffect, useState } from "react";
import { SensorProvider } from "@/components/SensorProvider";
import { Sidebar } from "@/components/Sidebar";

const STORAGE_KEY = "airsense:sidebar-open";

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw !== null) setSidebarOpen(raw === "1");
    } catch {
      /* abaikan */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* abaikan */
      }
      return next;
    });
  }, []);

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

        <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />
        
        <main className="min-w-0 flex-1 relative z-10">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 text-slate-100">
            {children}
          </div>
        </main>
      </div>
    </SensorProvider>
  );
}