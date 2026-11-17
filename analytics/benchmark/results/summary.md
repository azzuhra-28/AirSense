# Benchmark Forecast PM2.5 — AirSense

Dijalankan: 18 Nov 2026 05:45 WIB  
Seed: 42 · Fold: 3 · Gap: 60 menit

## 1. Profil data

| Item | Nilai |
|---|---|
| Baris mentah | 9950 |
| Rentang | 10 Nov 22:44 – 17 Nov 22:44 UTC |
| Panjang | 7.0 hari |
| Celah > 1 menit | 28 kejadian |
| Celah terpanjang | 25 menit |
| PM2.5 hilang | 0 |
| PM2.5 negatif | 0 |
| Outlier (lonjakan > 10.0) | 3 |
| PM2.5 median / p95 / maks | 17.5 / 23.9 / 48.9 µg/m³ |
| Suhu / kelembapan median | 36.0 °C / 64.1 % |

Setelah reindex 1 menit: 10081 baris, 2 celah panjang dibiarkan kosong, 3 outlier ditandai (tidak dibuang).

## 2. Hasil per metode (target halus 5 menit)

| Metode | h=5 | h=15 | h=30 | h=60 |
|---|---|---|---|---|
| ewma | 0.64 (+43%) | 0.82 (+34%) | 1.03 (+26%) | 1.35 (+18%) |
| global_mean | 2.05 (-83%) | 2.06 (-66%) | 2.06 (-50%) | 2.07 (-27%) |
| lightgbm | 0.85 (+24%) | 1.00 (+20%) | 1.23 (+12%) | 1.57 (+5%) |
| lightgbm_quantile | 0.81 (+37%) | 1.04 (+22%) | 1.21 (+24%) | 1.50 (+17%) |
| persistence | 1.11 (+0%) | 1.22 (+0%) | 1.37 (+0%) | 1.62 (+0%) |
| produksi_10_15_30 | 0.63 (+43%) | 0.79 (+36%) | 1.00 (+28%) | 1.30 (+21%) |
| profil_jam | 1.70 (-51%) | 1.70 (-37%) | 1.70 (-23%) | 1.71 (-5%) |
| ridge | 0.65 (+42%) | 0.81 (+35%) | 1.02 (+27%) | 1.32 (+20%) |
| rolling_15 | 0.66 (+41%) | 0.81 (+35%) | 1.01 (+27%) | 1.32 (+20%) |
| rolling_30 | 0.72 (+36%) | 0.87 (+31%) | 1.06 (+24%) | 1.34 (+19%) |
| rolling_5 | 0.69 (+38%) | 0.85 (+32%) | 1.04 (+25%) | 1.35 (+18%) |
| rolling_auto | 0.67 (+40%) | 0.82 (+34%) | 1.07 (+22%) | 1.40 (+15%) |

Format: MAE µg/m³ (skill vs persistence). Skill positif = lebih baik.

### Target A (nilai mentah t+h)

| Metode | h=5 | h=15 | h=30 | h=60 |
|---|---|---|---|---|
| ewma | 1.14 (+21%) | 1.25 (+19%) | 1.40 (+15%) | 1.64 (+12%) |
| global_mean | 2.23 (-54%) | 2.23 (-44%) | 2.23 (-36%) | 2.24 (-19%) |
| lightgbm | 1.25 (+13%) | 1.36 (+11%) | 1.54 (+7%) | 1.84 (+3%) |
| persistence | 1.44 (+0%) | 1.53 (+0%) | 1.63 (+0%) | 1.86 (+0%) |
| produksi_10_15_30 | 1.12 (+22%) | 1.23 (+20%) | 1.37 (+16%) | 1.61 (+14%) |
| profil_jam | 1.97 (-36%) | 1.97 (-27%) | 1.97 (-20%) | 1.98 (-6%) |
| ridge | 1.13 (+22%) | 1.24 (+19%) | 1.39 (+15%) | 1.62 (+13%) |
| rolling_15 | 1.13 (+21%) | 1.24 (+19%) | 1.39 (+16%) | 1.62 (+13%) |
| rolling_30 | 1.17 (+19%) | 1.28 (+17%) | 1.41 (+14%) | 1.64 (+13%) |
| rolling_5 | 1.14 (+21%) | 1.25 (+18%) | 1.40 (+14%) | 1.65 (+12%) |
| rolling_auto | 1.15 (+20%) | 1.27 (+17%) | 1.43 (+12%) | 1.69 (+10%) |

Target A lebih sulit karena nilai sesaat berderau. Untuk dashboard, target B (halus 5 menit) lebih bermakna karena pengguna melihat level, bukan fluktuasi per menit.

## 3. Metode terbaik per horizon

| Horizon | Terbaik | MAE | Skill | Signifikan? |
|---|---|---|---|---|
| 5 | produksi_10_15_30 | 0.63 | +43% | ya (95% CI 0.44–0.51) |
| 15 | produksi_10_15_30 | 0.79 | +36% | ya (95% CI 0.39–0.47) |
| 30 | produksi_10_15_30 | 1.00 | +28% | ya (95% CI 0.32–0.41) |
| 60 | produksi_10_15_30 | 1.30 | +21% | ya (95% CI 0.27–0.37) |

Uji signifikansi membandingkan **metode terbaik per horizon** dengan persistence memakai block bootstrap (blok 30, 2000 ulangan) atas galat per sampel dari seluruh fold uji. CI adalah selisih MAE dalam µg/m³; seluruh rentang di atas 0 berarti keunggulan bukan kebetulan.

## 4. Kategori ISPU dan kejadian memburuk

| Metode | Horizon | Akurasi kategori | Precision memburuk | Recall memburuk | Kejadian |
|---|---|---|---|---|---|
| persistence | 5 | 86% | – | 0% | 589 |
| persistence | 15 | 85% | – | 0% | 613 |
| persistence | 30 | 85% | – | 0% | 635 |
| persistence | 60 | 83% | – | 0% | 666 |
| produksi_10_15_30 | 5 | 92% | 81% | 84% | 589 |
| produksi_10_15_30 | 15 | 92% | 83% | 82% | 613 |
| produksi_10_15_30 | 30 | 91% | 84% | 81% | 635 |
| produksi_10_15_30 | 60 | 91% | 85% | 80% | 666 |
| rolling_15 | 5 | 92% | 81% | 82% | 588 |
| rolling_15 | 15 | 92% | 84% | 81% | 613 |
| rolling_15 | 30 | 91% | 85% | 79% | 635 |
| rolling_15 | 60 | 90% | 87% | 79% | 666 |

Kejadian memburuk per horizon: 666 dari sekitar 6.000 sampel uji (±11%), jadi cukup untuk disimpulkan. Persistence tidak pernah memprediksi kenaikan kategori, sehingga precision-nya tidak terdefinisi dan recall-nya nol.

## 5. Perbandingan antar metode (block bootstrap)

Pembanding utama sekarang **rolling_15**, bukan persistence. Blok bootstrap sebesar horizon, bukan 30 menit tetap.

| Horizon | Dibandingkan | Selisih MAE | 95% CI | Keputusan |
|---|---|---|---|---|
| 5 | produksi_10_15_30 | -0.02 | -0.04–-0.00 | produksi_10_15_30 lebih baik (signifikan) |
| 5 | rolling_30 | +0.06 | +0.04–+0.09 | rolling_15 lebih baik (signifikan) |
| 5 | rolling_5 | +0.03 | +0.01–+0.06 | rolling_15 lebih baik (signifikan) |
| 15 | produksi_10_15_30 | -0.02 | -0.04–-0.00 | produksi_10_15_30 lebih baik (signifikan) |
| 15 | rolling_30 | +0.05 | +0.02–+0.08 | rolling_15 lebih baik (signifikan) |
| 15 | rolling_5 | +0.03 | +0.01–+0.06 | rolling_15 lebih baik (signifikan) |
| 30 | produksi_10_15_30 | -0.01 | -0.03–+0.00 | seri (tidak signifikan) |
| 30 | rolling_30 | +0.04 | +0.01–+0.08 | rolling_15 lebih baik (signifikan) |
| 30 | rolling_5 | +0.03 | +0.00–+0.06 | rolling_15 lebih baik (signifikan) |
| 60 | produksi_10_15_30 | -0.02 | -0.03–-0.00 | produksi_10_15_30 lebih baik (signifikan) |
| 60 | rolling_30 | +0.02 | -0.01–+0.06 | seri (tidak signifikan) |
| 60 | rolling_5 | +0.03 | +0.00–+0.06 | rolling_15 lebih baik (signifikan) |

Selisih positif berarti rolling_15 memiliki galat lebih kecil.

## 5b. Profil jam vs produksi (block bootstrap)

Profil jam memprediksi nilai jam tujuan memakai rata-rata target pada jam yang sama, dihitung hanya dari data latih tiap fold. Selisih positif berarti profil jam memiliki galat lebih kecil daripada produksi 10/15/30.

| Horizon | Selisih MAE | 95% CI | Keputusan |
|---|---|---|---|
| 5 | -1.06 | -1.15–-0.98 | produksi lebih baik (signifikan) |
| 15 | -0.90 | -1.03–-0.76 | produksi lebih baik (signifikan) |
| 30 | -0.70 | -0.87–-0.50 | produksi lebih baik (signifikan) |
| 60 | -0.40 | -0.68–-0.15 | produksi lebih baik (signifikan) |

## 6. Interval konformal (P10–P90 residual)

Kuantil residual dihitung dari data latih tiap fold, lalu diterapkan ke data uji. Tidak ada test yang dipakai untuk menghitung kuantil.

| Horizon | Cakupan empiris | Lebar rata-rata | q10 | q90 | n |
|---|---|---|---|---|---|
| 5 | 76% | 1.86 µg/m³ | -0.95 | +0.91 | 6009 |
| 15 | 76% | 2.22 µg/m³ | -1.12 | +1.10 | 5992 |
| 30 | 74% | 2.74 µg/m³ | -1.42 | +1.32 | 5977 |
| 60 | 74% | 3.68 µg/m³ | -1.93 | +1.75 | 5947 |

Nominal 80%. Diekspor ke `results/residual_quantiles.json` agar bisa dibaca dashboard.

## 7. Interval LightGBM kuantil

| Target | Horizon | Cakupan P10–P90 | Lebar rata-rata |
|---|---|---|---|
| A | 5 | 64% | 2.71 µg/m³ |
| A | 15 | 61% | 2.74 µg/m³ |
| A | 30 | 57% | 2.85 µg/m³ |
| A | 60 | 51% | 2.85 µg/m³ |
| B | 5 | 54% | 1.31 µg/m³ |
| B | 15 | 49% | 1.41 µg/m³ |
| B | 30 | 42% | 1.47 µg/m³ |
| B | 60 | 36% | 1.44 µg/m³ |

Nominal 80%. Cakupan jauh di bawah itu berarti interval terlalu sempit.

## 8. Perbandingan dengan GRU/LSTM produksi

Tidak dibandingkan secara langsung. Model produksi memakai kontrak fitur berbeda (50 fitur termasuk lag dan rolling dari `build_features`), hanya memprediksi t+60, dan tidak boleh dilatih ulang dalam eksperimen ini. Memaksakan perbandingan akan menyesatkan karena input dan skala berbeda.

## 9. Pemeriksaan kewarasan

- Uji kebocoran fitur: **lulus** (fitur pada t tidak berubah saat data setelah t diubah).
- Target A: simpangan baku prediksi 2.07 vs aktual 3.63 (rasio 0.57). Tidak collapse.
- Target B: simpangan baku prediksi 2.22 vs aktual 3.36 (rasio 0.66). Tidak collapse.

## 10. Rekomendasi

Pembanding utama adalah **rolling_15**. Pada h=60, rolling_15 MAE 1.30 µg/m³ (skill +21% vs persistence).
 Selisih galat terhadap persistence 0.32 µg/m³ (95% CI 0.27–0.37).

Perhitungan produksi saat ini (`produksi_10_15_30`) mencapai MAE 1.30 µg/m³ pada h=60.

**Perhitungan produksi saat ini sudah yang terbaik.** Selisihnya terhadap rolling_15 hanya 0.02 µg/m³ pada h=60, dan pada h=15 keduanya seri secara statistik. Artinya **tidak ada alasan mengganti dasar forecast produksi**. LightGBM, EWMA, Ridge, dan rolling_5/30/auto semuanya lebih buruk.

## 11. Keterbatasan

- Data hanya 7.0 hari. Pola harian dan mingguan belum bisa disimpulkan.
- Tidak ada data cuaca eksternal (angin, hujan) yang biasanya menjelaskan sebagian besar variasi PM2.5.
- Sensor debu masih berderau; sebagian galat berasal dari pengukuran, bukan dari model.
- Perbandingan antar fold memakai data yang tumpang-tindih secara alami; block bootstrap dipakai untuk mengurangi klaim berlebih.
