-- ============================================================
-- MIGRASI: kolom insight di tb_forecast
-- ============================================================
-- Menyimpan teks insight dari pipeline analytics (mis. ringkasan
-- kondisi + rekomendasi) per siklus forecast.
--
-- Catatan desain: 1 siklus forecast = 60 baris (t+1..t+60) dgn
-- generated_at yang sama. Pipeline menulis teks insight yang
-- SAMA ke seluruh baris dalam satu siklus; dashboard cukup baca
-- dari 1 baris saja (mis. baris pertama siklus terbaru).
-- ============================================================

ALTER TABLE public.tb_forecast
ADD COLUMN IF NOT EXISTS insight TEXT;

-- RLS: tidak perlu diubah. Policy tabel (allow_select /
-- allow_insert dengan USING/WITH CHECK true) otomatis mencakup
-- kolom baru ini.
