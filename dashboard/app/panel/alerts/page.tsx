"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Cpu,
  LineChart,
  RefreshCw,
  Wind,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSensorData } from "@/components/SensorProvider";
import {
  getRecentAlerts,
  subscribeAlerts,
  type AlertRow,
} from "@/lib/api";
import { AQI } from "@/lib/brand";
import { DEVICE_STATUS_META } from "@/lib/device";

const THRESHOLDS = [
  { key: "good", range: "0 – 50" },
  { key: "moderate", range: "51 – 100" },
  { key: "unhealthy", range: "101 – 200" },
  { key: "veryUnhealthy", range: "201 – 300" },
  { key: "hazardous", range: "> 300" },
] as const;

const TYPE_META: Record<
  string,
  {
    label: string;
    icon: typeof Wind;
    color: string;
    soft: string;
  }
> = {
  DEVICE_OFFLINE: {
    label: "Perangkat",
    icon: Cpu,
    color: "#F87171",
    soft: "rgba(248, 113, 113, 0.15)",
  },
  ISPU_HIGH: {
    label: "Kualitas Udara",
    icon: Wind,
    color: "#FBBF24",
    soft: "rgba(251, 191, 36, 0.15)",
  },
  ANOMALY: {
    label: "Anomali",
    icon: Activity,
    color: "#FB7185",
    soft: "rgba(251, 113, 133, 0.15)",
  },
  FORECAST_HIGH: {
    label: "Prediksi",
    icon: LineChart,
    color: "#A78BFA",
    soft: "rgba(167, 139, 250, 0.15)",
  },
};

const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "border-rose-500/30 bg-rose-500/20 text-rose-300",
  MEDIUM: "border-amber-500/30 bg-amber-500/20 text-amber-300",
  LOW: "border-white/10 bg-slate-800 text-slate-300",
};

export default function AlertsPage() {
  const { loading, ispu, tone, dominant, status } = useSensorData();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = () => {
    setAlertsLoading(true);

    getRecentAlerts(30)
      .then((rows) => {
        setAlerts(rows);
        setFailed(false);
      })
      .catch(() => {
        setFailed(true);
      })
      .finally(() => {
        setAlertsLoading(false);
      });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeAlerts((row) => {
      setAlerts((prev) =>
        prev.some((a) => a.id === row.id)
          ? prev
          : [row, ...prev].slice(0, 30)
      );
    });

    return unsubscribe;
  }, []);

  const deviceMeta = DEVICE_STATUS_META[status];

  const activeAlerts = alerts.filter(
    (a) => a.is_active !== false
  );

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="h-16 animate-pulse rounded-2xl bg-slate-800/50" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60" />
          <div className="h-32 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60" />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-slate-100 sm:space-y-6 pb-8">
      <PageHeader
        title="Peringatan"
        subtitle="Pantau kondisi perangkat dan kualitas udara secara real-time"
      />

      {/* RINGKASAN STATUS */}
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/25 text-sky-300 border border-sky-400/30 shadow-sm">
                <Cpu className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Status Perangkat
                </p>
                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: deviceMeta.text }}
                >
                  {deviceMeta.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Node 01 — PENS
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 backdrop-blur-sm">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: deviceMeta.dot }}
              />
              <span className="text-[10px] font-semibold text-slate-300">
                Perangkat
              </span>
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/25 text-sky-300 border border-sky-400/30 shadow-sm">
                <Wind className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Kualitas Udara
                </p>
                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: tone.text }}
                >
                  {tone.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  ISPU {ispu}
                  {dominant
                    ? ` · ${dominant.label} ${dominant.display.toFixed(1)} ${dominant.unit}`
                    : ""}
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-950/40 px-2.5 py-1 backdrop-blur-sm">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tone.dot }}
              />
              <span className="text-[10px] font-semibold text-slate-300">
                Kualitas
              </span>
            </span>
          </div>
        </section>
      </div>

      {/* STATUS PERINGATAN */}
      <section className="rounded-3xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl sm:p-6 backdrop-blur-md">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/25 text-sky-300 border border-sky-400/30 shadow-sm">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Status Peringatan
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Kondisi alert yang sedang tercatat
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold border ${
              activeAlerts.length > 0
                ? "border-rose-500/30 bg-rose-500/20 text-rose-300"
                : "border-white/10 bg-slate-800 text-slate-300"
            }`}
          >
            {activeAlerts.length > 0
              ? `${activeAlerts.length} alert aktif`
              : "Tidak ada alert aktif"}
          </span>
        </div>

        {activeAlerts.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeAlerts.slice(0, 3).map((a) => {
              const meta = TYPE_META[a.alert_type] ?? {
                label: a.alert_type,
                icon: AlertTriangle,
                color: "#94A3B8",
                soft: "rgba(148, 163, 184, 0.15)",
              };
              const Icon = meta.icon;

              return (
                <div
                  key={a.id}
                  className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 transition hover:bg-slate-800/50 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-sm"
                      style={{
                        backgroundColor: meta.soft,
                        color: meta.color,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-xs font-bold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                        {a.message ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 py-7 text-center backdrop-blur-sm">
            <CheckCircle2 className="mx-auto h-7 w-7 text-sky-400" />
            <p className="mt-2 text-sm font-semibold text-white">
              Kondisi aman
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Tidak ada peringatan aktif saat ini.
            </p>
          </div>
        )}
      </section>

      {/* RIWAYAT ALERT */}
      <section className="rounded-3xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl sm:p-6 backdrop-blur-md">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-bold text-white">
                Riwayat Alert
              </h2>
              {alerts.length > 0 && (
                <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 text-[10px] font-semibold text-slate-300 backdrop-blur-sm">
                  {alerts.length} tercatat
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400">
              Maksimal 30 peringatan terbaru
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={alertsLoading}
            className="flex items-center gap-1.5 rounded-xl border border-sky-400/30 bg-slate-950/40 px-3.5 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer backdrop-blur-sm"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-sky-400 ${
                alertsLoading ? "animate-spin" : ""
              }`}
            />
            Muat ulang
          </button>
        </header>

        {alertsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-2xl border border-white/10 bg-slate-950/40"
              />
            ))}
          </div>
        ) : failed ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 py-8 text-center backdrop-blur-sm">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-400" />
            <p className="mt-2 text-sm font-semibold text-rose-200">
              Gagal memuat riwayat alert
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-xl bg-sky-500 px-3.5 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-sky-400 cursor-pointer shadow"
            >
              Coba lagi
            </button>
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 py-9 text-center backdrop-blur-sm">
            <CheckCircle2 className="mx-auto h-7 w-7 text-sky-400" />
            <p className="mt-2 text-sm font-semibold text-slate-200">
              Belum ada alert tercatat
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Alert akan muncul otomatis ketika kondisi memenuhi
              ambang peringatan.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => {
              const meta = TYPE_META[a.alert_type] ?? {
                label: a.alert_type,
                icon: AlertTriangle,
                color: "#94A3B8",
                soft: "rgba(148, 163, 184, 0.15)",
              };
              const Icon = meta.icon;

              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3.5 transition hover:bg-slate-800/50 backdrop-blur-sm"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 shadow-sm"
                    style={{
                      backgroundColor: meta.soft,
                      color: meta.color,
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-xs font-bold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${
                          SEVERITY_STYLE[a.severity] ??
                          "border-white/10 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {a.severity}
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {a.message ?? "—"}
                    </p>
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {formatStamp(a.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* AMBANG BATAS ISPU */}
      <section className="rounded-3xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl sm:p-6 backdrop-blur-md">
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/25 text-sky-300 border border-sky-400/30 shadow-sm">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
          </div>

          <div>
            <h2 className="text-sm font-bold text-white">
              Ambang Batas ISPU
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">
              Referensi kategori kualitas udara
            </p>
          </div>
        </header>

        <div className="space-y-2">
          {THRESHOLDS.map((t) => {
            const info = AQI[t.key];
            const isNow = tone.label === info.label;

            return (
              <div
                key={t.key}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition backdrop-blur-sm ${
                  isNow
                    ? "border-sky-400/40 bg-sky-500/15 shadow-sm"
                    : "border-white/10 bg-slate-950/40"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/20"
                    style={{ backgroundColor: info.dot }}
                  />
                  <span className="text-xs font-semibold text-white">
                    {info.label}
                  </span>

                  {isNow && (
                    <span className="rounded-full border border-sky-400/30 bg-sky-500 px-2 py-0.5 text-[9px] font-bold text-slate-950">
                      SAAT INI
                    </span>
                  )}
                </div>

                <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-300">
                  {t.range}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}