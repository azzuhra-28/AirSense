"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Database, Droplets, MapPin, Thermometer } from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { MetricCard } from "@/components/MetricCard";
import { RadialGauge } from "@/components/RadialGauge";
import { RecommendationCard } from "@/components/RecommendationCard";
import { TrendChart, type TrendPoint } from "@/components/TrendChart";
import { toWIB } from "@/lib/ispu";
import { metricSeries, useSensorData } from "@/components/SensorProvider";

const DEVICES = ["Node 01 — PENS"];

export default function OverviewPage() {
  const data = useSensorData();
  const {
    loading,
    failed,
    refreshing,
    source,
    rows,
    reload,
    pollutants,
    dominant,
  } = data;

  const trend: TrendPoint[] = useMemo(
    () =>
      rows.slice(-24).map((r) => ({
        t: toWIB(r.created_at),
        pm25: Number(r.pm25_ugm3) || 0,
        pm10: Number(r.pm10_ugm3) || 0,
      })),
    [rows]
  );

  if (loading) return <LoadingState />;
  if (failed || !dominant) return <EmptyState onRetry={reload} />;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={reload}
        refreshing={refreshing}
        source={source}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-start">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6"
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                Indeks kualitas udara
              </h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                <MapPin className="h-3.5 w-3.5" />
                {DEVICES[0]}
              </p>
            </div>
            <span
              className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                backgroundColor: data.tone.soft,
                color: data.tone.text,
              }}
            >
              {data.tone.label}
            </span>
          </header>

          <div className="mt-4">
            <RadialGauge ispu={data.ispu} />
          </div>

          <p className="mx-auto mt-4 max-w-sm text-center text-[12.5px] leading-relaxed text-slate-500">
            Ditentukan oleh{" "}
            <span className="font-medium text-slate-700">
              {dominant.label}
            </span>{" "}
            sebesar {formatNumber(dominant.display)} {dominant.unit} — polutan
            tertinggi saat ini.
          </p>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          <RecommendationCard ispu={data.ispu} />

          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              icon={<Thermometer className="h-4 w-4" strokeWidth={2.2} />}
              label="Suhu"
              value={
                Number.isFinite(data.temp) ? `${data.temp.toFixed(1)}°C` : "—"
              }
              color="#F97316"
            />
            <MiniStat
              icon={<Droplets className="h-4 w-4" strokeWidth={2.2} />}
              label="Kelembapan"
              value={
                Number.isFinite(data.hum) ? `${data.hum.toFixed(0)}%` : "—"
              }
              color="#0EA5E9"
            />
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4">
            <p className="text-[12px] font-medium text-slate-400">
              Waktu pembacaan
            </p>
            <p className="tabular mt-1 text-sm font-semibold text-slate-800">
              {formatFull(data.at)}
            </p>
          </div>
        </motion.section>
      </div>

      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-slate-700">
          Konsentrasi polutan
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pollutants.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.05 * i,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <MetricCard
                label={p.label}
                value={p.display}
                unit={p.unit}
                color={p.color}
                ispu={p.ispu}
                series={metricSeries(rows, p.key, p.unit === "mg/m³" ? 1 / 1000 : 1)}
              />
            </motion.div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">
              Tren pembacaan terakhir
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Partikulat PM2.5 dan PM10 (µg/m³)
            </p>
          </div>
          <span className="flex items-center gap-3 text-[11px] text-slate-400">
            <Legend color="#F97316" label="PM2.5" />
            <Legend color="#8B5CF6" label="PM10" />
          </span>
        </header>
        <TrendChart data={trend} />
      </section>
    </div>
  );
}

/* =========================================================
   Sub-komponen & bantu format
========================================================= */

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}14`, color }}
      >
        {icon}
      </span>
      <p className="mt-3 text-[12px] text-slate-400">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="h-80 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
      <div className="space-y-5">
        <div className="h-44 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
        <div className="h-24 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
      </div>
    </div>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-10 text-center">
      <Database className="mx-auto h-6 w-6 text-slate-300" strokeWidth={2} />
      <p className="mt-3 text-sm font-medium text-slate-600">
        Data pembacaan belum tersedia
      </p>
      <p className="mt-1 text-[12px] text-slate-400">
        Pastikan perangkat mengirim data atau berkas data contoh tersedia.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-[12px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Coba lagi
      </button>
    </div>
  );
}

function formatNumber(v: number) {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString("id-ID");
  if (Math.abs(v) >= 100) return v.toFixed(0);
  return v.toFixed(1);
}

function formatFull(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}
