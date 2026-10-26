import type { KonsentrasiGas } from "@/lib/types";

/**
 * Deteksi anomali Rolling Z-Score di sisi dashboard.
 *
 * Parameter dan cara hitungnya sama dengan komponen Z-Score pada
 * pipeline analytics (analytics/src/anomaly.py):
 * - jendela acuan 60 pembacaan SEBELUM titik yang dinilai,
 * - simpangan baku sampel (n - 1),
 * - anomali bila |z| > 3,
 * - titik tanpa 60 riwayat lengkap, atau simpangan baku 0, tidak dinilai,
 * - nilai negatif diperlakukan sebagai 0 (sama dengan zero-clamping pipeline).
 *
 * Isolation Forest dan RF cross-check hanya ada di pipeline; hasil
 * akhirnya muncul sebagai alert tipe ANOMALY di halaman Peringatan.
 */

export const Z_WINDOW = 60;
export const Z_THRESHOLD = 3;

/** Minimal pembacaan beruntun bernilai sama persis agar dianggap sensor macet. */
export const OFFLINE_MIN_RUN = 10;
/** Jarak antar pembacaan yang dianggap data terlambat. */
export const OFFLINE_GAP_MS = 5 * 60_000;
/** Setelah sensor macet, kejadian dalam rentang ini dianggap efek penyalaan ulang. */
export const RECOVERY_MS = Z_WINDOW * 60_000;

export type EventLevel = "Moderat" | "Pengamatan" | "Gangguan perangkat";

export interface OfflinePeriod {
  start: string;
  end: string;
  reason: "konstan" | "terlambat";
  readings: number;
}

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
  level: EventLevel;
  others: string[]; // polutan lain yang anomali bersamaan
  device?: OfflinePeriod; // diisi bila kejadian terkait gangguan perangkat
}

export interface AnomalyResult {
  points: Record<string, AnomalyPoint[]>;
  events: AnomalyEvent[];
  offline: OfflinePeriod[];
}

/** Angka konsentrasi; kosong/invalid jadi NaN, negatif jadi 0. */
function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "") return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : NaN;
}

export function fmtDur(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${Math.max(min, 1)} menit`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} jam ${m} menit` : `${h} jam`;
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

/**
 * Periode sensor bermasalah:
 * - "konstan": semua polutan bernilai sama persis >= minRun pembacaan beruntun
 * - "terlambat": jarak dua pembacaan berurutan > maxGapMs
 */
export function detectOffline(
  rows: KonsentrasiGas[],
  keys: readonly string[],
  minRun: number = OFFLINE_MIN_RUN,
  maxGapMs: number = OFFLINE_GAP_MS
): OfflinePeriod[] {
  const out: OfflinePeriod[] = [];

  const sig = rows.map((r) => {
    const v = keys.map((k) => toNum(r[k as keyof KonsentrasiGas]));
    return v.every((x) => Number.isFinite(x)) ? v.join("|") : "";
  });

  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j + 1 < rows.length && sig[j + 1] === sig[i]) j++;

    if (sig[i] !== "" && j - i + 1 >= minRun) {
      out.push({
        start: rows[i].created_at,
        end: rows[j].created_at,
        reason: "konstan",
        readings: j - i + 1,
      });
    }

    i = j + 1;
  }

  for (let k = 1; k < rows.length; k++) {
    const gap =
      new Date(rows[k].created_at).getTime() -
      new Date(rows[k - 1].created_at).getTime();

    if (gap > maxGapMs) {
      out.push({
        start: rows[k - 1].created_at,
        end: rows[k].created_at,
        reason: "terlambat",
        readings: 0,
      });
    }
  }

  return out.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()
  );
}

/** Gabungkan titik beruntun (jarak <= maxGapMs) menjadi satu kejadian. */
function groupEvents(
  points: AnomalyPoint[],
  simultaneous: Map<string, string[]>,
  maxGapMs: number
): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];
  let group: AnomalyPoint[] = [];

  const flush = () => {
    if (!group.length) return;

    const peak = group.reduce((a, b) =>
      Math.abs(b.z) > Math.abs(a.z) ? b : a
    );

    const others = Array.from(
      new Set(
        group.flatMap((p) =>
          (simultaneous.get(p.at) ?? []).filter((k) => k !== peak.key)
        )
      )
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
      level: others.length > 0 ? "Moderat" : "Pengamatan",
      others,
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

/** Cari periode offline yang menjelaskan kejadian ini (di dalam / sesudahnya). */
function findDevicePeriod(
  e: AnomalyEvent,
  offline: OfflinePeriod[]
): OfflinePeriod | undefined {
  const s = new Date(e.start).getTime();

  return offline.find((p) => {
    const ps = new Date(p.start).getTime();
    const pe = new Date(p.end).getTime();
    const after = p.reason === "konstan" ? RECOVERY_MS : OFFLINE_GAP_MS;
    return s >= ps && s <= pe + after;
  });
}

export function detectAnomalies(
  rows: KonsentrasiGas[],
  keys: readonly string[],
  maxGapMs: number = 5 * 60_000
): AnomalyResult {
  const points: Record<string, AnomalyPoint[]> = {};
  const simultaneous = new Map<string, string[]>();

  for (const key of keys) {
    const list = rollingZScore(rows, key);
    points[key] = list;

    for (const p of list) {
      const arr = simultaneous.get(p.at) ?? [];
      arr.push(key);
      simultaneous.set(p.at, arr);
    }
  }

  const offline = detectOffline(rows, keys);

  const events = keys
    .flatMap((key) => groupEvents(points[key], simultaneous, maxGapMs))
    .map((e) => {
      const device = findDevicePeriod(e, offline);
      return device
        ? { ...e, level: "Gangguan perangkat" as const, device }
        : e;
    })
    .sort(
      (a, b) =>
        new Date(b.end).getTime() - new Date(a.end).getTime()
    );

  return { points, events, offline };
}

/* ------------------------------------------------------------------ */
/* Penjelasan kejadian (rule-based, bukan diagnosis penyebab)          */
/* ------------------------------------------------------------------ */

export interface Explanation {
  summary: string;
  causes: string[];
  confidence: "Rendah" | "Sedang" | "Tinggi";
}

function kindOf(key: string, label: string): string {
  const s = `${key} ${label}`
    .toLowerCase()
    .replace(/₂/g, "2")
    .replace(/₃/g, "3")
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, " ");

  if (s.includes("pm25")) return "pm25";
  if (s.includes("pm10")) return "pm10";
  if (s.includes("no2")) return "no2";
  if (s.includes("o3")) return "o3";
  if (/\bco\b/.test(s)) return "co";
  return "other";
}

export function explainEvent(
  e: AnomalyEvent,
  labelOf: (key: string) => string
): Explanation {
  const me = kindOf(e.key, labelOf(e.key));
  const kinds = new Set([
    me,
    ...e.others.map((k) => kindOf(k, labelOf(k))),
  ]);

  const up = e.peakZ > 0;
  const pct =
    e.baseline > 0
      ? Math.round(((e.peakValue - e.baseline) / e.baseline) * 100)
      : null;

  const summary =
    `${up ? "Naik" : "Turun"}` +
    (pct !== null ? ` sekitar ${Math.abs(pct)}% dari acuan` : "") +
    `, menyimpang ${Math.abs(e.peakZ).toFixed(1)}× simpangan baku, ` +
    `berlangsung ${e.points} titik.`;

  if (e.device) {
    const d = e.device;
    const dur = fmtDur(
      new Date(d.end).getTime() - new Date(d.start).getTime()
    );
    return {
      summary,
      causes: [
        d.reason === "konstan"
          ? `Muncul tepat setelah sensor macet (nilai konstan) ±${dur}. Kemungkinan efek pemanasan atau penyalaan ulang sensor, bukan kejadian udara.`
          : `Muncul tepat setelah data terputus ±${dur}. Kemungkinan perbedaan kondisi akibat jeda pengiriman, bukan kejadian udara.`,
      ],
      confidence: "Rendah",
    };
  }

  const causes: string[] = [];
  let score = 0;

  if (e.points === 1) {
    causes.push(
      "Hanya satu titik: pola khas noise atau gangguan sesaat pada sensor."
    );
    score -= 1;
  } else if (e.points >= 5) {
    causes.push(
      "Bertahan beberapa menit, lebih mungkin perubahan nyata daripada noise."
    );
    score += 1;
  }

  if (kinds.has("pm25") && kinds.has("pm10")) {
    causes.push(
      "PM2.5 dan PM10 menyimpang bersamaan, konsisten dengan debu, asap, atau partikel di sekitar sensor."
    );
    score += 1;
  }

  if (kinds.has("co") && kinds.has("no2")) {
    causes.push(
      "CO dan NO₂ berasal dari sensor MiCS-6814 yang sama, jadi bisa gangguan sensor atau emisi kendaraan."
    );
  }

  if (e.others.length > 0) {
    causes.push(
      "Beberapa polutan menyimpang bersamaan, lebih kuat sebagai kejadian nyata daripada gangguan satu kanal."
    );
    score += 1;
  }

  if (me === "no2" || me === "o3") {
    causes.push(
      "Sensor NO₂/O₃ belum terkalibrasi, jadi interpretasikan dengan hati-hati."
    );
    score -= 1;
  }

  if (!up) {
    causes.push(
      "Penurunan mendadak belum tentu udara membaik; bisa sensor bermasalah atau data tidak wajar."
    );
  }

  if (!causes.length) {
    causes.push(
      "Menyimpang dari pola 60 pembacaan sebelumnya; penyebab belum dapat dipastikan dari data sensor saja."
    );
  }

  return {
    summary,
    causes,
    confidence: score >= 2 ? "Tinggi" : score >= 0 ? "Sedang" : "Rendah",
  };
}