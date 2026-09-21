# Analytics AirSense (Anggota 2)

Modul analytics AirSense menangani eksplorasi dan analisis data, perhitungan ISPU, forecasting kualitas udara 60 menit ke depan, anomaly detection, dan alert logic.

## Struktur

```text
analytics/
├── src/
│   ├── supabase_client.py   # koneksi dan akses data Supabase
│   ├── ispu.py              # perhitungan ISPU berbasis breakpoint
│   ├── preprocess.py        # preprocessing dan feature engineering
│   ├── train_forecast.py    # training dan seleksi model forecast t+60 menit
│   ├── anomaly.py           # anomaly detection dengan Rolling Z-Score dan Isolation Forest
│   ├── alert_logic.py       # logika alert berdasarkan anomaly, ISPU, dan forecast
│   └── run_pipeline.py      # pipeline analytics dan inferensi
├── models/                  # artefak model (JANGAN di-commit, lihat .gitignore)
├── notebooks/               # EDA dan eksperimen analytics
├── outputs/                 # output hasil eksperimen
└── requirements.txt
```

## Setup

```bash
cd analytics

python -m venv .venv
.venv\Scripts\activate

pip install -r requirements.txt

copy .env.example .env
```

Isi `SUPABASE_URL` dan `SUPABASE_KEY` pada file `.env` untuk menggunakan data dari Supabase.

## Alur Kerja Analytics

Alur utama analytics AirSense:

```text
Data Sensor
    ↓
Preprocessing & Feature Engineering
    ↓
Perhitungan ISPU
    ↓
Anomaly Detection
    ↓
Forecast t+60 Menit
    ↓
Forecast Indicator
    ↓
Alert Logic
```

### 1. Preprocessing dan Feature Engineering

Preprocessing dilakukan melalui `src/preprocess.py`.

Tahapan utama meliputi:

- validasi kolom data sensor
- parsing dan pengurutan timestamp
- penanganan timestamp duplikat
- validasi nilai konsentrasi
- pembuatan lag features
- rolling statistics
- temporal cyclical features

Feature forecasting menggunakan lag 1, 10, 30, dan 60 menit serta rolling statistics 10, 30, dan 60 menit.

Data dibagi secara kronologis menjadi train, validation, dan test untuk menghindari time-series data leakage.

### 2. Perhitungan ISPU

Perhitungan ISPU dilakukan melalui `src/ispu.py`.

Polutan yang digunakan:

- PM2.5
- PM10
- CO
- NO2
- O3

Kategori ISPU dihitung secara deterministik berdasarkan konsentrasi dan breakpoint ISPU, bukan menggunakan model klasifikasi Machine Learning.

Pada pipeline saat ini, konsentrasi rolling 24 jam digunakan sebelum perhitungan ISPU.

Kategori yang dihasilkan:

- Baik
- Sedang
- Tidak Sehat
- Sangat Tidak Sehat
- Berbahaya

### 3. Forecasting

Training forecasting dilakukan melalui:

```bash
python -m src.train_forecast
```

Forecast dilakukan secara direct forecasting dengan horizon:

```text
t + 60 menit
```

Target forecast terdiri dari:

- PM2.5
- PM10
- CO
- NO2
- O3

Kandidat model yang dibandingkan:

- Persistence Baseline
- Ridge Regression
- XGBoost

Model dipilih secara terpisah untuk setiap polutan berdasarkan performa pada validation set.

Pada eksperimen menggunakan dummy data saat ini, model yang terpilih adalah:

| Polutan | Model Terpilih |
|---|---|
| PM2.5 | Ridge |
| PM10 | Ridge |
| CO | Ridge |
| NO2 | Persistence |
| O3 | XGBoost |

Model yang terpilih kemudian dilatih kembali menggunakan data train + validation dan dievaluasi pada test set.

Metrik evaluasi utama:

- MAE
- RMSE

Hasil pada dummy data merupakan hasil pengembangan awal dan perlu dievaluasi kembali menggunakan data sensor aktual.

### 4. Anomaly Detection

Anomaly detection dilakukan melalui `src/anomaly.py` menggunakan dua metode.

**Rolling Z-Score**

Mendeteksi perubahan tidak biasa pada masing-masing polutan berdasarkan pola historis sebelumnya.

Konfigurasi prototype:

```text
Rolling window : 60 menit
Z threshold    : 3.0
```

**Isolation Forest**

Digunakan untuk mendeteksi pola multivariat yang tidak biasa berdasarkan:

- PM2.5
- PM10
- CO
- NO2
- O3
- Temperature
- Humidity

Konfigurasi prototype:

```text
n_estimators  : 300
contamination : 0.01
random_state  : 42
```

Anomaly menunjukkan observasi yang tidak biasa dibandingkan pola data referensi dan tidak otomatis berarti kondisi kualitas udara berbahaya.

### 5. Alert Logic

Logika alert berada pada `src/alert_logic.py`.

Alert mempertimbangkan tiga sumber informasi:

- anomaly evidence
- kondisi kualitas udara berdasarkan ISPU
- indikator hasil forecast

Level anomaly dibagi menjadi:

```text
None
Observation
Moderate
Strong
```

Anomaly alert diberikan pada level `Moderate` dan `Strong`.

Dengan demikian, anomaly detection dan alert merupakan dua proses yang berbeda. Tidak setiap anomaly otomatis menghasilkan alert.

### 6. Forecast Indicator

Hasil prediksi konsentrasi t+60 juga digunakan untuk membentuk indikator kualitas udara eksperimental.

Forecast indicator bukan ISPU resmi untuk 60 menit ke depan karena prediksi konsentrasi pada satu timestamp tidak menggantikan keseluruhan periode agregasi yang dibutuhkan untuk perhitungan ISPU resmi.

Indikator ini digunakan sebagai informasi analitik tambahan untuk mendukung alert dan dashboard.

## Menjalankan Pipeline

Pipeline analytics dapat dijalankan dengan:

```bash
python -m src.run_pipeline
```

Pipeline menjalankan proses:

```text
Preprocessing
→ ISPU
→ Anomaly Detection
→ Forecast t+60
→ Forecast Indicator
→ Alert Logic
```

Pipeline juga dapat diuji secara lokal menggunakan dummy data tanpa harus menjalankan koneksi Supabase.

Pada tahap pengembangan saat ini, pipeline analytics belum melakukan write hasil forecast dan alert ke database. Integrasi penyimpanan hasil ke Supabase dilakukan setelah schema dan kontrak data dikoordinasikan dengan bagian Database & Cloud.

## Otomatisasi

Repository memiliki workflow:

```text
../.github/workflows/forecast-nightly.yml
```

Workflow digunakan untuk menjalankan proses analytics secara otomatis menggunakan GitHub Actions.

Konfigurasi Supabase menggunakan GitHub Secrets:

```text
SUPABASE_URL
SUPABASE_KEY
```

Implementasi workflow perlu disesuaikan dengan pipeline forecasting terbaru sebelum digunakan sebagai pipeline produksi.

## Catatan Pengembangan

Dataset yang digunakan dalam tahap pengembangan analytics saat ini masih berupa dummy data.

Setelah data sensor aktual tersedia, beberapa bagian perlu dievaluasi kembali, terutama:

- kualitas dan kontinuitas data sensor
- coverage data untuk perhitungan rolling 24 jam
- performa model forecasting
- pemilihan model per polutan
- threshold anomaly
- parameter Isolation Forest
- alert severity
- kebutuhan retraining model

Hasil eksperimen menggunakan dummy data tidak dianggap sebagai performa final AirSense pada kondisi lingkungan sebenarnya.

## 7. Perbandingan Model: XGBoost vs RNN (LSTM / BiLSTM / GRU)

Untuk membedakan pendekatan pemodelan dari penelitian sebelumnya (yang memakai XGBoost sebagai model utama), AirSense menyediakan modul perbandingan yang melatih **XGBoost (tree-based)** dan **model recurrent (deep learning, PyTorch)** pada **data dan test set yang sama**, sehingga hasilnya apple-to-apple.

Modul:

```text
src/model_lstm.py      # arsitektur LSTM/BiLSTM/GRU + training + inference
src/compare_models.py  # script perbandingan XGBoost vs RNN
src/tune_lstm.py       # grid search hyperparameter RNN
```

### 7.1 Hyperparameter Tuning

Mencari konfigurasi terbaik per polutan berdasarkan validation MAE:

```bash
python -m src.tune_lstm
python -m src.tune_lstm --targets pm25_ugm3 --windows 30 60 --device cuda
```

Ruang pencarian default: `arch` (lstm/bilstm/gru) x `window` (30/60/120) x `hidden` (32/64/128) x `layers` (1/2) = 54 konfigurasi per polutan.

Hasil tuning disimpan ke `outputs/lstm_tuning.json` dan `outputs/lstm_tuning_best.csv`.

### 7.2 Perbandingan Head-to-Head

```bash
python -m src.compare_models
# pakai konfigurasi terbaik hasil tuning:
python -m src.compare_models --best-config --device cuda
```

Karakteristik pendekatan:

| Aspek | XGBoost (baseline) | RNN (AirSense) |
|---|---|---|
| Paradigma | Tree-based (gradient boosting) | Deep learning (recurrent) |
| Input | Vektor fitur lag + rolling | Sekuens waktu (window 30-120 menit) |
| Target | direct t+60 | direct t+60 |
| Scaling | tidak perlu (tree) | fitur + target di-standardisasi |

Output:

```text
outputs/model_comparison.json
outputs/model_comparison.csv
outputs/lstm_tuning_best.csv
```

### 7.3 Hasil (data Supabase, 30 hari terakhir)

Konfigurasi terbaik hasil tuning:

| Polutan | Arsitektur | window | hidden | layers | Val MAPE |
|---|---|---|---|---|---|
| PM2.5 | LSTM | 30 | 128 | 2 | 18.53% |
| PM10 | GRU | 30 | 128 | 2 | 23.10% |
| CO | GRU | 60 | 128 | 1 | 4.47% |

Perbandingan pada test set (XGBoost vs RNN terbaik):

| Polutan | XGBoost | RNN terbaik | Pemenang |
|---|---|---|---|
| PM2.5 | 22.77% | **18.84%** (LSTM) | RNN |
| PM10 | 26.31% | **23.48%** (GRU) | RNN |
| CO | 7.23% | **5.34%** (GRU) | RNN |

> Catatan: angka absolut berbeda dari penelitian sebelumnya karena dataset, rentang waktu, dan horizon peramalan dapat berbeda. Perbandingan di sini dilakukan pada **data dan test set yang sama** untuk kedua model.

Catatan implementasi:

- RNN dilatih dengan **standarisasi fitur DAN target** agar stabil pada polutan bermagnitudo besar (CO).
- Hasil bergantung pada kualitas/panjang data. Dengan data pendek, selisih antar model dapat bervariasi; reliabilitas meningkat seiring bertambahnya data sensor.
- **Windows:** `torch` harus di-import sebelum `xgboost` (sudah diatur di `src/compare_models.py`) untuk menghindari konflik DLL OpenMP.
- **Device:** gunakan `--device cuda` untuk pelatihan cepat (RTX GPU). Pada sebagian setup Windows, shutdown CUDA dapat memicu crash `0xC0000409` (hasil & file tetap tersimpan benar, hanya proses exit yang tidak bersih). Default `cpu` dipakai untuk eksekusi yang bersih.

