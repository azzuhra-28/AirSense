"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Database,
  History,
  RefreshCw,
  Thermometer,
  Droplets,
  Activity,
  Clock3,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { POLLUTANTS } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { useSensorData } from "@/components/SensorProvider";
import type { KonsentrasiGas } from "@/lib/types";

const PAGE_SIZE = 15;

export default function HistoryPage() {
  const { loading, failed, rows, reload } = useSensorData();
  const [page, setPage] = useState(0);

  const ordered = useMemo(() => [...rows].reverse(), [rows]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);

  const slice = ordered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  const stats = useMemo(() => {
    if (!rows.length) {
      return { total: 0, temperature: "-", humidity: "-" };
    }

    const latest = rows[rows.length - 1];

    return {
      total: rows.length,
      temperature: formatNumber(latest.temperature),
      humidity: formatNumber(latest.humidity),
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-800/50" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-28 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60" />
      </div>
    );
  }

  if (failed || !rows.length) {
    return (
      <div className="space-y-5 text-slate-100">
        <PageHeader
          title="Riwayat Pembacaan"
          subtitle="Rekam jejak data sensor kualitas udara AirSense."
        />

        <section className="overflow-hidden rounded-3xl border border-sky-400/30 bg-slate-900/70">
          <div className="bg-slate-950/40 p-6 sm:p-8 border-b border-white/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
              <Database size={23} />
            </div>

            <h2 className="mt-4 text-xl font-bold text-white">
              {failed ? "Data belum dapat dimuat" : "Belum ada riwayat"}
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              {failed
                ? "Terjadi kendala saat mengambil data sensor. Periksa koneksi database, lalu coba muat ulang."
                : "Riwayat pembacaan akan ditampilkan di sini setelah data sensor tersedia."}
            </p>
          </div>

          <div className="p-5">
            <button
              onClick={reload}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 cursor-pointer shadow-lg"
            >
              <RefreshCw size={15} />
              Muat ulang data
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 pb-8 text-slate-100">
      <PageHeader
        title="Riwayat Pembacaan"
        subtitle="Rekam jejak data sensor kualitas udara AirSense."
      />

      {/* RINGKASAN */}
      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<Database size={20} />}
          label="Total pembacaan"
          value={stats.total.toLocaleString("id-ID")}
          detail="Seluruh data tersedia"
        />

        <SummaryCard
          icon={<Thermometer size={20} />}
          label="Suhu terakhir"
          value={stats.temperature === "-" ? "-" : `${stats.temperature} °C`}
          detail="Pembacaan sensor terbaru"
        />

        <SummaryCard
          icon={<Droplets size={20} />}
          label="Kelembapan terakhir"
          value={stats.humidity === "-" ? "-" : `${stats.humidity} %`}
          detail="Pembacaan sensor terbaru"
        />
      </section>

      {/* TABEL RIWAYAT */}
      <section className="overflow-hidden rounded-3xl border border-sky-400/30 bg-slate-900/70">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
              <History size={21} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Data pembacaan sensor
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                Urutan terbaru ke terlama
              </p>
            </div>
          </div>

          <button
            onClick={reload}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/30 bg-slate-950/40 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 sm:w-auto cursor-pointer"
          >
            <RefreshCw size={14} className="shrink-0 text-sky-400" />
            Segarkan data
          </button>
        </div>

        <div className="border-t border-white/10 bg-slate-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
            <span className="flex items-center gap-2 text-xs text-slate-300">
              <Activity size={14} className="text-sky-400" />
              Total {rows.length.toLocaleString("id-ID")} baris
            </span>
            <span className="flex items-center gap-2 text-xs text-slate-400">
              <Clock3 size={14} />
              Halaman {safePage + 1} dari {pageCount}
            </span>
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-900/80 border-b border-white/10">
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:px-5">
                    No.
                  </th>
                  <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Waktu pembacaan
                  </th>

                  {POLLUTANTS.map((p) => (
                    <th
                      key={p.key}
                      className="px-4 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400"
                    >
                      {p.label}
                      <span className="mt-1 block font-normal normal-case tracking-normal text-slate-400">
                        {p.unit}
                      </span>
                    </th>
                  ))}

                  <th className="px-4 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Suhu
                    <span className="mt-1 block font-normal normal-case tracking-normal text-slate-400">
                      °C
                    </span>
                  </th>

                  <th className="px-4 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Kelembapan
                    <span className="mt-1 block font-normal normal-case tracking-normal text-slate-400">
                      %
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-white/5">
                {slice.map((row, index) => (
                  <tr
                    key={`${row.created_at}-${index}`}
                    className="transition hover:bg-slate-900/50"
                  >
                    <td className="px-4 py-4 text-xs font-medium font-mono tabular-nums text-slate-400 sm:px-5">
                      {(safePage * PAGE_SIZE + index + 1)
                        .toString()
                        .padStart(2, "0")}
                    </td>

                    <td className="whitespace-nowrap px-4 py-4 text-xs font-semibold text-white">
                      {toWIB(row.created_at)}
                    </td>

                    {POLLUTANTS.map((p) => (
                      <td
                        key={p.key}
                        className="px-4 py-4 text-right text-xs font-mono tabular-nums text-slate-200"
                      >
                        {formatCell(row, p.key)}
                      </td>
                    ))}

                    <td className="px-4 py-4 text-right text-xs font-mono tabular-nums text-slate-200">
                      {formatNumber(row.temperature)}
                    </td>

                    <td className="px-4 py-4 text-right text-xs font-mono tabular-nums text-slate-200">
                      {formatNumber(row.humidity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* KARTU MOBILE - pengganti tabel di layar kecil */}
          <div className="divide-y divide-white/5 sm:hidden">
            {slice.map((row, index) => (
              <article
                key={`m-${row.created_at}-${index}`}
                className="space-y-3 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium font-mono tabular-nums text-slate-400">
                    #
                    {(safePage * PAGE_SIZE + index + 1)
                      .toString()
                      .padStart(2, "0")}
                  </span>
                  <span className="text-xs font-semibold text-white">
                    {toWIB(row.created_at)}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2">
                  {POLLUTANTS.map((p) => (
                    <div
                      key={p.key}
                      className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-2 py-1.5"
                    >
                      <dt className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                        {p.label}
                      </dt>
                      <dd className="mt-0.5 truncate text-xs font-semibold font-mono tabular-nums text-white">
                        {formatCell(row, p.key)}
                        <span className="ml-0.5 text-[9px] font-normal text-slate-400">
                          {p.unit}
                        </span>
                      </dd>
                    </div>
                  ))}

                  <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-2 py-1.5">
                    <dt className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                      Suhu
                    </dt>
                    <dd className="mt-0.5 truncate text-xs font-semibold font-mono tabular-nums text-white">
                      {formatNumber(row.temperature)}
                      <span className="ml-0.5 text-[9px] font-normal text-slate-400">
                        °C
                      </span>
                    </dd>
                  </div>

                  <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 px-2 py-1.5">
                    <dt className="truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                      Lembap
                    </dt>
                    <dd className="mt-0.5 truncate text-xs font-semibold font-mono tabular-nums text-white">
                      {formatNumber(row.humidity)}
                      <span className="ml-0.5 text-[9px] font-normal text-slate-400">
                        %
                      </span>
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          {/* PAGINATION */}
          <div className="flex flex-col gap-3 border-t border-white/10 bg-slate-950/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-400">
              Menampilkan{" "}
              <span className="font-semibold text-white">
                {safePage * PAGE_SIZE + 1}
                {"–"}
                {Math.min((safePage + 1) * PAGE_SIZE, ordered.length)}
              </span>{" "}
              dari {ordered.length.toLocaleString("id-ID")} data
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft size={15} />
                Sebelumnya
              </button>

              <span className="min-w-16 rounded-xl border border-sky-400/30 bg-slate-900 px-3 py-2 text-center text-xs font-bold text-white">
                {safePage + 1} / {pageCount}
              </span>

              <button
                onClick={() =>
                  setPage((p) => Math.min(pageCount - 1, p + 1))
                }
                disabled={safePage >= pageCount - 1}
                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
              >
                Berikutnya
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <p className="px-1 text-[10px] leading-5 text-slate-400">
        AirSense · Riwayat pembacaan sensor. Tanda{" "}
        <span className="font-semibold text-slate-300">-</span> berarti sensor
        membaca di bawah ambang deteksi atau data tidak terbaca, bukan
        konsentrasi nol.
      </p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 transition hover:-translate-y-0.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm">
          {icon}
        </span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-white">
        {value}
      </p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </article>
  );
}

function formatCell(row: KonsentrasiGas, key: string) {
  const raw = Number(row[key as keyof KonsentrasiGas]);
  if (!Number.isFinite(raw)) return "-";

  // Nilai negatif bukan konsentrasi nol. Itu tanda sensor membaca di
  // bawah ambang deteksi, jadi ditampilkan sebagai "-" agar tidak
  // disalahartikan sebagai udara bersih sempurna.
  if (raw < 0) return "-";

  return raw.toLocaleString("id-ID", {
    maximumFractionDigits: 3,
  });
}

function formatNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  return number.toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  });
}