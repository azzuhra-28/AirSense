"use client";

import { HeartPulse } from "lucide-react";

import { aqiOf } from "@/lib/brand";

/**
 * Kartu rekomendasi kesehatan.
 *
 * Menyesuaikan pesan dengan kategori ISPU saat ini. Bahasa
 * dibuat praktis, bukan jargon.
 */
export function RecommendationCard({ ispu }: { ispu: number }) {
  const tone = aqiOf(ispu);

  const advice: Record<string, string[]> = {
    Baik: [
      "Buka jendela untuk sirkulasi udara segar.",
      "Waktu yang tepat untuk aktivitas luar ruangan.",
    ],
    Sedang: [
      "Kelompok sensitif sebaiknya kurangi aktivitas berat di luar.",
      "Masih aman untuk aktivitas harian biasa.",
    ],
    "Tidak Sehat": [
      "Batasi waktu di luar ruangan, terutama siang hari.",
      "Pakai masker bila harus beraktivitas di jalan.",
    ],
    "Sangat Tidak Sehat": [
      "Hindari aktivitas luar ruangan.",
      "Tutup jendela dan nyalakan penyaring udara bila ada.",
    ],
    Berbahaya: [
      "Tetap di dalam ruangan.",
      "Ikuti arahan otoritas setempat soal kualitas udara.",
    ],
  };

  const items = advice[tone.label] ?? [];

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        backgroundColor: tone.soft,
        borderColor: tone.ring,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/70"
          style={{ color: tone.text }}
        >
          <HeartPulse className="h-4 w-4" strokeWidth={2.2} />
        </span>
        <div>
          <p
            className="text-sm font-semibold"
            style={{ color: tone.text }}
          >
            Saran Kesehatan
          </p>
          <p className="text-[11px] text-slate-500">
            Berdasarkan kondisi saat ini
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-slate-700">
        {tone.hint}
      </p>

      {items.length > 0 && (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[13px] text-slate-600">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: tone.dot }}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
