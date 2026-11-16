"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, X } from "lucide-react";

import { getRecentAlerts, subscribeAlerts, type AlertRow } from "@/lib/api";

const POLL_MS = 30_000;
const TOAST_MS = 8_000;

const LABEL: Record<string, string> = {
  DEVICE_OFFLINE: "Perangkat offline",
  ISPU_HIGH: "Kualitas udara memburuk",
  ISPU_SPIKE: "Lonjakan ISPU",
  ANOMALY: "Anomali pembacaan",
  FORECAST_HIGH: "Peringatan prediksi",
};

type Toast = {
  id: number;
  title: string;
  body: string;
  severity: string;
};

/**
 * Notifikasi alert di seluruh panel.
 *
 * Sumber utama adalah langganan realtime Supabase. Polling 30 detik
 * dipasang sebagai jaring pengaman kalau realtime tidak aktif di
 * project, supaya notifikasi tidak diam-diam tidak pernah muncul.
 */
export function AlertNotifier() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [unread, setUnread] = useState(0);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("default");
  const lastId = useRef<number | null>(null);

  const push = useCallback((row: AlertRow) => {
    if (lastId.current !== null && row.id <= lastId.current) return;
    lastId.current = row.id;

    const title = LABEL[row.alert_type] ?? row.alert_type;
    const body = (row.message ?? "").replace(/\s*\(conf\s*\d+%\)/gi, "");

    setUnread((n) => n + 1);
    setToasts((t) => [
      ...t.slice(-2),
      { id: row.id, title, body, severity: row.severity },
    ]);

    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(`AirSense · ${title}`, {
          body,
          tag: `airsense-alert-${row.id}`,
        });
      } catch {
        // Sebagian browser menolak Notification tanpa service worker.
        // Toast di dalam halaman tetap tampil.
      }
    }
  }, []);

  useEffect(() => {
    setPermission(
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission
    );

    let alive = true;

    const tick = async () => {
      try {
        const rows = await getRecentAlerts(5);
        if (!alive) return;

        // Muat pertama: jadikan alert terbaru sebagai patokan, jangan
        // memunculkan notifikasi untuk riwayat lama.
        if (lastId.current === null) {
          lastId.current = rows[0]?.id ?? 0;
          return;
        }

        for (const row of [...rows].reverse()) push(row);
      } catch {
        // Jaringan putus sesaat; coba lagi pada polling berikutnya.
      }
    };

    tick();
    const timer = setInterval(tick, POLL_MS);
    const unsubscribe = subscribeAlerts(push);

    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, [push]);

  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((t) => t.slice(1)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toasts]);

  const aktifkan = async () => {
    if (typeof Notification === "undefined") return;
    const hasil = await Notification.requestPermission();
    setPermission(hasil);
  };

  return (
    <>
      {/* Tombol lonceng + jumlah belum dibaca */}
      <Link
        href="/panel/alerts"
        onClick={() => setUnread(0)}
        aria-label={
          unread > 0 ? `${unread} peringatan baru` : "Buka halaman peringatan"
        }
        className="fixed bottom-24 right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-sky-400/40 bg-slate-900/95 text-sky-300 shadow-lg backdrop-blur transition hover:bg-slate-800 lg:bottom-6 lg:right-6"
      >
        {unread > 0 ? <BellRing size={19} /> : <Bell size={19} />}
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>

      {/* Ajakan mengaktifkan notifikasi sistem */}
      {permission === "default" && (
        <button
          type="button"
          onClick={aktifkan}
          className="fixed bottom-24 right-16 z-40 mr-2 rounded-full border border-sky-400/30 bg-slate-900/95 px-3 py-2 text-[11px] font-semibold text-sky-200 shadow-lg backdrop-blur transition hover:bg-slate-800 lg:bottom-6 lg:right-20"
        >
          Aktifkan notifikasi
        </button>
      )}

      {/* Toast di dalam halaman */}
      <div className="pointer-events-none fixed right-4 top-20 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 lg:right-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto rounded-2xl border border-sky-400/30 bg-slate-900/95 p-3 shadow-xl backdrop-blur"
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  t.severity === "HIGH"
                    ? "bg-rose-400"
                    : t.severity === "MEDIUM"
                      ? "bg-amber-400"
                      : "bg-slate-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-bold text-white">{t.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-300">
                  {t.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setToasts((x) => x.filter((v) => v.id !== t.id))}
                aria-label="Tutup notifikasi"
                className="shrink-0 text-slate-400 transition hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}