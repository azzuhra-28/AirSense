// ============================================================
// AirSense — Brandkit & Design Tokens
//
// Satu sumber kebenaran untuk warna, bayangan, dan kategori
// kualitas udara. Dipakai lintas komponen agar tidak ada
// hard-code warna yang tersebar.
// ============================================================

/**
 * Palet status ISPU.
 *
 * `dot`   — warna solid untuk indikator kecil / garis chart
 * `soft`  — latar tipis untuk banner & pill (teks tetap gelap)
 * `ring`  — warna border halus senada
 * `label` — teks aksen di atas latar `soft`
 */
export const AQI = {
  good: {
    label: "Baik",
    dot: "#10B981",
    soft: "#ECFDF5",
    ring: "#A7F3D0",
    text: "#047857",
    hint: "Udara bersih. Aman beraktivitas di luar.",
  },
  moderate: {
    label: "Sedang",
    dot: "#F59E0B",
    soft: "#FFFBEB",
    ring: "#FDE68A",
    text: "#B45309",
    hint: "Masih aman. Kurangi aktivitas berat bila sensitif.",
  },
  unhealthy: {
    label: "Tidak Sehat",
    dot: "#EF4444",
    soft: "#FEF2F2",
    ring: "#FECACA",
    text: "#B91C1C",
    hint: "Batasi waktu di luar. Pakai masker bila perlu.",
  },
  veryUnhealthy: {
    label: "Sangat Tidak Sehat",
    dot: "#8B5CF6",
    soft: "#F5F3FF",
    ring: "#DDD6FE",
    text: "#6D28D9",
    hint: "Hindari aktivitas luar. Tutup jendela ruangan.",
  },
  hazardous: {
    label: "Berbahaya",
    dot: "#111827",
    soft: "#F3F4F6",
    ring: "#D1D5DB",
    text: "#111827",
    hint: "Tetap di dalam ruangan. Nyalakan penyaring udara.",
  },
} as const;

export type AqiKey = keyof typeof AQI;

/** Ambang batas ISPU sesuai standar KLHK. */
const AQI_BREAKPOINTS: { max: number; key: AqiKey }[] = [
  { max: 50, key: "good" },
  { max: 100, key: "moderate" },
  { max: 200, key: "unhealthy" },
  { max: 300, key: "veryUnhealthy" },
  { max: Infinity, key: "hazardous" },
];

export function aqiOf(value: number) {
  const v = Number.isFinite(value) ? value : 0;
  const found =
    AQI_BREAKPOINTS.find((b) => v <= b.max) ??
    AQI_BREAKPOINTS[AQI_BREAKPOINTS.length - 1];
  return { key: found.key, ...AQI[found.key] };
}

/** Warna chart polutan — dijaga tetap tenang di atas latar terang. */
export const POLLUTANT_COLOR = {
  pm25: "#F97316",
  pm10: "#8B5CF6",
  co: "#0EA5E9",
  no2: "#10B981",
  o3: "#6366F1",
} as const;

/**
 * Definisi polutan beserta satuan tampilan.
 *
 * CO secara konvensi kualitas udara disajikan dalam mg/m³
 * (nilai sensor ~2900 µg/m³ → 2,9 mg/m³), sedangkan partikulat
 * tetap µg/m³. `scale` mengubah nilai sensor ke satuan tampilan.
 */
export const POLLUTANTS = [
  { key: "pm25_ugm3", label: "PM2.5", unit: "µg/m³", scale: 1, color: POLLUTANT_COLOR.pm25 },
  { key: "pm10_ugm3", label: "PM10", unit: "µg/m³", scale: 1, color: POLLUTANT_COLOR.pm10 },
  { key: "co_ugm3", label: "CO", unit: "mg/m³", scale: 1 / 1000, color: POLLUTANT_COLOR.co },
  { key: "no2_ugm3", label: "NO₂", unit: "µg/m³", scale: 1, color: POLLUTANT_COLOR.no2 },
  { key: "o3_ugm3", label: "O₃", unit: "µg/m³", scale: 1, color: POLLUTANT_COLOR.o3 },
] as const;

export type PollutantKey = (typeof POLLUTANTS)[number]["key"];

/** Bayangan lembut — sengaja halus agar tidak "mengambang". */
export const SHADOW = {
  card: "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]",
  raised:
    "shadow-[0_2px_4px_rgba(15,23,42,0.05),0_16px_40px_-16px_rgba(15,23,42,0.14)]",
} as const;

/**
 * Struktur navigasi aplikasi.
 *
 * Dipakai bersama oleh Sidebar desktop dan bottom-nav mobile,
 * agar daftar menu hanya didefinisikan sekali.
 */
export const NAV = [
  { href: "/", label: "Ringkasan", icon: "gauge" },
  { href: "/analytics", label: "Analitik", icon: "trending" },
  { href: "/predict", label: "Prediksi", icon: "sparkles" },
  { href: "/history", label: "Riwayat", icon: "list" },
  { href: "/devices", label: "Perangkat", icon: "cpu" },
  { href: "/alerts", label: "Peringatan", icon: "bell" },
] as const;

export type NavItem = (typeof NAV)[number];
