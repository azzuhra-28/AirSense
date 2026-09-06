# 🗄️ Database (Anggota 1)

Skema & SQL untuk Supabase.

## Isi folder

| File | Fungsi |
|---|---|
| `db_airlytics.sql` | Skema utama: 3 tabel (`tb_konsentrasi_gas`, `tb_analog_out`, `tb_prediksi_kualitas_udara`) |
| `policy_rls.sql` | Policy RLS read/insert untuk anon key *(akan dibuat)* |
| `agregasi.sql` | Fungsi/tabel agregasi per jam (RPC utk Edge Function) *(akan dibuat)* |

## Urutan setup

1. Jalankan `db_airlytics.sql` di Supabase SQL Editor
2. Import dummy data — lihat `../dummy_data/README.md`
3. Jalankan `policy_rls.sql` kalau dashboard belum bisa baca data
4. (Opsional, M6+) `agregasi.sql` untuk chart performa

## Referensi

- Format lengkap kolom & payload: `../docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md`
- Konsep agregasi (Edge Functions + cron): laporan Yusuf bab 3.2.6 di `../docs/bacaan/`
