-- ============================================================
-- Retensi tb_forecast
-- ------------------------------------------------------------
-- Loop forecast menulis 60 baris setiap siklus. Pada interval
-- 1 menit itu berarti ~86.400 baris/hari (~33 MB/hari), sehingga
-- database Supabase gratis (500 MB) penuh dalam ~2 minggu.
--
-- CARA PAKAI (3 langkah, sekali saja):
--   1. Aktifkan pg_cron di menu Database > Extensions
--   2. Buka SQL Editor, tempel seluruh isi file ini, klik Run
--   3. Cek hasil query terakhir: harus muncul satu baris jadwal
-- ============================================================

-- ------------------------------------------------------------
-- LANGKAH 1: bersihkan baris uji yang tertinggal dari diagnosa.
-- Baris ini bertanggal 2020 dan tidak dipakai apa pun.
-- ------------------------------------------------------------
DELETE FROM tb_forecast
WHERE generated_at = '2020-01-01T00:00:00+00:00';

-- ------------------------------------------------------------
-- LANGKAH 2: fungsi pembersihan, simpan N hari terakhir.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- LANGKAH 3: jadwalkan tiap hari 03:00 WIB (20:00 UTC).
--
-- Kalau langkah ini error "schema cron does not exist", berarti
-- pg_cron belum aktif. Buka Database > Extensions > cari "pg_cron"
-- > aktifkan, lalu jalankan ulang blok ini saja.
-- ------------------------------------------------------------
SELECT cron.schedule(
  'airsense-retensi-forecast',
  '0 20 * * *',
  $$SELECT hapus_forecast_lama(7)$$
);

-- ------------------------------------------------------------
-- VERIFIKASI: harus muncul satu baris dengan jadwal '0 20 * * *'.
-- ------------------------------------------------------------
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'airsense-retensi-forecast';
