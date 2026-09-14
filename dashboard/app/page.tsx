"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { getHistory, getLatestGas, subscribeGas } from "@/lib/api";
import { ispuOf, toWIB } from "@/lib/ispu";
import { categoryOf, type KonsentrasiGas } from "@/lib/types";

const POLLUTANTS = [
  { key: "pm25_ugm3", label: "PM2.5", unit: "µg/m³" },
  { key: "pm10_ugm3", label: "PM10", unit: "µg/m³" },
  { key: "co_ugm3", label: "CO", unit: "µg/m³" },
  { key: "no2_ugm3", label: "NO₂", unit: "µg/m³" },
  { key: "o3_ugm3", label: "O₃", unit: "µg/m³" },
] as const;

// Timeframe chart (gaya trading): jendela + bucket agregasi (rata-rata)
const TIMEFRAMES = [
  { key: "5m", label: "5 menit", windowMin: 5 * 24, bucketMin: 5 },
  { key: "15m", label: "15 menit", windowMin: 15 * 24, bucketMin: 15 },
  { key: "30m", label: "30 menit", windowMin: 30 * 24, bucketMin: 30 },
  { key: "1h", label: "1 jam", windowMin: 60 * 24, bucketMin: 60 },
  { key: "4h", label: "4 jam", windowMin: 4 * 60 * 24, bucketMin: 4 * 60 },
] as const;
type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

export default function OverviewPage() {
  const [latest, setLatest] = useState<KonsentrasiGas | null>(null);
  const [history, setHistory] = useState<KonsentrasiGas[]>([]);
  const [tf, setTf] = useState<TimeframeKey>("1h");

  useEffect(() => {
    getLatestGas().then((row) => setLatest(row ?? null)).catch(console.error);
    getHistory(TIMEFRAMES.find((t) => t.key === tf)!.windowMin).then(setHistory).catch(console.error);

    const ch = subscribeGas((row) => {
      setLatest(row);
      setHistory((prev) => [...prev.slice(-1440), row]);
    });
    return () => {
      ch.unsubscribe();
    };
  }, [tf]);

  const summary = useMemo(() => {
    if (!latest) return null;
    const vals = POLLUTANTS.map((p) => ispuOf(p.key, latest[p.key as keyof KonsentrasiGas] as number));
    const total = Math.max(...vals.filter(Number.isFinite), -1);
    const cat = categoryOf(total);
    const raw = (k: keyof KonsentrasiGas) => {
      const v = latest[k];
      return typeof v === "number" && Number.isFinite(v) && v > -100 ? v : null;
    };
    return { total: Math.round(total), cat, vals, time: latest.created_at, temp: raw("temperature"), hum: raw("humidity") };
  }, [latest]);

  const chartData = useMemo(() => {
    if (!history.length) return [];
    const tfConf = TIMEFRAMES.find((t) => t.key === tf)!;
    const now = Date.now();
    const cut = now - tfConf.windowMin * 60 * 1000;
    const BUCKET = tfConf.bucketMin * 60 * 1000;
    const buckets = new Map<number, { n: number; pm25: number; pm10: number; t0: number }>();
    for (const r of history) {
      const t = new Date(r.created_at).getTime();
      if (t < cut) continue;
      const key = Math.floor(t / BUCKET) * BUCKET;
      const b = buckets.get(key) ?? { n: 0, pm25: 0, pm10: 0, t0: key };
      b.n += 1;
      b.pm25 += r.pm25_ugm3 ?? 0;
      b.pm10 += r.pm10_ugm3 ?? 0;
      buckets.set(key, b);
    }
    return [...buckets.values()]
      .sort((a, b) => a.t0 - b.t0)
      .map((b) => ({
        t: toWIB(new Date(b.t0).toISOString()),
        pm25: Number((b.pm25 / b.n).toFixed(1)),
        pm10: Number((b.pm10 / b.n).toFixed(1)),
      }));
  }, [history, tf]);

  const isOnline = latest ? Date.now() - new Date(latest.created_at).getTime() < 3 * 60_000 : false;

  return (
    <div className="space-y-6">
      <Header latest={latest} isOnline={isOnline} />

      {summary && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            {POLLUTANTS.map((p, i) => {
              const ispu = summary.vals[i];
              const ok = Number.isFinite(ispu);
              const cat = ok ? categoryOf(ispu) : null;
              const val = latest?.[p.key];
              const valOk = typeof val === "number" && Number.isFinite(val);
              return (
                <div key={p.key} className={`rounded-2xl border border-slate-300 bg-white p-4 shadow-sm ${cat?.bg ?? "bg-slate-50"}`}>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{p.label}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{ok ? Math.round(ispu) : "—"}</span>
                    <span className="text-xs text-slate-500">ISPU</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    {valOk ? val : "—"} {p.unit}
                  </div>
                  <div className={`text-sm font-semibold ${cat?.text ?? "text-slate-500"}`}>{cat?.label ?? "—"}</div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-slate-700">Tren Polutan (PM2.5 & PM10)</h2>
                  <p className="text-xs text-slate-500">µg/m³ · rata-rata per interval · waktu WIB · update real-time</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                  {TIMEFRAMES.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTf(t.key)}
                      title={t.label}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                        tf === t.key
                          ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="t" tick={{ fontSize: 11 }} interval={tf === "5m" || tf === "15m" ? 4 : 11} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pm25" name="PM2.5" stroke="#7c3aed" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="pm10" name="PM10" stroke="#10b981" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-4">
              <SummaryCard title="Kondisi Lingkungan">
                <Row label="Suhu" value={summary.temp != null ? `${summary.temp.toFixed(1)} °C` : "—"} />
                <Row label="Kelembapan" value={summary.hum != null ? `${summary.hum.toFixed(1)} %RH` : "—"} />
              </SummaryCard>
              <SummaryCard title="ISPU Total">
                <div className={`rounded-xl px-3 py-2 text-lg font-bold ${summary.cat.bg} ${summary.cat.text}`}>
                  {summary.total} · {summary.cat.label}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  ISPU total = nilai tertinggi antar polutan · update tiap 60 detik
                </p>
              </SummaryCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Header({ latest, isOnline }: { latest: KonsentrasiGas | null; isOnline: boolean }) {
  const lastUpdate = latest
    ? new Date(latest.created_at).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      })
    : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold">Air Quality Now</h1>
        <p className="text-sm text-slate-500">
          {lastUpdate ? `Update terakhir: ${lastUpdate} WIB` : "Menunggu data..."}
        </p>
      </div>
      <span
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
          isOnline ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
        {isOnline ? "Device Online" : "Device Offline"}
      </span>
    </div>
  );
}

function SummaryCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}