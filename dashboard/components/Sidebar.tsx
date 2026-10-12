
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  Bell,
  ChevronsLeft,
  Cpu,
  Gauge,
  List,
  Menu,
  Sparkles,
  TrendingUp,
  Wind,
  type LucideIcon,
} from "lucide-react";

import { NAV } from "@/lib/brand";
import {
  DEVICE_STATUS_META,
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

export function Sidebar({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();
  const { status, lastSeenMinutes, loading } = useSensorData();

  const isActive = (href: string) =>
    pathname === href ||
    (href !== "/panel" && pathname.startsWith(`${href}/`));

  const meta = DEVICE_STATUS_META[status];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-stone-200 bg-white shadow-[0_16px_48px_-16px_rgba(15,23,42,0.25)] transition-transform duration-300 ease-in-out lg:flex ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Brand */}
        <div className="flex h-20 items-center gap-3 px-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 ring-1 ring-stone-200 shadow-sm">
            <Wind
              className="h-5 w-5 text-stone-600"
              strokeWidth={2.2}
            />
          </span>

          <div>
            <span className="block text-[17px] font-bold tracking-tight text-stone-800">
              AirSense
            </span>
            <span className="block text-[10px] font-medium text-stone-400">
              Air Quality Monitoring
            </span>
          </div>

          <button
            type="button"
            onClick={onToggle}
            aria-label="Sembunyikan sidebar"
            title="Sembunyikan sidebar (Esc)"
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
          >
            <ChevronsLeft className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-3">
          {NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);

            if (!Icon) return null;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-3 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-stone-200 text-stone-900"
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-800"
                }`}
              >
                <Icon
                  className={`h-[18px] w-[18px] ${
                    active ? "text-stone-700" : "text-stone-400"
                  }`}
                  strokeWidth={2.1}
                />

                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Device status */}
        <div className="border-t border-stone-200 p-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
            <p className="flex items-center gap-2 text-[11px] font-semibold text-stone-700">
              <span className="relative flex h-2 w-2">
                {status === "online" && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                    style={{ backgroundColor: meta.dot }}
                  />
                )}
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta.dot }}
                />
              </span>

              {meta.label}
            </p>

            <p className="mt-1 text-[11px] text-stone-400">
              Node 01 — PENS
              {!loading && lastSeenMinutes !== null && (
                <> · {formatAge(lastSeenMinutes)}</>
              )}
            </p>
          </div>
        </div>
      </aside>

      {/* Tombol buka (saat drawer sembunyi) */}
      {!open && (
        <button
          type="button"
          onClick={onToggle}
          aria-label="Tampilkan sidebar"
          title="Tampilkan sidebar"
          className="fixed left-4 top-4 z-40 hidden h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white/90 text-stone-500 shadow-md backdrop-blur-md transition-colors hover:bg-white hover:text-stone-900 lg:flex"
        >
          <Menu className="h-5 w-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur-md lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-6">
          {NAV.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(item.href);

            if (!Icon) return null;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 py-2.5"
              >
                <span
                  className={`flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${
                    active ? "bg-stone-200" : "bg-transparent"
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] ${
                      active ? "text-stone-800" : "text-stone-400"
                    }`}
                    strokeWidth={2.1}
                  />
                </span>

                <span
                  className={`text-[10px] font-medium ${
                    active ? "text-stone-800" : "text-stone-400"
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
