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

/** Ambang peringatan per kategori ISPU (mengikuti KLHK). */
const THRESHOLDS = [
  { key: "good", range: "0 – 50" },
  { key: "moderate", range: "51 – 100" },
  { key: "unhealthy", range: "101 – 200" },
  { key: "veryUnhealthy", range: "201 – 300" },
  { key: "hazardous", range: "> 300" },
] as const;

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Wind; color: string; soft: string }
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
      .catch(() => setFailed(true))
      .finally(() => setAlertsLoading(false));
  };

  useEffect(load, []);

  // Alert baru masuk tanpa refresh.
  useEffect(() => {
    const unsubscribe = subscribeAlerts((row) => {
      setAlerts((prev) =>
        prev.some((a) => a.id === row.id) ? prev : [row, ...prev].slice(0, 30)
      );
    });
    return unsubscribe;
  }, []);

  const deviceMeta = DEVICE_STATUS_META[status];
  const activeAlerts = alerts.filter((a) => a.is_active !== false);

  if (loading) {
    return (
      <div className="h-72 animate-pulse rounded-2xl border border-slate-200/80 bg-white/60" />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Peringatan"
        subtitle="Riwayat alert dari pipeline otomatis dan status terkini"
      />

      {/* Status terkini */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Status perangkat */}
        <section
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: deviceMeta.soft,
            borderColor: deviceMeta.ring,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70"
                style={{ color: deviceMeta.text }}
              >
                <Cpu className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: deviceMeta.text }}
                >
                  {deviceMeta.label}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  Node 01 — PENS
                </p>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">perangkat</span>
          </div>
        </section>

        {/* Status kualitas udara */}
        <section
          className="rounded-2xl border p-5"
          style={{
            backgroundColor: tone.soft,
            borderColor: tone.ring,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70"
                style={{ color: tone.text }}
              >
                <Wind className="h-5 w-5" strokeWidth={2.2} />
              </span>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: tone.text }}
                >
                  {tone.label} · ISPU {ispu}
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {dominant
                    ? `Dominan ${dominant.label} (${dominant.display.toFixed(1)} ${dominant.unit})`
                    : "—"}
                </p>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">kualitas udara</span>
          </div>
        </section>
      </div>

      {/* Riwayat alert */}
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-slate-400" strokeWidth={2.2} />
            <h2 className="text-[13px] font-semibold text-slate-700">
              Riwayat alert
            </h2>
            {activeAlerts.length > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 ring-1 ring-red-200">
                {activeAlerts.length} tercatat
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${alertsLoading ? "animate-spin" : ""}`}
            />
            Muat ulang
          </button>
        </header>

        {alertsLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-slate-100"
              />
            ))}
          </div>
        ) : failed ? (
          <p className="py-6 text-center text-[13px] text-slate-400">
            Gagal memuat riwayat alert.
          </p>
        ) : alerts.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2
              className="mx-auto h-6 w-6 text-emerald-400"
              strokeWidth={2}
            />
            <p className="mt-2 text-[13px] font-medium text-slate-500">
              Belum ada alert tercatat
            </p>
            <p className="mt-0.5 text-[12px] text-slate-400">
              Alert muncul otomatis saat alat mati atau udara tidak sehat.
            </p>
          </div>
        ) : (
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
                  className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5 transition-colors hover:bg-slate-50"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: meta.soft,
                      color: meta.color,
                    }}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.2} />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-[12.5px] font-semibold"
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
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-600">
                      {a.message ?? "—"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {formatStamp(a.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Referensi ambang */}
      <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 sm:p-6">
        <header className="mb-4 flex items-center gap-2">
          <AlertTriangle
            className="h-4 w-4 text-slate-400"
            strokeWidth={2.2}
          />
          <h2 className="text-[13px] font-semibold text-slate-700">
            Ambang batas ISPU
          </h2>
        </header>

        <ul className="space-y-1">
          {THRESHOLDS.map((t) => {
            const info = AQI[t.key];
            const isNow = tone.label === info.label;
            return (
              <li
                key={t.key}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] ${
                  isNow ? "bg-slate-50" : ""
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: info.dot }}
                  />
                  <span className="font-medium text-slate-700">
                    {info.label}
                  </span>
                  {isNow && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200">
                      saat ini
                    </span>
                  )}
                </span>
                <span className="tabular text-slate-400">{t.range}</span>
              </li>
            );
          })}
        </ul>
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
