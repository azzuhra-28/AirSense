"use client";

import { useMemo, useState } from "react";
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
  Activity,
  BarChart3,
  Database,
  Gauge,
  TrendingUp,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { POLLUTANTS } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { useSensorData } from "@/components/SensorProvider";

const LIMIT_OPTIONS = [
  { label: "30 Terakhir", value: 30 },
  { label: "60 Terakhir (1 Jam)", value: 60 },
  { label: "120 Terakhir", value: 120 },
  { label: "Semua Data", value: 0 },
] as const;

export default function AnalyticsPage() {
  const { loading, failed, rows, reload } = useSensorData();

  const [active, setActive] = useState<string>(
    POLLUTANTS[0].key
  );

  const [limit, setLimit] = useState<number>(60);

  const meta =
    POLLUTANTS.find((p) => p.key === active) ??
    POLLUTANTS[0];

  // Batasi jumlah titik sesuai pilihan.
  const activeRows = useMemo(() => {
    if (!limit || limit <= 0) return rows;

    return rows.slice(-limit);
  }, [rows, limit]);

  // Data grafik.
  const data = useMemo(
    () =>
      activeRows.map((r) => {
        const raw =
          Number(r[active as keyof typeof r]) || 0;

        const val = Math.max(
          0,
          raw * meta.scale
        );

        return {
          t: toWIB(r.created_at),
          v: val,
        };
      }),
    [activeRows, active, meta.scale]
  );

  // Statistik.
  const stats = useMemo(() => {
    const vals = data
      .map((d) => d.v)
      .filter(Number.isFinite);

    if (!vals.length) return null;

    const sum = vals.reduce(
      (a, b) => a + b,
      0
    );

    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
    };
  }, [data]);

  // Rentang waktu.
  const timeRangeLabel = useMemo(() => {
    if (!data.length) return "";

    const firstTime = data[0].t;
    const lastTime = data[data.length - 1].t;

    if (firstTime === lastTime) {
      return lastTime;
    }

    return `${firstTime} - ${lastTime} WIB`;
  }, [data]);

  /* =========================
     LOADING
  ========================= */

  if (loading) {
    return (
      <div className="space-y-5">

        <div className="h-10 w-56 animate-pulse rounded-xl bg-[#B7E4C7]/60" />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />
          <div className="h-28 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />
          <div className="h-28 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />
        </div>

        <div className="h-96 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />

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
          <Database className="h-7 w-7 text-emerald-700" />
        </div>

        <p className="mt-4 text-sm font-semibold text-emerald-950">
          Data historis belum tersedia
        </p>

        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-emerald-800/70">
          Belum terdapat data sensor yang dapat dianalisis.
          Silakan coba memuat ulang data.
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
        title="Analitik & Tren"
        subtitle="Perubahan konsentrasi polutan sepanjang periode pengamatan"
      />

      {/* =========================
          POLLUTANT SELECTOR
      ========================= */}

      <section className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-4 shadow-sm sm:p-5">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <BarChart3 className="h-5 w-5 text-emerald-700" />
            </div>

            <div>
              <h2 className="text-[13px] font-bold text-emerald-950">
                Pilih Polutan
              </h2>

              <p className="mt-0.5 text-[10px] text-emerald-800/60">
                Tentukan parameter yang ingin dianalisis
              </p>
            </div>

          </div>

          <span className="w-fit rounded-full bg-white/70 px-3 py-1 text-[10px] font-bold text-emerald-700">
            {meta.label}
          </span>

        </div>

        <div className="mt-4 flex flex-wrap gap-2">

          {POLLUTANTS.map((p) => {
            const on = p.key === active;

            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(p.key)}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition-all ${
                  on
                    ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                    : "border-emerald-100 bg-white/70 text-slate-600 hover:bg-white hover:text-emerald-700"
                }`}
              >

                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: on
                      ? "#FFFFFF"
                      : p.color,
                  }}
                />

                {p.label}

              </button>
            );
          })}

        </div>

      </section>

      {/* =========================
          SUMMARY STATISTICS
      ========================= */}

      {stats && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

          <StatBox
            icon={<TrendingUp className="h-4 w-4" />}
            label="Terendah"
            value={fmt(stats.min)}
            unit={meta.unit}
          />

          <StatBox
            icon={<Gauge className="h-4 w-4" />}
            label="Rata-rata"
            value={fmt(stats.avg)}
            unit={meta.unit}
            featured
          />

          <StatBox
            icon={<Activity className="h-4 w-4" />}
            label="Tertinggi"
            value={fmt(stats.max)}
            unit={meta.unit}
          />

        </div>
      )}

      {/* =========================
          MAIN CHART
      ========================= */}

      <section className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm sm:p-6">

        {/* CHART HEADER */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <Activity className="h-5 w-5 text-emerald-700" />
            </div>

            <div>
              <h2 className="text-[15px] font-bold text-emerald-950">
                {meta.label}
                <span className="ml-1 text-xs font-medium text-emerald-800/60">
                  ({meta.unit})
                </span>
              </h2>

              <p className="mt-0.5 text-[11px] text-emerald-800/60">
                {limit > 0 && limit < rows.length
                  ? `Menampilkan ${data.length} titik terakhir dari ${rows.length} data`
                  : `Menampilkan seluruh ${data.length} titik pembacaan`}
              </p>

            </div>

          </div>

          {/* TIME FILTER */}
          <div className="flex w-fit flex-wrap items-center gap-1 rounded-xl border border-emerald-100 bg-white/55 p-1">

            {LIMIT_OPTIONS.map((opt) => {

              const isSelected =
                limit === opt.value;

              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() =>
                    setLimit(opt.value)
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-[10px] font-semibold transition-all ${
                    isSelected
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "text-slate-500 hover:bg-white/70 hover:text-emerald-700"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}

          </div>

        </header>

        {/* TIME RANGE */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/60 px-3 py-2.5">

          <div className="flex items-center gap-2">

            <span className="h-2 w-2 rounded-full bg-emerald-500" />

            <span className="text-[10px] font-medium text-slate-500">
              Periode pengamatan
            </span>

          </div>

          <span className="text-[10px] font-semibold text-emerald-800">
            {timeRangeLabel}
          </span>

        </div>

        {/* CHART */}
        <div className="mt-4 h-80 w-full rounded-xl border border-emerald-100 bg-white/65 p-2 sm:p-3">

          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <AreaChart
              data={data}
              margin={{
                top: 12,
                right: 12,
                bottom: 4,
                left: -10,
              }}
            >

              <defs>

                <linearGradient
                  id="anaFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={meta.color}
                    stopOpacity={0.28}
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
                stroke="#DDEFE5"
                vertical={false}
              />

              <XAxis
                dataKey="t"
                tick={{
                  fontSize: 10,
                  fill: "#7C9487",
                }}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />

              <YAxis
                domain={[0, "auto"]}
                allowDataOverflow={false}
                tick={{
                  fontSize: 10,
                  fill: "#7C9487",
                }}
                axisLine={false}
                tickLine={false}
                width={42}
                tickFormatter={(val) =>
                  Math.round(val).toString()
                }
              />

              <Tooltip
                cursor={{
                  stroke: "#94B8A3",
                  strokeDasharray: "4 4",
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #D5E9DC",
                  boxShadow:
                    "0 12px 32px -16px rgba(15,23,42,0.18)",
                  fontSize: 12,
                  backgroundColor: "#FFFFFF",
                }}
                labelStyle={{
                  color: "#164E35",
                  fontWeight: 600,
                }}
                formatter={(v: number) => [
                  `${fmt(v)} ${meta.unit}`,
                  meta.label,
                ]}
              />

              <Area
                type="monotone"
                dataKey="v"
                stroke={meta.color}
                strokeWidth={2.5}
                fill="url(#anaFill)"
                dot={false}
                activeDot={{
                  r: 4,
                }}
              />

            </AreaChart>

          </ResponsiveContainer>

        </div>

        {/* CHART FOOTER */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">

          <div className="flex items-center gap-2">

            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: meta.color,
              }}
            />

            <span className="text-[11px] font-semibold text-slate-600">
              {meta.label}
            </span>

            <span className="text-[10px] text-slate-400">
              {meta.unit}
            </span>

          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">

            <Database className="h-3.5 w-3.5" />

            {data.length} titik data

          </div>

        </div>

      </section>

    </div>
  );
}

/* =========================
   STAT BOX
========================= */

function StatBox({
  icon,
  label,
  value,
  unit,
  featured = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        featured
          ? "border-emerald-300 bg-[#B7E4C7]"
          : "border-emerald-200 bg-[#B7E4C7]"
      }`}
    >

      <div className="flex items-center justify-between">

        <p className="text-[11px] font-medium text-emerald-800/70">
          {label}
        </p>

        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70 text-emerald-700">
          {icon}
        </div>

      </div>

      <p className="tabular mt-3 text-xl font-bold text-emerald-950">

        {value}

        <span className="ml-1.5 text-[10px] font-medium text-emerald-800/60">
          {unit}
        </span>

      </p>

      {featured && (
        <p className="mt-1 text-[10px] text-emerald-800/60">
          Nilai rata-rata periode terpilih
        </p>
      )}

    </div>
  );
}

/* =========================
   FORMAT NUMBER
========================= */

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";

  if (Math.abs(v) >= 100) {
    return v.toFixed(0);
  }

  return v.toFixed(1);
}