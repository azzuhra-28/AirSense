-- ============================================================
-- POLICY RLS - Airlytics (jalankan SEKALI setelah db_airlytics.sql)
-- ============================================================
-- Kenapa perlu: publishable key memang didesain semi-publik, tapi
-- amannya HANYA kalau RLS (Row Level Security) aktif dengan policy
-- yang jelas. Tanpa ini, siapa pun yang pegang publishable key
-- bisa baca/tulis/hapus semua data.
--
-- Policy di bawah = open policy (semua orang boleh baca & insert).
-- Ini standar untuk MVP: ESP32 & dashboard pakai publishable key,
-- penulisan/penyalahgunaan dilaporkan lewat monitoring.
-- ============================================================

-- 1. TABEL KONSENTRASI GAS
ALTER TABLE public.tb_konsentrasi_gas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_tb_konsentrasi_gas"
  ON public.tb_konsentrasi_gas
  FOR SELECT
  USING (true);

CREATE POLICY "allow_insert_tb_konsentrasi_gas"
  ON public.tb_konsentrasi_gas
  FOR INSERT
  WITH CHECK (true);

-- 2. TABEL ANALOG OUT
ALTER TABLE public.tb_analog_out ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_tb_analog_out"
  ON public.tb_analog_out
  FOR SELECT
  USING (true);

CREATE POLICY "allow_insert_tb_analog_out"
  ON public.tb_analog_out
  FOR INSERT
  WITH CHECK (true);

-- 3. TABEL PREDIKSI / ISPU
ALTER TABLE public.tb_prediksi_kualitas_udara ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_select_tb_prediksi_kualitas_udara"
  ON public.tb_prediksi_kualitas_udara
  FOR SELECT
  USING (true);

CREATE POLICY "allow_insert_tb_prediksi_kualitas_udara"
  ON public.tb_prediksi_kualitas_udara
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- CATATAN:
-- - INSERT/SELECT dari ESP32 & dashboard: JALAN (pakai publishable key)
-- - UPDATE/DELETE: TIDAK ada policy = otomatis DITOLAK semua orang
--   (data historis sensor aman dari kehabisan/kehapus tidak sengaja)
-- - Kalau nanti perlu hapus data (mis. bersih-bersih dummy), pakai
--   Table Editor / SQL Editor yang login sebagai owner (bypass RLS)
-- ============================================================
