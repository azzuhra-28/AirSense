"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface TrendPoint {
  t: string;
  pm25: number;
  pm10: number;
}

/**
 * Grafik tren historis PM2.5 & PM10.
 *
 * Dua area dengan gradasi lembut. Grid dibuat sangat tipis agar
 * tidak bersaing dengan garis data.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-64 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
        >
          <defs>
            <linearGradient id="trendPm25" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F97316" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#F97316" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="trendPm10" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.18} />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0} />
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
            minTickGap={28}
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
          />
          <Area
            type="monotone"
            dataKey="pm25"
            name="PM2.5"
            stroke="#F97316"
            strokeWidth={2}
            fill="url(#trendPm25)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="pm10"
            name="PM10"
            stroke="#8B5CF6"
            strokeWidth={2}
            fill="url(#trendPm10)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
