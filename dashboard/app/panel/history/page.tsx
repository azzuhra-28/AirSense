"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  Clock3,
  FileSpreadsheet,
} from "lucide-react";

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

  const pageCount = Math.max(
    1,
    Math.ceil(ordered.length / PAGE_SIZE)
  );

  const safePage = Math.min(page, pageCount - 1);

  const slice = ordered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  /* =========================
     LOADING
  ========================= */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-[#B7E4C7]/60" />

        <div className="h-96 animate-pulse rounded-2xl border border-emerald-100 bg-[#B7E4C7]/40" />
      </div>
    );
  }

  /* =========================
     EMPTY / ERROR
  ========================= */

  if (failed || !rows.length) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-10 text-center shadow-sm">

        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70">
          <Database
            className="h-7 w-7 text-emerald-700"
            strokeWidth={2}
          />
        </div>

        <p className="mt-4 text-sm font-semibold text-emerald-950">
          Belum ada riwayat pembacaan
        </p>

        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-emerald-800/70">
          Data pembacaan sensor belum tersedia. Silakan coba
          memuat ulang data.
        </p>

        <button
          type="button"
          onClick={reload}
          className="mt-5 rounded-xl bg-emerald-700 px-4 py-2.5 text-[12px] font-semibold text-white transition-all hover:bg-emerald-800 hover:shadow-md"
        >
          Coba lagi
        </button>

      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* =========================
          HEADER
      ========================= */}

      <PageHeader
        title="Riwayat Pembacaan"
        subtitle={`${rows.length.toLocaleString("id-ID")} data tersimpan`}
      />

      {/* =========================
          SUMMARY
      ========================= */}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        <SummaryCard
          icon={<Database className="h-5 w-5" />}
          label="Total Data"
          value={rows.length.toLocaleString("id-ID")}
          description="Pembacaan tersimpan"
        />

        <SummaryCard
          icon={<Clock3 className="h-5 w-5" />}
          label="Urutan Data"
          value="Terbaru"
          description="Data terbaru ditampilkan di atas"
        />

        <SummaryCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          label="Data per Halaman"
          value={`${PAGE_SIZE}`}
          description="Pembacaan sensor"
        />

      </div>

      {/* =========================
          TABLE
      ========================= */}

      <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-[#B7E4C7] shadow-sm">

        {/* TABLE HEADER */}
        <div className="flex flex-col gap-3 border-b border-emerald-200/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <Database className="h-5 w-5 text-emerald-700" />
            </div>

            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                Data Sensor
              </h2>

              <p className="mt-0.5 text-[11px] text-emerald-800/70">
                Riwayat pembacaan kualitas udara
              </p>
            </div>

          </div>

          <div className="w-fit rounded-full bg-white/70 px-3 py-1.5">
            <span className="text-[11px] font-semibold text-emerald-700">
              {rows.length.toLocaleString("id-ID")} records
            </span>
          </div>

        </div>

        {/* TABLE */}
        <div className="overflow-x-auto p-3 sm:p-4">

          <div className="overflow-hidden rounded-xl border border-emerald-200/70 bg-white/75">

            <table className="w-full min-w-[760px] border-collapse text-left">

              <thead>
                <tr className="border-b border-emerald-100 bg-emerald-50/70">

                  <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Waktu (WIB)
                  </th>

                  {POLLUTANTS.map((p) => (
                    <th
                      key={p.key}
                      className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-700"
                    >
                      {p.label}
                    </th>
                  ))}

                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Suhu
                  </th>

                  <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    RH
                  </th>

                </tr>
              </thead>

              <tbody>
                {slice.map((r, i) => (
                  <tr
                    key={`${r.created_at}-${i}`}
                    className="border-b border-slate-100 last:border-0 transition-colors hover:bg-emerald-50/60"
                  >

                    {/* TIME */}
                    <td className="tabular whitespace-nowrap px-4 py-3 text-[12px] font-medium text-slate-600">
                      <div className="flex items-center gap-2">

                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                        {formatStamp(r.created_at)}

                      </div>
                    </td>

                    {/* POLLUTANTS */}
                    {POLLUTANTS.map((p) => (
                      <td
                        key={p.key}
                        className="tabular px-4 py-3 text-right text-[12px] font-medium text-slate-700"
                      >
                        {formatCell(r, p.key, p.scale)}
                      </td>
                    ))}

                    {/* TEMPERATURE */}
                    <td className="tabular px-4 py-3 text-right text-[12px] font-medium text-slate-700">
                      {fmt(r.temperature)}°
                    </td>

                    {/* HUMIDITY */}
                    <td className="tabular px-4 py-3 text-right text-[12px] font-medium text-slate-700">
                      {fmt(r.humidity)}%
                    </td>

                  </tr>
                ))}
              </tbody>

            </table>

          </div>
        </div>

        {/* =========================
            PAGINATION
        ========================= */}

        <div className="flex flex-col gap-3 border-t border-emerald-200/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

          <div>
            <p className="text-[11px] font-medium text-emerald-800/70">
              Menampilkan{" "}
              <span className="font-bold text-emerald-900">
                {safePage * PAGE_SIZE + 1}
              </span>
              {" – "}
              <span className="font-bold text-emerald-900">
                {Math.min(
                  (safePage + 1) * PAGE_SIZE,
                  ordered.length
                )}
              </span>{" "}
              dari{" "}
              <span className="font-bold text-emerald-900">
                {ordered.length}
              </span>{" "}
              data
            </p>
          </div>

          <div className="flex items-center gap-2">

            <span className="mr-1 text-[11px] font-medium text-emerald-800/70">
              Halaman {safePage + 1} / {pageCount}
            </span>

            <PagerButton
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              icon={<ChevronLeft className="h-4 w-4" />}
              label="Halaman sebelumnya"
            />

            <PagerButton
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              icon={<ChevronRight className="h-4 w-4" />}
              label="Halaman berikutnya"
            />

          </div>

        </div>

      </section>
    </div>
  );
}

/* =========================
   SUMMARY CARD
========================= */

function SummaryCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-4 shadow-sm">

      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-emerald-700">
        {icon}
      </div>

      <p className="mt-4 text-[11px] font-medium text-emerald-800/70">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-emerald-950">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-emerald-800/70">
        {description}
      </p>

    </div>
  );
}

/* =========================
   PAGINATION BUTTON
========================= */

function PagerButton({
  disabled,
  onClick,
  icon,
  label,
}: {
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white/80 text-emerald-700 transition-all hover:bg-white hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35"
    >
      {icon}
    </button>
  );
}

/* =========================
   FORMAT CELL
========================= */

function formatCell(
  r: KonsentrasiGas,
  key: string,
  scale: number
) {
  const v = Number(r[key as keyof KonsentrasiGas]);

  if (!Number.isFinite(v)) return "—";

  const scaled = Math.max(0, v * scale);

  if (Math.abs(scaled) >= 1000) {
    return Math.round(scaled).toLocaleString("id-ID");
  }

  return scaled.toFixed(scaled < 10 ? 2 : 1);
}

/* =========================
   FORMAT NORMAL VALUE
========================= */

function fmt(v: number | null) {
  return Number.isFinite(v)
    ? (v as number).toFixed(1)
    : "—";
}

/* =========================
   FORMAT TIMESTAMP
========================= */

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}