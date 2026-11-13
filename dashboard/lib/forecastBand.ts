/**
 * Kuantil residual per horizon untuk pita ketidakpastian.
 *
 * Angka berasal dari benchmark offline (analytics/benchmark/) dan
 * disalin statis ke lib/data/. Dashboard tidak pernah menjalankan
 * skrip Python.
 *
 * Format JSON: { "5": {p10, p50, p90, n, tanggal_hitung}, ... }
 */

import residual from "./data/residual_quantiles.json";

export type ResidualQuantile = {
  p10: number;
  p50: number;
  p90: number;
  n: number;
  tanggal_hitung: string;
};

/** Hasil pembacaan JSON: ada atau rusak. */
export type ResidualTable = {
  ok: boolean;
  data: Record<number, ResidualQuantile>;
};

function parse(raw: unknown): ResidualTable {
  const hasil: Record<number, ResidualQuantile> = {};
  if (!raw || typeof raw !== "object") return { ok: false, data: hasil };

  for (const [kunci, nilai] of Object.entries(raw as Record<string, unknown>)) {
    const menit = Number(kunci);
    if (!Number.isFinite(menit) || menit <= 0) continue;
    if (!nilai || typeof nilai !== "object") continue;

    const v = nilai as Record<string, unknown>;
    const p10 = Number(v.p10);
    const p90 = Number(v.p90);
    const n = Number(v.n);
    if (!Number.isFinite(p10) || !Number.isFinite(p90) || p10 >= p90) continue;

    hasil[menit] = {
      p10,
      p50: Number.isFinite(Number(v.p50)) ? Number(v.p50) : 0,
      p90,
      n: Number.isFinite(n) ? n : 0,
      tanggal_hitung:
        typeof v.tanggal_hitung === "string" ? v.tanggal_hitung : "-",
    };
  }

  return { ok: Object.keys(hasil).length > 0, data: hasil };
}

export const RESIDUAL = parse(residual);

export const RESIDUAL_META = {
  /** Rentang hari data yang dipakai benchmark. */
  hariData: 7,
  catatan: "Dihitung dari 7 hari data; akan diperbarui seiring data bertambah.",
};

/**
 * Ambil kuantil pada horizon tertentu.
 *
 * Titik di antara horizon yang tersedia diinterpolasi linear. Di luar
 * jangkauan, dipakai nilai terdekat (tidak diekstrapolasi, karena
 * melebarkan tanpa dasar akan menyesatkan).
 */
export function quantileAt(minutes: number): ResidualQuantile | null {
  const tabel = RESIDUAL;
  if (!tabel.ok) return null;

  const kunci = Object.keys(tabel.data)
    .map(Number)
    .sort((a, b) => a - b);
  if (!kunci.length) return null;

  if (tabel.data[minutes]) return tabel.data[minutes];

  if (minutes <= kunci[0]) return tabel.data[kunci[0]];
  if (minutes >= kunci[kunci.length - 1]) return tabel.data[kunci[kunci.length - 1]];

  for (let i = 0; i < kunci.length - 1; i += 1) {
    const a = kunci[i];
    const b = kunci[i + 1];
    if (minutes > a && minutes < b) {
      const t = (minutes - a) / (b - a);
      const qa = tabel.data[a];
      const qb = tabel.data[b];
      return {
        p10: qa.p10 + (qb.p10 - qa.p10) * t,
        p50: qa.p50 + (qb.p50 - qa.p50) * t,
        p90: qa.p90 + (qb.p90 - qa.p90) * t,
        n: Math.round(qa.n + (qb.n - qa.n) * t),
        tanggal_hitung: qa.tanggal_hitung,
      };
    }
  }

  return null;
}

/**
 * Batas pita untuk satu titik forecast.
 *
 * Mengembalikan null bila JSON tidak tersedia; pemanggil kemudian
 * memakai fallback galat rata-rata.
 */
export function bandAt(
  level: number,
  minutes: number
): { low: number; high: number; q: ResidualQuantile } | null {
  const q = quantileAt(minutes);
  if (!q) return null;
  return {
    low: Math.max(0, level + q.p10),
    high: Math.max(0, level + q.p90),
    q,
  };
}
