"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { fetchSkill, type Skill } from "@/lib/forecast-skill";
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

/**
 * Ambang konsentrasi PM2.5 untuk batas kategori ISPU (µg/m³).
 * Dipakai sebagai garis referensi di grafik, bukan untuk menghitung ISPU.
 */
const PM25_THRESHOLDS = [
  { value: 15.5, label: "Sedang" },
  { value: 55.4, label: "Tidak Sehat" },
  { value: 150.4, label: "Sangat Tidak Sehat" },
] as const;

/**
 * Saran tindakan per kategori ISPU. Satu tempat supaya mudah diubah
 * tanpa menyentuh JSX.
 */
const SARAN_KATEGORI: Record<string, string> = {
  Baik: "Aman beraktivitas di luar ruangan.",
  Sedang: "Aman untuk aktivitas luar, kelompok sensitif tetap waspada.",
  "Tidak Sehat": "Batasi aktivitas luar, pertimbangkan masker.",
  "Sangat Tidak Sehat": "Hindari aktivitas luar, tutup jendela.",
  Berbahaya: "Tetap di dalam ruangan, nyalakan penyaring udara.",
};

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

  const chart = useMemo(() => {
    const terakhir = data.rows.length
      ? new Date(data.rows[data.rows.length - 1].created_at).getTime()
      : 0;
    return forecast
      .filter((r) => new Date(r.forecast_at).getTime() > terakhir)
      .map((r) => ({
        t: toWIB(r.forecast_at),
        pm25: r.pm25_ugm3_pred,
        pm10: r.pm10_ugm3_pred,
        co: r.co_ugm3_pred != null ? r.co_ugm3_pred / 1000 : null,
      }));
  }, [forecast, data.rows]);

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

  /** Jumlah titik forecast yang masih di masa depan. */
  const futurePoints = useMemo(() => {
    const terakhir = data.rows.length
      ? new Date(data.rows[data.rows.length - 1].created_at).getTime()
      : 0;
    return forecast.filter(
      (r) => new Date(r.forecast_at).getTime() > terakhir
    ).length;
  }, [forecast, data.rows]);

  const currentIspu = useMemo(() => {
    const tone = aqiOf(data.ispu);
    return { value: data.ispu, ...tone };
  }, [data.ispu]);

  // Gabungan riwayat aktual dan forecast dalam satu deret waktu.
  // Ketidakpastian terukur, dipakai sebagai pita di sekitar forecast.
  const [skill, setSkill] = useState<Record<string, Skill>>({});

  useEffect(() => {
    let batal = false;
    fetchSkill(3)
      .then((s) => {
        if (!batal) setSkill(s);
      })
      .catch(() => {
        // Tanpa data evaluasi, pita tidak digambar. Garis tetap tampil.
      });
    return () => {
      batal = true;
    };
  }, []);

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
    const actual = actualRows.map((r) => {
      const nilai = valid(r.pm25_ugm3);
      return {
        iso: r.created_at,
        t: toWIB(r.created_at),
        pm25: nilai,
        pm10: valid(r.pm10_ugm3),
        co: coMg(r.co_ugm3),
        isForecast: false,
        // Pita nol pada bagian aktual supaya tidak ada isian palsu,
        // tetapi tumpukan Recharts tetap punya nilai numerik.
        bandLow: nilai,
        bandSpan: nilai == null ? null : 0,
      };
    });

    const fc = forecast
      // Hanya titik yang benar-benar di masa depan. Kalau siklus sudah
      // basi, sebagian forecast-nya jatuh di belakang pembacaan terakhir
      // dan akan tergambar menumpuk dengan garis aktual.
      .filter((r) => {
        const terakhir = actualRows.length
          ? new Date(actualRows[actualRows.length - 1].created_at).getTime()
          : 0;
        return new Date(r.forecast_at).getTime() > terakhir;
      })
      .map((r) => ({
        iso: r.forecast_at,
        t: toWIB(r.forecast_at),
        pm25: valid(r.pm25_ugm3_pred),
        pm10: valid(r.pm10_ugm3_pred),
        co: coMg(r.co_ugm3_pred),
        isForecast: true,
        bandLow: null as number | null,
        bandSpan: null as number | null,
      }));

    // Pita ketidakpastian untuk seri utama. Batasnya galat nyata dari
    // evaluasi 3 hari terakhir; kalau belum tersedia, dipakai ±1,0
    // sebagai perkiraan awal yang disebut terang-terangan di legenda.
    const galat = skill[primaryKey]?.mae ?? 1.0;
    for (const row of fc) {
      const nilai = row[primaryKey];
      if (nilai == null) continue;
      const bawah = Math.max(0, nilai - galat);
      const atas = nilai + galat;
      row.bandLow = bawah;
      row.bandSpan = atas - bawah;
    }

    // Urutkan menurut waktu asli; label "HH.mm" tidak bisa dipakai
    // mengurutkan karena tidak membawa tanggal.
    return [...actual, ...fc].sort(
      (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
    );
  }, [data.rows, forecast, skill, primaryKey]);

  /** Batas sumbu Y mengikuti data, bukan 0-24 tetap. */
  const yDomain = useMemo(() => {
    const nilai: number[] = [];
    for (const row of combined) {
      for (const s of SERIES) {
        if (!activeSeries.includes(s.key)) continue;
        const v = row[s.key];
        if (typeof v === "number" && Number.isFinite(v)) nilai.push(v);
      }
      if (typeof row.bandLow === "number") nilai.push(row.bandLow);
      if (typeof row.bandLow === "number" && typeof row.bandSpan === "number") {
        nilai.push(row.bandLow + row.bandSpan);
      }
    }
    if (!nilai.length) return [0, 10] as [number, number];

    const min = Math.min(...nilai);
    const max = Math.max(...nilai);
    const rentang = Math.max(max - min, 1);
    const pad = rentang * 0.15;
    return [
      Math.max(0, Math.floor((min - pad) * 10) / 10),
      Math.ceil((max + pad) * 10) / 10,
    ] as [number, number];
  }, [combined, activeSeries]);

  /** Titik "sekarang": akhir data aktual, awal forecast. */
  const nowLabel = useMemo(() => {
    const aktual = combined.filter((r) => !r.isForecast);
    if (aktual.length) return aktual[aktual.length - 1].t;
    const fc = combined.find((r) => r.isForecast);
    return fc ? fc.t : null;
  }, [combined]);

  /** Ambang ISPU yang masuk rentang sumbu, maksimal satu garis. */
  const thresholdLine = useMemo(() => {
    if (primaryKey !== "pm25") return null;
    const [bawah, atas] = yDomain;
    const kandidat = PM25_THRESHOLDS.filter((t) => t.value > bawah && t.value < atas);
    return kandidat.length ? kandidat[0] : null;
  }, [primaryKey, yDomain]);

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
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5 backdrop-blur-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-stretch">
          <div className="sm:border-r sm:border-white/10 sm:pr-5">
            <p className="text-[12px] font-medium text-slate-300">ISPU saat ini</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-bold font-mono tabular-nums text-white">
                {data.latest ? currentIspu.value : "-"}
              </span>
              <span
                className="text-base font-semibold"
                style={{ color: currentIspu.dot }}
              >
                {data.latest ? currentIspu.label : "Belum ada data"}
              </span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">
              {data.latest
                ? `Polutan dominan ${data.dominant?.label ?? "-"}`
                : "Menunggu pembacaan sensor"}
            </p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-slate-300">Suhu</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {Number.isFinite(data.temp) ? data.temp.toFixed(1) : "-"}
              <span className="ml-1 text-sm font-normal text-slate-300">°C</span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">pembacaan terakhir</p>
          </div>

          <div>
            <p className="text-[12px] font-medium text-slate-300">Kelembapan</p>
            <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-white">
              {Number.isFinite(data.hum) ? data.hum.toFixed(1) : "-"}
              <span className="ml-1 text-sm font-normal text-slate-300">%</span>
            </p>
            <p className="mt-1 text-[12px] text-slate-300">relatif terhadap ruang</p>
          </div>
        </div>
      </section>

      {/* Forecast: data asli dari tb_forecast, bukan placeholder. */}
      <section className="rounded-xl border border-sky-400/25 bg-slate-900/85 p-5 backdrop-blur-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-white">
              Forecast 60 menit
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-300">
              {forecastLoading
                ? "Memuat siklus forecast"
                : forecast.length
                  ? `${futurePoints} titik ke depan dari siklus ${forecast[0] ? toWIB(forecast[0].generated_at) : "-"}`
                  : "Belum ada siklus forecast"}
            </p>
            {(() => {
              // Horizon forecast hanya 60 menit. Kalau siklusnya lebih
              // tua dari itu, isinya sudah kedaluwarsa dan tidak boleh
              // ditampilkan seolah masih berlaku.
              if (!forecast.length) return null;
              const umur =
                (Date.now() - new Date(forecast[0].generated_at).getTime()) / 60_000;
              if (!Number.isFinite(umur) || umur <= 60) return null;

              return (
                <p className="mt-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2 py-1.5 text-[10px] leading-snug text-amber-200">
                  Siklus ini berumur {Math.round(umur)} menit, sedangkan
                  horizonnya hanya 60 menit. Isinya sudah kedaluwarsa; garis
                  aktual tetap ditampilkan.
                </p>
              );
            })()}
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
                <AreaChart data={combined} margin={{ top: 12, right: 12, bottom: 0, left: -14 }}>
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
                    tick={{ fontSize: 12, fill: "#cbd5e1" }}
                    axisLine={false}
                    tickLine={false}
                    interval={14}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 12, fill: "#cbd5e1" }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                    allowDecimals
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
                      const phase = item?.payload?.isForecast ? "forecast" : "aktual";
                      return [
                        `${Number(value).toFixed(2)} ${s?.unit ?? ""} (${phase})`,
                        s?.label ?? name,
                      ];
                    }}
                  />

                  {/* Ambang kategori ISPU, hanya bila masuk rentang sumbu. */}
                  {thresholdLine && (
                    <ReferenceLine
                      y={thresholdLine.value}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeOpacity={0.55}
                      label={{
                        value: `${thresholdLine.label} ≥ ${thresholdLine.value}`,
                        position: "insideTopRight",
                        fill: "#fbbf24",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Batas antara data aktual dan forecast. */}
                  {nowLabel && (
                    <ReferenceLine
                      x={nowLabel}
                      stroke="#94a3b8"
                      strokeOpacity={0.7}
                      label={{
                        value: "Sekarang",
                        position: "insideTopLeft",
                        fill: "#cbd5e1",
                        fontSize: 11,
                      }}
                    />
                  )}

                  {/* Pita ketidakpastian sebagai satu area rentang. */}
                  <Area
                    dataKey={(d: (typeof combined)[number]) =>
                      d.bandLow != null && d.bandSpan != null
                        ? [d.bandLow, d.bandLow + d.bandSpan]
                        : null
                    }
                    stroke="none"
                    fill={SERIES.find((s) => s.key === primaryKey)?.color ?? "#38bdf8"}
                    fillOpacity={0.25}
                    isAnimationActive={false}
                    activeDot={false}
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
                    // Garis putus-putus: forecast. Tanpa area isian supaya
                    // tidak terbaca sebagai kepastian.
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
                      fill="none"
                      dot={false}
                      connectNulls
                      isAnimationActive={false}
                    />,
                  ])}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Legenda fase + pita ketidakpastian */}
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-slate-300">
              <span className="flex items-center gap-2">
                <span className="h-0.5 w-6 rounded bg-slate-200" />
                Aktual (60 menit terakhir)
              </span>
              <span className="flex items-center gap-2">
                <span
                  className="h-0.5 w-6 rounded"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, #cbd5e1 0 5px, transparent 5px 9px)",
                  }}
                />
                Forecast 60 menit
              </span>
              {skill[primaryKey]?.mae != null && (
                <span className="flex items-center gap-2">
                  <span
                    className="h-3 w-6 rounded"
                    style={{
                      backgroundColor: `${SERIES.find((s) => s.key === primaryKey)?.color ?? "#38bdf8"}29`,
                    }}
                  />
                  Perkiraan rentang ±{(skill[primaryKey]?.mae ?? 0).toFixed(1)} µg/m³
                </span>
              )}
            </div>

            <p className="mt-2 text-[12px] leading-relaxed text-slate-300">
              Garis putus-putus adalah <strong className="text-white">perkiraan level</strong>,
              bukan ramalan naik-turun. Galat nyata 3 hari terakhir
              {" "}±{(skill[primaryKey]?.mae ?? 1.0).toFixed(1)} µg/m³, jadi nilainya
              diperkirakan bertahan di sekitar{" "}
              {forecast[0]?.[`${primaryKey}_ugm3_pred` as keyof ForecastRow] != null
                ? Number(forecast[0][`${primaryKey}_ugm3_pred` as keyof ForecastRow]).toFixed(1)
                : "-"}{" "}
              µg/m³.
            </p>

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
                      forecast karena riwayat data validnya belum cukup panjang
                      atau model belum lebih akurat dari sekadar mengulang nilai
                      terakhir.
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
              {/* Kesimpulan: paling menonjol, karena inilah yang dicari pembaca. */}
              <div className="rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2.5">
                <dt className="text-[12px] font-medium text-sky-200">
                  Kesimpulan {primaryLabel}
                </dt>
                <dd className="mt-1 flex items-center gap-2 text-[15px] font-bold text-white">
                  {trend ? (
                    <>
                      {trend.direction === "naik" ? (
                        <ArrowUpRight className="h-5 w-5 text-rose-400" />
                      ) : trend.direction === "turun" ? (
                        <ArrowDownRight className="h-5 w-5 text-emerald-400" />
                      ) : (
                        <Minus className="h-5 w-5 text-slate-300" />
                      )}
                      <span className="capitalize">{trend.direction}</span>
                      <span className="font-mono text-[12px] font-normal tabular-nums text-slate-300">
                        ({trend.delta > 0 ? "+" : ""}
                        {trend.delta.toFixed(2)})
                      </span>
                    </>
                  ) : (
                    "-"
                  )}
                </dd>
                <p className="mt-1 text-[12px] leading-snug text-slate-300">
                  {trend?.direction === "stabil"
                    ? "Diperkirakan bertahan pada level sekarang."
                    : trend?.direction === "naik"
                      ? "Cenderung meningkat dalam satu jam ke depan."
                      : trend?.direction === "turun"
                        ? "Cenderung menurun dalam satu jam ke depan."
                        : "Belum cukup data untuk menyimpulkan arah."}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 px-3 py-2.5">
                <dt className="text-[12px] font-medium text-slate-300">
                  Puncak {primaryLabel}
                </dt>
                <dd className="mt-1 text-[15px] font-semibold font-mono tabular-nums text-white">
                  {peak ? `${peak.v.toFixed(2)} µg/m³` : "-"}
                </dd>
                <p className="mt-1 text-[12px] text-slate-300">
                  {peak ? `pukul ${peak.t}` : "belum ada nilai"}
                </p>
              </div>

              <div className="rounded-lg border border-white/10 px-3 py-2.5">
                <dt className="text-[12px] font-medium text-slate-300">
                  Akurasi terukur
                </dt>
                <dd className="mt-1 text-[15px] font-semibold font-mono tabular-nums text-white">
                  ±{(skill[primaryKey]?.mae ?? 1.0).toFixed(1)} µg/m³
                </dd>
                <p className="mt-1 text-[12px] text-slate-300">
                  galat rata-rata 3 hari terakhir
                </p>
              </div>
            </dl>
          </>
        )}
      </section>

      {/* Insight dari pipeline + saran tindakan per kategori. */}
      {(() => {
        const insight = forecast.find((r) => r.insight?.trim())?.insight;
        const saran = SARAN_KATEGORI[currentIspu.label] ?? null;
        if (!insight && !saran) return null;

        return (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-start gap-3 rounded-xl border border-sky-400/25 bg-slate-900/85 p-4 backdrop-blur-sm"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
            <div className="space-y-1">
              <p className="text-[12px] font-semibold text-sky-200">
                Catatan pipeline
              </p>
              {saran && (
                <p className="text-[13px] leading-relaxed text-white">
                  {saran}
                </p>
              )}
              {insight && (
                <p className="text-[12px] leading-relaxed text-slate-300">
                  {insight}
                </p>
              )}
              <p className="text-[12px] leading-relaxed text-slate-400">
                Forecast bersifat indikatif, bukan ISPU resmi.
              </p>
            </div>
          </motion.section>
        );
      })()}
    </div>
  );
}
