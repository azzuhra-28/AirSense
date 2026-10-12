
"use client";

import type { ReactNode } from "react";
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
    <div className="space-y-5 text-stone-800 sm:space-y-6">
      {/* HEADER */}

      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={reload}
        refreshing={refreshing}
        source={source}
      />

      {/* CATATAN MODEL */}

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-3 rounded-2xl border border-stone-300 bg-[#E7E5E4] p-4 shadow-sm"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-stone-700">
          <AlertTriangle className="h-5 w-5" />
        </div>

        <div>
          <p className="text-sm font-bold text-stone-800">
            Catatan Model
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
            Grafik dan metrik di bawah bersifat{" "}
            <span className="font-semibold underline">
              indikatif, bukan ISPU resmi
            </span>
            . Hasil prediksi dapat meleset jika terjadi perubahan cuaca
            mendadak.
          </p>
        </div>
      </motion.div>

      {/* RINGKASAN MODEL */}

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

      {/* KONTEN UTAMA */}

      <div className="grid gap-5 lg:grid-cols-3">
        {/* FORECAST */}

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-stone-300 bg-[#E7E5E4] p-5 shadow-sm sm:p-6 lg:col-span-2"
        >
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-700 shadow-sm">
                <TrendingUp className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-[15px] font-bold text-stone-800">
                  Forecast Polutan
                </h2>
                <p className="text-[12px] text-stone-500">
                  60 menit ke depan
                </p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600">
              <Sparkles className="h-3.5 w-3.5" />
              Model Aktif
            </span>
          </header>

          {/* AREA GRAFIK */}

          <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-stone-700">
                  Proyeksi Kualitas Udara
                </p>
                <p className="mt-0.5 text-[11px] text-stone-400">
                  PM2.5 · PM10 · CO
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-semibold text-stone-600">
                  Real-time
                </span>
              </div>
            </div>

            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-[#F8F7F6] px-5 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E7E5E4] text-stone-700">
                <TrendingUp className="h-7 w-7" />
              </div>

              <p className="mt-3 text-sm font-semibold text-stone-700">
                Grafik Prediksi 60 Menit
              </p>

              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-stone-500">
                Menampilkan proyeksi kenaikan atau penurunan kadar polutan
                berdasarkan data sensor terkini.
              </p>

              <span className="mt-3 rounded-full border border-stone-200 bg-white px-3 py-1 text-[10px] text-stone-500">
                Visualisasi prediksi belum tersedia pada komponen ini
              </span>
            </div>
          </div>

          {/* RINGKASAN POLUTAN */}

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

        {/* KOLOM KANAN */}

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-col gap-5"
        >
          {/* METRIK EVALUASI */}

          <div className="rounded-2xl border border-stone-300 bg-[#E7E5E4] p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[15px] font-bold text-stone-800">
                  Metrik Evaluasi
                </h2>
                <p className="mt-0.5 text-[12px] text-stone-500">
                  Performa model prediksi
                </p>
              </div>

              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-stone-700">
                <Target className="h-4 w-4" />
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

            <p className="mt-3 text-[10px] leading-relaxed text-stone-500">
              Nilai evaluasi mengikuti angka yang tercantum pada kode
              sebelumnya. Pastikan nilainya sesuai hasil pengujian model.
            </p>
          </div>

          {/* ARAH PERUBAHAN */}

          <div className="rounded-2xl border border-stone-300 bg-[#E7E5E4] p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-stone-700">
                <ArrowUpRight className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-[15px] font-bold text-stone-800">
                  Arah Perubahan
                </h2>
                <p className="text-[11px] text-stone-500">
                  Prediksi 1 jam ke depan
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />

                <span className="text-sm font-bold text-stone-700">
                  Stabil membaik
                </span>
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-stone-600">
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
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-stone-300 bg-[#E7E5E4] p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-stone-700 shadow-sm">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-[11px] font-medium text-stone-500">
        {title}
      </p>

      <p className="mt-1 text-xl font-bold text-stone-800">
        {value}
      </p>

      <p className="mt-1 text-[11px] text-stone-500">
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
    <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-3">
      <span className="text-[12px] font-medium text-stone-500">
        {label}
      </span>

      <span className="text-[13px] font-bold tabular-nums text-stone-800">
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
    <div className="rounded-xl border border-stone-200 bg-white p-3 transition hover:shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-stone-700">
          {name}
        </span>

        <TrendingUp className="h-3.5 w-3.5 text-stone-500" />
      </div>

      <div className="mt-2">
        <span className="text-lg font-bold text-stone-800">
          {value}
        </span>

        <span className="ml-1 text-[10px] text-stone-400">
          {unit}
        </span>
      </div>

      <p className="mt-1 text-[10px] text-stone-400">
        Proyeksi
      </p>
    </div>
  );
}
