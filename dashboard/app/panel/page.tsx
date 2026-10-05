"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  TrendingUp,
  AlertTriangle,
  Activity,
  Target,
  Gauge,
  ArrowUpRight,
  Clock3,
} from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { useSensorData } from "@/components/SensorProvider";

const DEVICES = ["Node 01 — PENS"];

export default function PredictPage() {
  const data = useSensorData();
  const { refreshing, source, reload } = data;

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* HEADER */}
      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={reload}
        refreshing={refreshing}
        source={source}
      />

      {/* MODEL NOTICE */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
        </div>

        <div>
          <p className="text-sm font-semibold text-amber-900">
            Catatan Model
          </p>

          <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
            Grafik dan metrik di bawah bersifat{" "}
            <span className="font-semibold underline">
              indikatif, bukan ISPU resmi
            </span>
            . Hasil prediksi dapat meleset jika terjadi perubahan cuaca
            mendadak.
          </p>
        </div>
      </motion.div>

      {/* TOP SUMMARY */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <SummaryCard
          icon={<Activity className="h-5 w-5" />}
          title="Status Model"
          value="Aktif"
          description="Model berjalan normal"
        />

        <SummaryCard
          icon={<Clock3 className="h-5 w-5" />}
          title="Horizon Prediksi"
          value="60 Menit"
          description="Proyeksi ke depan"
        />

        <SummaryCard
          icon={<Target className="h-5 w-5" />}
          title="MAPE"
          value="5.8%"
          description="Error relatif model"
        />

        <SummaryCard
          icon={<Gauge className="h-5 w-5" />}
          title="Arah Tren"
          value="Membaik"
          description="Proyeksi 1 jam"
        />

      </div>

      {/* MAIN CONTENT */}
      <div className="grid gap-5 lg:grid-cols-3">

        {/* FORECAST */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm sm:p-6 lg:col-span-2"
        >
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70">
                  <TrendingUp className="h-5 w-5 text-emerald-700" />
                </div>

                <div>
                  <h2 className="text-[15px] font-bold text-emerald-950">
                    Forecast Polutan
                  </h2>

                  <p className="text-[12px] text-emerald-800/70">
                    60 menit ke depan
                  </p>
                </div>
              </div>
            </div>

            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/75 px-3 py-1.5 text-[11px] font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" />
              Model Aktif
            </span>

          </header>

          {/* CHART AREA */}
          <div className="mt-5 rounded-2xl border border-emerald-200/70 bg-white/70 p-4">

            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-700">
                  Proyeksi Kualitas Udara
                </p>

                <p className="mt-0.5 text-[11px] text-slate-400">
                  PM2.5 · PM10 · CO
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-700">
                  Real-time
                </span>
              </div>
            </div>

            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-emerald-200 bg-white/60 text-center">

              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B7E4C7]">
                <TrendingUp className="h-7 w-7 text-emerald-700" />
              </div>

              <p className="mt-3 text-sm font-semibold text-slate-700">
                Grafik Prediksi 60 Menit
              </p>

              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-slate-400">
                Menampilkan proyeksi kenaikan atau penurunan kadar polutan
                berdasarkan data sensor terkini.
              </p>

            </div>

          </div>

          {/* POLLUTANT MINI CARDS */}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">

            <PollutantForecast
              name="PM2.5"
              value="—"
              unit="µg/m³"
            />

            <PollutantForecast
              name="PM10"
              value="—"
              unit="µg/m³"
            />

            <PollutantForecast
              name="CO"
              value="—"
              unit="ppm"
            />

          </div>
        </motion.section>

        {/* RIGHT COLUMN */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-col gap-5"
        >

          {/* MODEL EVALUATION */}
          <div className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm">

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-emerald-950">
                  Metrik Evaluasi
                </h2>

                <p className="mt-0.5 text-[12px] text-emerald-800/70">
                  Performa model prediksi
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70">
                <Target className="h-4 w-4 text-emerald-700" />
              </div>
            </div>

            <div className="mt-4 space-y-3">

              <MetricEvalItem
                label="MAE"
                value="2.41 µg/m³"
              />

              <MetricEvalItem
                label="RMSE"
                value="3.12 µg/m³"
              />

              <MetricEvalItem
                label="MAPE"
                value="5.8%"
              />

            </div>
          </div>

          {/* TREND */}
          <div className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                <ArrowUpRight className="h-5 w-5 text-emerald-700" />
              </div>

              <div>
                <h2 className="text-[15px] font-bold text-emerald-950">
                  Arah Perubahan
                </h2>

                <p className="text-[11px] text-emerald-800/70">
                  Prediksi 1 jam ke depan
                </p>
              </div>

            </div>

            <div className="mt-4 rounded-xl bg-white/70 p-4">

              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <span className="text-sm font-bold text-emerald-700">
                  Stabil membaik
                </span>
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                Kualitas udara diproyeksikan mengalami kondisi yang
                relatif stabil dan membaik dalam 1 jam ke depan.
              </p>

            </div>

          </div>

        </motion.section>
      </div>
    </div>
  );
}

/* =========================
   SUMMARY CARD
========================= */

function SummaryCard({
  icon,
  title,
  value,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">

        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/70 text-emerald-700">
          {icon}
        </div>

      </div>

      <p className="mt-4 text-[11px] font-medium text-emerald-800/70">
        {title}
      </p>

      <p className="mt-1 text-xl font-bold text-emerald-950">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-emerald-800/70">
        {description}
      </p>
    </motion.div>
  );
}

/* =========================
   METRIC ITEM
========================= */

function MetricEvalItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-white/70 p-3">

      <span className="text-[12px] font-medium text-slate-500">
        {label}
      </span>

      <span className="tabular text-[13px] font-bold text-emerald-800">
        {value}
      </span>

    </div>
  );
}

/* =========================
   POLLUTANT FORECAST
========================= */

function PollutantForecast({
  name,
  value,
  unit,
}: {
  name: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-emerald-200/70 bg-white/65 p-3">

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">
          {name}
        </span>

        <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
      </div>

      <div className="mt-2">
        <span className="text-lg font-bold text-emerald-800">
          {value}
        </span>

        <span className="ml-1 text-[10px] text-slate-400">
          {unit}
        </span>
      </div>

      <p className="mt-1 text-[10px] text-slate-400">
        Proyeksi
      </p>

    </div>
  );
}