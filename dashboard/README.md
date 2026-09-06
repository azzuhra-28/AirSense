# 🖥️ Dashboard (Anggota 3)

Web dashboard publik: Air Quality Now, kartu polutan, ISPU gauge, trend
historis, forecast 60 menit, anomaly/alert, device status.

## Struktur yang disarankan

```
dashboard/
├── src/ atau app/      ← kode aplikasi (Next.js / React + Recharts)
├── public/             ← aset statis
└── package.json
```

> Laporan Yusuf pakai React + Recharts + Supabase Realtime — boleh lanjut
> stack itu atau Next.js, yang penting pola konsumsi datanya sama.

## Kontrak data (WAJIB baca dulu)

- Bentuk response & TypeScript interfaces:
  `../docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md` (bagian 3)
- Mock data siap pakai (bentuk sama dgn backend asli):
  - `../dummy_data/output/dummy_tb_konsentrasi_gas.json` — data real-time & historis
  - `../dummy_data/output/dummy_tb_prediksi_kualitas_udara.json` — ISPU
  - `../dummy_data/output/dummy_agregasi_per_jam.json` — chart pola harian
  - `../dummy_data/output/dummy_forecast_60menit.json` — halaman Predict
- Kategori ISPU (0-50 Baik, 51-100 Sedang, 101-200 Tidak Sehat,
  201-300 Sangat Tidak Sehat, 301+ Berbahaya) — Laporan Yusuf pakai
  breakpoint + Random Forest sebagai penstabil (robustness layer).

## Deployment

Public URL (Vercel/netlify dst) di minggu M12 — responsive, functional
testing, usability testing M13.
