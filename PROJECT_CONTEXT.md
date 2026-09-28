# PROJECT_CONTEXT.md — AirSense

> **CARA PAKAI FILE INI (WAJIB DIBACA SETIAP SESI):**
>
> 1. **Di awal sesi baru**, baca seluruh file ini SEBELUM mengerjakan apa pun,
>    supaya kerja sinkron dengan checkpoint terakhir.
> 2. **Setiap selesai pekerjaan penting / mengambil keputusan teknis**,
>    update bagian yang relevan (STATUS SISTEM, KEPUTUSAN, NEXT STEPS).
> 3. File ini adalah **single source of truth** tentang kondisi project.
>
> Terakhir diperbarui: 2026-09-28 (sesi dokumentasi format data)

---

## 1. PROJECT CONTEXT

- **Nama project:** AirSense — Platform Analitik Kualitas Udara Berbasis IoT
- **Latar belakang:** Proyek ini adalah kelanjutan/pengembangan dari PA
  (Proyek Akhir) sebelumnya milik **"Yusuf"**, yang sudah membangun sistem
  dasar berupa:
  - Perangkat IoT (ESP32 + sensor PM2.5/PM10/CO/NO2/O3 + DHT22)
    yang mengirim data ke Supabase
  - Dashboard Next.js
  - Model forecasting **XGBoost** (prediksi 60 menit)
  - Model klasifikasi **Random Forest** (kategori ISPU)
- **Tujuan project saat ini:** Mengembangkan sistem existing tersebut
  menjadi platform analitik yang lebih lengkap — meliputi:
  - Historical analytics
  - Trend analytics
  - Peak-time analytics
  - Air quality alert
  - Anomaly detection
  - Spatial analytics multi-lokasi
  - Data quality monitor
  - AI summary
  - Fitur tanya-jawab **"Ask AirSense"**
- **Stack teknis:**
  - ESP32 (firmware)
  - Supabase (database/backend)
  - Next.js (dashboard/frontend)
  - Python (pipeline ML)
  - XGBoost & Random Forest (model)

---

## 2. STATUS SISTEM SAAT INI (per checkpoint terakhir)

- **Hardware/perangkat IoT:** Dikonfirmasi **AMAN dan berfungsi**
  (dikonfirmasi langsung oleh Yusuf).
- **Yang perlu diganti:** **HOST dan API KEY Supabase** (project Supabase
  lama milik Yusuf akan diganti ke project baru). Ini mempengaruhi:
  - Firmware ESP32
  - `.env` dashboard Next.js
  - Config pipeline Python
- **Data historis:** Kemungkinan **TIDAK ikut pindah otomatis** ke
  Supabase project baru (perlu dicek / export-import manual jika
  dibutuhkan).
- **Known issue yang diwariskan:** Sensor **NO2 dan O3** memiliki masalah
  kalibrasi/wiring — data belum representatif. Sudah dicatat sebagai
  saran perbaikan oleh Yusuf di laporan PA-nya, tapi belum diperbaiki.

---

## 3. TASK YANG SEDANG DIKERJAKAN

- **Analisis & Sinkronisasi Sistem End-to-End:**
  - Selesai membedah sinkronisasi data: ESP32 -> Supabase (REST API) -> Next.js Dashboard (WebSocket Realtime CDC).
  - Selesai memperbaiki visualisasi grafik pada halaman **Analitik & Tren** (`dashboard/app/analytics/page.tsx`): ditambahkan filter limit (30, 60 default, 120, Semua), sanitasi nilai negatif (clamp 0), dan perbaikan skala YAxis.
  - Selesai mengatasi bottleneck performa laptop saat menjalankan dashboard (bug memory Turbopack di Windows diatasi dengan membersihkan lockfile root dan menjalankan server production `next start`).
  - Selesai mendiagnosis dan memperbaiki sinkronisasi forecast: query `getLatestForecast()` di `dashboard/lib/api.ts` kini toleran terhadap data uji coba 1-baris dan selalu memilih batch 60-titik yang valid.
  - Berhasil menjalankan model forecast recurrent (`python -m src.run_forecast_rnn`) yang menghasilkan 60 titik prediksi baru ke `tb_forecast`.

---

## 4. KEPUTUSAN / CATATAN PENTING

- **Server Dashboard di Windows:**
  `next dev` dengan Turbopack di Windows sempat menyebabkan crash *out of memory (os error 1450)* saat compile CSS/PostCSS. Solusi stabil: gunakan bundle teroptimasi via `npm run build` dan `npm run start` (penggunaan RAM hanya ~59 MB, CPU < 1%).
- **Penyempurnaan Pelatihan Model Runtun Waktu (`run_forecast_rnn.py`):**
  Fungsi `load_data()` diperbaiki dari sebelumnya mengambil 1.000 data tertua (`created_at.asc`) menjadi data terbaru (`created_at.desc`, lalu diurutkan kronologis) agar model memprediksi berdasarkan kondisi sensor riil terkini.
- **Deteksi Data Drift di Halaman Prediksi:**
  Pengecekan drift menggabungkan deviasi persentase (> 50%) dan ambang batas selisih absolut minimum (PM2.5 >= 8 µg/m³, PM10 >= 12 µg/m³, CO >= 800 µg/m³) untuk mencegah alarm palsu saat udara sangat bersih.
- **Fitur Dual View Prediksi:**
  Ditambahkan switcher antara mode `Indeks ISPU (0-300)` dan `Konsentrasi Fisik (µg/m³)` di halaman `/predict`.
- **Hasil Evaluasi Akurasi Model (Test Set Independen):**
  Pengujian perbandingan *apple-to-apple* antara **XGBoost** (baseline PA Yusuf) vs **Deep Learning (LSTM/GRU)** pada 10.501 data sensor Supabase menunjukkan bahwa arsitektur Recurrent Neural Network secara konsisten mengungguli XGBoost:
  - PM2.5: **LSTM** unggul (MAE: 4.87 vs 5.25 µg/m³, MAPE: 39.5% vs 42.9%).
  - PM10: **GRU** unggul (MAE: 6.57 vs 6.84 µg/m³, RMSE: 16.67 vs 16.81 µg/m³).
  - CO: **GRU** unggul signifikan (MAE: 556.5 vs 629.3 µg/m³, MAPE: 41.4% vs 45.7%).

---

## 5. NEXT STEPS

1. Hubungkan pipeline analytics otomatis (`src/scheduler.py` atau cron GitHub Actions) agar rutin memperbarui `tb_forecast` dan `tb_alert`.
2. Lakukan pengujian migrasi kredensial Supabase baru ke firmware ESP32 dan lingkungan live.
3. Lanjutkan pengembangan modul analitik lanjutan: anomaly detection UI dan fitur tanya-jawab "Ask AirSense".

---

*— Akhir file. Ingat: baca dulu tiap sesi baru, update tiap selesai kerja. —*
