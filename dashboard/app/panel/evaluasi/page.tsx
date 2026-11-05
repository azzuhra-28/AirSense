"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Info, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/lib/supabase";

type ForecastRow = {
  generated_at: string;
  forecast_at: string;
  pm25_ugm3_pred: number | null;
  pm10_ugm3_pred: number | null;
  co_ugm3_pred: number | null;
};

type ActualRow = {
  created_at: string;
  pm25_ugm3: number | null;
  pm10_ugm3: number | null;
  co_ugm3: number | null;
};

const SERIES = [
  { key: "pm25", label: "PM2.5", pred: "pm25_ugm3_pred", actual: "pm25_ugm3" },
  { key: "pm10", label: "PM10", pred: "pm10_ugm3_pred", actual: "pm10_ugm3" },
  { key: "co", label: "CO", pred: "co_ugm3_pred", actual: "co_ugm3" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];

const BUCKETS = [
  { label: "1-10 mnt", lo: 1, hi: 10 },
  { label: "11-30 mnt", lo: 11, hi: 30 },
  { label: "31-60 mnt", lo: 31, hi: 60 },
] as const;

const TOOLTIP = {
  background: "rgba(15, 23, 42, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: 10,
  fontSize: 11,
  color: "#E2E8F0",
} as const;

function toWIB(iso: string) {
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > -900 ? n : null;
}

/** Cari pembacaan aktual terdekat dalam toleransi `tolMs`. */
function nearest(
  sorted: { t: number; v: number }[],
  t: number,
  tolMs: number
): number | null {
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
    if (d <= tolMs && (!best || d < Math.abs(best.t - t))) best = sorted[i];
  }
  return best ? best.v : null;
}

function metrics(errors: number[], actuals: number[]) {
  const n = errors.length;
  if (!n) return null;
  const abs = errors.map(Math.abs);
  const mae = abs.reduce((a, b) => a + b, 0) / n;
  const rmse = Math.sqrt(errors.reduce((a, b) => a + b * b, 0) / n);

  // MAPE tidak dipakai: pada PM2.5 banyak pembacaan mendekati nol,
  // sehingga persentasenya meledak (ratusan ribu persen) dan tidak
  // bisa dibaca. nMAE membagi MAE dengan rata-rata konsentrasi, jadi
  // tetap bermakna dan sebanding antar polutan.
  const meanActual = actuals.reduce((a, b) => a + Math.abs(b), 0) / n;
  const nmae = meanActual > 1e-9 ? (mae / meanActual) * 100 : null;

  return { n, mae, rmse, nmae };
}

export default function EvaluasiPage() {
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [actual, setActual] = useState<ActualRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<SeriesKey>("pm25");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase belum dikonfigurasi.");
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

      // Urutan menurun: PostgREST memotong 1000 baris, jadi yang diambil
      // harus yang terbaru.
      const [f, a] = await Promise.all([
        supabase
          .from("tb_forecast")
          .select(
            "generated_at, forecast_at, pm25_ugm3_pred, pm10_ugm3_pred, co_ugm3_pred"
          )
          .gte("generated_at", since)
          .order("generated_at", { ascending: false })
          .limit(1000),
        supabase
          .from("tb_konsentrasi_gas")
          .select("created_at, pm25_ugm3, pm10_ugm3, co_ugm3")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (f.error) throw new Error(f.error.message);
      if (a.error) throw new Error(a.error.message);

      setForecast((f.data ?? []) as ForecastRow[]);
      setActual(((a.data ?? []) as ActualRow[]).slice().reverse());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const series = useMemo(
    () => SERIES.find((s) => s.key === active) ?? SERIES[0],
    [active]
  );

  /** Pasangkan tiap prediksi ke aktual & baseline, lalu ukur. */
  const evaluation = useMemo(() => {
    const actualSorted = actual
      .map((r) => ({
        t: new Date(r.created_at).getTime(),
        v: num(r[series.actual]),
      }))
      .filter((p): p is { t: number; v: number } => p.v !== null)
      .sort((a, b) => a.t - b.t);

    if (!actualSorted.length || !forecast.length) return null;

    const points: {
      t: number;
      gen: string;
      pred: number;
      actual: number;
      base: number;
      horizon: number;
    }[] = [];

    for (const row of forecast) {
      const pred = num(row[series.pred]);
      if (pred === null) continue;

      const tPred = new Date(row.forecast_at).getTime();
      const tGen = new Date(row.generated_at).getTime();
      const horizon = (tPred - tGen) / 60_000;
      if (horizon <= 0 || horizon > 60) continue;

      const act = nearest(actualSorted, tPred, 3 * 60_000);
      const base = nearest(actualSorted, tGen, 3 * 60_000);
      if (act === null || base === null) continue;

      points.push({ t: tPred, gen: row.generated_at, pred, actual: act, base, horizon });
    }

    if (!points.length) return null;

    // Urutkan naik supaya siklus terbaru ada di akhir, lalu ambil satu
    // siklus saja untuk kurva (tiap siklus punya 60 titik sendiri).
    points.sort((a, b) => a.t - b.t);
    const newestGen = points.reduce(
      (acc, p) => (p.gen > acc ? p.gen : acc),
      points[0].gen
    );

    const bucketOf = (h: number) =>
      BUCKETS.find((b) => h >= b.lo && h <= b.hi) ?? null;

    const rows = BUCKETS.map((b) => {
      const sel = points.filter((p) => bucketOf(p.horizon) === b);
      const model = metrics(
        sel.map((p) => p.pred - p.actual),
        sel.map((p) => p.actual)
      );
      const baseline = metrics(
        sel.map((p) => p.base - p.actual),
        sel.map((p) => p.actual)
      );
      return { ...b, model, baseline };
    }).filter((r) => r.model !== null);

    const all = metrics(
      points.map((p) => p.pred - p.actual),
      points.map((p) => p.actual)
    );
    const allBase = metrics(
      points.map((p) => p.base - p.actual),
      points.map((p) => p.actual)
    );

    const curve = points
      .filter((p) => p.gen === newestGen)
      .sort((a, b) => a.t - b.t)
      .map((p) => ({
        t: toWIB(new Date(p.t).toISOString()),
        pred: p.pred,
        actual: p.actual,
        base: p.base,
      }));

    return { rows, all, allBase, curve, total: points.length };
  }, [forecast, actual, series]);

  const best = evaluation?.all;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Evaluasi Prediksi"
        subtitle="Perbandingan forecast dengan pembacaan aktual sesudahnya, diukur di luar data training"
      />

      <div className="flex flex-wrap items-center gap-2">
        {SERIES.map((s) => (
          <button
            key={s.key}
            onClick={() => setActive(s.key)}
            className={
              active === s.key
                ? "rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/40"
                : "rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
            }
          >
            {s.label}
          </button>
        ))}
        <button
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 hover:bg-white/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Muat ulang
        </button>
      </div>

      {loading && (
        <p className="text-xs text-slate-400">Menghitung dari data Supabase...</p>
      )}

      {error && (
        <p className="rounded-lg border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}

      {!loading && !evaluation && !error && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-medium text-white">
            Belum ada pasangan prediksi dan aktual yang bisa dinilai.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            Evaluasi butuh forecast yang terbit minimal beberapa menit sebelum
            pembacaan aktualnya masuk. Selama forecast ditahan gate kualitas,
            halaman ini akan kosong. Itu bukan kegagalan pengukuran.
          </p>
        </div>
      )}

      {evaluation && best && (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "MAE", value: best.mae.toFixed(2), hint: "rata-rata selisih absolut" },
              { label: "RMSE", value: best.rmse.toFixed(2), hint: "menghukum error besar" },
              {
                label: "nMAE",
                value: best.nmae === null ? "-" : `${best.nmae.toFixed(1)}%`,
                hint: "MAE dibagi rata-rata konsentrasi",
              },
              { label: "Sampel", value: String(evaluation.total), hint: "pasangan prediksi-aktual" },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <p className="text-[10px] uppercase tracking-wide text-slate-400">
                  {m.label}
                </p>
                <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">
                  {m.value}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500">{m.hint}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="text-sm font-semibold text-white">
              Per horizon waktu
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Dibandingkan dengan baseline persistence, yaitu menahan nilai
              terakhir saat forecast dibuat.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pb-2 font-medium">Horizon</th>
                    <th className="pb-2 text-right font-medium">n</th>
                    <th className="pb-2 text-right font-medium">MAE model</th>
                    <th className="pb-2 text-right font-medium">MAE baseline</th>
                    <th className="pb-2 text-right font-medium">Selisih</th>
                  </tr>
                </thead>
                <tbody className="text-slate-200">
                  {evaluation.rows.map((r) => {
                    const m = r.model!;
                    const b = r.baseline;
                    const winning = b ? m.mae < b.mae : null;
                    const gain = b ? (1 - m.mae / b.mae) * 100 : null;
                    return (
                      <tr key={r.label} className="border-t border-white/5">
                        <td className="py-2">{r.label}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-400">
                          {m.n}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums">
                          {m.mae.toFixed(2)}
                        </td>
                        <td className="py-2 text-right font-mono tabular-nums text-slate-400">
                          {b ? b.mae.toFixed(2) : "-"}
                        </td>
                        <td
                          className={
                            winning === null
                              ? "py-2 text-right font-mono tabular-nums text-slate-400"
                              : winning
                                ? "py-2 text-right font-mono tabular-nums text-emerald-300"
                                : "py-2 text-right font-mono tabular-nums text-amber-300"
                          }
                        >
                          {gain === null ? "-" : `${gain > 0 ? "+" : ""}${gain.toFixed(0)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-sky-400/20 bg-sky-500/10 px-3 py-2 text-[11px] leading-relaxed text-sky-200">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Selisih positif berarti model lebih baik daripada menahan nilai
                terakhir. Selama angkanya negatif, forecast memang tidak
                diterbitkan ke dashboard.
              </span>
            </p>
          </section>

          {evaluation.curve.length > 2 && (
            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <h2 className="text-sm font-semibold text-white">
                Aktual vs prediksi, siklus terakhir
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Garis putus-putus adalah prediksi, garis penuh adalah pembacaan
                sensor sesudahnya.
              </p>

              <div className="mt-3 h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={evaluation.curve} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <defs>
                      <linearGradient id="evalActual" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(148,163,184,0.12)" vertical={false} />
                    <XAxis
                      dataKey="t"
                      tick={{ fill: "#94A3B8", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tick={{ fill: "#94A3B8", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={46}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP}
                      labelStyle={{ color: "#94A3B8", fontSize: 10 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      name="Aktual"
                      stroke="#38BDF8"
                      strokeWidth={2}
                      fill="url(#evalActual)"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="pred"
                      name="Prediksi"
                      stroke="#A78BFA"
                      strokeWidth={2}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
