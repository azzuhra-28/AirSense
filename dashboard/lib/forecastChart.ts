/**
 * Fungsi murni untuk menyiapkan data grafik dan kartu horizon.
 *
 * Dipisahkan dari komponen supaya bisa diverifikasi tanpa render.
 */

import { bandAt, RESIDUAL, RESIDUAL_META } from "./forecastBand";

export type ChartPoint = {
  ts: number;
  pm25: number | null;
  pm10: number | null;
  co: number | null;
  isForecast: boolean;
};

export type ForecastSample = {
  ts: number;
  minutes: number;
  level: number;
};

/**
 * Ambil satu titik forecast per 5 menit.
 *
 * Dipilih mengambil titik terdekat dengan kelipatan 5 menit, bukan
 * merata-ratakan blok. Alasannya: nilai forecast pada menit ke-k adalah
 * level yang sama untuk seluruh horizon, sehingga merata-ratakan blok
 * hanya menghasilkan angka yang sama. Mengambil titik per 5 menit juga
 * menjaga nilai grafik identik dengan nilai kartu pada horizon yang
 * sama.
 */
export function sampleEvery5Minutes(
  points: { ts: number; minutes: number; level: number }[]
): ForecastSample[] {
  const hasil: ForecastSample[] = [];
  for (const p of points) {
    if (p.minutes <= 0) continue;
    if (p.minutes % 5 === 0) hasil.push(p);
  }
  return hasil.sort((a, b) => a.minutes - b.minutes);
}

export type HorizonCard = {
  minutes: number;
  ts: number;
  /** Jam WIB tujuan. */
  jamTujuan: string;
  level: number;
  delta: number | null;
  low: number | null;
  high: number | null;
  /** Label sumber pita. */
  bandLabel: string;
  /** Tooltip pita: tanggal hitung dan jumlah sampel. */
  bandDetail: string | null;
  kategori: string;
  warna: string;
  catatan: string;
};

/**
 * Bangun pita untuk satu titik forecast.
 *
 * Sumber utama: kuantil residual dari benchmark (cakupan sekitar 80%).
 * Kuantil itu hanya dihitung untuk PM2.5, jadi polutan lain wajib memakai
 * fallback galat rata-rata — memakai kuantil PM2.5 untuk CO akan
 * melebarkan pita sekitar 1000x karena satuannya berbeda.
 *
 * Fallback: galat rata-rata (MAE) dengan label berbeda, supaya pembaca
 * tidak menyangka itu interval statistik.
 */
export function bandFor(
  level: number,
  minutes: number,
  fallbackMae: number | null,
  pakaiKuantil = true
): { low: number | null; high: number | null; label: string; detail: string | null } {
  const b = pakaiKuantil ? bandAt(level, minutes) : null;
  if (b) {
    return {
      low: b.low,
      high: b.high,
      label: "Rentang ±, cakupan sekitar 80%",
      detail: `Kuantil residual benchmark ${b.q.tanggal_hitung} · n=${b.q.n.toLocaleString("id-ID")}`,
    };
  }

  if (fallbackMae != null && Number.isFinite(fallbackMae)) {
    return {
      low: Math.max(0, level - fallbackMae),
      high: level + fallbackMae,
      label: "Galat rata-rata",
      detail: "Data kuantil tidak tersedia; memakai galat rata-rata terukur.",
    };
  }

  return { low: null, high: null, label: "Rentang tidak tersedia", detail: null };
}

/** True bila pita memakai kuantil benchmark, bukan fallback. */
export function usingQuantiles(): boolean {
  return RESIDUAL.ok;
}

export const BAND_META = RESIDUAL_META;
