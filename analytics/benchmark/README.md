# Benchmark Forecast PM2.5 — AirSense

Eksperimen terpisah untuk menentukan metode forecast PM2.5 terbaik.
Tidak menyentuh pipeline produksi, model, skema Supabase, atau dashboard.

## Menjalankan

```bash
cd analytics/benchmark
python run_benchmark.py
```

Opsi:

```bash
python run_benchmark.py --days 7 --seed 42
python run_benchmark.py --source csv --csv data_sensor.csv
python run_benchmark.py --folds 2
```

Butuh: pandas, numpy, scikit-learn, lightgbm, matplotlib.
Semuanya sudah ada di environment proyek. Tidak ada dependensi baru.

## Keluaran

| Berkas | Isi |
|---|---|
| `results/metrics.csv` | satu baris per metode × horizon × fold × target |
| `results/summary.md` | ringkasan, tabel, signifikansi, rekomendasi |
| `results/figures/` | MAE per horizon, contoh prediksi, cakupan interval, feature importance |

## Protokol

- Data di-resample ke grid 1 menit. Celah ≤5 menit diinterpolasi, celah
  lebih panjang dibiarkan kosong dan sampelnya dibuang.
- Dua target: **A** nilai mentah t+h, **B** rata-rata 5 menit berakhir t+h.
- Validasi: expanding window, 3 fold, gap 60 menit antara latih dan uji.
- Hyperparameter (alpha EWMA, LightGBM) dipilih hanya dari validasi di
  dalam data latih. Test fold tidak dipakai untuk memilih apa pun.
- Signifikansi: block bootstrap (blok 30, 2000 ulangan) atas selisih
  galat per sampel metode terbaik vs persistence.

## Catatan

- `--days 0` memakai seluruh data yang tersedia.
- Hasil bergantung pada data yang diambil saat dijalankan; angka di
  `summary.md` adalah hasil eksekusi terakhir, bukan nilai tetap.
