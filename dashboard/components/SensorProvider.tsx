"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchLatestReadings,
  fetchRecentReadings,
  subscribeGas,
  supabaseConfigured,
} from "@/lib/api";
import { aqiOf, POLLUTANTS } from "@/lib/brand";
import {
  DEVICE_DESCRIPTION,
  deviceStatusFrom,
  type DeviceStatus,
} from "@/lib/device";
import { ispuOf, toWIB } from "@/lib/ispu";
import type { KonsentrasiGas } from "@/lib/types";

export type DataSource = "supabase" | "demo" | "none";

export interface PollutantReading {
  key: string;
  label: string;
  unit: string;
  color: string;
  raw: number;
  display: number;
  ispu: number;
}

export interface SensorContextValue {
  loading: boolean;
  failed: boolean;
  refreshing: boolean;
  source: DataSource;
  rows: KonsentrasiGas[];
  reload: () => void;
  latest: KonsentrasiGas | null;
  pollutants: PollutantReading[];
  dominant: PollutantReading | null;
  ispu: number;
  tone: ReturnType<typeof aqiOf>;
  temp: number;
  hum: number;
  at: string;
  /** Status alat (online / terlambat / offline). */
  status: DeviceStatus;
  statusText: string;
  /** Usia data terakhir dalam menit. */
  lastSeenMinutes: number | null;
}

const SensorContext = createContext<SensorContextValue | null>(null);

const DEMO_PATH = "/data/dummy_tb_konsentrasi_gas.json";
const DEMO_WINDOW = 1440; // ~24 jam bila kadensi per menit

export function SensorProvider({ children }: { children: ReactNode }) {
  const [rows, setRows] = useState<KonsentrasiGas[]>([]);
  const [source, setSource] = useState<DataSource>("none");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /** Detik sejak epoch; diperbarui berkala untuk memicu perhitungan status. */
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setRefreshing(true);
    setFailed(false);

    let live: KonsentrasiGas[] = [];
    let liveOk = false;

    if (supabaseConfigured) {
      try {
        live = await fetchRecentReadings(24 * 60);
        liveOk = true;
        setSource("supabase");
      } catch {
        liveOk = false;
      }
    }

    if (liveOk && live.length > 0) {
      setRows(live);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    // Data Supabase ada tetapi sudah lama (alat mati): jangan
    // tutupi dengan data demo — tampilkan data asli terakhir
    // agar status perangkat & pembacaan tetap jujur.
    if (liveOk) {
      try {
        const latest = await fetchLatestReadings(500);
        if (latest.length > 0) {
          setRows(latest);
          setSource("supabase");
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch {
        /* lanjut ke fallback demo */
      }
    }

    try {
      const res = await fetch(`${DEMO_PATH}?t=${Date.now()}`);
      if (!res.ok) throw new Error(String(res.status));
      const demo: KonsentrasiGas[] = await res.json();
      setRows(demo.slice(-DEMO_WINDOW));
      setSource(supabaseConfigured ? "demo" : "demo");
      setFailed(false);
    } catch {
      setFailed(true);
      setSource("none");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Detak status: hitung ulang usia data tiap 30 detik.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Realtime: baris baru langsung masuk + status kembali online.
  useEffect(() => {
    if (!supabaseConfigured) return;

    const unsubscribe = subscribeGas((row) => {
      setRows((prev) => {
        if (prev.some((r) => r.id === row.id)) return prev;
        const next = [...prev, row];
        return next.length > DEMO_WINDOW ? next.slice(-DEMO_WINDOW) : next;
      });
      setNow(Date.now());
    });

    return unsubscribe;
  }, []);

  const latest = rows.length ? rows[rows.length - 1] : null;

  const lastSeenMinutes = useMemo(() => {
    if (!latest) return null;
    const t = new Date(latest.created_at).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((now - t) / 60_000));
  }, [latest, now]);

  const status = useMemo<DeviceStatus>(
    () => deviceStatusFrom(latest?.created_at, now),
    [latest, now]
  );

  const pollutants = useMemo<PollutantReading[]>(() => {
    if (!latest) return [];
    return POLLUTANTS.map((p) => {
      const raw = Number(latest[p.key as keyof KonsentrasiGas]);
      const safe = Number.isFinite(raw) ? raw : 0;
      return {
        key: p.key,
        label: p.label,
        unit: p.unit,
        color: p.color,
        raw: safe,
        display: safe * p.scale,
        ispu: ispuOf(p.key, safe),
      };
    });
  }, [latest]);

  const dominant = useMemo<PollutantReading | null>(
    () =>
      pollutants.length
        ? pollutants.reduce((a, b) => (b.ispu > a.ispu ? b : a))
        : null,
    [pollutants]
  );

  const value: SensorContextValue = {
    loading,
    failed,
    refreshing,
    source,
    rows,
    reload: load,
    latest,
    pollutants,
    dominant,
    ispu: Math.round(dominant?.ispu ?? 0),
    tone: aqiOf(Math.round(dominant?.ispu ?? 0)),
    temp: Number(latest?.temperature),
    hum: Number(latest?.humidity),
    at: latest?.created_at ?? "",
    status,
    statusText: DEVICE_DESCRIPTION[status],
    lastSeenMinutes,
  };

  return (
    <SensorContext.Provider value={value}>{children}</SensorContext.Provider>
  );
}

/** Akses data sensor bersama; melempar bila dipakai di luar Provider. */
export function useSensorData(): SensorContextValue {
  const ctx = useContext(SensorContext);
  if (!ctx) {
    throw new Error(
      "useSensorData harus dipakai di dalam <SensorProvider>."
    );
  }
  return ctx;
}

/** Seri metrik untuk sparkline / grafik (dengan skala satuan). */
export function metricSeries(
  rows: KonsentrasiGas[],
  key: string,
  scale = 1,
  n = 24
) {
  return rows.slice(-n).map((r) => ({
    t: toWIB(r.created_at),
    v: (Number(r[key as keyof KonsentrasiGas]) || 0) * scale,
  }));
}
