"use client";

import { useEffect, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

interface DashboardHeaderProps {
  /** Waktu pembacaan terakhir (ISO). */
  lastSynced?: string;
  /** Daftar perangkat yang bisa dipilih. */
  devices?: string[];
  device?: string;
  onDeviceChange?: (device: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Sumber data aktif — menentukan label badge. */
  source?: "supabase" | "demo" | "none";
}

/**
 * Header dashboard: pemilih perangkat, indikator live, dan
 * waktu sinkron terakhir (relatif + absolut).
 */
export function DashboardHeader({
  lastSynced,
  devices = ["Node 01 — PENS"],
  device,
  onDeviceChange,
  onRefresh,
  refreshing,
  source = "supabase",
}: DashboardHeaderProps) {
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);
  const active = device ?? devices[0];

  const isLive = source === "supabase";

  // Segarkan label "x menit lalu" tiap 30 detik.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
          Ringkasan Kualitas Udara
        </h1>
        <p className="mt-0.5 text-[12px] text-slate-400">
          Pembacaan real-time dari sensor di sekitar Anda
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Pemilih perangkat */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-slate-300"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {active}
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
          </button>

          {open && devices.length > 1 && (
            <ul
              role="listbox"
              className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.25)]"
            >
              {devices.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={d === active}
                    onMouseDown={() => onDeviceChange?.(d)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-slate-50 ${
                      d === active
                        ? "font-semibold text-slate-900"
                        : "text-slate-600"
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {d}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Indikator sumber data */}
        {isLive ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-200/70 bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Supabase
          </span>
        ) : (
          <span
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
            style={
              source === "demo"
                ? {
                    backgroundColor: "#FFFBEB",
                    borderColor: "#FDE68A",
                    color: "#B45309",
                  }
                : {
                    backgroundColor: "#F3F4F6",
                    borderColor: "#D1D5DB",
                    color: "#4B5563",
                  }
            }
          >
            {source === "demo" ? "Data contoh" : "Tanpa data"}
          </span>
        )}

        {/* Waktu sinkron + refresh */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5">
          <span className="text-[12px] text-slate-400">
            Sinkron{" "}
            <span className="font-medium text-slate-600">
              {relativeTime(lastSynced)}
            </span>
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-slate-400 transition-colors hover:text-slate-700"
            aria-label="Muat ulang data"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Ubah ISO menjadi label relatif berbahasa Indonesia. */
function relativeTime(iso?: string) {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";

  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);

  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  return `${day} hari lalu`;
}
