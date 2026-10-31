"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Database,
  Minus,
  RefreshCw,
} from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { useSensorData } from "@/components/SensorProvider";
import { getLatestForecast, subscribeForecast } from "@/lib/api";
import { aqiOf, POLLUTANT_COLOR } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import type { ForecastRow } from "@/lib/types";

const DEVICES = ["Node 01 - PENS"];

const SERIES = [
  { key: "pm25", label: "PM2.5", unit: "µg/m³", color: POLLUTANT_COLOR.pm25 },
  { key: "pm10", label: "PM10", unit: "µg/m³", color: POLLUTANT_COLOR.pm10 },
  { key: "co", label: "CO", unit: "mg/m³", color: POLLUTANT_COLOR.co },
] as const;

export default function SummaryPage() {
  const data = useSensorData();
  const { refreshing, source, reload } = data;

  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [activeSeries, setActiveSeries] = useState<string[]>(["pm25"]);
  const reduceMotion = useReducedMotion();

  const loadForecast = useCallback(async () => {
    setForecastError(null);
    try {
      const rows = await getLatestForecast();
      setForecast(rows);
    } catch (e) {
      setForecastError(e instanceof Error ? e.message : String(e));
    } finally {
      setForecastLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForecast();
    const unsubscribe = subscribeForecast(() => {
      void loadForecast();
    });
    return unsubscribe;
  }, [loadForecast]);

  // Pilih seri yang benar-benar punya data, supaya grafik tidak kosong
  // hanya karena polutan default kebetulan tidak diproyeksikan.
  useEffect(() => {
    if (!forecast.length) return;
    const available: string[] = SERIES.filter((s) =>
      forecast.some((r) => r[`${s.key}_ugm3_pred` as keyof ForecastRow] != null)
    ).map((s) => s.key);
    if (!available.length) return;

    setActiveSeries((prev) => {
      const masihAda = prev.filter((k) => available.includes(k));
      return masihAda.length ? masihAda : [available[0]];
    });
  }, [forecast]);

  const chart = useMemo(
    () =>
      forecast.map((r) => ({
        t: toWIB(r.forecast_at),
        pm25: r.pm25_ugm3_pred,
        pm10: r.pm10_ugm3_pred,
        co: r.co_ugm3_pred != null ? r.co_ugm3_pred / 1000 : null,
      })),
    [forecast]
  );

  // Seri utama untuk ringkasan: yang pertama aktif dan punya data.
  const primaryKey = useMemo<"pm25" | "pm10" | "co">(() => {
    const first = SERIES.find((s) => activeSeries.includes(s.key));
    return (first?.key ?? "pm25") as "pm25" | "pm10" | "co";
  }, [activeSeries]);

  const primaryLabel = useMemo(
    () => SERIES.find((s) => s.key === primaryKey)?.label ?? "-",
    [primaryKey]
  );

  // Arah tren dihitung dari titik awal vs akhir siklus, bukan dikarang.
  const trend = useMemo(() => {
    if (chart.length < 2) return null;
    const a = Number(chart[0][primaryKey]);
    const b = Number(chart[chart.length - 1][primaryKey]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const delta = b - a;
    return {
      delta,
      direction: delta > 0.5 ? "naik" : delta < -0.5 ? "turun" : "stabil",
    };
  }, [chart, primaryKey]);

  const peak = useMemo(() => {
    if (!chart.length) return null;
    const values = chart
      .map((p) => ({ t: p.t, v: Number((p as Record<string, unknown>)[primaryKey]) }))
      .filter((p) => Number.isFinite(p.v));
    if (!values.length) return null;
    return values.reduce((a, b) => (b.v > a.v ? b : a));
  }, [chart, primaryKey]);

  const currentIspu = useMemo(() => {
    const tone = aqiOf(data.ispu);
    return { value: data.ispu, ...tone };
  }, [data.ispu]);

  // Gabungan riwayat aktual dan forecast dalam satu deret waktu.
  // Aktual = garis padat di kiri, forecast = area transparan di kanan.
  const combined = useMemo(() => {
    // Nilai negatif berarti sensor membaca di bawah ambang deteksi,
    // bukan nol. Dibiarkan kosong supaya garis terputus, bukan
    // digambar rata di 0 yang menyesatkan.
    const valid = (v: number | null): number | null =>
      v == null || v < 0 ? null : v;

    const coMg = (v: number | null): number | null => {
      const c = valid(v);
      return c == null ? null : c / 1000;
    };

    const actualRows = data.rows.slice(-60);
    const actual = actualRows.map((r) => ({
      t: toWIB(r.created_at),
      pm25: valid(r.pm25_ugm3),
      pm10: valid(r.pm10_ugm3),
      co: coMg(r.co_ugm3),
      isForecast: false,
    }));

    const fc = forecast.map((r) => ({
      t: toWIB(r.forecast_at),
      pm25: valid(r.pm25_ugm3_pred),
      pm10: valid(r.pm10_ugm3_pred),
      co: coMg(r.co_ugm3_pred),
      isForecast: true,
    }));

    return [...actual, ...fc];
  }, [data.rows, forecast]);

  // Berapa banyak pembacaan terakhir yang di bawah ambang deteksi.
  const belowDetection = useMemo(() => {
    const recent = data.rows.slice(-30);
    if (!recent.length) return null;
    const count = (key: "pm25_ugm3" | "pm10_ugm3") =>
      recent.filter((r) => {
        const v = Number(r[key]);
        return Number.isFinite(v) && v < 0;
      }).length;
    return { pm25: count("pm25_ugm3"), pm10: count("pm10_ugm3"), total: recent.length };
  }, [data.rows]);

  const hasActual = data.rows.length > 0;
  const toggleSeries = (key: string) => {
    setActiveSeries((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  return (
    <div className="space-y-5 text-slate-100 sm:space-y-6">
      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={() => {
          reload();
          void loadForecast();
        }}
        refreshing={refreshing}
        source={source}
      />

      {/* Kondisi terkini: angka nyata dari sensor terakhir. */}
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium text-slate-400">
              ISPU saat ini
            </p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold font-mono tabular-nums text-white">
                {data.latest ? currentIspu.value : "-"}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: currentIspu.dot }}
              >
                {data.latest ? currentIspu.label : "Belum ada data"}
              </span>
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {data.latest
                ? `Polutan dominan ${data.dominant?.label ?? "-"}`
                : "Menunggu pembacaan sensor"}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-right">
            <div>
              <dt className="text-[10px] text-slate-400">Suhu</dt>
              <dd className="text-sm font-semibold font-mono tabular-nums text-white">
                {Number.isFinite(data.temp) ? `${data.temp.toFixed(1)} °C` : "-"}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] text-slate-400">Kelembapan</dt>
              <dd className="text-sm font-semibold font-mono tabular-nums text-white">
                {Number.isFinite(data.hum) ? `${data.hum.toFixed(1)} %` : "-"}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Forecast: data asli dari tb_forecast, bukan placeholder. */}
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">
              Forecast 60 menit
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {forecastLoading
                ? "Memuat siklus forecast"
                : forecast.length
                  ? `${forecast.length} titik dari siklus ${forecast[0] ? toWIB(forecast[0].generated_at) : "-"}`
                  : "Belum ada siklus forecast"}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {SERIES.map((s) => {
              const on = activeSeries.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => toggleSeries(s.key)}
                  aria-pressed={on}
                  className={`flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    on
                      ? "border-sky-400/40 bg-sky-500/15 text-sky-200"
                      : "border-white/10 bg-slate-800/60 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: on ? s.color : "#64748b" }}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </header>

        {forecastError ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3">
            <p className="text-[12px] text-rose-200">
              Gagal memuat forecast: {forecastError}
            </p>
            <button
              type="button"
              onClick={() => void loadForecast()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-rose-400/30 px-3 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/20"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Coba lagi
            </button>
          </div>
        ) : forecastLoading ? (
          <div className="mt-4 h-64 animate-pulse rounded-lg bg-slate-800/60" />
        ) : (
          <>
            <div className="mt-4 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combined} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    {SERIES.map((s) => (
                      <linearGradient key={s.key} id={`fc-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>

                  <CartesianGrid strokeDasharray="2 6" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="t"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #334155",
                      backgroundColor: "#0f172a",
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                    formatter={(value, name, item) => {
                      const s = SERIES.find((x) => x.key === name);
                      const phase = item?.payload?.isForecast ? "Forecast" : "aktual";
                      return [
                        `${Number(value).toFixed(2)} ${s?.unit ?? ""} (${phase})`,
                        s?.label ?? name,
                      ];
                    }}
                  />

                  {SERIES.filter((s) => activeSeries.includes(s.key)).flatMap((s) => [
                    // Garis padat: pembacaan sensor nyata.
                    <Area
                      key={`actual-${s.key}`}
                      type="monotone"
                      dataKey={(d: (typeof combined)[number]) =>
                        d.isForecast ? null : d[s.key]
                      }
                      name={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      fill="none"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />,
                    // Area transparan: Forecast model, jelas dibedakan.
                    <Area
                      key={`fc-${s.key}`}
                      type="monotone"
                      dataKey={(d: (typeof combined)[number]) =>
                        d.isForecast ? d[s.key] : null
                      }
                      name={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      fill={`url(#fc-${s.key})`}
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />,
                  ])}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda fase: garis padat vs putus-putus */}
            <div className="mt-3 flex flex-wrap items-center gap-4 text-[10px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-0.5 w-6 rounded bg-slate-300" />
                Aktual (60 menit terakhir)
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-0.5 w-6 rounded"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, #94a3b8 0 5px, transparent 5px 9px)",
                  }}
                />
                Forecast 60 menit ke depan
              </span>
            </div>

            {(() => {
              const missing = SERIES.filter(
                (s) => !forecast.some((r) => r[`${s.key}_ugm3_pred` as keyof ForecastRow] != null)
              );
              if (!missing.length) return null;

              const lastActual = data.latest;
              const sensorDead = missing.filter((s) => {
                const key = `${s.key}_ugm3` as keyof typeof lastActual;
                const v = Number(lastActual?.[key]);
                return Number.isFinite(v) && v < 0;
              });
              const modelWeak = missing.filter((s) => !sensorDead.includes(s));

              return (
                <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  {sensorDead.length > 0 && (
                    <>
                      {sensorDead.map((s) => s.label).join(", ")} tidak memiliki
                      forecast karena sensor tidak menghasilkan nilai valid.{" "}
                    </>
                  )}
                  {modelWeak.length > 0 && (
                    <>
                      {modelWeak.map((s) => s.label).join(", ")} tidak memiliki
                      forecast karena model belum lebih akurat dari sekadar
                      mengulang nilai terakhir.
                    </>
                  )}
                </p>
              );
            })()}

            {belowDetection && belowDetection.pm25 + belowDetection.pm10 > 0 && (
              <p className="mt-3 rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-[11px] leading-relaxed text-rose-200">
                Sensor debu membaca di bawah ambang deteksi pada{" "}
                {belowDetection.total} pembacaan terakhir
                {belowDetection.pm25 > 0 && ` (PM2.5: ${belowDetection.pm25}x`}
                {belowDetection.pm10 > 0 && `, PM10: ${belowDetection.pm10}x`}
                {belowDetection.pm25 + belowDetection.pm10 > 0 && ")"}.
                Garis aktualnya terputus karena nilainya tidak valid, bukan karena
                udaranya nol.
              </p>
            )}

            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 px-3 py-2">
                <dt className="text-[10px] text-slate-400">Arah {primaryLabel}</dt>
                <dd className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-white">
                  {trend ? (
                    <>
                      {trend.direction === "naik" ? (
                        <ArrowUpRight className="h-4 w-4 text-rose-400" />
                      ) : trend.direction === "turun" ? (
                        <ArrowDownRight className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Minus className="h-4 w-4 text-slate-400" />
                      )}
                      {trend.direction}
                      <span className="font-mono tabular-nums text-slate-400">
                        ({trend.delta > 0 ? "+" : ""}
                        {trend.delta.toFixed(2)})
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                </dd>
              </div>

              <div className="rounded-lg border border-white/10 px-3 py-2">
                <dt className="text-[10px] text-slate-400">Puncak {primaryLabel}</dt>
                <dd className="mt-0.5 text-[13px] font-semibold font-mono tabular-nums text-white">
                  {peak ? `${peak.v.toFixed(2)} µg/m³` : "-"}
                  {peak && (
                    <span className="ml-1 text-[10px] font-normal text-slate-400">
                      {peak.t}
                    </span>
                  )}
                </dd>
              </div>

              <div className="rounded-lg border border-white/10 px-3 py-2">
                <dt className="text-[10px] text-slate-400">Horizon</dt>
                <dd className="mt-0.5 text-[13px] font-semibold text-white">
                  {forecast.length} menit
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>

      {/* Insight dari pipeline, ditampilkan apa adanya. */}
      {(() => {
        const insight = forecast.find((r) => r.insight?.trim())?.insight;
        if (!insight) return null;
        return (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 rounded-xl border border-sky-400/25 bg-slate-900/85 p-4"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div>
              <p className="text-[11px] font-semibold text-sky-200">
                Catatan pipeline
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-300">
                {insight}
              </p>
            </div>
          </motion.section>
        );
      })()}

      <p className="px-1 text-[10px] leading-5 text-slate-400">
        Forecast dihitung model LSTM/GRU dan bersifat indikatif, bukan ISPU
        resmi. Angka berubah setiap siklus pipeline.
      </p>
    </div>
  );
}
