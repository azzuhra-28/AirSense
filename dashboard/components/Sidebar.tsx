"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  LayoutDashboard,
  LineChart,
  BrainCircuit,
  History,
  Cpu,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
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
  const reduceMotion = useReducedMotion();

  const isActive = (href: string) =>
    href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);

  return (
    <>
      <aside
        className={`sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-sky-400/20 bg-slate-900/70 p-4 text-slate-100 shadow-xl backdrop-blur-md transition-[width] duration-300 ease-out lg:flex ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* TOMBOL TOGGLE BUKA/TUTUP */}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Buka sidebar" : "Tutup sidebar"}
          aria-expanded={!collapsed}
          className="absolute -right-3.5 top-6 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-sky-400/30 bg-slate-900 text-sky-300 shadow-md transition-colors hover:bg-slate-800"
          title={collapsed ? "Buka Sidebar" : "Tutup Sidebar"}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>

        {/* LOGO / HEADER SIDEBAR (DIARAHKAN KE LANDING PAGE) */}
        <Link
          href="/"
          title="Kembali ke Landing Page"
          className={`flex items-center gap-3 px-2 py-4 mb-4 border-b border-white/10 overflow-hidden transition-opacity hover:opacity-80 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
            <Cpu className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="truncate">
              <span className="font-display text-lg tracking-wider text-white block">
                AirSense
              </span>
              <p className="text-[10px] text-slate-400">IoT Air Monitoring</p>
            </div>
          )}
        </Link>

        {/* MENU NAVIGASI */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? item.name : undefined}
                className={`relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                  collapsed ? "justify-center px-0" : ""
                } ${
                  active
                    ? "text-sky-300"
                    : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="sidebar-active-pill"
                    aria-hidden
                    className="absolute inset-0 rounded-xl bg-sky-500/20 ring-1 ring-sky-400/30 shadow-md"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 420, damping: 34 }
                    }
                  />
                )}

                <Icon className="relative h-4 w-4 shrink-0" />
                {!collapsed && <span className="relative truncate">{item.name}</span>}
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

      {/* NAVIGASI BAWAH UNTUK LAYAR KECIL */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-sky-400/20 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex min-h-[44px] flex-col items-center justify-center gap-1 py-2"
              >
                <Icon
                  className={`h-[18px] w-[18px] ${
                    active ? "text-sky-300" : "text-slate-400"
                  }`}
                />
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-sky-300" : "text-slate-400"
                  }`}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
