/**
 * Konfigurasi horizon perkiraan yang ditampilkan di dashboard.
 *
 * Satu-satunya tempat untuk mengubah horizon mana yang tampil dan
 * statusnya. Komponen membaca daftar ini; tidak ada angka horizon yang
 * ditulis langsung di JSX.
 *
 * Status mengikuti hasil benchmark di analytics/benchmark/results/:
 * seluruh horizon memiliki MAE lebih rendah daripada persistence dengan
 * selisih signifikan menurut block bootstrap.
 */

export type HorizonStatus = "andal" | "belum_andal";

export type ForecastHorizon = {
  /** Jarak ke depan dalam menit. */
  minutes: number;
  status: HorizonStatus;
  /** Dasar penetapan status, ditampilkan di tooltip kartu. */
  note: string;
};

export const FORECAST_HORIZONS: ForecastHorizon[] = [
  {
    minutes: 5,
    status: "andal",
    note: "Perkiraan level; MAE lebih rendah dari persistence (benchmark 7 hari).",
  },
  {
    minutes: 15,
    status: "andal",
    note: "Perkiraan level; MAE lebih rendah dari persistence (benchmark 7 hari).",
  },
  {
    minutes: 30,
    status: "andal",
    note: "Perkiraan level; MAE lebih rendah dari persistence (benchmark 7 hari).",
  },
  {
    minutes: 60,
    status: "andal",
    note: "Perkiraan level; MAE lebih rendah dari persistence (benchmark 7 hari).",
  },
];

/** Horizon yang boleh ditampilkan sebagai angka biasa. */
export function reliableHorizons(): ForecastHorizon[] {
  return FORECAST_HORIZONS.filter((h) => h.status === "andal").sort(
    (a, b) => a.minutes - b.minutes
  );
}

/** Horizon terjauh yang andal; 0 bila tidak ada. */
export function maxReliableMinutes(): number {
  const andal = reliableHorizons();
  return andal.length ? andal[andal.length - 1].minutes : 0;
}

/** Batas sumbu X: horizon andal terjauh, atau terjauh yang dikonfigurasi. */
export function chartLimitMinutes(): number {
  const andal = maxReliableMinutes();
  if (andal > 0) return andal;
  return Math.max(...FORECAST_HORIZONS.map((h) => h.minutes), 0);
}

/** True bila belum ada satu pun horizon yang tervalidasi. */
export function hasReliableHorizon(): boolean {
  return reliableHorizons().length > 0;
}
