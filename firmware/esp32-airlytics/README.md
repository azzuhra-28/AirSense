# 📡 Firmware ESP32 (Anggota 1)

Firmware perangkat IoT Airlytics — Arduino sketch (folder `main`).

## Sensor & Pin

| Sensor | Parameter | Pin |
|---|---|---|
| DHT22 | suhu (°C), kelembapan (%RH) | GPIO 33 |
| GP2Y1010AU0F | PM2.5, PM10 (µg/m³) | ADC GPIO 35 (+ LED GPIO 2) |
| MiCS-6814 | CO, NO₂ (µg/m³) | CO=GPIO 39, NO₂=GPIO 34 |
| MQ-131 | O₃ (µg/m³) | ADC GPIO 32 |
| Relay kipas | pendingin otomatis (suhu ≥35°C) | GPIO 4 |

## Kredensial (secrets.h) ⚠️ PENTING

WiFi & Supabase key **TIDAK lagi ditulis di main.ino** — sudah dipindah ke
`secrets.h` yang tidak ikut di-commit (lihat `.gitignore` di root repo).

Kalau compile error `fatal error: secrets.h: No such file or directory`:

1. Copy `secrets.h.example` → rename jadi **`secrets.h`** (di folder yang sama dgn main.ino)
2. Isi: nama WiFi, password, Project ID Supabase (`xxx.supabase.co` tanpa https://),
   dan **publishable key** (`sb_publishable_...` — bukan yang `sb_secret_...`!)

Kenapa dipisah? `sb_publishable` memang semi-publik, tapi begitu repo masuk
GitHub, kredensial yang ter-commit = praktik buruk + susah di-revoke rapi.
File contoh: `secrets.h.example`.

## Cara build & upload

1. Arduino IDE → Open `main/main.ino` (file lain ikut kebuka sebagai tab)
2. Board: **ESP32 Dev Module** (driver CP210x ada di folder `Projek` luar repo)
3. WiFi dikonfigurasi via portal WiFiManager (AP: "Air Quality Access Point")
4. Upload, monitor serial 115200 baud

## Perilaku

- Baca sensor tiap 2 detik, kirim ke Supabase tiap **60 detik**
- Kirim 3 POST berurutan: `tb_konsentrasi_gas` → `tb_analog_out` → `tb_prediksi_kualitas_udara`
  (kalau satu gagal, sisanya dibatalkan, LCD tampil error code)
- LCD 16x2 I2C (0x27) rotasi tampilan tiap 3 detik

## ⚠️ TODO sebelum repo dibagikan

✅ SELESAI — `SUPABASE_HOST` & `SUPABASE_API_KEY` sudah dipindah ke `secrets.h`
(dikecualikan via `.gitignore`; templat untuk anggota tim: `secrets.h.example`).
Sisa tugas: pastikan `.gitignore` ikut ter-commit saat git init nanti.
