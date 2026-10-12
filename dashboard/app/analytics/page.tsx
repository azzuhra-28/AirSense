"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianGrid,
  Cell,
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
  Clock,
  Database,
  Download,
  Droplets,
  Gauge,
  Lightbulb,
  Thermometer,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSensorData } from "@/components/SensorProvider";
import { POLLUTANTS, aqiOf } from "@/lib/brand";
import { ispuOf, toWIB } from "@/lib/ispu";
import type { KonsentrasiGas } from "@/lib/types";

/* ============================================================
   Konstanta tampilan
============================================================ */

const PERIODS = [
  { label: "1 jam", minutes: 60 },
  { label: "6 jam", minutes: 360 },
  { label: "12 jam", minutes: 720 },
  { label: "Semua", minutes: 0 },
] as const;

// Batas atas kategori Baik (ISPU 50) dan Sedang (ISPU 100) per polutan,
// sama dengan breakpoint di lib/ispu.ts (satuan µg/m³, sebelum skala tampilan).
const ISPU_LIMITS: Record<string, { baik: number; sedang: number }> = {
  pm25_ugm3: { baik: 15.5, sedang: 55.4 },
  pm10_ugm3: { baik: 50, sedang: 150 },
  co_ugm3: { baik: 4000, sedang: 8000 },
  no2_ugm3: { baik: 80, sedang: 200 },
  o3_ugm3: { baik: 120, sedang: 235 },
};

function downloadCsv(rows: KonsentrasiGas[]) {
  const header = [
    "created_at",
    "pm25_ugm3",
    "pm10_ugm3",
    "co_ugm3",
    "no2_ugm3",
    "o3_ugm3",
    "temperature",
    "humidity",
  ];

  const lines = rows.map((r) =>
    header
      .map((h) => {
        const v = r[h as keyof KonsentrasiGas];
        return v === null || v === undefined ? "" : String(v);
      })
      .join(",")
  );

  const blob = new Blob([[header.join(","), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = `airsense_data_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();

  URL.revokeObjectURL(url);
}

const CARD =
  "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]";

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #E2E8F0",
  boxShadow: "0 12px 32px -16px rgba(15,23,42,0.18)",
  fontSize: 12,
  backgroundColor: "#FFFFFF",
} as const;

const HOUR_FMT = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

/* ============================================================
   Fungsi bantu
============================================================ */

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}

function hourWIB(iso: string) {
  return Number(HOUR_FMT.format(new Date(iso)));
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  const mx = mean(xs);
  const my = mean(ys);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }

  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function corrOf(
  rows: KonsentrasiGas[],
  key: string,
  envKey: "temperature" | "humidity"
) {
  const xs: number[] = [];
  const ys: number[] = [];

  for (const r of rows) {
    const x = num(r[key as keyof KonsentrasiGas]);
    const y = num(r[envKey]);

    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }

  if (xs.length < 10) return null;
  return pearson(xs, ys);
}

function describeCorr(
  r: number | null,
  envLabel: string,
  polLabel: string
) {
  if (r === null) {
    return "Data belum cukup, atau nilainya konstan pada periode ini.";
  }

  const a = Math.abs(r);

  if (a < 0.2) {
    return `${envLabel} hampir tidak berhubungan dengan ${polLabel} pada periode ini.`;
  }

  const strength = a < 0.4 ? "lemah" : a < 0.7 ? "sedang" : "kuat";
  const env = envLabel.toLowerCase();

  return r > 0
    ? `Hubungan ${strength}: saat ${env} naik, ${polLabel} cenderung naik.`
    : `Hubungan ${strength}: saat ${env} naik, ${polLabel} cenderung turun.`;
}

/* ============================================================
   Halaman
============================================================ */

export default function AnalyticsPage() {
  const { loading, failed, rows, reload, source } = useSensorData();

  const [active, setActive] = useState<string>(POLLUTANTS[0].key);
  const [minutes, setMinutes] = useState<number>(0);
  const [showLimits, setShowLimits] = useState<boolean>(false);

  const meta =
    POLLUTANTS.find((p) => p.key === active) ?? POLLUTANTS[0];
  const limits = ISPU_LIMITS[active];

  // Periode dihitung dari waktu pembacaan terakhir (bukan jam
  // sekarang), supaya tetap bermakna walau alat sedang mati.
  const activeRows = useMemo(() => {
    if (!minutes || !rows.length) return rows;

    const end = new Date(rows[rows.length - 1].created_at).getTime();
    if (!Number.isFinite(end)) return rows;

    const start = end - minutes * 60_000;

    return rows.filter(
      (r) => new Date(r.created_at).getTime() >= start
    );
  }, [rows, minutes]);

  // Seri untuk grafik tren.
  const series = useMemo(
    () =>
      activeRows.map((r) => {
        const x = num(r[active as keyof KonsentrasiGas]);

        return {
          t: toWIB(r.created_at),
          v: Number.isFinite(x) ? Math.max(0, x * meta.scale) : null,
        };
      }),
    [activeRows, active, meta.scale]
  );

  // Statistik ringkas.
  const stats = useMemo(() => {
    let max = -Infinity;
    let min = Infinity;
    let sum = 0;
    let n = 0;
    let peakAt = "";

    for (const d of series) {
      if (d.v === null) continue;

      sum += d.v;
      n += 1;

      if (d.v > max) {
        max = d.v;
        peakAt = d.t;
      }

      if (d.v < min) min = d.v;
    }

    if (!n) return null;

    return { min, max, avg: sum / n, peakAt };
  }, [series]);

  // Perubahan: rata-rata seperempat awal vs seperempat akhir.
  const trend = useMemo(() => {
    const vals = series
      .map((d) => d.v)
      .filter((v): v is number => v !== null);

    if (vals.length < 8) return null;

    const q = Math.max(2, Math.floor(vals.length / 4));
    const head = mean(vals.slice(0, q));
    const tail = mean(vals.slice(-q));

    if (head <= 0) return null;

    return ((tail - head) / head) * 100;
  }, [series]);

  // Pola per jam (WIB).
  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => ({
      s: 0,
      n: 0,
    }));

    for (const r of activeRows) {
      const x = num(r[active as keyof KonsentrasiGas]);
      const h = hourWIB(r.created_at);

      if (!Number.isFinite(x)) continue;
      if (!(h >= 0 && h < 24)) continue;

      buckets[h].s += Math.max(0, x * meta.scale);
      buckets[h].n += 1;
    }

    const data = buckets.map((b, h) => ({
      hour: h,
      label: String(h).padStart(2, "0"),
      v: b.n ? b.s / b.n : null,
    }));

    const present = data.filter(
      (d): d is { hour: number; label: string; v: number } =>
        d.v !== null
    );

    const peak = present.length
      ? present.reduce((a, b) => (b.v > a.v ? b : a))
      : null;

    return {
      data,
      peakHour: peak ? peak.hour : null,
      hoursCovered: present.length,
    };
  }, [activeRows, active, meta.scale]);

  // Kontribusi semua polutan (ISPU dari rata-rata periode).
  const contributions = useMemo(
    () =>
      POLLUTANTS.map((p) => {
        const vals = activeRows
          .map((r) => num(r[p.key as keyof KonsentrasiGas]))
          .filter(Number.isFinite);

        const avgRaw = vals.length ? mean(vals) : NaN;
        const ispu = Number.isFinite(avgRaw)
          ? ispuOf(p.key, avgRaw)
          : NaN;

        return {
          key: p.key,
          label: p.label,
          unit: p.unit,
          color: p.color,
          avg: avgRaw * p.scale,
          ispu,
          tone: aqiOf(Math.round(ispu)),
        };
      })
        .filter((c) => Number.isFinite(c.ispu))
        .sort((a, b) => b.ispu - a.ispu),
    [activeRows]
  );

  // Korelasi dengan suhu & kelembapan.
  const envTemp = useMemo(
    () => corrOf(activeRows, active, "temperature"),
    [activeRows, active]
  );

  const envHum = useMemo(
    () => corrOf(activeRows, active, "humidity"),
    [activeRows, active]
  );

  // Kualitas data (asumsi 1 pembacaan per menit).
  const quality = useMemo(() => {
    const times = activeRows
      .map((r) => new Date(r.created_at).getTime())
      .filter(Number.isFinite);

    if (times.length < 2) return null;

    const spanMin = Math.max(
      1,
      Math.round((times[times.length - 1] - times[0]) / 60_000)
    );

    const expected = spanMin + 1;

    let maxGap = 0;
    for (let i = 1; i < times.length; i++) {
      maxGap = Math.max(maxGap, (times[i] - times[i - 1]) / 60_000);
    }

    const empty = activeRows.filter(
      (r) => !Number.isFinite(num(r[active as keyof KonsentrasiGas]))
    ).length;

    return {
      actual: times.length,
      expected,
      pct: Math.min(100, (times.length / expected) * 100),
      maxGap: Math.round(maxGap),
      empty,
    };
  }, [activeRows, active]);

  const timeRangeLabel = series.length
    ? `${series[0].t} – ${series[series.length - 1].t} WIB`
    : "";

  // Ringkasan otomatis dari angka-angka di halaman ini.
  const insight = useMemo(() => {
    if (!stats) return "";

    const parts: string[] = [];

    parts.push(
      `Rata-rata ${meta.label} pada periode ini ${fmt(stats.avg)} ${meta.unit}, dengan puncak ${fmt(stats.max)} ${meta.unit} sekitar pukul ${stats.peakAt} WIB.`
    );

    if (trend !== null) {
      if (Math.abs(trend) < 5) {
        parts.push("Tren relatif stabil dari awal hingga akhir periode.");
      } else if (trend > 0) {
        parts.push(
          `Konsentrasi cenderung naik sekitar ${Math.abs(trend).toFixed(0)}% dibanding awal periode.`
        );
      } else {
        parts.push(
          `Konsentrasi cenderung turun sekitar ${Math.abs(trend).toFixed(0)}% dibanding awal periode.`
        );
      }
    }

    if (contributions.length) {
      const top = contributions[0];
      parts.push(
        `Polutan dengan kontribusi ISPU tertinggi: ${top.label} (${top.tone.label}).`
      );
    }

    return parts.join(" ");
  }, [stats, trend, contributions, meta.label, meta.unit]);

  /* ---------- LOADING ---------- */

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-10 w-56 animate-pulse rounded-xl bg-slate-200/70" />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl bg-slate-200/70"
            />
          ))}
        </div>

        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70" />
      </div>
    );
  }

  /* ---------- KOSONG / ERROR ---------- */

  if (failed || !rows.length) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-200">
          <Database className="h-6 w-6 text-emerald-600" />
        </div>

        <p className="mt-4 text-sm font-semibold text-slate-900">
          Data historis belum tersedia
        </p>

        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          Belum ada data sensor yang dapat dianalisis. Silakan coba
          memuat ulang data.
        </p>

        <button
          type="button"
          onClick={reload}
          className="mt-5 rounded-full bg-slate-900 px-5 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  /* ---------- HALAMAN UTAMA ---------- */

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Analitik & Tren"
          subtitle="Pola, kontribusi, dan hubungan antar parameter dari data sensor"
        />

        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              source === "supabase" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {source === "supabase" ? "Data sensor" : "Data demo"}
        </span>
      </div>

      {/* KONTROL */}
      <section className={`${CARD} p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Label>Parameter</Label>

            <div className="mt-2 flex flex-wrap gap-2">
              {POLLUTANTS.map((p) => {
                const on = p.key === active;

                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setActive(p.key)}
                    className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      on
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Periode</Label>

            <div className="mt-2 inline-flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              {PERIODS.map((opt) => {
                const on = minutes === opt.minutes;

                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setMinutes(opt.minutes)}
                    className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      on
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* STATISTIK */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            dark
            label="Rata-rata"
            value={fmt(stats.avg)}
            unit={meta.unit}
            sub="Periode terpilih"
          />

          <StatCard
            label="Tertinggi"
            value={fmt(stats.max)}
            unit={meta.unit}
            sub={`Pukul ${stats.peakAt} WIB`}
          />

          <StatCard
            label="Terendah"
            value={fmt(stats.min)}
            unit={meta.unit}
            sub="Nilai minimum periode"
          />

          <StatCard
            label="Perubahan"
            value={
              trend === null ? (
                "—"
              ) : (
                <span className="inline-flex items-center gap-1">
                  {trend > 0.5 && (
                    <ArrowUpRight className="h-5 w-5 text-red-500" />
                  )}
                  {trend < -0.5 && (
                    <ArrowDownRight className="h-5 w-5 text-emerald-500" />
                  )}
                  {Math.abs(trend).toFixed(1)}
                </span>
              )
            }
            unit="%"
            sub="Awal vs akhir periode"
          />
        </div>
      )}

      {/* RINGKASAN OTOMATIS */}
      {insight && (
        <section className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-200">
            <Lightbulb className="h-4 w-4" />
          </div>

          <div>
            <p className="text-[12px] font-semibold text-emerald-900">
              Ringkasan analitik
            </p>

            <p className="mt-1 text-[12px] leading-relaxed text-emerald-900/80">
              {insight}
            </p>
          </div>
        </section>
      )}

            {/* GRAFIK TREN */}
      <section className={`${CARD} p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardHead
            icon={<Activity className="h-4 w-4" />}
            title={`${meta.label} (${meta.unit})`}
            subtitle={`${series.length} titik data · ${timeRangeLabel}`}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-pressed={showLimits}
              onClick={() => setShowLimits((v) => !v)}
              className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                showLimits
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
              }`}
            >
              Batas ISPU
            </button>

            <button
              type="button"
              onClick={() => downloadCsv(activeRows)}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </button>
          </div>
        </div>

        <div className="mt-4 h-[22rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 12, right: 12, bottom: 4, left: -10 }}
            >
              <defs>
                <linearGradient id="anaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={meta.color}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={meta.color}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="2 6"
                stroke="#E2E8F0"
                vertical={false}
              />

              <XAxis
                dataKey="t"
                tick={{ fontSize: 10, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                minTickGap={32}
              />

              <YAxis
                domain={[
                  0,
                  (dataMax: number) =>
                    showLimits && limits
                      ? Math.max(dataMax, limits.baik * meta.scale * 1.2)
                      : dataMax,
                ]}
                tick={{ fontSize: 10, fill: "#94A3B8" }}
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
                cursor={{ stroke: "#CBD5E1", strokeDasharray: "4 4" }}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#0F172A", fontWeight: 600 }}
                formatter={(v) => [
                  `${fmt(Number(v))} ${meta.unit}`,
                  meta.label,
                ]}
              />

              {showLimits && limits && (
                <ReferenceLine
                  y={limits.baik * meta.scale}
                  stroke="#10B981"
                  strokeDasharray="5 5"
                  label={{
                    value: "Batas Baik",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#059669",
                  }}
                />
              )}

              {showLimits && limits && (
                <ReferenceLine
                  y={limits.sedang * meta.scale}
                  stroke="#F59E0B"
                  strokeDasharray="5 5"
                  label={{
                    value: "Batas Sedang",
                    position: "insideTopRight",
                    fontSize: 10,
                    fill: "#B45309",
                  }}
                />
              )}

              <Area
                type="monotone"
                dataKey="v"
                stroke={meta.color}
                strokeWidth={2.25}
                fill="url(#anaFill)"
                dot={false}
                connectNulls
                activeDot={{ r: 4 }}
              />

              <Brush
                dataKey="t"
                height={22}
                stroke="#CBD5E1"
                fill="#F8FAFC"
                travellerWidth={8}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>


      {/* POLA JAM + KONTRIBUSI */}
      <div className="grid gap-5 lg:grid-cols-2 sm:gap-6">
        {/* POLA PER JAM */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <CardHead
            icon={<Clock className="h-4 w-4" />}
            title="Pola per jam"
            subtitle={
              hourly.peakHour !== null
                ? `Rata-rata ${meta.label} per jam (WIB) · puncak pukul ${String(hourly.peakHour).padStart(2, "0")}:00`
                : "Belum ada data untuk pola per jam"
            }
          />

          <div className="mt-4 h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={hourly.data}
                margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
              >
                <CartesianGrid
                  strokeDasharray="2 6"
                  stroke="#E2E8F0"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "#94A3B8" }}
                  axisLine={false}
                  tickLine={false}
                  interval={2}
                />

                <YAxis
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
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
                  cursor={{ fill: "#F1F5F9" }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(l) => `Pukul ${l}:00 WIB`}
                  formatter={(v) => [
                    `${fmt(Number(v))} ${meta.unit}`,
                    "Rata-rata",
                  ]}
                />

                <Bar dataKey="v" radius={[6, 6, 0, 0]}>
                  {hourly.data.map((d) => (
                    <Cell
                      key={d.hour}
                      fill={
                        d.hour === hourly.peakHour
                          ? meta.color
                          : `${meta.color}59`
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            Dihitung dari {hourly.hoursCovered} jam yang tersedia pada
            periode terpilih. Pola harian yang lebih meyakinkan baru
            terlihat setelah data terkumpul beberapa hari.
          </p>
        </section>

        {/* KONTRIBUSI POLUTAN */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <CardHead
            icon={<Gauge className="h-4 w-4" />}
            title="Kontribusi polutan"
            subtitle="ISPU tiap polutan dari rata-rata periode"
          />

                    <ul className="mt-4 space-y-1">
            {contributions.map((c, i) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => setActive(c.key)}
                  className={`block w-full rounded-xl p-3 text-left transition-colors hover:bg-slate-50 ${
                    c.key === active
                      ? "bg-slate-50 ring-1 ring-slate-200"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />

                      {c.label}

                      {i === 0 && (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">
                          Dominan
                        </span>
                      )}
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="tabular text-[13px] font-semibold text-slate-900">
                        {Math.round(c.ispu)}
                      </span>

                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: c.tone.soft,
                          color: c.tone.text,
                        }}
                      >
                        {c.tone.label}
                      </span>
                    </span>
                  </div>

                  <div className="relative mt-2 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, c.ispu)}%`,
                        backgroundColor: c.tone.dot,
                      }}
                    />

                    <span
                      className="absolute -top-[3px] h-3 w-px bg-slate-300"
                      style={{ left: "50%" }}
                    />
                  </div>

                  <p className="mt-1 text-[10px] text-slate-400">
                    rata-rata {fmt(c.avg)} {c.unit}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[10px] leading-relaxed text-slate-400">
            Garis tengah menandai batas kategori Baik (ISPU 50). Nilai di
            sini bersifat indikatif karena memakai rata-rata periode
            terpilih; ISPU resmi memakai rata-rata 24 jam.
          </p>
        </section>
      </div>

      {/* HUBUNGAN LINGKUNGAN + KUALITAS DATA */}
      <div className="grid gap-5 lg:grid-cols-2 sm:gap-6">
        {/* HUBUNGAN LINGKUNGAN */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <CardHead
            icon={<Thermometer className="h-4 w-4" />}
            title="Hubungan dengan kondisi lingkungan"
            subtitle={`Korelasi ${meta.label} dengan suhu dan kelembapan`}
          />

          <div className="mt-5 space-y-5">
            <CorrRow
              icon={<Thermometer className="h-4 w-4" />}
              label="Suhu"
              r={envTemp}
              text={describeCorr(envTemp, "Suhu", meta.label)}
            />

            <CorrRow
              icon={<Droplets className="h-4 w-4" />}
              label="Kelembapan"
              r={envHum}
              text={describeCorr(envHum, "Kelembapan", meta.label)}
            />
          </div>

          <p className="mt-4 text-[10px] leading-relaxed text-slate-400">
            Korelasi menunjukkan keterkaitan pola, bukan sebab-akibat.
            Nilai r berkisar −1 sampai +1.
          </p>
        </section>

        {/* KUALITAS DATA */}
        <section className={`${CARD} p-5 sm:p-6`}>
          <CardHead
            icon={<Database className="h-4 w-4" />}
            title="Kualitas data"
            subtitle="Kelengkapan pembacaan pada periode terpilih"
          />

          {quality ? (
            <>
              <div className="mt-5">
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-3xl font-semibold leading-none text-slate-900">
                    {quality.pct.toFixed(0)}
                    <span className="ml-0.5 text-base text-slate-400">
                      %
                    </span>
                  </span>

                  <span className="text-[11px] text-slate-400">
                    {quality.actual} dari {quality.expected} pembacaan
                  </span>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${quality.pct}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat
                  label="Celah terpanjang"
                  value={`${quality.maxGap} menit`}
                />

                <MiniStat
                  label="Nilai kosong"
                  value={`${quality.empty} baris`}
                />
              </div>
            </>
          ) : (
            <p className="mt-5 text-[12px] text-slate-500">
              Data belum cukup untuk menilai kualitas pembacaan.
            </p>
          )}

          <p className="mt-4 text-[10px] leading-relaxed text-slate-400">
            Dengan asumsi satu pembacaan per menit. Celah panjang
            biasanya berarti perangkat sempat mati atau kehilangan
            koneksi.
          </p>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   Komponen kecil
============================================================ */

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
      {children}
    </p>
  );
}

function CardHead({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
        {icon}
      </div>

      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold text-slate-900">
          {title}
        </h2>

        {subtitle && (
          <p className="mt-0.5 truncate text-[11px] text-slate-400">
            {subtitle}
          </p>
        )}
      </div>
    </header>
  );
}

function StatCard({
  label,
  value,
  unit,
  sub,
  dark = false,
}: {
  label: string;
  value: ReactNode;
  unit: string;
  sub?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] ${
        dark
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200/80 bg-white text-slate-900"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tabular text-3xl font-semibold leading-none">
          {value}
        </span>

        <span className="text-[11px] text-slate-400">{unit}</span>
      </div>

      {sub && (
        <p className="mt-2 text-[10px] text-slate-400">{sub}</p>
      )}
    </div>
  );
}

function CorrRow({
  icon,
  label,
  r,
  text,
}: {
  icon: ReactNode;
  label: string;
  r: number | null;
  text: string;
}) {
  // Batang dua arah: mulai dari tengah, ke kanan (+) atau kiri (−).
  const width = r === null ? 0 : Math.abs(r) * 50;
  const left = r === null || r >= 0 ? 50 : 50 - width;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
          <span className="text-slate-400">{icon}</span>
          {label}
        </span>

        <span className="tabular text-[13px] font-semibold text-slate-900">
          {r === null ? "—" : `r = ${r.toFixed(2)}`}
        </span>
      </div>

      <div className="relative mt-2 h-1.5 rounded-full bg-slate-100">
        <div
          className="absolute h-full rounded-full bg-slate-900"
          style={{ left: `${left}%`, width: `${width}%` }}
        />

        <span
          className="absolute -top-[3px] h-3 w-px bg-slate-300"
          style={{ left: "50%" }}
        />
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        {text}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
      <Label>{label}</Label>

      <p className="tabular mt-1.5 text-[15px] font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}