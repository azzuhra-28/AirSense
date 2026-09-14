-- ============================================================
-- AKTIFKAN SUPABASE REALTIME untuk tabel AirSense
-- ============================================================
-- TANPA ini: dashboard yang sudah kebuka TIDAK dapat event INSERT,
-- data baru hanya muncul setelah refresh halaman.
-- Jalankan SEKALI setelah tabel dibuat. Kalau error
-- "table is already member of publication", aman — berarti sudah aktif.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_konsentrasi_gas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_analog_out;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_prediksi_kualitas_udara;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_forecast;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tb_alert;

-- ============================================================
-- VERIFIKASI: harus keluar 5 baris (tabel + pubname = supabase_realtime)
--   SELECT schemaname, tablename, pubname
--   FROM pg_publication_tables
--   WHERE schemaname = 'public';
-- ============================================================
