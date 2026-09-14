// ============================================================
// TypeScript types - kontrak data AirSense
// (salinan konsisten dari docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md)
// ============================================================

export interface KonsentrasiGas {
  id: number;
  created_at: string; // ISO 8601 UTC
  pm25_ugm3: number | null;
  pm10_ugm3: number | null;
  co_ugm3: number | null;
  no2_ugm3: number | null;
  o3_ugm3: number | null;
  temperature: number | null;
  humidity: number | null;
}

export interface PrediksiKualitasUdara {
  id: number;
  created_at: string;
  pm2_5_ispu: number | null;
  pm10_ispu: number | null;
  co_ispu: number | null;
  no2_ispu: number | null;
  o3_ispu: number | null;
}

export interface ForecastRow {
  id: number;
  generated_at: string;
  forecast_at: string;
  pm25_ugm3_pred: number | null;
  pm10_ugm3_pred: number | null;
  co_ugm3_pred: number | null;
  pm25_ispu_pred: number | null;
  pm10_ispu_pred: number | null;
  co_ispu_pred: number | null;
  category: string | null;
}

export interface AlertRow {
  id: number;
  created_at: string;
  alert_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  is_active: boolean;
}

export const ISPU_CATEGORIES = {
  Baik: { min: 0, max: 50, color: "#16a34a", bg: "bg-green-100", text: "text-green-700" },
  Sedang: { min: 51, max: 100, color: "#f59e0b", bg: "bg-yellow-100", text: "text-yellow-700" },
  "Tidak Sehat": { min: 101, max: 200, color: "#ef4444", bg: "bg-red-100", text: "text-red-700" },
  "Sangat Tidak Sehat": { min: 201, max: 300, color: "#8b5cf6", bg: "bg-violet-100", text: "text-violet-700" },
  Berbahaya: { min: 301, max: Infinity, color: "#000000", bg: "bg-neutral-900", text: "text-neutral-100" },
} as const;

export type CategoryKey = keyof typeof ISPU_CATEGORIES;

export function categoryOf(ispu: number): { label: CategoryKey; color: string; bg: string; text: string } {
  const keys = Object.keys(ISPU_CATEGORIES) as CategoryKey[];
  for (const k of keys) {
    const c = ISPU_CATEGORIES[k];
    if (ispu >= c.min && ispu < c.max) {
      return { label: k, color: c.color, bg: c.bg, text: c.text };
    }
  }
  const last = keys[keys.length - 1];
  return { label: last, color: ISPU_CATEGORIES[last].color, bg: ISPU_CATEGORIES[last].bg, text: ISPU_CATEGORIES[last].text };
}