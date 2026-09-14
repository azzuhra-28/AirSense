# 🖥️ Dashboard AirSense (Anggota 3)

Dashboard web publik: Air Quality Now (real-time), tren 24 jam, dan prediksi
60 menit. Bootstrapped dari struktur resmi — dikembangkan lebih lanjut oleh
Anggota 3.

## Stack

- **Next.js** (App Router) + TypeScript
- **Tailwind CSS** v4
- **Recharts** (grafik)
- **@supabase/supabase-js** — query + **Realtime** (update live tanpa refresh)

## Setup & run

```bash
cd dashboard
npm install
copy .env.local.example .env.local   # isi URL + publishable key Supabase
npm run dev                          # buka http://localhost:3000
```

Requirements di Supabase:
- Tabel `tb_konsentrasi_gas`, `tb_prediksi_kualitas_udara` (db_airlytics.sql)
- Tabel `tb_forecast` (migrasi_forecast_alert.sql) — untuk halaman Forecast
- RLS: read=true (policy_rls.sql) supaya publishable key bisa SELECT

## Struktur

```
dashboard/
├── app/
│   ├── layout.tsx          # navbar + tampilan dasar
│   ├── page.tsx            # Overview (realtime + chart 24 jam)
│   └── predict/page.tsx    # Forecast 60 menit
├── lib/
│   ├── supabase.ts         # client (env: NEXT_PUBLIC_*)
│   ├── types.ts            # kontrak data + kategori ISPU
│   ├── ispu.ts             # perhitungan ISPU (backend-independent)
│   └── api.ts              # helper query + realtime subscription
```

## Kontrak data & referensi

- Format data lengkap: `../docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md`
- Mock data utk test offline: `../dummy_data/output/*.json`
- Palet kategori ISPU sudah di `lib/types.ts` (ISPU_CATEGORIES)

## Cara ngembangin (yang bisa Anggota 3 lanjutkan)

1. **Halaman Alert** — ambil dari `tb_alert` (`lib/api.ts` tambah helper)
2. **Filter periode** di chart Overview (1/7/14/30/90 jam)
3. **Halaman pola harian / agregasi** — baca `dummy_agregasi_per_jam.json`
   (data konsep per-jam, kalau kurasa cukup pakai query `tb_konsentrasi_gas`)
4. **Deploy** ke Vercel: hubungkan repo → isi env `NEXT_PUBLIC_*` → deploy
   (siap target M12/M14)

## Catatan penting

- JANGAN pakai service role key di frontend — cuma publishable/anon key.
- Waktu disimpan UTC di DB; komponen pakai helper `toWIB()` (WIB = UTC+7).