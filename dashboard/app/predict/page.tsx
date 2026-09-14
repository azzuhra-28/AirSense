"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { getLatestForecast } from "@/lib/api";
import { toWIB } from "@/lib/ispu";
import { categoryOf, type ForecastRow } from "@/lib/types";

export default function PredictPage() {
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getLatestForecast()
        .then((rows) => {
          if (!cancelled) setForecast(rows);
        })
        .catch((e) => {
          if (!cancelled) setError(String(e.message ?? e));
        });

    load();
    const t = setInterval(load, 5 * 60 * 1000); // auto-refresh tiap 5 menit
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const data = useMemo(
    () =>
      forecast.map((r) => ({
        t: toWIB(r.forecast_at),
        pm25: r.pm25_ispu_pred,
        pm10: r.pm10_ispu_pred,
        co: r.co_ispu_pred,
      })),
    [forecast]
  );

  const summary = useMemo(() => {
    if (!forecast.length) return null;
    const last = forecast[forecast.length - 1];
    const vals = [
      last.pm25_ispu_pred ?? 0,
      last.pm10_ispu_pred ?? 0,
      last.co_ispu_pred ?? 0,
    ];
    const total = Math.max(...vals.filter(Number.isFinite), -1);
    const cat = categoryOf(total);
    const dominant = [
      { k: "PM2.5", v: vals[0] },
      { k: "PM10", v: vals[1] },
      { k: "CO", v: vals[2] },
    ]
      .filter((x) => Number.isFinite(x.v))
      .sort((a, b) => b.v - a.v)[0];
    return {
      total: Number.isFinite(total) ? Math.round(total) : NaN,
      cat,
      dominant: dominant?.k ?? "—",
      generated: forecast[0].generated_at,
      horizon: forecast.length,
    };
  }, [forecast]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Gagal ambil data forecast: {error}
        <p className="mt-2 text-xs text-red-500">
          Pastikan tabel tb_forecast ada & pipeline sudah pernah dijalankan
          (jalankan database/migrasi_forecast_alert.sql lalu python -m src.run_pipeline).
        </p>
      </div>
    );
  }

  if (!forecast.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Belum ada data forecast. Pipeline belum dijalankan — coba nanti, atau lihat
        README di <code className="rounded bg-slate-100 px-1.5 py-0.5">analytics/</code>.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Prediksi 60 Menit</h1>
          <p className="text-sm text-slate-500">
            {summary ? `Dihasilkan: ${new Date(summary.generated).toLocaleString("id-ID")} · horizon ${summary.horizon} titik @1 menit` : ""}
          </p>
        </div>
        {summary && (
          <div className="flex items-center gap-3">
            <div className={`rounded-2xl px-5 py-3 text-center ${summary.cat.bg}`}>
              <div className={`text-2xl font-bold ${summary.cat.text}`}>
                {Number.isFinite(summary.total) ? summary.total : "—"}
              </div>
              <div className={`text-xs font-semibold ${summary.cat.text}`}>{summary.cat.label}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center shadow-sm">
              <div className="text-2xl font-bold text-slate-800">{summary.dominant}</div>
              <div className="text-xs text-slate-500">Polutan dominan</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Proyeksi ISPU per Polutan (60 menit ke depan)</h2>
        <p className="mb-3 text-xs text-slate-500">ISPU prediksi XGBoost · waktu WIB</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="gPM25" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gPM10" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gCO" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="t" tick={{ fontSize: 11 }} interval={9} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="pm25" name="PM2.5" stroke="#7c3aed" fill="url(#gPM25)" strokeWidth={2} />
              <Area type="monotone" dataKey="pm10" name="PM10" stroke="#10b981" fill="url(#gPM10)" strokeWidth={2} />
              <Area type="monotone" dataKey="co" name="CO" stroke="#f59e0b" fill="url(#gCO)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Data prediksi disimpan di tabel <code className="rounded bg-slate-100 px-1 py-0.5">tb_forecast</code>,
        diperbarui oleh pipeline <code className="rounded bg-slate-100 px-1 py-0.5">analytics</code> (XGBoost).
        Kategori = ISPU total (tertinggi antar polutan).
      </p>
    </div>
  );
}