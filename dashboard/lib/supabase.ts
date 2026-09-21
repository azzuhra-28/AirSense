import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * Klien tidak lagi dilempar error saat import agar halaman tetap
 * bisa tampil (mode demo) ketika env belum diisi.
 */
export const supabaseConfigured = Boolean(url && key);

export const supabase = supabaseConfigured
  ? createClient(url, key, {
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;
