import { supabase } from "./supabase";
import type { ForecastRow, KonsentrasiGas } from "./types";

export async function getLatestGas() {
  const { data, error } = await supabase
    .from("tb_konsentrasi_gas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data ?? [])[0] as KonsentrasiGas | undefined;
}

export async function getHistory24h() {
  return getHistory(24 * 60);
}

export async function getHistory(minutes: number) {
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("tb_konsentrasi_gas")
    .select("created_at, pm25_ugm3, pm10_ugm3, co_ugm3, no2_ugm3, o3_ugm3, temperature, humidity")
    .gte("created_at", since)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as KonsentrasiGas[];
}

export async function getLatestForecast() {
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

export function subscribeGas(cb: (row: KonsentrasiGas) => void) {
  return supabase
    .channel("live-gas")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tb_konsentrasi_gas" },
      (payload) => cb(payload.new as KonsentrasiGas)
    )
    .subscribe();
}
