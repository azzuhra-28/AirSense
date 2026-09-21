"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { aqiOf } from "@/lib/brand";

export interface MetricPoint {
  t: string;
  v: number;
}

interface MetricCardProps {
  label: string;
  value: number;
  unit: string;
  color: string;
  /** ISPU polutan ini, dipakai untuk warna status kecil. */
  ispu: number;
  series: MetricPoint[];
}

/**
 * Kartu metrik satu polutan.
 *
 * Menampilkan nilai saat ini, status kecil, perubahan singkat,
 * dan sparkline halus. Angka memakai lebar tetap agar tidak
 * bergeser saat update real-time.
 */
export function MetricCard({
  label,
  value,
  unit,
  color,
  ispu,
  series,
}: MetricCardProps) {
  const tone = aqiOf(ispu);

  const first = series[0]?.v;
  const last = series[series.length - 1]?.v;
  const delta =
    Number.isFinite(first) && Number.isFinite(last) && first !== 0
      ? ((last - first) / first) * 100
      : 0;
  const up = delta > 0.05;
  const down = delta < -0.05;

  const gradientId = `spark-${label.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div className="group rounded-xl border border-slate-200/80 bg-white/90 p-4 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[13px] font-medium text-slate-600">
            {label}
          </span>
        </span>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: tone.soft, color: tone.text }}
        >
          {tone.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tabular text-2xl font-semibold leading-none text-slate-900">
          {formatValue(value)}
        </span>
        <span className="text-[11px] text-slate-400">{unit}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-1 text-[11px] font-medium text-slate-400">
          {up && (
            <>
              <ArrowUpRight className="h-3.5 w-3.5 text-red-400" />
              <span className="tabular text-red-400">
                {delta.toFixed(1)}%
              </span>
            </>
          )}
          {down && (
            <>
              <ArrowDownRight className="h-3.5 w-3.5 text-emerald-500" />
              <span className="tabular text-emerald-500">
                {Math.abs(delta).toFixed(1)}%
              </span>
            </>
          )}
          {!up && !down && <span>stabil</span>}
        </span>

        <div className="h-8 w-24 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={series}
              margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={1.75}
                fill={`url(#${gradientId})`}
                isAnimationActive={false}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function formatValue(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("id-ID");
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}
