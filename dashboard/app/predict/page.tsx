"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, LineChart as LineChartIcon, Sparkles, TriangleAlert } from "lucide-react";

import { getLatestForecast } from "@/lib/api";
import { aqiOf, POLLUTANT_COLOR } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { useSensorData } from "@/components/SensorProvider";
import type { ForecastRow } from "@/lib/types";

const SERIES = [
  { key: "pm25", label: "PM2.5", color: POLLUTANT_COLOR.pm25 },
  { key: "pm10", label: "PM10", color: POLLUTANT_COLOR.pm10 },
  { key: "co", label: "CO", color: POLLUTANT_COLOR.co },
] as const;

// Kolom konsentrasi aktual & prediksi per seri (untuk uji drift).
const ACTUAL_COL: Record<string, "pm25_ugm3" | "pm10_ugm3" | "co_ugm3"> = {
  pm25: "pm25_ugm3",
  pm10: "pm10_ugm3",
  co: "co_ugm3",
};
const PRED_COL: Record<string, "pm25_ugm3_pred" | "pm10_ugm3_pred" | "co_ugm3_pred"> = {
  pm25: "pm25_ugm3_pred",
  pm10: "pm10_ugm3_pred",
  co: "co_ugm3_pred",
};

// Batas selisih rata-rata forecast vs aktual terkini.
// Di atas ini, prediksi polutan dianggap tidak bisa dipercaya
// (distribution shift — model dilatih di rezim data lama).
const DRIFT_THRESHOLD_PCT = 50;

export default function PredictPage() {
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"ispu" | "conc">("ispu");

  // Data aktual terkini (untuk uji kewajaran prediksi).
  const { rows: actualRows } = useSensorData();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLatestForecast()
        .then((rows) => {
          if (!cancelled) {
            setForecast(rows);
            setLoading(false);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(String(e?.message ?? e));
            setLoading(false);
          }
        });

    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const data = useMemo(
    () =>
      forecast.map((r) => ({
        t: toWIB(r.forecast_at),
        // Nilai ISPU (skala 0 - 300)
        pm25_ispu: r.pm25_ispu_pred,
        pm10_ispu: r.pm10_ispu_pred,
        co_ispu: r.co_ispu_pred,
        // Nilai Konsentrasi Fisik (PM µg/m³, CO mg/m³)
        pm25_conc: r.pm25_ugm3_pred,
        pm10_conc: r.pm10_ugm3_pred,
        co_conc: r.co_ugm3_pred ? r.co_ugm3_pred / 1000 : null,
      })),
    [forecast]
  );

  const summary = useMemo(() => {
    if (!forecast.length) return null;
    const last = forecast[forecast.length - 1];
    const values = [
      last.pm25_ispu_pred ?? 0,
      last.pm10_ispu_pred ?? 0,
      last.co_ispu_pred ?? 0,
    ].filter(Number.isFinite);

    const total = values.length ? Math.max(...values) : 0;
    const dominant =
      [
        { k: "PM2.5", v: last.pm25_ispu_pred ?? -1 },
        { k: "PM10", v: last.pm10_ispu_pred ?? -1 },
        { k: "CO", v: last.co_ispu_pred ?? -1 },
      ].sort((a, b) => b.v - a.v)[0]?.k ?? "—";

    return {
      total: Math.round(total),
      tone: aqiOf(total),
      dominant,
      generated: forecast[0]?.generated_at,
      horizon: forecast.length,
      // Teks insight ditulis pipeline ke siklus terbaru (bisa hanya
      // di sebagian baris); ambil yang pertama tidak kosong.
      insight: forecast.find((r) => r.insight?.trim())?.insight ?? null,
    };
  }, [forecast]);

  // Uji kewajaran: bandingkan rata-rata forecast (konsentrasi)
  // dengan rata-rata aktual 60 pembacaan terakhir. Selisih besar
  // = distribution shift, prediksi polutan itu tidak terpercaya.
  const drift = useMemo(() => {
    if (!forecast.length || actualRows.length < 10) return null;

    const recent = actualRows.slice(-60);
    const result: Record<string, { pct: number; unreliable: boolean }> = {};

    for (const s of SERIES) {
      const aVals = recent
        .map((r) => Number(r[ACTUAL_COL[s.key]]))
        .filter((v) => Number.isFinite(v) && v > 0);
      const fVals = forecast
        .map((r) => Number(r[PRED_COL[s.key]]))
        .filter((v) => Number.isFinite(v) && v >= 0);
      if (!aVals.length || !fVals.length) continue;

      const amean = aVals.reduce((a, b) => a + b, 0) / aVals.length;
      const fmean = fVals.reduce((a, b) => a + b, 0) / fVals.length;
      const diff = Math.abs(fmean - amean);
      const pct = amean > 0 ? (diff / amean) * 100 : 0;

      // Ambang batas absolut minimum agar tidak terjadi false-alarm pada konsentrasi udara sangat bersih
      // (misal selisih cuma 3-4 µg/m³ di kondisi udara 'Baik' tidak dianggap drift sistemik)
      const absThreshold = s.key === "co" ? 800 : s.key === "pm10" ? 12 : 8;
      const isUnreliable = pct > DRIFT_THRESHOLD_PCT && diff > absThreshold;

      result[s.key] = { pct, unreliable: isUnreliable };
    }
    return result;
  }, [forecast, actualRows]);

  const unreliableLabels = useMemo(() => {
    if (!drift) return [];
    return SERIES.filter((s) => drift[s.key]?.unreliable).map((s) => s.label);
  }, [drift]);

  if (loading) {
    return (
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5">
        <p className="text-sm font-semibold text-red-700">
          Gagal memuat data prediksi
        </p>
        <p className="mt-1 text-[12px] text-red-600/80">{error}</p>
        <p className="mt-3 text-[12px] leading-relaxed text-red-500/80">
          Pastikan tabel <code className="rounded bg-white/70 px-1.5 py-0.5">tb_forecast</code>{" "}
          sudah ada dan pipeline <code className="rounded bg-white/70 px-1.5 py-0.5">analytics</code>{" "}
          pernah dijalankan.
        </p>
      </div>
    );
  }

  if (!forecast.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center">
        <LineChartIcon className="mx-auto h-6 w-6 text-slate-300" strokeWidth={2} />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Belum ada hasil prediksi
        </p>
        <p className="mt-1 text-[12px] text-slate-400">
          Pipeline prediksi belum menghasilkan data. Coba lagi beberapa saat.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
            Prediksi 60 menit ke depan
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" />
            {summary ? formatGenerated(summary.generated) : "—"} ·{" "}
            {summary?.horizon ?? 0} titik data
          </p>
        </div>

        {summary && (
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl px-5 py-2.5 text-center"
              style={{
                backgroundColor: summary.tone.soft,
                border: `1px solid ${summary.tone.ring}`,
              }}
            >
              <p
                className="tabular text-2xl font-semibold leading-none"
                style={{ color: summary.tone.text }}
              >
                {summary.total}
              </p>
              <p
                className="mt-1 text-[11px] font-medium"
                style={{ color: summary.tone.text }}
              >
                {summary.tone.label}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-center">
              <p className="text-sm font-semibold text-slate-800">
                {summary.dominant}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Polutan dominan
              </p>
            </div>
          </div>
        )}
      </header>

      {unreliableLabels.length > 0 && (
        <section className="flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4 sm:p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-amber-600">
            <TriangleAlert className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
              Prediksi kurang dapat diandalkan
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
              Nilai prediksi {unreliableLabels.join(", ")}{" "}
              menyimpang jauh dari pembacaan sensor terkini (selisih &gt; 50%). Kemungkinan
              kondisi udara berubah sejak model dilatih — pertimbangkan
              menjalankan ulang pipeline.
            </p>
          </div>
        </section>
      )}

      {summary?.insight && (
        <section className="flex items-start gap-3 rounded-2xl border border-violet-200/70 bg-violet-50/60 p-4 sm:p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">
              Insight Analytics
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
              {summary.insight}
            </p>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              {viewMode === "ispu" ? "Proyeksi Indeks ISPU" : "Proyeksi Konsentrasi Polutan"}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {viewMode === "ispu"
                ? "Standar KLHK (0 - 300) · Model recurrent (LSTM/GRU)"
                : "Konsentrasi fisik (PM µg/m³, CO mg/m³) · Model recurrent"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Switcher Mode ISPU vs Konsentrasi */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1">
              <button
                type="button"
                onClick={() => setViewMode("ispu")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  viewMode === "ispu"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Indeks ISPU
              </button>
              <button
                type="button"
                onClick={() => setViewMode("conc")}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                  viewMode === "conc"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                Konsentrasi Fisik (µg/m³)
              </button>
            </div>

            {/* Legend */}
            <span className="flex items-center gap-2.5 text-[11px] text-slate-400">
              {SERIES.map((s) => (
                <span key={s.key} className="flex items-center gap-1">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </span>
          </div>
        </header>

        <div className="mt-2 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 12, bottom: 0, left: -10 }}
            >
              <defs>
                {SERIES.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`grad-${s.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>

              <CartesianGrid
                strokeDasharray="2 6"
                stroke="#EEF2F7"
                vertical={false}
              />
              <XAxis
                dataKey="t"
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, "auto"]}
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(val) => Math.round(val).toString()}
              />
              <Tooltip
                cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 12px 32px -16px rgba(15,23,42,0.2)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "#0F172A", fontWeight: 600 }}
                formatter={(val: number, name: string, item: any) => {
                  const p = item?.payload;
                  if (!p) return [val, name];
                  if (viewMode === "ispu") {
                    let rawText = "";
                    if (name === "PM2.5" && p.pm25_conc != null) rawText = ` (~${p.pm25_conc.toFixed(1)} µg/m³)`;
                    if (name === "PM10" && p.pm10_conc != null) rawText = ` (~${p.pm10_conc.toFixed(1)} µg/m³)`;
                    if (name === "CO" && p.co_conc != null) rawText = ` (~${p.co_conc.toFixed(2)} mg/m³)`;
                    return [`${Number(val).toFixed(1)} ISPU${rawText}`, name];
                  } else {
                    let ispuText = "";
                    let unit = "µg/m³";
                    if (name === "PM2.5" && p.pm25_ispu != null) ispuText = ` (ISPU ${p.pm25_ispu.toFixed(0)})`;
                    if (name === "PM10" && p.pm10_ispu != null) ispuText = ` (ISPU ${p.pm10_ispu.toFixed(0)})`;
                    if (name === "CO") {
                      unit = "mg/m³";
                      if (p.co_ispu != null) ispuText = ` (ISPU ${p.co_ispu.toFixed(0)})`;
                    }
                    return [`${Number(val).toFixed(1)} ${unit}${ispuText}`, name];
                  }
                }}
              />
              {SERIES.map((s) => {
                const key = viewMode === "ispu" ? `${s.key}_ispu` : `${s.key}_conc`;
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={key}
                    name={s.label}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#grad-${s.key})`}
                    dot={false}
                  />
                );
              })}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <p className="text-[12px] leading-relaxed text-slate-400">
        Kategori diambil dari ISPU tertinggi antar polutan. Data prediksi
        diperbarui otomatis oleh pipeline analytics.
      </p>
    </div>
  );
}

function formatGenerated(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}
