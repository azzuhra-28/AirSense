"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  Clock,
  Cpu,
  Info,
  LineChart as LineChartIcon,
  Minus,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Wind,
} from "lucide-react";

import { getLatestForecast, subscribeForecast } from "@/lib/api";
import { aqiOf, POLLUTANT_COLOR } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { useSensorData } from "@/components/SensorProvider";
import type { ForecastRow } from "@/lib/types";

const SERIES = [
  { key: "pm25", label: "PM2.5", color: POLLUTANT_COLOR.pm25, model: "LSTM (w=30, h=128)" },
  { key: "pm10", label: "PM10", color: POLLUTANT_COLOR.pm10, model: "GRU (w=30, h=128)" },
  { key: "co", label: "CO", color: POLLUTANT_COLOR.co, model: "GRU (w=60, h=128)" },
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
    const unsubscribe = subscribeForecast(() => {
      load();
    });
    const timer = setInterval(load, 2 * 60 * 1000);
    return () => {
      cancelled = true;
      unsubscribe();
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
      insight: forecast.find((r) => r.insight?.trim())?.insight ?? null,
    };
  }, [forecast]);

  // Statistik Puncak, Lembah & Tren per Polutan untuk Kartu Metrik
  const pollutantStats = useMemo(() => {
    if (!forecast.length) return [];

    return SERIES.map((s) => {
      const ispuKey = `${s.key}_ispu_pred` as keyof ForecastRow;
      const concKey = `${s.key}_ugm3_pred` as keyof ForecastRow;

      const ispuVals = forecast.map((r) => Number(r[ispuKey]) || 0);
      const concVals = forecast.map((r) => {
        const raw = Number(r[concKey]) || 0;
        return s.key === "co" ? raw / 1000 : raw;
      });

      // Nilai awal & akhir
      const initialIspu = ispuVals[0] ?? 0;
      const finalIspu = ispuVals[ispuVals.length - 1] ?? 0;
      const initialConc = concVals[0] ?? 0;
      const finalConc = concVals[concVals.length - 1] ?? 0;

      // Puncak (Peak)
      let peakIdx = 0;
      let maxVal = -Infinity;
      ispuVals.forEach((val, idx) => {
        if (val > maxVal) {
          maxVal = val;
          peakIdx = idx;
        }
      });
      const peakTime = toWIB(forecast[peakIdx]?.forecast_at);
      const peakIspu = ispuVals[peakIdx];
      const peakConc = concVals[peakIdx];

      // Delta persentase
      const deltaIspu = initialIspu > 0 ? ((finalIspu - initialIspu) / initialIspu) * 100 : 0;
      const deltaConc = initialConc > 0 ? ((finalConc - initialConc) / initialConc) * 100 : 0;

      const trend =
        deltaIspu > 5 ? "up" : deltaIspu < -5 ? "down" : "stable";

      const unit = s.key === "co" ? "mg/m³" : "µg/m³";

      return {
        key: s.key,
        label: s.label,
        color: s.color,
        model: s.model,
        unit,
        trend,
        initialIspu,
        finalIspu,
        deltaIspu,
        peakIspu,
        initialConc,
        finalConc,
        deltaConc,
        peakConc,
        peakTime,
        category: aqiOf(peakIspu),
      };
    });
  }, [forecast]);

  // Jendela Waktu Aktivitas & Panduan Kesehatan
  const actionPlan = useMemo(() => {
    if (!forecast.length) return null;

    // Cari menit dengan ISPU terendah (best window)
    let minIdx = 0;
    let minIspu = Infinity;
    forecast.forEach((r, idx) => {
      const maxInRow = Math.max(
        r.pm25_ispu_pred || 0,
        r.pm10_ispu_pred || 0,
        r.co_ispu_pred || 0
      );
      if (maxInRow < minIspu) {
        minIspu = maxInRow;
        minIdx = idx;
      }
    });

    const bestTime = toWIB(forecast[minIdx]?.forecast_at);
    const overallPeak = Math.max(
      ...forecast.map((r) =>
        Math.max(r.pm25_ispu_pred || 0, r.pm10_ispu_pred || 0, r.co_ispu_pred || 0)
      )
    );

    const peakTone = aqiOf(overallPeak);

    return {
      bestTime,
      minIspu: Math.round(minIspu),
      overallPeak: Math.round(overallPeak),
      peakTone,
      outdoorAdvice:
        overallPeak <= 50
          ? "Sangat Aman Beraktivitas Luar — Kualitas udara diproyeksikan dalam kategori Baik sepanjang 60 menit ke depan. Waktu ideal untuk olahraga outdoor atau bersepeda."
          : overallPeak <= 100
          ? "Aman dengan Pengawasan — Udara tergolong Sedang. Individu yang sangat sensitif disarankan membatasi olahraga intensitas tinggi di luar ruangan."
          : "Kurangi Aktivitas Berat di Luar — Proyeksi menunjukkan peningkatan polusi udara. Utamakan olahraga atau aktivitas di dalam ruangan.",
      ventilationAdvice:
        overallPeak <= 50
          ? "Buka Jendela untuk Sirkulasi — Kondisi udara di luar ruangan bersih, aman untuk pertukaran udara alami ke dalam ruangan."
          : "Tutup Jendela & Pakai Purifier — Disarankan menutup ventilasi dan menyalakan penyaring udara untuk menjaga kualitas udara ruangan.",
      sensitiveAdvice:
        summary?.dominant === "PM2.5"
          ? "Perhatian Partikel Halus (PM2.5) — Partikel PM2.5 mendominasi proyeksi. Penderita asma dan lansia disarankan menyediakan inhaler atau masker jika bepergian."
          : "Waspada Iritasi Saluran Napas — Pantau anak-anak dan lansia jika udara terasa berdebu di jam-jam puncak.",
    };
  }, [forecast, summary]);

  // Uji kewajaran drift
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
      {/* Header Utama */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold text-slate-900 sm:text-lg">
            Prediksi 60 menit ke depan
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400">
            <CalendarClock className="h-3.5 w-3.5" />
            {summary ? formatGenerated(summary.generated) : "—"} ·{" "}
            {summary?.horizon ?? 0} titik data · Sinkronisasi cloud per 30m
          </p>
        </div>

        {summary && (
          <div className="flex items-center gap-3">
            <div
              className="rounded-xl px-5 py-2.5 text-center shadow-sm"
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
            <div className="rounded-xl border border-slate-200/80 bg-white/90 px-4 py-2.5 text-center shadow-sm">
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

      {/* Peringatan Drift Data */}
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

      {/* Insight Otomatis Model RNN */}
      {summary?.insight && (
        <section className="flex items-start gap-3 rounded-2xl border border-violet-200/70 bg-violet-50/60 p-4 sm:p-5 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-violet-600">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-500">
              Insight Analytics (AI Recurrent Network)
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
              {summary.insight}
            </p>
          </div>
        </section>
      )}

      {/* FITUR 1: Kartu Ringkasan Puncak & Arah Tren per Polutan */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {pollutantStats.map((stat) => {
          const isConc = viewMode === "conc";
          const currentVal = isConc ? stat.initialConc : stat.initialIspu;
          const finalVal = isConc ? stat.finalConc : stat.finalIspu;
          const peakVal = isConc ? stat.peakConc : stat.peakIspu;
          const delta = isConc ? stat.deltaConc : stat.deltaIspu;
          const unitStr = isConc ? stat.unit : "ISPU";

          return (
            <div
              key={stat.key}
              className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 sm:p-5 shadow-sm transition-all hover:border-slate-300"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: stat.color }}
                  />
                  <h3 className="text-sm font-semibold text-slate-800">
                    {stat.label}
                  </h3>
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: stat.category.soft,
                    color: stat.category.text,
                  }}
                >
                  {stat.category.label}
                </span>
              </div>

              {/* Nilai Saat Ini vs Akhir Horizon */}
              <div className="mt-3 flex items-baseline justify-between">
                <div>
                  <span className="text-[11px] text-slate-400">Proyeksi Akhir</span>
                  <div className="flex items-baseline gap-1">
                    <span className="tabular text-xl font-bold text-slate-900">
                      {finalVal.toFixed(1)}
                    </span>
                    <span className="text-[11px] text-slate-400">{unitStr}</span>
                  </div>
                </div>

                {/* Badge Tren */}
                <span
                  className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
                    stat.trend === "up"
                      ? "bg-rose-50 text-rose-600"
                      : stat.trend === "down"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {stat.trend === "up" ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : stat.trend === "down" ? (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  <span>{Math.abs(delta).toFixed(1)}%</span>
                </span>
              </div>

              {/* Rincian Puncak */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-2.5 text-[11.5px]">
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="h-3 w-3" />
                  Puncak ({stat.peakTime})
                </span>
                <span className="tabular font-semibold text-slate-700">
                  {peakVal.toFixed(1)} {unitStr}
                </span>
              </div>
            </div>
          );
        })}
      </section>

      {/* Grafik Proyeksi 60 Menit dengan Garis Ambang ISPU */}
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6 shadow-sm">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              {viewMode === "ispu" ? "Proyeksi Indeks ISPU" : "Proyeksi Konsentrasi Polutan"}
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {viewMode === "ispu"
                ? "Standar KLHK (0 - 300) · Dilengkapi garis batas kategori acuan"
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
              margin={{ top: 12, right: 12, bottom: 0, left: -10 }}
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
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
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

              {/* FITUR 2: Garis Ambang Kategori ISPU (Muncul saat Mode ISPU aktif) */}
              {viewMode === "ispu" && (
                <>
                  <ReferenceLine
                    y={50}
                    stroke="#10B981"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: "Batas Baik (50)",
                      position: "insideTopRight",
                      fill: "#059669",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  />
                  <ReferenceLine
                    y={100}
                    stroke="#F59E0B"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: "Batas Sedang (100)",
                      position: "insideTopRight",
                      fill: "#D97706",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  />
                  <ReferenceLine
                    y={200}
                    stroke="#EF4444"
                    strokeDasharray="4 4"
                    strokeOpacity={0.5}
                    label={{
                      value: "Batas Tidak Sehat (200)",
                      position: "insideTopRight",
                      fill: "#DC2626",
                      fontSize: 10,
                      fontWeight: 500,
                    }}
                  />
                </>
              )}

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

      {/* FITUR 3: Panduan Waktu & Rekomendasi Aksi Dinamis */}
      {actionPlan && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Card 1: Waktu Aktivitas Luar Ruangan */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2.5 text-emerald-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                <Activity className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Aktivitas Luar Ruangan
              </h3>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-[12px]">
              <span className="text-slate-500">Waktu Terbersih</span>
              <span className="font-semibold text-emerald-700">
                {actionPlan.bestTime} (ISPU ~{actionPlan.minIspu})
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {actionPlan.outdoorAdvice}
            </p>
          </div>

          {/* Card 2: Ventilasi & Air Purifier */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2.5 text-sky-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50">
                <Wind className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Ventilasi Ruangan
              </h3>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-[12px]">
              <span className="text-slate-500">Status Puncak</span>
              <span
                className="font-semibold"
                style={{ color: actionPlan.peakTone.text }}
              >
                ISPU Puncak: {actionPlan.overallPeak} ({actionPlan.peakTone.label})
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {actionPlan.ventilationAdvice}
            </p>
          </div>

          {/* Card 3: Rekomendasi Kelompok Rentan */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <div className="flex items-center gap-2.5 text-indigo-600">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <h3 className="text-sm font-semibold text-slate-900">
                Kelompok Rentan
              </h3>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-[12px]">
              <span className="text-slate-500">Polutan Utama</span>
              <span className="font-semibold text-indigo-700">
                {summary?.dominant}
              </span>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-slate-600">
              {actionPlan.sensitiveAdvice}
            </p>
          </div>
        </section>
      )}

      {/* FITUR 4: Kartu Transparansi Model & Pipeline AI */}
      <section className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-slate-700">
          <Cpu className="h-4 w-4 text-slate-500" />
          <h3 className="text-[13px] font-semibold">Spesifikasi Model & Pipeline AI</h3>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 text-[12px]">
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-slate-400">Arsitektur Runtun Waktu</p>
            <p className="mt-1 font-semibold text-slate-800">
              LSTM (PM2.5) &amp; GRU (PM10, CO)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Multi-step Direct Window (t+1..t+60)</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-slate-400">Siklus Otomatis Cloud</p>
            <p className="mt-1 font-semibold text-slate-800">
              GitHub Actions Cron (30 Menit)
            </p>
            <p className="mt-0.5 text-[11px] text-emerald-600 font-medium">Realtime Push via WebSocket</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white p-3">
            <p className="text-slate-400">Akurasi Uji Independen</p>
            <p className="mt-1 font-semibold text-slate-800">
              MAE: 4.87 (PM2.5) | 6.57 (PM10)
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Mengungguli XGBoost pada dataset sensor</p>
          </div>
        </div>
      </section>
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
