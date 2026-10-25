import type { KonsentrasiGas } from "@/lib/types";

/**
 * Deteksi anomali Rolling Z-Score di sisi dashboard.
 *
 * Parameter dan cara hitungnya sama dengan komponen Z-Score pada
 * pipeline analytics (analytics/src/anomaly.py):
 * - jendela acuan 60 pembacaan SEBELUM titik yang dinilai
 *   (titik itu sendiri tidak ikut menentukan acuannya),
 * - simpangan baku sampel (n - 1),
 * - anomali bila |z| > 3,
 * - titik tanpa 60 riwayat lengkap, atau dengan simpangan baku 0,
 *   tidak dinilai.
 *
 * Isolation Forest dan RF cross-check hanya ada di pipeline; hasil
 * akhirnya muncul sebagai alert tipe ANOMALY di halaman Peringatan.
 */

export const Z_WINDOW = 60;
export const Z_THRESHOLD = 3;

export interface AnomalyPoint {
  at: string;
  key: string;
  value: number;
  mean: number;
  z: number;
}

export interface AnomalyEvent {
  key: string;
  start: string;
  end: string;
  points: number;
  peakAt: string;
  peakValue: number;
  peakZ: number;
  baseline: number;
  level: "Moderat" | "Pengamatan";
}

export interface AnomalyResult {
  points: Record<string, AnomalyPoint[]>;
  events: AnomalyEvent[];
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Titik anomali satu polutan. `rows` harus terurut menaik menurut waktu. */
export function rollingZScore(
  rows: KonsentrasiGas[],
  key: string,
  window: number = Z_WINDOW,
  threshold: number = Z_THRESHOLD
): AnomalyPoint[] {
  const vals = rows.map((r) => toNum(r[key as keyof KonsentrasiGas]));
  const out: AnomalyPoint[] = [];

  for (let i = window; i < vals.length; i++) {
    const x = vals[i];
    if (!Number.isFinite(x)) continue;

    let sum = 0;
    let complete = true;

    for (let j = i - window; j < i; j++) {
      if (!Number.isFinite(vals[j])) {
        complete = false;
        break;
      }
      sum += vals[j];
    }

    if (!complete) continue;

    const mean = sum / window;

    let ss = 0;
    for (let j = i - window; j < i; j++) {
      ss += (vals[j] - mean) ** 2;
    }

    const std = Math.sqrt(ss / (window - 1));
    if (!(std > 0)) continue;

    const z = (x - mean) / std;

    if (Math.abs(z) > threshold) {
      out.push({ at: rows[i].created_at, key, value: x, mean, z });
    }
  }

  return out;
}

/** Gabungkan titik beruntun (jarak <= maxGapMs) menjadi satu kejadian. */
function groupEvents(
  points: AnomalyPoint[],
  simultaneous: Map<string, number>,
  maxGapMs: number
): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  let group: AnomalyPoint[] = [];

  const flush = () => {
    if (!group.length) return;

    const peak = group.reduce((a, b) =>
      Math.abs(b.z) > Math.abs(a.z) ? b : a
    );

    const concurrent = group.some(
      (p) => (simultaneous.get(p.at) ?? 0) >= 2
    );

    events.push({
      key: peak.key,
      start: group[0].at,
      end: group[group.length - 1].at,
      points: group.length,
      peakAt: peak.at,
      peakValue: peak.value,
      peakZ: peak.z,
      baseline: peak.mean,
      level: concurrent ? "Moderat" : "Pengamatan",
    });

    group = [];
  };

  for (const p of points) {
    if (group.length) {
      const gap =
        new Date(p.at).getTime() -
        new Date(group[group.length - 1].at).getTime();

      if (gap > maxGapMs) flush();
    }

    group.push(p);
  }

  flush();

  return events;
}

export function detectAnomalies(
  rows: KonsentrasiGas[],
  keys: readonly string[],
  maxGapMs: number = 5 * 60_000
): AnomalyResult {
  const points: Record<string, AnomalyPoint[]> = {};
  const simultaneous = new Map<string, number>();

  for (const key of keys) {
    const list = rollingZScore(rows, key);
    points[key] = list;

    for (const p of list) {
      simultaneous.set(p.at, (simultaneous.get(p.at) ?? 0) + 1);
    }
  }

  const events = keys
    .flatMap((key) => groupEvents(points[key], simultaneous, maxGapMs))
    .sort(
      (a, b) =>
        new Date(b.end).getTime() - new Date(a.end).getTime()
    );

  return { points, events };
}