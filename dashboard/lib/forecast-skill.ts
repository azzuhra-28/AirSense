import type { ForecastRow, KonsentrasiGas } from "./types";
import { supabase } from "./supabase";

/**
 * Galat forecast yang benar-benar terjadi.
 *
 * Setiap baris forecast dicocokkan ke pembacaan sensor terdekat pada
 * waktu forecast_at, lalu dihitung MAE terhadap garis "nilai terakhir
 * dipertahankan". Angkanya dipakai untuk menampilkan ketidakpastian,
 * bukan untuk mengklaim akurasi.
 */

const SERIES = [
  { key: "pm25", pred: "pm25_ugm3_pred", actual: "pm25_ugm3", label: "PM2.5" },
  { key: "pm10", pred: "pm10_ugm3_pred", actual: "pm10_ugm3", label: "PM10" },
  { key: "co", pred: "co_ugm3_pred", actual: "co_ugm3", label: "CO" },
] as const;

const TOLERANCE_MS = 3 * 60_000;
const HORIZON_LOW = 31;
const HORIZON_HIGH = 60;

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > -900 ? n : null;
}

function nearest(sorted: { t: number; v: number }[], t: number): number | null {
  if (!sorted.length) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].t < t) lo = mid + 1;
    else hi = mid - 1;
  }
  let best: { t: number; v: number } | null = null;
  for (const i of [hi, lo]) {
    if (i < 0 || i >= sorted.length) continue;
    const d = Math.abs(sorted[i].t - t);
    if (d <= TOLERANCE_MS && (!best || d < Math.abs(best.t - t))) best = sorted[i];
  }
  return best ? best.v : null;
}

export type Skill = { mae: number | null; p90: number | null; n: number };

export function computeSkill(
  forecast: ForecastRow[],
  actual: KonsentrasiGas[]
): Record<string, Skill> {
  const hasil: Record<string, Skill> = {};

  for (const s of SERIES) {
    const aktual = actual
      .map((r) => ({ t: new Date(r.created_at).getTime(), v: num(r[s.actual]) }))
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .sort((a, b) => a.t - b.t);

    const errors: number[] = [];

    for (const row of forecast) {
      const pred = num(row[s.pred as keyof ForecastRow]);
      if (pred === null || !aktual.length) continue;

      const tPred = new Date(row.forecast_at).getTime();
      const tGen = new Date(row.generated_at).getTime();
      const horizon = (tPred - tGen) / 60_000;
      if (horizon < HORIZON_LOW || horizon > HORIZON_HIGH) continue;

      const act = nearest(aktual, tPred);
      if (act === null) continue;
      errors.push(Math.abs(pred - act));
    }

    const urut = [...errors].sort((a, b) => a - b);
    const p90 = urut.length
      ? urut[Math.min(urut.length - 1, Math.floor(urut.length * 0.9))]
      : null;

    hasil[s.key] = {
      mae: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
      p90,
      n: errors.length,
    };
  }

  return hasil;
}

export { SERIES as SKILL_SERIES };

const PAGE = 1000;

async function ambilSemua<T>(
  tabel: string,
  kolom: string,
  sejak: string,
  urut: string,
  maksHalaman = 6
): Promise<T[]> {
  if (!supabase) return [];
  const hasil: T[] = [];

  for (let i = 0; i < maksHalaman; i += 1) {
    const { data, error } = await supabase
      .from(tabel)
      .select(kolom)
      .gte(urut, sejak)
      .order(urut, { ascending: false })
      .range(i * PAGE, i * PAGE + PAGE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    hasil.push(...batch);
    if (batch.length < PAGE) break;
  }

  return hasil;
}

/**
 * Hitung galat dari data nyata beberapa hari terakhir.
 *
 * Dipakai halaman Prediksi untuk menampilkan ketidakpastian, bukan
 * untuk mengklaim akurasi. Membaca bertahap karena PostgREST memotong
 * 1000 baris per permintaan.
 */
export async function fetchSkill(hari = 3): Promise<Record<string, Skill>> {
  const sejak = new Date(Date.now() - hari * 24 * 3600_000).toISOString();

  const [fc, actual] = await Promise.all([
    ambilSemua<ForecastRow>(
      "tb_forecast",
      "generated_at,forecast_at,pm25_ugm3_pred,pm10_ugm3_pred,co_ugm3_pred",
      sejak,
      "generated_at"
    ),
    ambilSemua<KonsentrasiGas>(
      "tb_konsentrasi_gas",
      "id,created_at,pm25_ugm3,pm10_ugm3,co_ugm3",
      sejak,
      "created_at"
    ),
  ]);

  return computeSkill(fc, actual);
}
