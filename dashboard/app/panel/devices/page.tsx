"use client";

import { useMemo } from "react";
import {
  Activity,
  Cpu,
  Database,
  Radio,
  Thermometer,
  WifiOff,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSensorData } from "@/components/SensorProvider";
import { POLLUTANTS } from "@/lib/brand";
import {
  DEVICE_DESCRIPTION,
  DEVICE_STATUS_META,
} from "@/lib/device";

const SENSORS = [
  {
    name: "ESP32",
    role: "Pengendali utama",
    detail: "Mengumpulkan & mengirim data tiap menit",
    icon: Cpu,
  },
  {
    name: "GP2Y1010AU0F",
    role: "Sensor partikulat",
    detail: "Mengukur PM2.5 dan PM10",
    icon: Activity,
  },
  {
    name: "MiCS-6814",
    role: "Sensor gas",
    detail: "Mengukur CO, NO₂, dan O₃",
    icon: Radio,
  },
  {
    name: "DHT22",
    role: "Sensor lingkungan",
    detail: "Mengukur suhu dan kelembapan",
    icon: Thermometer,
  },
];

export default function DevicesPage() {
  const {
    loading,
    failed,
    rows,
    at,
    status,
    statusText,
    lastSeenMinutes,
    reload,
  } = useSensorData();

  const meta = DEVICE_STATUS_META[status];

  // Ringkasan aktivitas kirim data per jam (6 jam terakhir).
  const activity = useMemo(() => {
    if (!rows.length) return [];
    const now = Date.now();
    const buckets = Array.from({ length: 6 }, (_, i) => ({
      label: `-${5 - i}j`,
      count: 0,
    }));
    const hourMs = 3_600_000;

    for (const r of rows) {
      const t = new Date(r.created_at).getTime();
      if (!Number.isFinite(t)) continue;
      const ageH = (now - t) / hourMs;
      const idx = 5 - Math.floor(ageH);
      if (idx >= 0 && idx < 6) buckets[idx].count += 1;
    }
    return buckets;
  }, [rows]);

  const maxCount = Math.max(...activity.map((a) => a.count), 1);

  if (loading) {
    return (
      <div className="h-96 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Perangkat"
        subtitle="Pemantauan status node dan sensor penyusunnya"
      />

      {/* Status node */}
      <section
        className="rounded-2xl border p-5 sm:p-6"
        style={{
          backgroundColor: meta.soft,
          borderColor: meta.ring,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/70"
              style={{ color: meta.text }}
            >
              {status === "offline" ? (
                <WifiOff className="h-5 w-5" strokeWidth={2.2} />
              ) : (
                <Radio className="h-5 w-5" strokeWidth={2.2} />
              )}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Node 01 — PENS
                </p>
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    backgroundColor: "#FFFFFF",
                    color: meta.text,
                  }}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {statusText}
              </p>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[11px] text-slate-400">Data terakhir</p>
            <p className="tabular text-[13px] font-semibold text-slate-800">
              {at
                ? new Date(at).toLocaleString("id-ID", {
                    timeStyle: "short",
                    dateStyle: "medium",
                    timeZone: "Asia/Jakarta",
                  })
                : "—"}
            </p>
            {lastSeenMinutes !== null && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {formatAge(lastSeenMinutes)}
              </p>
            )}
          </div>
        </div>

        {/* Aktivitas kirim data (6 jam terakhir) */}
        {activity.length > 0 && (
          <div className="mt-5 border-t border-white/60 pt-4">
            <p className="mb-2 text-[11px] font-medium text-slate-400">
              Aktivitas pengiriman data — 6 jam terakhir
            </p>
            <div className="flex items-end gap-1.5" aria-hidden>
              {activity.map((b, i) => (
                <div key={i} className="flex-1">
                  <div
                    className="w-full rounded-sm transition-all"
                    style={{
                      height: `${Math.max(4, (b.count / maxCount) * 36)}px`,
                      backgroundColor:
                        b.count === 0 ? "#E2E8F0" : meta.dot,
                      opacity: b.count === 0 ? 1 : 0.75,
                    }}
                  />
                  <p className="mt-1 text-center text-[9px] text-slate-400">
                    {b.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {failed && (
          <div className="mt-4 flex items-center justify-between rounded-lg bg-white/70 px-3 py-2">
            <p className="text-[12px] text-slate-600">
              Gagal terhubung ke basis data.
            </p>
            <button
              type="button"
              onClick={reload}
              className="text-[12px] font-medium text-slate-700 underline-offset-2 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        )}
      </section>

      {/* Daftar sensor */}
      <section>
        <h2 className="mb-3 text-[13px] font-semibold text-slate-700">
          Sensor terpasang
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SENSORS.map((s) => {
            const Icon = s.icon;
            const sensorOk = status !== "offline";
            return (
              <div
                key={s.name}
                className="flex items-start gap-3.5 rounded-xl border border-slate-200/80 bg-white/90 p-4"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
                  <Icon className="h-4 w-4" strokeWidth={2.1} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-900">
                    {s.name}
                  </p>
                  <p className="text-[12px] text-slate-500">{s.role}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {s.detail}
                  </p>
                </div>
                <span
                  className="ml-auto shrink-0 text-[11px] font-medium"
                  style={{
                    color: sensorOk ? "#047857" : "#B91C1C",
                  }}
                >
                  {sensorOk ? "baik" : "tidak aktif"}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Data terakhir per sensor (validasi cepat) */}
      {rows.length > 0 && (
        <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
          <header className="mb-3 flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
            <h2 className="text-[13px] font-semibold text-slate-700">
              Pembacaan validitas terakhir
            </h2>
          </header>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {POLLUTANTS.map((p) => {
              const reading = rows[rows.length - 1];
              const v = Number(reading[p.key as keyof typeof reading]);
              return (
                <div key={p.key} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-[11px] text-slate-400">{p.label}</p>
                  <p className="tabular mt-0.5 text-[13px] font-semibold text-slate-800">
                    {Number.isFinite(v) ? v.toFixed(1) : "—"}{" "}
                    <span className="text-[10px] font-normal text-slate-400">
                      µg/m³
                    </span>
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function formatAge(min: number) {
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} jam lalu`;
  return `${Math.round(hr / 24)} hari lalu`;
}
