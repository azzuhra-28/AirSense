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
import { Database } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { POLLUTANTS } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { useSensorData } from "@/components/SensorProvider";

export default function AnalyticsPage() {
  const { loading, failed, rows, reload } = useSensorData();
  const [active, setActive] = useState<string>(POLLUTANTS[0].key);

  const meta = POLLUTANTS.find((p) => p.key === active) ?? POLLUTANTS[0];

  const data = useMemo(
    () =>
      rows.map((r) => ({
        t: toWIB(r.created_at),
        v: (Number(r[active as keyof typeof r]) || 0) * meta.scale,
      })),
    [rows, active, meta.scale]
  );

  const stats = useMemo(() => {
    const vals = data.map((d) => d.v).filter(Number.isFinite);
    if (!vals.length) return null;
    const sum = vals.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...vals),
      max: Math.max(...vals),
      avg: sum / vals.length,
    };
  }, [data]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />;
  }

  if (failed || !rows.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center">
        <Database className="mx-auto h-6 w-6 text-slate-300" strokeWidth={2} />
        <p className="mt-3 text-sm font-medium text-slate-600">
          Data historis belum tersedia
        </p>
        <button
          type="button"
          onClick={reload}
          className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Analitik & Tren"
        subtitle="Perubahan konsentrasi polutan sepanjang periode pengamatan"
      />

      {/* Pemilih polutan */}
      <div className="flex flex-wrap gap-2">
        {POLLUTANTS.map((p) => {
          const on = p.key === active;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActive(p.key)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                on
                  ? "border-transparent text-white"
                  : "border-slate-200/80 bg-white/90 text-slate-600 hover:border-slate-300"
              }`}
              style={on ? { backgroundColor: p.color } : undefined}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: on ? "#fff" : p.color }}
              />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Statistik ringkas */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <StatBox label="Terendah" value={fmt(stats.min)} unit={meta.unit} />
          <StatBox label="Rata-rata" value={fmt(stats.avg)} unit={meta.unit} />
          <StatBox label="Tertinggi" value={fmt(stats.max)} unit={meta.unit} />
        </div>
      )}

      {/* Grafik utama */}
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-2">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {meta.label} ({meta.unit})
          </h2>
          <p className="mt-0.5 text-[12px] text-slate-400">
            {data.length} titik pembacaan
          </p>
        </header>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            >
              <defs>
                <linearGradient id="anaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={meta.color} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={meta.color} stopOpacity={0} />
                </linearGradient>
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
                minTickGap={32}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                axisLine={false}
                tickLine={false}
                width={44}
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
                formatter={(v: number) => [
                  `${fmt(v)} ${meta.unit}`,
                  meta.label,
                ]}
              />
              <Area
                type="monotone"
                dataKey="v"
                stroke={meta.color}
                strokeWidth={2}
                fill="url(#anaFill)"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function StatBox({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4">
      <p className="text-[12px] text-slate-400">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold text-slate-900">
        {value}{" "}
        <span className="text-[11px] font-normal text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}
