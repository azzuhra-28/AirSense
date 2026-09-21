"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Cpu,
  Gauge,
  List,
  Sparkles,
  TrendingUp,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { NAV } from "@/lib/brand";
import {
  DEVICE_STATUS_META,
  type DeviceStatus,
} from "@/lib/device";
import { useSensorData } from "@/components/SensorProvider";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  trending: TrendingUp,
  sparkles: Sparkles,
  list: List,
  cpu: Cpu,
  bell: Bell,
};

/**
 * Sidebar navigasi + monitor status perangkat.
 *
 * - Desktop (lg+): kolom tetap di kiri.
 * - Mobile: bar bawah; status alat ditandai lewat warna titik.
 */
export function Sidebar() {
  const pathname = usePathname();
  const { status, lastSeenMinutes, loading } = useSensorData();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const meta = DEVICE_STATUS_META[status];

  return (
    <>
      {/* ================= Desktop sidebar ================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200/70 bg-white/80 backdrop-blur-md lg:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
            <Wind className="h-4 w-4 text-emerald-600" strokeWidth={2.4} />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-slate-900">
            AirSense
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                  strokeWidth={2.2}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Monitor status perangkat */}
        <div className="border-t border-slate-200/70 p-3">
          <div
            className="rounded-lg px-3 py-2.5"
            style={{ backgroundColor: meta.soft }}
          >
            <p
              className="flex items-center gap-1.5 text-[11px] font-semibold"
              style={{ color: meta.text }}
            >
              <span className="relative flex h-2 w-2">
                {status === "online" && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70" style={{ backgroundColor: meta.dot }} />
                )}
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.dot }}
                />
              </span>
              {meta.label}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Node 01 — PENS
              {!loading && lastSeenMinutes !== null && (
                <> · {formatAge(lastSeenMinutes)}</>
              )}
            </p>
          </div>
        </div>
      </aside>

      {/* ================= Mobile bottom nav ================= */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-1 py-2.5"
              >
                <Icon
                  className={`h-[18px] w-[18px] ${
                    active ? "text-emerald-600" : "text-slate-400"
                  }`}
                  strokeWidth={2.2}
                />
                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-emerald-700" : "text-slate-400"
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function formatAge(min: number) {
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} mnt lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return `${Math.round(hr / 24)} hari lalu`;
}
