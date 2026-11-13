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
  /** Sumber data aktif - menentukan label badge. */
  source?: "supabase" | "demo" | "none";
}

/** Ambang usia data (menit). */
const DELAYED_MINUTES = 3;
const OFFLINE_MINUTES = 10;

type StatusKey = "connected" | "delayed" | "offline";

const STATUS_META: Record<
  StatusKey,
  { label: string; dot: string; bg: string; border: string; text: string }
> = {
  connected: {
    label: "Terhubung",
    dot: "#34D399",
    bg: "rgba(16, 185, 129, 0.12)",
    border: "rgba(16, 185, 129, 0.35)",
    text: "#6EE7B7",
  },
  delayed: {
    label: "Data tertunda",
    dot: "#FBBF24",
    bg: "rgba(245, 158, 11, 0.12)",
    border: "rgba(245, 158, 11, 0.35)",
    text: "#FCD34D",
  },
  offline: {
    label: "Terputus",
    dot: "#F87171",
    bg: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.35)",
    text: "#FCA5A5",
  },
};

/**
 * Header dashboard: pemilih perangkat, status koneksi nyata, dan
 * waktu sinkron terakhir (relatif + absolut).
 *
 * Warna indikator mengikuti usia data, bukan dihitung dari sumber saja,
 * supaya "udara baik" tidak tertukar dengan "sensor berhenti mengirim".
 */
export function DashboardHeader({
  lastSynced,
  devices = ["Node 01 - PENS"],
  device,
  onDeviceChange,
  onRefresh,
  refreshing,
  source = "supabase",
}: DashboardHeaderProps) {
  const [open, setOpen] = useState(false);
  const [, forceTick] = useState(0);
  const active = device ?? devices[0];

  // Segarkan status dan label "x menit lalu" tiap 30 detik.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const umurMenit = (() => {
    if (!lastSynced) return Infinity;
    const then = new Date(lastSynced).getTime();
    if (!Number.isFinite(then)) return Infinity;
    return (Date.now() - then) / 60_000;
  })();

  const statusKey: StatusKey =
    source !== "supabase" || umurMenit >= OFFLINE_MINUTES
      ? "offline"
      : umurMenit >= DELAYED_MINUTES
        ? "delayed"
        : "connected";

  const status = STATUS_META[statusKey];

  const detail = [
    `Sumber: ${source === "supabase" ? "Supabase" : source === "demo" ? "data contoh" : "tidak ada"}`,
    `Pembacaan terakhir: ${lastSynced ? new Date(lastSynced).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}`,
    Number.isFinite(umurMenit) ? `Usia data: ${Math.round(umurMenit)} menit` : "Usia data: tidak diketahui",
    `Ambang: tertunda ≥ ${DELAYED_MINUTES} menit, terputus ≥ ${OFFLINE_MINUTES} menit`,
  ].join("\n");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-base font-semibold text-white sm:text-lg">
          Ringkasan Kualitas Udara
        </h1>
        <p className="mt-0.5 text-[12px] text-slate-200">
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
            title={detail}
            className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-slate-900/90 px-3 py-1.5 text-[12px] font-medium text-slate-100 transition-colors hover:bg-slate-800/80"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: status.dot }}
              aria-hidden
            />
            {active}
            <ChevronDown className="h-3.5 w-3.5 text-slate-300" />
          </button>

          {open && devices.length > 1 && (
            <ul
              role="listbox"
              className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-lg border border-sky-400/30 bg-slate-900 py-1 shadow-lg"
            >
              {devices.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={d === active}
                    onMouseDown={() => onDeviceChange?.(d)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-slate-800 ${
                      d === active
                        ? "font-semibold text-white bg-sky-500/20"
                        : "text-slate-200"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: status.dot }}
                    />
                    {d}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status koneksi: warna mengikuti usia data sebenarnya. */}
        <span
          className="group relative flex cursor-help items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium"
          style={{
            backgroundColor: status.bg,
            borderColor: status.border,
            color: status.text,
          }}
          tabIndex={0}
          aria-label={`Status koneksi: ${status.label}`}
        >
          <span
            className={`relative flex h-2 w-2 ${statusKey === "connected" ? "animate-pulse" : ""}`}
          >
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ backgroundColor: status.dot }}
            />
            <span
              className="relative inline-flex h-2 w-2 rounded-full"
              style={{ backgroundColor: status.dot }}
            />
          </span>
          {status.label}

          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 whitespace-pre-line rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-left text-[12px] font-normal leading-relaxed text-slate-200 opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {detail}
          </span>
        </span>

        {/* Waktu sinkron + refresh */}
        <div className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-slate-900/90 px-3 py-1.5">
          <span className="text-[12px] text-slate-200">
            Sinkron{" "}
            <span className="font-medium text-white">
              {relativeTime(lastSynced)}
            </span>
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="text-slate-200 transition-colors hover:text-white"
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
  if (!iso) return "-";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "-";

  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);

  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  const day = Math.round(hr / 24);
  return `${day} hari lalu`;
}
