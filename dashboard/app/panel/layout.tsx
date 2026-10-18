
"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
      /* abaikan — storage tidak tersedia */
    }
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* abaikan — storage tidak tersedia */
      }
      return next;
    });
  }, []);

  return (
    <SensorProvider>
      <div className="flex min-h-screen bg-[#F5F5F4] relative">
        {/* Tekstur awan samar di balik konten */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <Image
            src="/images/cloud-bg.jpg"
            alt=""
            fill
            className="object-cover opacity-30"
          />
        </div>
        <Sidebar open={sidebarOpen} onToggle={toggleSidebar} />

        <main
          className={`relative min-w-0 flex-1 transition-[padding] duration-300 ease-in-out ${
            sidebarOpen ? "lg:pl-60" : "lg:pl-0"
          }`}
        >
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </div>
        </main>
      </div>
    </SensorProvider>
  );
}
