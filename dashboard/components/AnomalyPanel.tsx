"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, CheckCircle2 } from "lucide-react";

import { POLLUTANTS } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import {
  Z_THRESHOLD,
  Z_WINDOW,
  detectAnomalies,
} from "@/lib/anomaly";
import type { KonsentrasiGas } from "@/lib/types";

const LEVEL_STYLE = {
  Moderat: "bg-red-50 text-red-700 ring-red-200",
  Pengamatan: "bg-amber-50 text-amber-700 ring-amber-200",
} as const;

const KEYS = POLLUTANTS.map((p) => p.key as string);

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

export function AnomalyPanel({
  rows,
  active,
  onSelect,
}: {
  rows: KonsentrasiGas[];
  active: string;
  onSelect: (key: string) => void;
}) {
  const meta =
    POLLUTANTS.find((p) => p.key === active) ?? POLLUTANTS[0];

  const enough = rows.length > Z_WINDOW;

  const result = useMemo(
    () => detectAnomalies(rows, KEYS),
    [rows]
  );

  const chartData = useMemo(() => {
    const flagged = new Set(
      (result.points[active] ?? []).map((p) => p.at)
    );

    return rows.map((r) => {
      const raw = num(r[active as keyof KonsentrasiGas]);
      const v = Number.isFinite(raw)
        ? Math.max(0, raw * meta.scale)
        : null;

      return {
        t: toWIB(r.created_at),
        v,
        a: flagged.has(r.created_at) ? v : null,
      };
    });
  }, [rows, result, active, meta.scale]);

  const counts = useMemo(
    () =>
      POLLUTANTS.map((p) => ({
        key: p.key as string,
        label: p.label as string,
        color: p.color as string,
        n: result.events.filter((e) => e.key === p.key).length,
      })),
    [result]
  );

  const meterOf = (key: string) =>
    POLLUTANTS.find((p) => p.key === key) ?? POLLUTANTS[0];

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
          <Activity className="h-5 w-5" />
        </div>

        <div className="min-w-0">
          <h2 className="text-sm font-bold text-stone-900">
            Deteksi Anomali
          </h2>

          <p className="mt-0.5 text-[11px] text-stone-500">
            Lonjakan atau penurunan tidak wajar dibanding{" "}
            {Z_WINDOW} pembacaan sebelumnya
          </p>
        </div>
      </header>

      {!enough ? (
        <p className="mt-5 rounded-xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-xs text-stone-500">
          Data belum cukup. Deteksi anomali membutuhkan lebih dari{" "}
          {Z_WINDOW} pembacaan.
        </p>
      ) : (
        <>
          {/* RINGKASAN PER POLUTAN */}
          <div className="mt-5 flex flex-wrap gap-2">
            {counts.map((c) => {
              const on = c.key === active;

              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onSelect(c.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                    on
                      ? "border-stone-800 bg-stone-800 text-white"
                      : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  {c.label}
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      on
                        ? "bg-white/20 text-white"
                        : "bg-stone-100 text-stone-500"
                    }`}
                  >
                    {c.n}
                  </span>
                </button>
              );
            })}
          </div>

          {/* GRAFIK DENGAN PENANDA */}
          <div className="mt-4 h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 8, bottom: 0, left: -10 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E7E5E4"
                  vertical={false}
                />

                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "#78716C" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={40}
                />

                <YAxis
                  domain={[0, "auto"]}
                  tick={{ fontSize: 10, fill: "#78716C" }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={(val) =>
                    Number(val) >= 10
                      ? String(Math.round(Number(val)))
                      : Number(val).toFixed(1)
                  }
                />

                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #E7E5E4",
                    fontSize: 12,
                  }}
                  formatter={(v, n) => [
                    `${fmt(Number(v))} ${meta.unit}`,
                    String(n),
                  ]}
                />

                <Line
                  type="monotone"
                  dataKey="v"
                  name={meta.label}
                  stroke={meta.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />

                <Line
                  type="monotone"
                  dataKey="a"
                  name="Anomali"
                  stroke="none"
                  dot={{
                    r: 4,
                    fill: "#DC2626",
                    stroke: "#FFFFFF",
                    strokeWidth: 1.5,
                  }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                  legendType="none"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* DAFTAR KEJADIAN */}
          <div className="mt-5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
              Kejadian terbaru
            </p>

            {result.events.length === 0 ? (
              <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 py-7 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-stone-500" />

                <p className="mt-2 text-xs font-semibold text-stone-600">
                  Tidak ada anomali pada data yang dimuat
                </p>
              </div>
            ) : (
              <ul className="mt-2 space-y-2">
                {result.events.slice(0, 8).map((e) => {
                  const m = meterOf(e.key);

                  return (
                    <li key={`${e.key}-${e.start}`}>
                      <button
                        type="button"
                        onClick={() => onSelect(e.key)}
                        className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:bg-stone-50 ${
                          e.key === active
                            ? "border-stone-300 bg-stone-50"
                            : "border-stone-200 bg-white"
                        }`}
                      >
                        <span
                          className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: m.color }}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-stone-800">
                              {m.label}
                            </span>

                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${LEVEL_STYLE[e.level]}`}
                            >
                              {e.level}
                            </span>
                          </div>

                          <p className="mt-1 text-xs text-stone-600">
                            {e.peakZ > 0 ? "Naik" : "Turun"} ke{" "}
                            {fmt(e.peakValue * m.scale)} {m.unit}{" "}
                            (acuan {fmt(e.baseline * m.scale)} {m.unit},{" "}
                            z = {e.peakZ.toFixed(1)})
                          </p>

                          <p className="mt-1 text-[10px] text-stone-400">
                            {toWIB(e.start)} WIB · {e.points} titik
                          </p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-stone-400">
            Metode: Rolling Z-Score (jendela {Z_WINDOW} pembacaan,
            ambang |z| &gt; {Z_THRESHOLD}), sama dengan komponen
            Z-Score di pipeline analitik. Level Moderat berarti dua
            polutan atau lebih menyimpang bersamaan; Pengamatan berarti
            satu polutan. Penilaian lengkap (Isolation Forest dan RF
            cross-check) ada di pipeline dan muncul sebagai alert
            Anomali di halaman Peringatan. Anomali bukan berarti udara
            berbahaya, bisa juga gangguan sensor.
          </p>
        </>
      )}
    </section>
  );
}