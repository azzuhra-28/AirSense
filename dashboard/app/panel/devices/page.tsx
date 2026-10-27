"use client";

import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  RefreshCw,
  Radio,
  Thermometer,
  Wifi,
  WifiOff,
  Wind,
  Droplets,
  Gauge,
} from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { useSensorData } from "@/components/SensorProvider";
import { POLLUTANTS } from "@/lib/brand";
import { toWIB } from "@/lib/ispu";
import { DEVICE_STATUS_META } from "@/lib/device";

const SENSORS = [
  {
    name: "ESP32",
    type: "Mikrokontroler",
    description: "Memproses dan mengirimkan data dari perangkat sensor.",
    icon: Cpu,
  },
  {
    name: "GP2Y1010AU0F",
    type: "Sensor partikulat",
    description: "Digunakan untuk pengukuran partikulat sesuai integrasi perangkat.",
    icon: Wind,
  },
  {
    name: "MiCS-6814",
    type: "Sensor gas",
    description: "Digunakan untuk pembacaan gas sesuai konfigurasi perangkat.",
    icon: Activity,
  },
  {
    name: "DHT22",
    type: "Sensor lingkungan",
    description: "Mengukur suhu dan kelembapan lingkungan.",
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
    refreshing,
    source,
  } = useSensorData();

  const meta = DEVICE_STATUS_META[status];

  const activity = useMemo(() => {
    const now = Date.now();

    return Array.from({ length: 6 }, (_, index) => {
      const end = now - (5 - index) * 60 * 60 * 1000;
      const start = end - 60 * 60 * 1000;

      const count = rows.filter((row) => {
        const time = new Date(row.created_at).getTime();
        return time >= start && time < end;
      }).length;

      return {
        label: new Date(end).toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Jakarta",
        }),
        count,
      };
    });
  }, [rows]);

  const maxCount = Math.max(...activity.map((item) => item.count), 1);
  const latest = rows.length ? rows[rows.length - 1] : null;

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-800/50" />
        <div className="h-56 animate-pulse rounded-3xl border border-sky-400/30 bg-slate-900/60" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl border border-sky-400/30 bg-slate-900/60"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 pb-8 text-slate-100">
      <PageHeader
        title="Perangkat"
        subtitle="Pantau status node dan komponen sensor AirSense."
      />

      {/* STATUS NODE */}
      <section className="overflow-hidden rounded-3xl border border-sky-400/30 bg-slate-900/70 shadow-xl backdrop-blur-md">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg border border-white/10 bg-slate-950/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-300 backdrop-blur-sm">
                Device monitoring
              </span>

              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold border ${
                  status === "online"
                    ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                    : "border-rose-500/30 bg-rose-500/20 text-rose-300"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    status === "online" ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                {statusText}
              </span>
            </div>

            <h2 className="mt-4 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Node 01 — PENS
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Pemantauan perangkat pengukuran kualitas udara dan data sensor
              yang diterima oleh sistem.
            </p>

            <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300">
              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 backdrop-blur-sm">
                <Clock3 size={14} className="text-sky-400" />
                {formatAge(lastSeenMinutes)}
              </span>

              <span className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 backdrop-blur-sm">
                <Database size={14} className="text-sky-400" />
                Sumber: {sourceLabel(source)}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl border border-sky-400/30 bg-slate-950/50 p-6 text-center sm:min-w-48 backdrop-blur-md">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${
                status === "online"
                  ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/20 text-rose-300"
              }`}
            >
              {status === "online" ? (
                <Wifi size={30} />
              ) : (
                <WifiOff size={30} />
              )}
            </div>

            <p className="mt-4 text-sm font-bold text-white">
              {status === "online" ? "Perangkat terhubung" : "Periksa koneksi"}
            </p>

            <p className="mt-1 text-xs text-slate-400">
              {at ? `Data terakhir: ${toWIB(at)}` : "Waktu data belum tersedia"}
            </p>

            <button
              onClick={reload}
              disabled={refreshing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50 cursor-pointer shadow-lg"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
              {refreshing ? "Memuat..." : "Segarkan"}
            </button>
          </div>
        </div>

        <div className="grid border-t border-white/10 sm:grid-cols-3 bg-slate-950/40 backdrop-blur-sm">
          <StatusItem
            icon={<Radio size={17} />}
            label="Koneksi node"
            value={statusText}
            online={status === "online"}
          />
          <StatusItem
            icon={<Database size={17} />}
            label="Data tersedia"
            value={`${rows.length.toLocaleString("id-ID")} baris`}
          />
          <StatusItem
            icon={<Activity size={17} />}
            label="Sumber data"
            value={sourceLabel(source)}
          />
        </div>
      </section>

      {/* AKTIVITAS PEMBACAAN */}
      <section className="rounded-3xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl sm:p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sky-300">
              <Activity size={18} />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">
                Device activity
              </span>
            </div>

            <h2 className="mt-2 text-lg font-bold text-white">
              Aktivitas pembacaan
            </h2>

            <p className="mt-1 text-xs leading-5 text-slate-300">
              Jumlah rekaman yang diterima pada setiap interval satu jam.
            </p>
          </div>

          <span className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-300 backdrop-blur-sm">
            6 jam terakhir
          </span>
        </div>

        <div className="mt-7 grid grid-cols-6 gap-2 sm:gap-4">
          {activity.map((item, index) => {
            const height =
              item.count === 0 ? 5 : Math.max(12, (item.count / maxCount) * 100);

            return (
              <div key={`${item.label}-${index}`} className="min-w-0 text-center">
                <div className="flex h-32 items-end justify-center rounded-xl border border-white/10 bg-slate-950/40 p-2 backdrop-blur-sm">
                  <div
                    title={`${item.count} rekaman`}
                    className={`w-full max-w-10 rounded-t-lg transition-all ${
                      item.count > 0 ? "bg-sky-500" : "bg-slate-800"
                    }`}
                    style={{ height: `${height}%` }}
                  />
                </div>

                <p className="mt-2 truncate text-[10px] font-medium text-slate-400">
                  {item.label}
                </p>

                <p className="mt-1 text-xs font-bold tabular-nums text-white">
                  {item.count}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-[10px] text-slate-400">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          Jumlah rekaman per jam, berdasarkan data yang tersedia di aplikasi.
        </div>
      </section>

      {/* KOMPONEN SENSOR */}
      <section>
        <div className="mb-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Hardware overview
          </p>
          <h2 className="mt-1 text-xl font-bold text-white sm:text-2xl">
            Komponen perangkat
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            Komponen yang digunakan pada rancangan perangkat AirSense.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SENSORS.map((sensor) => {
            const Icon = sensor.icon;

            return (
              <article
                key={sensor.name}
                className="rounded-2xl border border-sky-400/30 bg-slate-900/70 p-5 shadow-xl backdrop-blur-md transition hover:-translate-y-0.5 hover:shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm">
                    <Icon size={21} />
                  </div>

                  <span className="rounded-lg border border-white/10 bg-slate-950/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-slate-300 backdrop-blur-sm">
                    Hardware
                  </span>
                </div>

                <h3 className="mt-5 break-words text-sm font-bold text-white">
                  {sensor.name}
                </h3>

                <p className="mt-1 text-xs font-medium text-sky-300">
                  {sensor.type}
                </p>

                <p className="mt-3 text-xs leading-5 text-slate-300">
                  {sensor.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      {/* PEMBACAAN TERBARU */}
      <section className="overflow-hidden rounded-3xl border border-sky-400/30 bg-slate-900/70 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-3 p-5 sm:p-6 border-b border-white/10">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300 border border-sky-400/30">
            <Gauge size={21} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">
              Pembacaan sensor terbaru
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Nilai terakhir yang tersedia dari sumber data.
            </p>
          </div>
        </div>

        <div className="grid gap-3 border-t border-white/10 bg-slate-950/40 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 backdrop-blur-sm">
          {POLLUTANTS.map((p) => {
            const value = latest
              ? Number(latest[p.key as keyof typeof latest])
              : NaN;

            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-sm"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white">{p.label}</p>
                  <p className="mt-1 text-[10px] text-slate-400">
                    Konsentrasi polutan
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-bold tabular-nums text-white">
                    {Number.isFinite(value)
                      ? value.toLocaleString("id-ID", {
                          maximumFractionDigits: 3,
                        })
                      : "—"}
                  </p>
                  <p className="text-[10px] text-slate-400">{p.unit}</p>
                </div>
              </div>
            );
          })}

          <ReadingCard
            label="Suhu"
            value={latest?.temperature}
            unit="°C"
            icon={<Thermometer size={18} />}
          />

          <ReadingCard
            label="Kelembapan"
            value={latest?.humidity}
            unit="%"
            icon={<Droplets size={18} />}
          />
        </div>

        {failed && (
          <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/10 p-4 text-xs leading-5 text-amber-200 backdrop-blur-sm">
            <WifiOff size={15} className="mt-0.5 shrink-0 text-amber-400" />
            Data mungkin belum diperbarui. Coba segarkan atau periksa koneksi
            sumber data.
          </div>
        )}
      </section>

      <p className="px-1 text-[10px] leading-5 text-slate-400">
        AirSense · Pemantauan perangkat dan komponen sensor.
      </p>
    </div>
  );
}

function StatusItem({
  icon,
  label,
  value,
  online,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  online?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-white/10 p-4 sm:border-r sm:p-5 last:border-r-0">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm">
        {icon}
      </div>

      <div className="min-w-0">
        <p className="text-[10px] text-slate-400">{label}</p>
        <p className="mt-1 truncate text-xs font-bold text-white">{value}</p>
        {online !== undefined && (
          <p
            className={`mt-1 flex items-center gap-1 text-[10px] ${
              online ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            <CheckCircle2 size={11} />
            {online ? "Terhubung" : "Perlu diperiksa"}
          </p>
        )}
      </div>
    </div>
  );
}

function ReadingCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: unknown;
  unit: string;
  icon: React.ReactNode;
}) {
  const number = Number(value);
  const display =
    value === null || value === undefined || value === "" || !Number.isFinite(number)
      ? "—"
      : number.toLocaleString("id-ID", { maximumFractionDigits: 1 });

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/20 text-sky-300 border border-sky-400/30 shadow-sm">
          {icon}
        </div>
        <div>
          <p className="text-xs font-semibold text-white">{label}</p>
          <p className="mt-1 text-[10px] text-slate-400">Sensor lingkungan</p>
        </div>
      </div>

      <div className="text-right">
        <p className="text-lg font-bold tabular-nums text-white">{display}</p>
        <p className="text-[10px] text-slate-400">{unit}</p>
      </div>
    </div>
  );
}

function formatAge(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return "Waktu data belum diketahui";
  }

  if (minutes < 1) return "Data baru saja diterima";
  if (minutes < 60) return `${Math.floor(minutes)} menit sejak data terakhir`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam sejak data terakhir`;

  return `${Math.floor(hours / 24)} hari sejak data terakhir`;
}

function sourceLabel(source: string) {
  if (source === "supabase") return "Supabase";
  if (source === "demo") return "Data demo";
  return "Belum tersedia";
}