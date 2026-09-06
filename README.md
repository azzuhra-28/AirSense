# AirSense — Airlytics

Platform analitik kualitas udara berbasis IoT (lanjutan PA Yusuf:
*Dashboard Real-Time Monitoring & Prediksi Kualitas Udara Surabaya*).

**Parameter:** PM2.5, PM10, CO, NO₂, O₃ (µg/m³) + suhu (°C) + kelembapan (%RH) → ISPU.

## Struktur Folder

| Folder | Isi | Pemilik |
|---|---|---|
| `docs/` | Dokumentasi format data, laporan referensi, jobdesk | Bersama |
| `database/` | Skema Supabase + SQL (tabel, policy, agregasi) | Anggota 1 |
| `firmware/esp32-airlytics/` | Kode ESP32 (Arduino, sketch `main`) | Anggota 1 |
| `dummy_data/` | Generator + data dummy terkalibrasi (aset bersama) | Bersama |
| `analytics/` | EDA, model XGBoost/RF *(akan dibuat)* | Anggota 2 |
| `dashboard/` | Web dashboard *(akan dibuat)* | Anggota 3 |
| `archive/` | Arsip zip lama | — |

## Alur Data (ringkas)

```
ESP32 (per 60 detik, HTTPS POST JSON)
  → Supabase tb_konsentrasi_gas / tb_analog_out / tb_prediksi_kualitas_udara
    → analytics (XGBoost forecast 60 menit, RF kategori ISPU)
      → dashboard (real-time + forecast)
```

Detail lengkap format data: **`docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md`**

## Quick Start

1. **Database** — jalankan `database/db_airlytics.sql` di Supabase SQL Editor
2. **Dummy data** — lihat `dummy_data/README.md` (3 file `.sql` siap import)
3. **Firmware** — buka `firmware/esp32-airlytics/main/main.ino` di Arduino IDE
   (driver board: folder `Projek` di luar repo ini — driver CP210x)

## Catatan Penting

- ⚠️ `SUPABASE_API_KEY` masih hardcoded di `firmware/esp32-airlytics/main/main.ino`
  (baris 29) — pindahkan ke file `secrets.h` sebelum repo dibagikan/publik.
- Dokumen jobdesk & laporan Yusuf ada di `docs/bacaan/`.
