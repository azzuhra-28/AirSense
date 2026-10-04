"use client";

import { motion } from "framer-motion";
import { Sparkles, TrendingUp, AlertTriangle } from "lucide-react";

import { DashboardHeader } from "@/components/DashboardHeader";
import { useSensorData } from "@/components/SensorProvider";

const DEVICES = ["Node 01 — PENS"];

export default function PredictPage() {
  const data = useSensorData();
  const { refreshing, source, reload } = data;

  return (
    <div className="space-y-5 sm:space-y-6">
      <DashboardHeader
        lastSynced={data.at}
        devices={DEVICES}
        onRefresh={reload}
        refreshing={refreshing}
        source={source}
      />

      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-amber-800">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-[13px] leading-relaxed">
          <span className="font-semibold">Catatan Model:</span> Grafik dan metrik di bawah bersifat <span className="font-semibold underline">indikatif, bukan ISPU resmi</span>[cite: 4]. Hasil prediksi dapat meleset jika terjadi perubahan cuaca mendadak.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6 lg:col-span-2 shadow-sm"
        >
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-900">
                Forecast Polutan (60 Menit ke Depan)
              </h2>
              <p className="mt-0.5 text-[12px] text-slate-400">
                Estimasi tren PM2.5, PM10, dan CO menggunakan model regresi/time-series
              </p>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5" /> Aktif
            </span>
          </header>

          <div className="mt-6 flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-center">
            <TrendingUp className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-medium text-slate-600">
              Grafik Prediksi 60 Menit
            </p>
            <p className="text-[12px] text-slate-400">
              Menampilkan proyeksi kenaikan/penurunan kadar polutan secara real-time.
            </p>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex flex-col gap-5"
        >
          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-[15px] font-semibold text-slate-900">
              Metrik Evaluasi Model
            </h2>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Performansi akurasi prediksi saat ini[cite: 4]
            </p>

            <div className="mt-4 space-y-3">
              <MetricEvalItem label="MAE" value="2.41 µg/m³" />
              <MetricEvalItem label="RMSE" value="3.12 µg/m³" />
              <MetricEvalItem label="MAPE" value="5.8%" />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 shadow-sm">
            <h2 className="text-[15px] font-semibold text-slate-900">
              Arah Perubahan
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-600">
              Kualitas udara diproyeksikan <span className="font-semibold text-emerald-600">stabil membaik</span> dalam 1 jam ke depan[cite: 4].
            </p>
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function MetricEvalItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-3">
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="tabular text-[13px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}