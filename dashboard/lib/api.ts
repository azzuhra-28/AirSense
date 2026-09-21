import { supabase, supabaseConfigured } from "./supabase";
import type { ForecastRow, KonsentrasiGas } from "./types";

/**
 * Ambil pembacaan sensor dari Supabase.
 *
 * @param minutes Rentang waktu ke belakang (detik? tidak — menit).
 * @param limit   Batas jumlah baris untuk keamanan.
 */
export async function fetchRecentReadings(
  minutes: number,
  limit = 5000
): Promise<KonsentrasiGas[]> {
  if (!supabase) return [];

  const since = new Date(
    Date.now() - minutes * 60_000
  ).toISOString();

  const { data, error } = await supabase
    .from("tb_konsentrasi_gas")
    .select(
      "id, created_at, pm25_ugm3, pm10_ugm3, co_ugm3, no2_ugm3, o3_ugm3, temperature, humidity"
    )
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as KonsentrasiGas[];
}

export async function getLatestGas() {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("tb_konsentrasi_iso")
    .select("*")
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] as KonsentrasiGas | undefined;
}

export async function getHistory24h() {
  return fetchRecentReadings(24 * 60);
}

/** N baris terakhir tanpa filter waktu (untuk alat yang sudah lama mati). */
export async function fetchLatestReadings(limit = 500) {
  if (!supabase) return [] as KonsentrasiGas[];

  const { data, error } = await supabase
    .from("tb_konsentrasi_gas")
    .select(
      "id, created_at, pm25_ugm3, pm10_ugm3, co_ugm3, no2_ugm3, o3_ugm3, temperature, humidity"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as KonsentrasiGas[]).reverse();
}

export async function getHistory(minutes: number) {
  return fetchRecentReadings(minutes);
}

export async function getLatestForecast() {
  if (!supabase) return [] as ForecastRow[];

  const { data: gen } = await supabase
    .from("tb_forecast")
    .select("generated_at")
    .order("generated_at", { ascending: false })
    .limit(1);

  const latestGen = gen?.[0]?.generated_at;
  if (!latestGen) return [] as ForecastRow[];

  const { data, error } = await supabase
    .from("tb_forecast")
    .select("*")
    .eq("generated_at", latestGen)
    .order("forecast_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ForecastRow[];
}

/* ============================================================
   Alert
============================================================ */

export interface AlertRow {
  id: number;
  created_at: string;
  alert_type: string;
  severity: string;
  message: string | null;
  is_active: boolean | null;
  payload: Record<string, unknown> | null;
}

/** Ambil N alert terbaru dari tb_alert. */
export async function getRecentAlerts(limit = 25) {
  if (!supabase) return [] as AlertRow[];

  const { data, error } = await supabase
    .from("tb_alert")
    .select(
      "id,created_at,alert_type,severity,message,is_active,payload"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as AlertRow[];
}

/** Berlangganan alert baru secara realtime. */
export function subscribeAlerts(
  cb: (row: AlertRow) => void
): () => void {
  const client = supabase;
  if (!client) return () => {};

  const channel = client
    .channel("airsense-alerts")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tb_alert",
      },
      (payload) => cb(payload.new as AlertRow)
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Berlangganan pembacaan baru secara realtime.
 * Mengembalikan fungsi berhenti berlangganan.
 */
export function subscribeGas(
  cb: (row: KonsentrasiGas) => void
): () => void {
  const client = supabase;
  if (!client) return () => {};

  const channel = client
    .channel("airsense-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tb_konsentrasi_gas",
      },
      (payload) => cb(payload.new as KonsentrasiGas)
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

export { supabaseConfigured };
