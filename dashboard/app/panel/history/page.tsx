"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Database } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { POLLUTANTS } from "@/lib/brand";
import { useSensorData } from "@/components/SensorProvider";
import type { KonsentrasiGas } from "@/lib/types";

const PAGE_SIZE = 15;

export default function HistoryPage() {
  const { loading, failed, rows, reload } = useSensorData();
  const [page, setPage] = useState(0);

  // Terbaru di atas.
  const ordered = useMemo(() => [...rows].reverse(), [rows]);
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = ordered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  if (loading) {
    return <div className="h-96 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />;
  }

  if (failed || !rows.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center">
        <Database className="mx-auto h-6 w-6 text-slate-300" strokeWidth={2} />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Belum ada riwayat pembacaan
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Riwayat Pembacaan"
        subtitle={`${rows.length.toLocaleString("id-ID")} data tersimpan`}
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/60">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Waktu (WIB)
                </th>
                {POLLUTANTS.map((p) => (
                  <th
                    key={p.key}
                    className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    {p.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Suhu
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  RH
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => (
                <tr
                  key={`${r.created_at}-${i}`}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                >
                  <td className="tabular whitespace-nowrap px-4 py-3 text-[12px] text-slate-600">
                    {formatStamp(r.created_at)}
                  </td>
                  {POLLUTANTS.map((p) => (
                    <td
                      key={p.key}
                      className="tabular px-4 py-3 text-right text-[12px] text-slate-700"
                    >
                      {formatCell(r, p.key, p.scale)}
                    </td>
                  ))}
                  <td className="tabular px-4 py-3 text-right text-[12px] text-slate-700">
                    {fmt(r.temperature)}°
                  </td>
                  <td className="tabular px-4 py-3 text-right text-[12px] text-slate-700">
                    {fmt(r.humidity)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginasi */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-3">
          <p className="text-[12px] text-slate-400">
            Halaman {safePage + 1} dari {pageCount}
          </p>
          <div className="flex items-center gap-2">
            <PagerButton
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              icon={<ChevronLeft className="h-4 w-4" />}
            />
            <PagerButton
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              icon={<ChevronRight className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function PagerButton({
  disabled,
  onClick,
  icon,
}: {
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Navigasi halaman"
    >
      {icon}
    </button>
  );
}

function formatCell(
  r: KonsentrasiGas,
  key: string,
  scale: number
) {
  const v = Number(r[key as keyof KonsentrasiGas]);
  if (!Number.isFinite(v)) return "—";
  const scaled = v * scale;
  if (Math.abs(scaled) >= 1000) return Math.round(scaled).toLocaleString("id-ID");
  return scaled.toFixed(scaled < 10 ? 2 : 1);
}

function fmt(v: number | null) {
  return Number.isFinite(v) ? (v as number).toFixed(1) : "—";
}

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}
