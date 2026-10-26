
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
    color: "#B91C1C",
    soft: "#FEF2F2",
  },
  ISPU_HIGH: {
    label: "Kualitas Udara",
    icon: Wind,
    color: "#B45309",
    soft: "#FFFBEB",
  },
    ANOMALY: {
    label: "Anomali",
    icon: Activity,
    color: "#BE123C",
    soft: "#FFF1F2",
  },
  FORECAST_HIGH: {
    label: "Prediksi",
    icon: LineChart,
    color: "#6D28D9",
    soft: "#F5F3FF",
  },
};


const SEVERITY_STYLE: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 ring-red-200",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-200",
  LOW: "bg-stone-100 text-stone-600 ring-stone-200",
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
        <div className="h-16 animate-pulse rounded-2xl bg-stone-200" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />
          <div className="h-32 animate-pulse rounded-2xl bg-stone-200" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-stone-200" />
      </div>
    );
  }

  return (
    <div className="space-y-5 text-stone-800 sm:space-y-6">
      <PageHeader
        title="Peringatan"
        subtitle="Pantau kondisi perangkat dan kualitas udara secara real-time"
      />

      {/* RINGKASAN STATUS */}

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                <Cpu className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Status Perangkat
                </p>
                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: deviceMeta.text }}
                >
                  {deviceMeta.label}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  Node 01 — PENS
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: deviceMeta.dot }}
              />
              <span className="text-[10px] font-semibold text-stone-600">
                Perangkat
              </span>
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
                <Wind className="h-5 w-5" />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Kualitas Udara
                </p>
                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: tone.text }}
                >
                  {tone.label}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">
                  ISPU {ispu}
                  {dominant
                    ? ` · ${dominant.label} ${dominant.display.toFixed(1)} ${dominant.unit}`
                    : ""}
                </p>
              </div>
            </div>

            <span className="flex items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tone.dot }}
              />
              <span className="text-[10px] font-semibold text-stone-600">
                Kualitas
              </span>
            </span>
          </div>
        </section>
      </div>

      {/* STATUS PERINGATAN */}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-stone-800">
                Status Peringatan
              </h2>
              <p className="mt-0.5 text-[11px] text-stone-500">
                Kondisi alert yang sedang tercatat
              </p>
            </div>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
              activeAlerts.length > 0
                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                : "bg-stone-100 text-stone-600 ring-1 ring-stone-200"
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
                color: "#57534E",
                soft: "#F5F5F4",
              };
              const Icon = meta.icon;

              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-4 transition hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
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
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-stone-600">
                        {a.message ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-stone-200 bg-stone-50 py-7 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-stone-500" />
            <p className="mt-2 text-sm font-semibold text-stone-700">
              Kondisi aman
            </p>
            <p className="mt-1 text-xs text-stone-500">
              Tidak ada peringatan aktif saat ini.
            </p>
          </div>
        )}
      </section>

      {/* RIWAYAT ALERT */}

      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-stone-600" />
              <h2 className="text-sm font-bold text-stone-800">
                Riwayat Alert
              </h2>
              {alerts.length > 0 && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">
                  {alerts.length} tercatat
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-stone-500">
              Maksimal 30 peringatan terbaru
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            disabled={alertsLoading}
            className="flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] font-semibold text-stone-700 transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
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
                className="h-16 animate-pulse rounded-xl bg-stone-100"
              />
            ))}
          </div>
        ) : failed ? (
          <div className="rounded-xl border border-red-300 bg-red-50 py-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-red-600" />
            <p className="mt-2 text-sm font-semibold text-red-800">
              Gagal memuat riwayat alert
            </p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-lg bg-stone-800 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-stone-700"
            >
              Coba lagi
            </button>
          </div>
        ) : alerts.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 py-9 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-stone-500" />
            <p className="mt-2 text-sm font-semibold text-stone-600">
              Belum ada alert tercatat
            </p>
            <p className="mt-1 text-xs text-stone-400">
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
                color: "#57534E",
                soft: "#F5F5F4",
              };
              const Icon = meta.icon;

              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-3.5 transition hover:bg-stone-50"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
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
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${
                          SEVERITY_STYLE[a.severity] ??
                          "bg-stone-100 text-stone-600 ring-stone-200"
                        }`}
                      >
                        {a.severity}
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-stone-600">
                      {a.message ?? "—"}
                    </p>
                    <p className="mt-1.5 text-[10px] text-stone-400">
                      {formatStamp(a.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* AMBANG BATAS ISPU - MERAH MENCOLOK */}

      <section
        className="rounded-2xl border-2 border-red-400 bg-red-100 p-5 shadow-sm sm:p-6"
        style={{
          backgroundColor: "#FEE2E2",
          borderColor: "#F87171",
        }}
      >
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-red-600 shadow-sm">
            <AlertTriangle className="h-5 w-5" strokeWidth={2.5} />
          </div>

          <div>
            <h2 className="text-sm font-bold text-red-900">
              Ambang Batas ISPU
            </h2>
            <p className="mt-0.5 text-[11px] text-red-800">
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
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 transition ${
                  isNow
                    ? "border-red-400 bg-white shadow-sm"
                    : "border-red-200 bg-white/80"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: info.dot }}
                  />
                  <span className="text-xs font-semibold text-stone-800">
                    {info.label}
                  </span>

                  {isNow && (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-bold text-white">
                      SAAT INI
                    </span>
                  )}
                </div>

                <span className="shrink-0 text-xs font-semibold tabular-nums text-red-800">
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
