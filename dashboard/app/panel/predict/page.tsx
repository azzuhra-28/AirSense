
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cloud,
  Cpu,
  Gauge,
  RefreshCw,
  ShieldAlert,
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
  {
    key: "pm25",
    label: "PM2.5",
    color: POLLUTANT_COLOR.pm25,
    model: "LSTM",
  },
  {
    key: "pm10",
    label: "PM10",
    color: POLLUTANT_COLOR.pm10,
    model: "GRU",
  },
  {
    key: "co",
    label: "CO",
    color: POLLUTANT_COLOR.co,
    model: "GRU",
  },
] as const;

const ACTUAL_COL: Record<
  string,
  "pm25_ugm3" | "pm10_ugm3" | "co_ugm3"
> = {
  pm25: "pm25_ugm3",
  pm10: "pm10_ugm3",
  co: "co_ugm3",
};

const PRED_COL: Record<
  string,
  "pm25_ugm3_pred" | "pm10_ugm3_pred" | "co_ugm3_pred"
> = {
  pm25: "pm25_ugm3_pred",
  pm10: "pm10_ugm3_pred",
  co: "co_ugm3_pred",
};

const DRIFT_THRESHOLD_PCT = 50;

type ViewMode = "ispu" | "conc";

export default function PredictPage() {
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("ispu");
  const [activeSeries, setActiveSeries] = useState<string[]>([
    "pm25",
    "pm10",
    "co",
  ]);
  const [showDriftDetails, setShowDriftDetails] = useState(false);
  const [showModelDetails, setShowModelDetails] = useState(false);

  const { rows: actualRows } = useSensorData();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!cancelled) {
        setRefreshing(true);
        setError(null);
      }

      try {
        const rows = await getLatestForecast();

        if (!cancelled) {
          setForecast(rows);
        }
      } catch (e) {
        if (!cancelled) {
          setError(String(e instanceof Error ? e.message : e));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    void load();

    const unsubscribe = subscribeForecast(() => {
      void load();
    });

    const timer = setInterval(() => {
      void load();
    }, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(timer);
    };
  }, [retryKey]);

  const data = useMemo(
    () =>
      forecast.map((r) => ({
        t: toWIB(r.forecast_at),
        pm25_ispu: r.pm25_ispu_pred,
        pm10_ispu: r.pm10_ispu_pred,
        co_ispu: r.co_ispu_pred,
        pm25_conc: r.pm25_ugm3_pred,
        pm10_conc: r.pm10_ugm3_pred,
        co_conc:
          r.co_ugm3_pred != null ? r.co_ugm3_pred / 1000 : null,
      })),
    [forecast]
  );

  const summary = useMemo(() => {
    if (!forecast.length) return null;

    const last = forecast[forecast.length - 1];
    const values = [
      last.pm25_ispu_pred,
      last.pm10_ispu_pred,
      last.co_ispu_pred,
    ]
      .map(Number)
      .filter(Number.isFinite);

    const total = values.length ? Math.max(...values) : 0;

    const dominant = [
      { k: "PM2.5", v: Number(last.pm25_ispu_pred ?? -1) },
      { k: "PM10", v: Number(last.pm10_ispu_pred ?? -1) },
      { k: "CO", v: Number(last.co_ispu_pred ?? -1) },
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

  const pollutantStats = useMemo(() => {
    if (!forecast.length) return [];

    return SERIES.map((s) => {
      const ispuKey = `${s.key}_ispu_pred` as keyof ForecastRow;
      const concKey = `${s.key}_ugm3_pred` as keyof ForecastRow;

      const ispuVals = forecast.map(
        (r) => Number(r[ispuKey]) || 0
      );

      const concVals = forecast.map((r) => {
        const raw = Number(r[concKey]) || 0;
        return s.key === "co" ? raw / 1000 : raw;
      });

      const initialIspu = ispuVals[0] ?? 0;
      const finalIspu = ispuVals[ispuVals.length - 1] ?? 0;
      const initialConc = concVals[0] ?? 0;
      const finalConc = concVals[concVals.length - 1] ?? 0;

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

      const deltaIspu =
        initialIspu > 0
          ? ((finalIspu - initialIspu) / initialIspu) * 100
          : 0;

      const deltaConc =
        initialConc > 0
          ? ((finalConc - initialConc) / initialConc) * 100
          : 0;

      const trend =
        deltaIspu > 5 ? "up" : deltaIspu < -5 ? "down" : "stable";

      return {
        key: s.key,
        label: s.label,
        color: s.color,
        model: s.model,
        unit: s.key === "co" ? "mg/m³" : "µg/m³",
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

  const actionPlan = useMemo(() => {
    if (!forecast.length) return null;

    let minIdx = 0;
    let minIspu = Infinity;

    forecast.forEach((r, idx) => {
      const maxInRow = Math.max(
        Number(r.pm25_ispu_pred) || 0,
        Number(r.pm10_ispu_pred) || 0,
        Number(r.co_ispu_pred) || 0
      );

      if (maxInRow < minIspu) {
        minIspu = maxInRow;
        minIdx = idx;
      }
    });

    const bestTime = toWIB(forecast[minIdx]?.forecast_at);

    const overallPeak = Math.max(
      ...forecast.map((r) =>
        Math.max(
          Number(r.pm25_ispu_pred) || 0,
          Number(r.pm10_ispu_pred) || 0,
          Number(r.co_ispu_pred) || 0
        )
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
          ? "Proyeksi berada dalam kategori Baik. Aktivitas luar ruangan dapat dipertimbangkan sesuai kondisi tubuh dan lingkungan."
          : overallPeak <= 100
          ? "Udara diproyeksikan dalam kategori Sedang. Kelompok sensitif sebaiknya mempertimbangkan untuk mengurangi aktivitas berat di luar."
          : "Pertimbangkan mengurangi aktivitas berat di luar ruangan dan pantau perkembangan kualitas udara.",
      ventilationAdvice:
        overallPeak <= 50
          ? "Kondisi yang diproyeksikan relatif baik. Ventilasi alami dapat dipertimbangkan jika kondisi sekitar mendukung."
          : "Pertimbangkan mengurangi masuknya udara luar yang tercemar. Gunakan penyaring udara jika tersedia.",
      sensitiveAdvice:
        summary?.dominant === "PM2.5"
          ? "Partikel PM2.5 menjadi polutan dominan dalam proyeksi. Kelompok sensitif perlu memperhatikan gejala pernapasan dan membatasi paparan bila diperlukan."
          : "Kelompok sensitif seperti anak-anak, lansia, dan orang dengan gangguan pernapasan sebaiknya terus memantau kualitas udara.",
    };
  }, [forecast, summary]);

  const drift = useMemo(() => {
    if (!forecast.length || actualRows.length < 10) return null;

    const recent = actualRows.slice(-60);
    const result: Record<
      string,
      { pct: number; unreliable: boolean; difference: number }
    > = {};

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
      const difference = Math.abs(fmean - amean);
      const pct = amean > 0 ? (difference / amean) * 100 : 0;

      const absThreshold =
        s.key === "co" ? 800 : s.key === "pm10" ? 12 : 8;

      result[s.key] = {
        pct,
        difference,
        unreliable: pct > DRIFT_THRESHOLD_PCT && difference > absThreshold,
      };
    }

    return result;
  }, [forecast, actualRows]);

  const unreliableLabels = useMemo(
    () =>
      drift
        ? SERIES.filter((s) => drift[s.key]?.unreliable).map((s) => s.label)
        : [],
    [drift]
  );

  const toggleSeries = useCallback((key: string) => {
    setActiveSeries((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key]
    );
  }, []);

  const retry = () => {
    setLoading(true);
    setRetryKey((key) => key + 1);
  };

  if (loading && !forecast.length) {
    return (
      <div className="space-y-5">
        <div className="h-44 animate-pulse rounded-3xl bg-slate-900" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-3xl border border-slate-200 bg-white" />
      </div>
    );
  }

  if (error && !forecast.length) {
    return (
      <div className="overflow-hidden rounded-3xl border border-rose-200 bg-white shadow-sm">
        <div className="bg-slate-950 p-6 text-white sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
            <ShieldAlert size={24} />
          </div>
          <h1 className="mt-4 text-xl font-bold">Prediksi belum tersedia</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            Data forecast belum berhasil dimuat. Periksa koneksi dan
            pipeline prediksi, lalu coba muat ulang.
          </p>
        </div>
        <div className="p-6">
          <p className="break-words rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
            {error}
          </p>
          <button
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            <RefreshCw size={15} />
            Coba lagi
          </button>
        </div>
      </div>
    );
  }

  if (!forecast.length) {
    return (
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <div className="bg-slate-950 p-7 text-white sm:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
            <Activity size={24} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">
            Belum ada hasil prediksi
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-6 text-slate-300">
            Halaman ini akan menampilkan tren polutan setelah pipeline
            menghasilkan data forecast.
          </p>
        </div>
        <div className="p-6">
          <p className="text-sm text-slate-500">
            Pastikan tabel <code>tb_forecast</code> tersedia dan pipeline
            analytics telah dijalankan.
          </p>
          <button
            onClick={retry}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
          >
            <RefreshCw size={15} />
            Periksa kembali
          </button>
        </div>
      </div>
    );
  }

  const maxChartValue =
    viewMode === "ispu"
      ? 300
      : Math.max(
          10,
          ...data.flatMap((row) =>
            activeSeries.map((key) =>
              Number(row[`${key}_conc` as keyof typeof row]) || 0
            )
          )
        );

  return (
    <div className="min-w-0 space-y-6 pb-8">
      {/* HERO */}
      <section className="relative isolate overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl shadow-slate-900/10">
        <div className="pointer-events-none absolute -right-16 -top-24 -z-10 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 -z-10 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />

        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-end lg:p-9">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-200">
              <Sparkles size={14} />
              AIRSENSE INTELLIGENCE
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              FORECAST
            </div>

            <h1 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Lihat kualitas udara
              <span className="block text-emerald-300">
                sebelum berubah.
              </span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Proyeksi kualitas udara 60 menit ke depan berdasarkan hasil
              model prediksi dan data sensor yang tersedia.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-slate-200">
                <Clock3 size={14} className="text-emerald-300" />
                {formatGenerated(summary?.generated)}
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-slate-200">
                <Activity size={14} className="text-cyan-300" />
                {summary?.horizon ?? 0} titik forecast
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-slate-200">
                <Cloud size={14} className="text-violet-300" />
                Pembaruan otomatis
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
            <div className="min-w-40 rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                Indeks puncak proyeksi
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span
                  className="text-5xl font-bold tracking-tight"
                  style={{ color: summary?.tone.text ?? "#FFFFFF" }}
                >
                  {summary?.total ?? "—"}
                </span>
                <span
                  className="mb-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    backgroundColor: summary?.tone.soft,
                    color: summary?.tone.text,
                  }}
                >
                  {summary?.tone.label ?? "Belum diketahui"}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Berdasarkan nilai maksimum proyeksi pada titik akhir.
              </p>
            </div>

            <button
              onClick={retry}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw
                size={16}
                className={refreshing ? "animate-spin" : ""}
              />
              {refreshing ? "Memperbarui..." : "Perbarui prediksi"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-white/[0.03] px-5 py-3 text-[11px] sm:px-9">
          <span className="flex items-center gap-2 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Data forecast berhasil dimuat
          </span>
          <span className="text-slate-400">
            Polutan dominan:{" "}
            <strong className="text-white">{summary?.dominant ?? "—"}</strong>
          </span>
        </div>
      </section>

      {/* ALERT DATA */}
      {error && forecast.length > 0 && (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <TriangleAlert
              className="mt-0.5 shrink-0 text-amber-600"
              size={19}
            />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Pembaruan data mengalami kendala
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-amber-800">
                Data forecast sebelumnya masih ditampilkan. {error}
              </p>
            </div>
          </div>
          <button
            onClick={retry}
            className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
          >
            Coba lagi
          </button>
        </section>
      )}

      {unreliableLabels.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <ShieldAlert size={21} />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Periksa kewajaran prediksi
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                  PERLU DITINJAU
                </span>
              </div>

              <p className="mt-1.5 text-sm leading-6 text-slate-600">
                Proyeksi {unreliableLabels.join(", ")} memiliki selisih
                rata-rata yang besar terhadap pembacaan sensor terkini.
                Hasil ini perlu ditinjau sebelum dijadikan dasar keputusan.
              </p>

              <button
                onClick={() => setShowDriftDetails((v) => !v)}
                className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-amber-800 hover:text-amber-950"
              >
                {showDriftDetails ? "Sembunyikan rincian" : "Lihat rincian"}
                {showDriftDetails ? (
                  <ChevronUp size={15} />
                ) : (
                  <ChevronDown size={15} />
                )}
              </button>

              {showDriftDetails && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {SERIES.filter((s) => drift?.[s.key]).map((s) => {
                    const item = drift![s.key];

                    return (
                      <div
                        key={s.key}
                        className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                      >
                        <p className="text-xs font-bold text-slate-800">
                          {s.label}
                        </p>
                        <p className="mt-2 text-xl font-bold text-slate-900">
                          {item.pct.toFixed(1)}%
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Selisih relatif rata-rata
                        </p>
                        <span
                          className={`mt-2 inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                            item.unreliable
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {item.unreliable
                            ? "Perlu ditinjau"
                            : "Dalam ambang pemeriksaan"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* INSIGHT */}
      {summary?.insight && (
        <section className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 via-white to-emerald-50 p-5 sm:p-6">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-violet-200/30 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
              <Sparkles size={19} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-600">
                Insight dari pipeline analytics
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {summary.insight}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* POLLUTANT CARDS */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Forecast overview
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Ringkasan polutan
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Perubahan dari titik pertama ke titik terakhir pada horizon
              prediksi.
            </p>
          </div>
          <span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-medium text-slate-600">
            {viewMode === "ispu" ? "Mode indeks ISPU" : "Mode konsentrasi"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pollutantStats.map((stat, index) => {
            const isConc = viewMode === "conc";
            const finalVal = isConc ? stat.finalConc : stat.finalIspu;
            const peakVal = isConc ? stat.peakConc : stat.peakIspu;
            const delta = isConc ? stat.deltaConc : stat.deltaIspu;
            const unit = isConc ? stat.unit : "ISPU";

            return (
              <article
                key={stat.key}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5"
              >
                <div
                  className="absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: stat.color }}
                />
                <div
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-[0.07] blur-2xl transition group-hover:opacity-15"
                  style={{ backgroundColor: stat.color }}
                />

                <div className="relative flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex h-10 w-10 items-center justify-center rounded-xl"
                      style={{
                        color: stat.color,
                        backgroundColor: `${stat.color}15`,
                      }}
                    >
                      {stat.key === "co" ? (
                        <Wind size={19} />
                      ) : (
                        <Activity size={19} />
                      )}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {stat.label}
                      </h3>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        Model {stat.model}
                      </p>
                    </div>
                  </div>

                  <span
                    className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{
                      backgroundColor: stat.category.soft,
                      color: stat.category.text,
                    }}
                  >
                    {stat.category.label}
                  </span>
                </div>

                <div className="relative mt-6 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-slate-500">
                      Proyeksi akhir
                    </p>
                    <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
                      {finalVal.toFixed(1)}
                      <span className="ml-1.5 text-xs font-medium text-slate-400">
                        {unit}
                      </span>
                    </p>
                  </div>

                  <span
                    className={`mb-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                      stat.trend === "up"
                        ? "bg-rose-50 text-rose-700"
                        : stat.trend === "down"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {stat.trend === "up" ? (
                      <ArrowUpRight size={14} />
                    ) : stat.trend === "down" ? (
                      <ArrowDownRight size={14} />
                    ) : (
                      <Activity size={13} />
                    )}
                    {delta > 0 ? "+" : ""}
                    {delta.toFixed(1)}%
                  </span>
                </div>

                <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <div>
                    <p className="text-[10px] text-slate-400">
                      Nilai awal
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {(isConc ? stat.initialConc : stat.initialIspu).toFixed(1)}
                      <span className="ml-1 text-[10px] font-normal text-slate-400">
                        {unit}
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">
                      Puncak proyeksi
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {peakVal.toFixed(1)}
                      <span className="ml-1 text-[10px] font-normal text-slate-400">
                        {unit}
                      </span>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {stat.peakTime}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* MAIN CHART */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-slate-950 p-5 text-white sm:p-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-emerald-300">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-400/10">
                  <Activity size={17} />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                  Forecast visualization
                </span>
              </div>
              <h2 className="mt-3 text-xl font-bold sm:text-2xl">
                Perjalanan kualitas udara
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-400 sm:text-sm">
                Bandingkan tren antarpolutan, periksa titik waktu, dan ubah
                skala pengukuran sesuai kebutuhan analisis.
              </p>
            </div>

            <div className="flex rounded-xl border border-white/10 bg-white/[0.06] p-1">
              <button
                type="button"
                onClick={() => setViewMode("ispu")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-semibold transition sm:flex-none ${
                  viewMode === "ispu"
                    ? "bg-emerald-400 text-slate-950 shadow"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                Indeks ISPU
              </button>
              <button
                type="button"
                onClick={() => setViewMode("conc")}
                className={`flex-1 rounded-lg px-4 py-2.5 text-xs font-semibold transition sm:flex-none ${
                  viewMode === "conc"
                    ? "bg-emerald-400 text-slate-950 shadow"
                    : "text-slate-300 hover:bg-white/10"
                }`}
              >
                Konsentrasi
              </button>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            {SERIES.map((s) => {
              const selected = activeSeries.includes(s.key);

              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                    selected
                      ? "border-white/20 bg-white/10 text-white"
                      : "border-white/5 bg-transparent text-slate-500 hover:border-white/20"
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: selected ? s.color : "#64748B",
                    }}
                  />
                  {s.label}
                  <span className="text-[10px] opacity-60">
                    {selected ? "Aktif" : "Nonaktif"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-3 sm:p-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2 pt-2">
            <div>
              <p className="text-xs font-bold text-slate-800">
                {viewMode === "ispu"
                  ? "Indeks Standar Pencemar Udara"
                  : "Konsentrasi polutan"}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {viewMode === "ispu"
                  ? "Skala indeks 0–300 · garis ambang sebagai acuan visual"
                  : "PM2.5 & PM10 dalam µg/m³ · CO dalam mg/m³"}
              </p>
            </div>
            <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">
              {data.length} titik data
            </span>
          </div>

          <div className="h-[340px] w-full sm:h-[410px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 16, right: 12, bottom: 0, left: -12 }}
              >
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient
                      key={s.key}
                      id={`predict-gradient-${s.key}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor={s.color}
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="95%"
                        stopColor={s.color}
                        stopOpacity={0.015}
                      />
                    </linearGradient>
                  ))}
                </defs>

                <CartesianGrid
                  strokeDasharray="3 6"
                  stroke="#E9EEF5"
                  vertical={false}
                />

                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={28}
                  tickMargin={12}
                />

                <YAxis
                  domain={
                    viewMode === "ispu" ? [0, 300] : [0, "auto"]
                  }
                  allowDataOverflow={viewMode === "ispu"}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  width={42}
                  tickFormatter={(v) => Number(v).toFixed(0)}
                />

                {viewMode === "ispu" && (
                  <>
                    <ReferenceLine
                      y={50}
                      stroke="#10B981"
                      strokeDasharray="5 5"
                      strokeOpacity={0.8}
                      label={{
                        value: "Baik · 50",
                        position: "insideTopRight",
                        fill: "#059669",
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      y={100}
                      stroke="#F59E0B"
                      strokeDasharray="5 5"
                      strokeOpacity={0.8}
                      label={{
                        value: "Sedang · 100",
                        position: "insideTopRight",
                        fill: "#B45309",
                        fontSize: 10,
                      }}
                    />
                    <ReferenceLine
                      y={200}
                      stroke="#EF4444"
                      strokeDasharray="5 5"
                      strokeOpacity={0.8}
                      label={{
                        value: "Tidak sehat · 200",
                        position: "insideTopRight",
                        fill: "#DC2626",
                        fontSize: 10,
                      }}
                    />
                  </>
                )}

                <Tooltip
                  cursor={{
                    stroke: "#94A3B8",
                    strokeDasharray: "4 4",
                  }}
                  contentStyle={{
                    borderRadius: 14,
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 14px 35px -18px rgba(15,23,42,0.35)",
                    fontSize: 12,
                    padding: 12,
                  }}
                  labelStyle={{
                    color: "#0F172A",
                    fontWeight: 700,
                    marginBottom: 6,
                  }}
                  formatter={(value: number, name: string, item: any) => {
                    const p = item?.payload;

                    if (!p) return [value, name];

                    if (viewMode === "ispu") {
                      let raw = "";

                      if (name === "PM2.5" && p.pm25_conc != null) {
                        raw = ` · ${Number(p.pm25_conc).toFixed(1)} µg/m³`;
                      }
                      if (name === "PM10" && p.pm10_conc != null) {
                        raw = ` · ${Number(p.pm10_conc).toFixed(1)} µg/m³`;
                      }
                      if (name === "CO" && p.co_conc != null) {
                        raw = ` · ${Number(p.co_conc).toFixed(2)} mg/m³`;
                      }

                      return [
                        `${Number(value).toFixed(1)} ISPU${raw}`,
                        name,
                      ];
                    }

                    const unit = name === "CO" ? "mg/m³" : "µg/m³";
                    const ispuKey =
                      name === "PM2.5"
                        ? "pm25_ispu"
                        : name === "PM10"
                        ? "pm10_ispu"
                        : "co_ispu";

                    return [
                      `${Number(value).toFixed(2)} ${unit} · ISPU ${Number(
                        p[ispuKey] ?? 0
                      ).toFixed(0)}`,
                      name,
                    ];
                  }}
                />

                {SERIES.filter((s) => activeSeries.includes(s.key)).map(
                  (s) => {
                    const key =
                      viewMode === "ispu"
                        ? `${s.key}_ispu`
                        : `${s.key}_conc`;

                    return (
                      <Area
                        key={s.key}
                        type="monotone"
                        dataKey={key}
                        name={s.label}
                        stroke={s.color}
                        strokeWidth={2.5}
                        fill={`url(#predict-gradient-${s.key})`}
                        activeDot={{
                          r: 5,
                          strokeWidth: 2,
                          stroke: "#FFFFFF",
                        }}
                        dot={false}
                        connectNulls
                        isAnimationActive
                      />
                    );
                  }
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {activeSeries.length === 0 && (
            <div className="mx-2 mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-xs text-slate-500">
              Pilih minimal satu polutan di atas untuk menampilkan grafik.
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 px-2 pt-4 text-[10px] leading-5 text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={13} className="text-emerald-600" />
              Data berasal dari pipeline forecast
            </span>
            <span>
              Garis ambang merupakan acuan visual; bukan penetapan ISPU
              resmi dari stasiun pemantauan.
            </span>
          </div>
        </div>
      </section>

      {/* ACTION PLAN */}
      {actionPlan && (
        <section>
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
              Suggested actions
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              Panduan berdasarkan proyeksi
            </h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Rekomendasi indikatif untuk membantu memahami hasil prediksi.
              Tetap perhatikan kondisi aktual di lingkunganmu.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <AdviceCard
              icon={<Activity size={19} />}
              number="01"
              title="Aktivitas luar ruangan"
              accent="emerald"
              metricLabel="Titik terendah"
              metric={`${actionPlan.bestTime} · ISPU ${actionPlan.minIspu}`}
              description={actionPlan.outdoorAdvice}
            />

            <AdviceCard
              icon={<Wind size={19} />}
              number="02"
              title="Ventilasi ruangan"
              accent="sky"
              metricLabel="Puncak proyeksi"
              metric={`ISPU ${actionPlan.overallPeak} · ${actionPlan.peakTone.label}`}
              description={actionPlan.ventilationAdvice}
            />

            <AdviceCard
              icon={<ShieldCheck size={19} />}
              number="03"
              title="Kelompok sensitif"
              accent="violet"
              metricLabel="Polutan dominan"
              metric={summary?.dominant ?? "—"}
              description={actionPlan.sensitiveAdvice}
            />
          </div>
        </section>
      )}

      {/* MODEL TRANSPARENCY */}
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowModelDetails((v) => !v)}
          aria-expanded={showModelDetails}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition hover:bg-slate-50 sm:p-6"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-emerald-300">
              <Cpu size={21} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Model transparency
              </p>
              <h2 className="mt-1 text-sm font-bold text-slate-900 sm:text-base">
                Spesifikasi model & pipeline
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Lihat arsitektur dan informasi proses prediksi.
              </p>
            </div>
          </div>

          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600">
            {showModelDetails ? (
              <ChevronUp size={18} />
            ) : (
              <ChevronDown size={18} />
            )}
          </span>
        </button>

        {showModelDetails && (
          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
            <ModelInfo
              icon={<Activity size={17} />}
              label="Arsitektur"
              value="LSTM & GRU"
              detail="LSTM untuk PM2.5; GRU untuk PM10 dan CO, sesuai konfigurasi yang tercantum pada halaman."
            />
            <ModelInfo
              icon={<Clock3 size={17} />}
              label="Horizon"
              value={`${summary?.horizon ?? 0} titik data`}
              detail="Jumlah titik yang saat ini diterima dari hasil forecast."
            />
            <ModelInfo
              icon={<Gauge size={17} />}
              label="Pemeriksaan drift"
              value="Ambang 50%"
              detail="Peringatan membandingkan rata-rata forecast dan pembacaan sensor terbaru, dengan ambang absolut tambahan."
            />
          </div>
        )}

        <div className="flex items-start gap-2.5 border-t border-slate-100 bg-amber-50/70 px-5 py-4 sm:px-6">
          <TriangleAlert
            size={16}
            className="mt-0.5 shrink-0 text-amber-700"
          />
          <p className="text-[11px] leading-5 text-amber-900">
            Hasil forecast adalah estimasi model, bukan jaminan kondisi
            aktual. Metrik evaluasi model tidak ditampilkan sebagai angka
            performa terkini karena perhitungannya tidak dilakukan pada
            halaman ini.
          </p>
        </div>
      </section>

      <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-[10px] leading-5 text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <span>AirSense · Air Quality Forecast</span>
        <span className="flex items-center gap-1.5">
          <Clock3 size={12} />
          Waktu ditampilkan dalam WIB
        </span>
      </footer>
    </div>
  );
}

function AdviceCard({
  icon,
  number,
  title,
  accent,
  metricLabel,
  metric,
  description,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  accent: "emerald" | "sky" | "violet";
  metricLabel: string;
  metric: string;
  description: string;
}) {
  const styles = {
    emerald: {
      icon: "bg-emerald-50 text-emerald-700",
      number: "text-emerald-700",
      border: "hover:border-emerald-200",
    },
    sky: {
      icon: "bg-sky-50 text-sky-700",
      number: "text-sky-700",
      border: "hover:border-sky-200",
    },
    violet: {
      icon: "bg-violet-50 text-violet-700",
      number: "text-violet-700",
      border: "hover:border-violet-200",
    },
  }[accent];

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${styles.border}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.icon}`}
        >
          {icon}
        </span>
        <span className={`text-xs font-bold ${styles.number}`}>
          {number}
        </span>
      </div>

      <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>

      <div className="mt-3 rounded-xl bg-slate-50 p-3">
        <p className="text-[10px] text-slate-400">{metricLabel}</p>
        <p className="mt-1 break-words text-xs font-bold leading-5 text-slate-800">
          {metric}
        </p>
      </div>

      <p className="mt-3 text-xs leading-6 text-slate-600">
        {description}
      </p>
    </article>
  );
}

function ModelInfo({
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
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-3 text-base font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function formatGenerated(iso?: string) {
  if (!iso) return "Waktu belum tersedia";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Waktu belum tersedia";

  return date.toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}