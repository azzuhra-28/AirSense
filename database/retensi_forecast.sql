-- ============================================================
-- Retensi tb_forecast
-- ------------------------------------------------------------
-- Loop forecast menulis 60 baris setiap siklus. Pada interval
-- 1 menit itu berarti ~86.400 baris/hari (~33 MB/hari), sehingga
-- database Supabase gratis (500 MB) penuh dalam ~2 minggu.
--
-- Jalankan file ini sekali di SQL Editor Supabase. Setelah itu
-- pembersihan berjalan otomatis tiap hari.
-- ============================================================

-- 1. Bersihkan baris uji yang tertinggal dari diagnosa.
--    Baris ini bertanggal 2020 dan tidak dipakai apa pun.
DELETE FROM tb_forecast
WHERE generated_at = '2020-01-01T00:00:00+00:00';

-- 2. Fungsi pembersihan: simpan hanya N hari terakhir.
CREATE OR REPLACE FUNCTION hapus_forecast_lama(hari integer DEFAULT 7)
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  dihapus bigint;
BEGIN
  DELETE FROM tb_forecast
  WHERE generated_at < now() - (hari || ' days')::interval;

  GET DIAGNOSTICS dihapus = ROW_COUNT;
  RETURN dihapus;
END;
$$;

-- 3. Jadwalkan tiap hari pukul 03:00 WIB (20:00 UTC).
--    pg_cron sudah tersedia di semua paket Supabase.
SELECT cron.schedule(
  'airsense-retensi-forecast',
  '0 20 * * *',
  $$SELECT hapus_forecast_lama(7)$$
);

-- 4. Cek jadwal terpasang.
SELECT jobname, schedule, command
FROM cron.job
WHERE jobname = 'airsense-retensi-forecast';

-- 5. (Opsional) jalankan sekali sekarang untuk melihat berapa baris terhapus.
-- SELECT hapus_forecast_lama(7);
