"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  LineChart, 
  BrainCircuit, 
  History, 
  Cpu, 
  Bell,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";

const navItems = [
  { name: "Ringkasan", href: "/panel", icon: LayoutDashboard },
  { name: "Analitik", href: "/panel/analytics", icon: LineChart },
  { name: "Prediksi", href: "/panel/predict", icon: BrainCircuit },
  { name: "Riwayat", href: "/panel/history", icon: History },
  { name: "Perangkat", href: "/panel/devices", icon: Cpu },
  { name: "Peringatan", href: "/panel/alerts", icon: Bell },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside 
      className={`relative flex flex-col transition-all duration-300 border-r border-sky-400/20 bg-slate-900/70 backdrop-blur-md p-4 text-slate-100 shadow-xl ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* TOMBOL TOGGLE BUKA/TUTUP */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3.5 top-6 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-sky-400/30 bg-slate-900 text-sky-300 shadow-md transition hover:bg-slate-800 cursor-pointer"
        title={collapsed ? "Buka Sidebar" : "Tutup Sidebar"}
      >
        {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
      </button>

      {/* LOGO / HEADER SIDEBAR (DIARAHKAN KE LANDING PAGE) */}
      <Link
        href="/"
        title="Kembali ke Landing Page"
        className={`flex items-center gap-3 px-2 py-4 mb-4 border-b border-white/10 overflow-hidden transition hover:opacity-80 ${
          collapsed ? "justify-center px-0" : ""
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
          <Cpu className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="truncate">
            <span 
              className="font-bold tracking-wider text-lg text-white block"
              style={{ fontFamily: "var(--font-audiowide), sans-serif" }}
            >
              AirSense
            </span>
            <p className="text-[10px] text-slate-400">IoT Air Monitoring</p>
          </div>
        )}
      </Link>

      {/* MENU NAVIGASI */}
      <nav className="flex-1 space-y-1.5 overflow-x-hidden">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.name : undefined}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                collapsed ? "justify-center px-0" : ""
              } ${
                isActive
                  ? "bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-md"
                  : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      {/* FOOTER KECIL DI SIDEBAR */}
      {!collapsed && (
        <div className="mt-auto pt-4 border-t border-white/10 text-center truncate">
          <span className="text-[10px] text-slate-400">
            PENS Data Science © 2026
          </span>
        </div>
      )}
    </aside>
  );
}