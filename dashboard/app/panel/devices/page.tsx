"use client";

import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Cpu,
  Database,
  Radio,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSensorData } from "@/components/SensorProvider";
import { POLLUTANTS } from "@/lib/brand";
import { DEVICE_STATUS_META } from "@/lib/device";

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

      if (idx >= 0 && idx < 6) {
        buckets[idx].count += 1;
      }
    }

    return buckets;
  }, [rows]);

  const maxCount = Math.max(
    ...activity.map((a) => a.count),
    1
  );

  const sensorOk = status !== "offline";

  if (loading) {
    return (
      <div className="space-y-5">

        <div className="h-10 w-52 animate-pulse rounded-xl bg-[#B7E4C7]/60" />

        <div className="h-72 animate-pulse rounded-2xl border border-emerald-100 bg-[#B7E4C7]/40" />

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />
          <div className="h-28 animate-pulse rounded-2xl bg-[#B7E4C7]/40" />
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">

      {/* =========================
          HEADER
      ========================= */}

      <PageHeader
        title="Perangkat"
        subtitle="Pemantauan status node dan sensor penyusunnya"
      />

      {/* =========================
          DEVICE STATUS
      ========================= */}

      <section className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm sm:p-6">

        {/* TOP STATUS */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">

          <div className="flex items-center gap-3.5">

            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/70">

              {status === "offline" ? (
                <WifiOff
                  className="h-5 w-5 text-red-600"
                  strokeWidth={2.2}
                />
              ) : (
                <Wifi
                  className="h-5 w-5 text-emerald-700"
                  strokeWidth={2.2}
                />
              )}

            </div>

            <div>

              <div className="flex flex-wrap items-center gap-2">

                <p className="text-sm font-bold text-emerald-950">
                  Node 01 — PENS
                </p>

                <span
                  className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold"
                  style={{
                    color: meta.text,
                  }}
                >
                  {meta.label}
                </span>

              </div>

              <p className="mt-1 text-[12px] text-emerald-800/70">
                {statusText}
              </p>

            </div>
          </div>

          {/* LAST DATA */}
          <div className="rounded-xl bg-white/60 px-4 py-3 sm:min-w-[210px]">

            <p className="text-[10px] font-medium uppercase tracking-wide text-emerald-800/60">
              Data terakhir
            </p>

            <p className="mt-1 tabular text-[13px] font-bold text-emerald-950">
              {at
                ? new Date(at).toLocaleString("id-ID", {
                    timeStyle: "short",
                    dateStyle: "medium",
                    timeZone: "Asia/Jakarta",
                  })
                : "—"}
            </p>

            {lastSeenMinutes !== null && (
              <p className="mt-0.5 text-[11px] text-emerald-800/60">
                {formatAge(lastSeenMinutes)}
              </p>
            )}

          </div>

        </div>

        {/* =========================
            STATUS SUMMARY
        ========================= */}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">

          <StatusMiniCard
            label="Koneksi"
            value={status === "offline" ? "Terputus" : "Terhubung"}
            icon={
              status === "offline" ? (
                <WifiOff className="h-4 w-4" />
              ) : (
                <Wifi className="h-4 w-4" />
              )
            }
            danger={status === "offline"}
          />

          <StatusMiniCard
            label="Sensor"
            value={sensorOk ? "Normal" : "Tidak aktif"}
            icon={<Activity className="h-4 w-4" />}
            danger={!sensorOk}
          />

          <StatusMiniCard
            label="Data"
            value={`${rows.length} records`}
            icon={<Database className="h-4 w-4" />}
          />

        </div>

        {/* =========================
            ACTIVITY
        ========================= */}

        {activity.length > 0 && (
          <div className="mt-5 rounded-2xl border border-emerald-200/70 bg-white/55 p-4">

            <div className="flex items-center justify-between">

              <div>
                <p className="text-[12px] font-bold text-emerald-950">
                  Aktivitas Pengiriman Data
                </p>

                <p className="mt-0.5 text-[10px] text-emerald-800/60">
                  6 jam terakhir
                </p>
              </div>

              <Activity className="h-4 w-4 text-emerald-700" />

            </div>

            <div className="mt-4 flex h-16 items-end gap-2">

              {activity.map((b, i) => (
                <div
                  key={i}
                  className="flex h-full flex-1 flex-col justify-end"
                >

                  <div
                    className="w-full rounded-md bg-emerald-600 transition-all"
                    style={{
                      height: `${Math.max(
                        5,
                        (b.count / maxCount) * 42
                      )}px`,
                      opacity:
                        b.count === 0 ? 0.15 : 0.75,
                    }}
                  />

                  <p className="mt-1.5 text-center text-[9px] text-emerald-800/60">
                    {b.label}
                  </p>

                </div>
              ))}

            </div>

          </div>
        )}

        {/* ERROR */}
        {failed && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl bg-white/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

            <div className="flex items-center gap-2">

              <WifiOff className="h-4 w-4 text-red-500" />

              <p className="text-[12px] text-slate-600">
                Gagal terhubung ke basis data.
              </p>

            </div>

            <button
              type="button"
              onClick={reload}
              className="w-fit rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-800"
            >
              Coba lagi
            </button>

          </div>
        )}

      </section>

      {/* =========================
          SENSOR LIST
      ========================= */}

      <section>

        <div className="mb-3 flex items-center justify-between">

          <div>
            <h2 className="text-[14px] font-bold text-slate-800">
              Sensor Terpasang
            </h2>

            <p className="mt-0.5 text-[11px] text-slate-400">
              Komponen yang digunakan pada Node 01
            </p>
          </div>

          <span className="rounded-full bg-[#B7E4C7] px-3 py-1 text-[10px] font-bold text-emerald-800">
            {SENSORS.length} sensor
          </span>

        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

          {SENSORS.map((s) => {

            const Icon = s.icon;

            return (
              <div
                key={s.name}
                className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              >

                <div className="flex items-start gap-3">

                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70 text-emerald-700">
                    <Icon
                      className="h-5 w-5"
                      strokeWidth={2.1}
                    />
                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex items-start justify-between gap-2">

                      <div>
                        <p className="text-[13px] font-bold text-emerald-950">
                          {s.name}
                        </p>

                        <p className="mt-0.5 text-[11px] font-medium text-emerald-800/70">
                          {s.role}
                        </p>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${
                          sensorOk
                            ? "bg-white/80 text-emerald-700"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {sensorOk ? "BAIK" : "TIDAK AKTIF"}
                      </span>

                    </div>

                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                      {s.detail}
                    </p>

                  </div>

                </div>

              </div>
            );
          })}

        </div>
      </section>

      {/* =========================
          LATEST READINGS
      ========================= */}

      {rows.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-[#B7E4C7] p-5 shadow-sm sm:p-6">

          <header className="flex items-center justify-between">

            <div className="flex items-center gap-3">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
                <Database className="h-5 w-5 text-emerald-700" />
              </div>

              <div>
                <h2 className="text-[13px] font-bold text-emerald-950">
                  Pembacaan Terakhir
                </h2>

                <p className="mt-0.5 text-[10px] text-emerald-800/60">
                  Validasi data sensor terkini
                </p>
              </div>

            </div>

            <CheckCircle2 className="h-5 w-5 text-emerald-600" />

          </header>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">

            {POLLUTANTS.map((p) => {

              const reading = rows[rows.length - 1];

              const v = Number(
                reading[p.key as keyof typeof reading]
              );

              return (
                <div
                  key={p.key}
                  className="rounded-xl border border-emerald-100 bg-white/70 p-3"
                >

                  <div className="flex items-center justify-between">

                    <p className="text-[11px] font-medium text-slate-500">
                      {p.label}
                    </p>

                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                  </div>

                  <p className="mt-2 tabular text-lg font-bold text-emerald-800">

                    {Number.isFinite(v)
                      ? v.toFixed(1)
                      : "—"}

                    <span className="ml-1 text-[9px] font-medium text-slate-400">
                      µg/m³
                    </span>

                  </p>

                  <p className="mt-1 text-[9px] text-slate-400">
                    Data terbaru
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

/* =========================
   STATUS MINI CARD
========================= */

function StatusMiniCard({
  label,
  value,
  icon,
  danger = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-white/65 p-3">

      <div className="flex items-center gap-2">

        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            danger
              ? "bg-red-50 text-red-600"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {icon}
        </div>

        <div>
          <p className="text-[10px] text-slate-400">
            {label}
          </p>

          <p
            className={`text-[12px] font-bold ${
              danger
                ? "text-red-600"
                : "text-emerald-800"
            }`}
          >
            {value}
          </p>
        </div>

      </div>

    </div>
  );
}

/* =========================
   FORMAT AGE
========================= */

function formatAge(min: number) {
  if (min < 1) return "baru saja";

  if (min < 60) {
    return `${min} menit lalu`;
  }

  const hr = Math.round(min / 60);

  if (hr < 24) {
    return `${hr} jam lalu`;
  }

  return `${Math.round(hr / 24)} hari lalu`;
}