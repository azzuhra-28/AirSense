# Analytics AirSense (Anggota 2)

EDA, model ML (XGBoost forecast 60 menit + Random Forest klasifikasi ISPU),
anomaly & alert logic.

## Struktur

```
analytics/
├── src/
│   ├── supabase_client.py   # koneksi + CRUD ke Supabase (REST / PostgREST)
│   ├── ispu.py              # rumus ISPU PermenLHK 14/2020 (konsisten dgn firmware)
│   ├── preprocess.py        # fetch, dropna, outlier IQR, fitur lag + waktu
│   ├── train_forecast.py    # training 3x XGBoost (PM2.5, PM10, CO) horizon 60 menit
│   ├── train_classifier.py  # training Random Forest (robustness layer ISPU)
│   └── run_pipeline.py      # INFERENSI: forecast + klasifikasi + alert -> Supabase
├── models/                  # artefak model (JANGAN di-commit, lihat .gitignore)
├── notebooks/               # EDA & eksperimen
└── requirements.txt
```

## Setup

```bash
cd analytics
python -m venv .venv && .venv\Scripts\activate   # Windows
pip install -r requirements.txt
copy .env.example .env        # lalu isi SUPABASE_URL + SUPABASE_KEY
```

Requirement data: `tb_forecast` & `tb_alert` harus ada (jalankan
`../database/migrasi_forecast_alert.sql` di Supabase SQL Editor).

## Alur kerja

1. **Pastikan data masuk** — import dummy (`../dummy_data/`) atau tunggu ESP32
2. **Training**:
   ```bash
   python -m src.train_forecast    # -> models/xgboost_*.joblib + models_meta.json
   python -m src.train_classifier  # -> models/random_forest_ispu.joblib
   ```
   (Butuh minimal ±2 hari data per-menit >2880 baris)
3. **Inferensi (jalankan tiap jam)**:
   ```bash
   python -m src.run_pipeline
   ```
   Hasil: forecast 60 titik masuk `tb_forecast`, klasifikasi ISPU + alert masuk `tb_alert`.

## Otomatisasi (cron tiap jam - GitHub Actions)

Ada workflow di `../.github/workflows/forecast-nightly.yml`. Setup:
1. Push repo ke GitHub
2. Settings > Secrets & variables > Actions: tambah `SUPABASE_URL` dan `SUPABASE_KEY`
   (pakai **service role key** untuk produksi)
3. Workflow jalan otomatis tiap jam. Manual: tab Actions > workflow > Run workflow

## Evaluasi model (referensi target dari laporan Yusuf)

| Target | MAE | RMSE | MAPE (target <10%) |
|---|---|---|---|
| PM2.5 | - | - | 7.50% |
| PM10  | - | - | 9.00% |
| CO    | - | - | 6.36% |

Random Forest (robustness): accuracy 82.3%, F1-Macro 68.1% pada noise 10%.