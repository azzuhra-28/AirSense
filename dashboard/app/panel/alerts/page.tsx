"use client";

import { useEffect, useState } from "react";
import {
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
import { getRecentAlerts, subscribeAlerts, type AlertRow } from "@/lib/api";
import { AQI } from "@/lib/brand";
import { DEVICE_STATUS_META } from "@/lib/device";

/* =========================================================
   KONSTANTA
========================================================= */

const GREEN = "#B7E4C7";

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
  LOW: "bg-slate-100 text-slate-600 ring-slate-200",
};

/* =========================================================
   PAGE
========================================================= */

export default function AlertsPage() {
  const {
    loading,
    ispu,
    tone,
    dominant,
    status,
  } = useSensorData();

  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  /* -------------------------------------------------------
     Ambil riwayat alert
  ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     Realtime alert
  ------------------------------------------------------- */

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

  /* -------------------------------------------------------
     Loading
  ------------------------------------------------------- */

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-6">
        <div className="h-16 animate-pulse rounded-2xl bg-[#B7E4C7]/60" />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-[#B7E4C7]/60" />
          <div className="h-32 animate-pulse rounded-2xl bg-[#B7E4C7]/60" />
        </div>

        <div className="h-72 animate-pulse rounded-2xl bg-[#B7E4C7]/60" />
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* =================================================
          HEADER
      ================================================= */}

      <PageHeader
        title="Peringatan"
        subtitle="Pantau kondisi perangkat dan kualitas udara secara real-time"
      />

      {/* =================================================
          RINGKASAN STATUS
      ================================================= */}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* -----------------------------------------------
            STATUS PERANGKAT
        ------------------------------------------------ */}

        <section
          className="rounded-2xl border border-emerald-200/70 p-5 shadow-sm"
          style={{ backgroundColor: GREEN }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70">
                <Cpu
                  className="h-5 w-5"
                  style={{ color: deviceMeta.text }}
                  strokeWidth={2.2}
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/60">
                  Status Perangkat
                </p>

                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: deviceMeta.text }}
                >
                  {deviceMeta.label}
                </p>

                <p className="mt-0.5 text-xs text-emerald-900/55">
                  Node 01 — PENS
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-white/65 px-2.5 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: deviceMeta.dot }}
              />
              <span className="text-[10px] font-semibold text-emerald-900/60">
                perangkat
              </span>
            </div>
          </div>
        </section>

        {/* -----------------------------------------------
            STATUS KUALITAS UDARA
        ------------------------------------------------ */}

        <section
          className="rounded-2xl border border-emerald-200/70 p-5 shadow-sm"
          style={{ backgroundColor: GREEN }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/70">
                <Wind
                  className="h-5 w-5"
                  style={{ color: tone.text }}
                  strokeWidth={2.2}
                />
              </div>

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800/60">
                  Kualitas Udara
                </p>

                <p
                  className="mt-1 text-base font-bold"
                  style={{ color: tone.text }}
                >
                  {tone.label}
                </p>

                <p className="mt-0.5 text-xs text-emerald-900/55">
                  ISPU {ispu}
                  {dominant
                    ? ` · ${dominant.label} ${dominant.display.toFixed(
                        1
                      )} ${dominant.unit}`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 rounded-full bg-white/65 px-2.5 py-1">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tone.dot }}
              />
              <span className="text-[10px] font-semibold text-emerald-900/60">
                kualitas
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* =================================================
          STATUS ALERT
      ================================================= */}

      <section
        className="rounded-2xl border border-emerald-200/70 p-5 shadow-sm sm:p-6"
        style={{ backgroundColor: GREEN }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
              <BellRing
                className="h-5 w-5 text-emerald-700"
                strokeWidth={2.2}
              />
            </div>

            <div>
              <h2 className="text-sm font-bold text-emerald-950">
                Status Peringatan
              </h2>

              <p className="mt-0.5 text-[11px] text-emerald-900/55">
                Kondisi alert yang sedang tercatat
              </p>
            </div>
          </div>

          <div
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${
              activeAlerts.length > 0
                ? "bg-red-50 text-red-700 ring-1 ring-red-200"
                : "bg-white/70 text-emerald-700"
            }`}
          >
            {activeAlerts.length > 0
              ? `${activeAlerts.length} alert aktif`
              : "Tidak ada alert aktif"}
          </div>
        </div>

        {activeAlerts.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeAlerts.slice(0, 3).map((a) => {
              const meta = TYPE_META[a.alert_type] ?? {
                label: a.alert_type,
                icon: AlertTriangle,
                color: "#475569",
                soft: "#F8FAFC",
              };

              const Icon = meta.icon;

              return (
                <div
                  key={a.id}
                  className="rounded-xl bg-white/70 p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: meta.soft,
                        color: meta.color,
                      }}
                    >
                      <Icon
                        className="h-4 w-4"
                        strokeWidth={2.2}
                      />
                    </span>

                    <div className="min-w-0">
                      <p
                        className="text-xs font-bold"
                        style={{ color: meta.color }}
                      >
                        {meta.label}
                      </p>

                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                        {a.message ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-white/60 py-7 text-center">
            <CheckCircle2
              className="mx-auto h-7 w-7 text-emerald-600"
              strokeWidth={2}
            />

            <p className="mt-2 text-sm font-semibold text-emerald-900">
              Kondisi aman
            </p>

            <p className="mt-1 text-xs text-emerald-900/50">
              Tidak ada peringatan aktif saat ini.
            </p>
          </div>
        )}
      </section>

      {/* =================================================
          RIWAYAT ALERT
      ================================================= */}

      <section
        className="rounded-2xl border border-emerald-200/70 p-5 shadow-sm sm:p-6"
        style={{ backgroundColor: GREEN }}
      >
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BellRing
                className="h-4 w-4 text-emerald-700"
                strokeWidth={2.2}
              />

              <h2 className="text-sm font-bold text-emerald-950">
                Riwayat Alert
              </h2>

              {alerts.length > 0 && (
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {alerts.length} tercatat
                </span>
              )}
            </div>

            <p className="mt-1 text-[11px] text-emerald-900/50">
              Maksimal 30 peringatan terbaru
            </p>
          </div>

          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-[11px] font-semibold text-emerald-800 transition hover:bg-white"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                alertsLoading ? "animate-spin" : ""
              }`}
            />
            Muat ulang
          </button>
        </header>

        {/* Loading */}
        {alertsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-white/60"
              />
            ))}
          </div>
        ) : failed ? (
          /* Error */
          <div className="rounded-xl bg-white/60 py-8 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />

            <p className="mt-2 text-sm font-semibold text-slate-600">
              Gagal memuat riwayat alert
            </p>

            <button
              type="button"
              onClick={load}
              className="mt-3 rounded-lg bg-emerald-700 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-emerald-800"
            >
              Coba lagi
            </button>
          </div>
        ) : alerts.length === 0 ? (
          /* Empty */
          <div className="rounded-xl bg-white/60 py-9 text-center">
            <CheckCircle2
              className="mx-auto h-7 w-7 text-emerald-500"
              strokeWidth={2}
            />

            <p className="mt-2 text-sm font-semibold text-slate-600">
              Belum ada alert tercatat
            </p>

            <p className="mt-1 text-xs text-slate-400">
              Alert akan muncul otomatis ketika kondisi memenuhi
              ambang peringatan.
            </p>
          </div>
        ) : (
          /* List */
          <ul className="space-y-2">
            {alerts.map((a) => {
              const meta = TYPE_META[a.alert_type] ?? {
                label: a.alert_type,
                icon: AlertTriangle,
                color: "#475569",
                soft: "#F8FAFC",
              };

              const Icon = meta.icon;

              return (
                <li
                  key={a.id}
                  className="flex items-start gap-3 rounded-xl bg-white/70 p-3.5 transition hover:bg-white"
                >
                  {/* Icon */}
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: meta.soft,
                      color: meta.color,
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={2.2}
                    />
                  </span>

                  {/* Content */}
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
                          "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {a.severity}
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
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

      {/* =================================================
          AMBANG ISPU
      ================================================= */}

      <section
        className="rounded-2xl border border-emerald-200/70 p-5 shadow-sm sm:p-6"
        style={{ backgroundColor: GREEN }}
      >
        <header className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/70">
            <AlertTriangle
              className="h-4.5 w-4.5 text-emerald-700"
              strokeWidth={2.2}
            />
          </div>

          <div>
            <h2 className="text-sm font-bold text-emerald-950">
              Ambang Batas ISPU
            </h2>

            <p className="mt-0.5 text-[11px] text-emerald-900/50">
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
                className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 transition ${
                  isNow
                    ? "bg-white/80 shadow-sm"
                    : "bg-white/45"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white/70"
                    style={{ backgroundColor: info.dot }}
                  />

                  <span className="text-xs font-semibold text-slate-700">
                    {info.label}
                  </span>

                  {isNow && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                      SAAT INI
                    </span>
                  )}
                </div>

                <span className="shrink-0 text-xs font-medium tabular-nums text-slate-400">
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

/* =========================================================
   HELPER
========================================================= */

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  });
}