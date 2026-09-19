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