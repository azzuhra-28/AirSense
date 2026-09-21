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
import { CalendarClock, LineChart as LineChartIcon } from "lucide-react";

import { getLatestForecast } from "@/lib/api";
import { aqiOf, POLLUTANT_COLOR } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import type { ForecastRow } from "@/lib/types";

const SERIES = [
  { key: "pm25", label: "PM2.5", color: POLLUTANT_COLOR.pm25 },
  { key: "pm10", label: "PM10", color: POLLUTANT_COLOR.pm10 },
  { key: "co", label: "CO", color: POLLUTANT_COLOR.co },
] as const;

export default function PredictPage() {
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        pm25: r.pm25_ispu_pred,
        pm10: r.pm10_ispu_pred,
        co: r.co_ispu_pred,
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
    };
  }, [forecast]);

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

      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              Proyeksi ISPU per polutan
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Model recurrent (LSTM/GRU) · waktu WIB
            </p>
          </div>
          <span className="flex items-center gap-3 text-[11px] text-slate-400">
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
        </header>

        <div className="mt-2 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
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
                interval={9}
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
              {SERIES.map((s) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#grad-${s.key})`}
                  dot={false}
                />
              ))}
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
