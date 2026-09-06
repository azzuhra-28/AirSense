# 📊 Analytics (Anggota 2)

EDA, analitik historis, model ML (XGBoost forecast 60 menit + Random Forest
klasifikasi ISPU), anomaly detection & alert logic.

## Struktur yang disarankan

```
analytics/
├── notebooks/          ← eksplorasi (EDA, uji model) - .ipynb
├── src/                ← kode produksi (preprocessing, model, inferensi)
├── models/             ← artefak model tersimpan (.json/.pkl) - jangan commit file besar
└── requirements.txt    ← dependency python
```

## Kontrak data (WAJIB baca dulu)

- Format input/output: `../docs/DOKUMENTASI_FORMAT_DATA_AIRLYTICS.md` (bagian 3 & 4)
- Data awal pakai dummy: `../dummy_data/output/dummy_tb_konsentrasi_gas.csv`
  (7 hari per-menit, terkalibrasi statistik data riil laporan Yusuf)
- Dummy forecast utk referensi format output: `../dummy_data/output/dummy_forecast_60menit.json`

## Spesifikasi model (dari laporan PA Yusuf)

| | XGBoost (forecast) | Random Forest (klasifikasi) |
|---|---|---|
| Target | PM2.5, PM10, CO (terpisah) | Kategori ISPU (5 kelas) |
| Horizon | 60 menit | real-time |
| Hyperparameter | n_est=300, depth=6, lr=0.05 | n_est=500, depth=14, leaf=2 |
| Fitur | 5 polutan + suhu + RH + waktu + lag 1 menit | 5 polutan mentah saja |
| Evaluasi | MAE/RMSE/MAPE (target MAPE <10%) | akurasi, F1-macro, drift test |

⚠️ Koneksi ke Supabase pakai `.env` (jangan hardcode key di notebook!).
