# Benchmark Forecast PM2.5 — AirSense

Dijalankan: 13 Nov 2026 21:35 WIB  
Seed: 42 · Fold: 3 · Gap: 60 menit

## 1. Profil data

| Item | Nilai |
|---|---|
| Baris mentah | 9997 |
| Rentang | 06 Nov 14:31 – 13 Nov 14:30 UTC |
| Panjang | 7.0 hari |
| Celah > 1 menit | 10 kejadian |
| Celah terpanjang | 7 menit |
| PM2.5 hilang | 0 |
| PM2.5 negatif | 0 |
| Outlier (lonjakan > 10.0) | 0 |
| PM2.5 median / p95 / maks | 17.7 / 23.5 / 30.6 µg/m³ |
| Suhu / kelembapan median | 36.0 °C / 62.6 % |

Setelah reindex 1 menit: 10080 baris, 1 celah panjang dibiarkan kosong, 0 outlier ditandai (tidak dibuang).

## 2. Hasil per metode (target halus 5 menit)

| Metode | h=5 | h=15 | h=30 | h=60 |
|---|---|---|---|---|
| ewma | 0.59 (+44%) | 0.70 (+37%) | 0.85 (+29%) | 1.11 (+22%) |
| global_mean | 1.81 (-72%) | 1.81 (-62%) | 1.81 (-51%) | 1.80 (-26%) |
| lightgbm | 0.77 (+27%) | 0.90 (+19%) | 1.02 (+14%) | 1.30 (+7%) |
| lightgbm_quantile | 0.74 (+30%) | 0.86 (+23%) | 0.98 (+17%) | 1.20 (+14%) |
| persistence | 1.05 (+0%) | 1.11 (+0%) | 1.18 (+0%) | 1.39 (+0%) |
| produksi_10_15_30 | 0.55 (+48%) | 0.65 (+42%) | 0.79 (+34%) | 1.05 (+26%) |
| ridge | 0.57 (+46%) | 0.68 (+39%) | 0.84 (+30%) | 1.11 (+22%) |
| rolling_15 | 0.57 (+46%) | 0.65 (+42%) | 0.80 (+33%) | 1.06 (+25%) |
| rolling_30 | 0.59 (+44%) | 0.69 (+38%) | 0.83 (+30%) | 1.09 (+23%) |
| rolling_5 | 0.64 (+39%) | 0.71 (+36%) | 0.84 (+29%) | 1.08 (+23%) |
| rolling_auto | 0.63 (+40%) | 0.68 (+39%) | 0.92 (+23%) | 1.10 (+23%) |

Format: MAE µg/m³ (skill vs persistence). Skill positif = lebih baik.

### Target A (nilai mentah t+h)

| Metode | h=5 | h=15 | h=30 | h=60 |
|---|---|---|---|---|
| ewma | 1.06 (+23%) | 1.13 (+21%) | 1.23 (+17%) | 1.45 (+12%) |
| global_mean | 2.00 (-45%) | 2.00 (-40%) | 2.00 (-33%) | 1.99 (-19%) |
| lightgbm | 1.16 (+16%) | 1.23 (+14%) | 1.34 (+10%) | 1.60 (+3%) |
| persistence | 1.37 (+0%) | 1.42 (+0%) | 1.49 (+0%) | 1.64 (+0%) |
| produksi_10_15_30 | 1.03 (+25%) | 1.09 (+23%) | 1.19 (+20%) | 1.39 (+16%) |
| ridge | 1.04 (+24%) | 1.11 (+22%) | 1.23 (+18%) | 1.43 (+14%) |
| rolling_15 | 1.04 (+24%) | 1.10 (+23%) | 1.19 (+20%) | 1.40 (+15%) |
| rolling_30 | 1.06 (+23%) | 1.12 (+21%) | 1.22 (+18%) | 1.43 (+14%) |
| rolling_5 | 1.08 (+22%) | 1.13 (+20%) | 1.22 (+18%) | 1.41 (+14%) |
| rolling_auto | 1.11 (+19%) | 1.14 (+19%) | 1.29 (+14%) | 1.44 (+13%) |

Target A lebih sulit karena nilai sesaat berderau. Untuk dashboard, target B (halus 5 menit) lebih bermakna karena pengguna melihat level, bukan fluktuasi per menit.

## 3. Metode terbaik per horizon

| Horizon | Terbaik | MAE | Skill | Signifikan? |
|---|---|---|---|---|
| 5 | produksi_10_15_30 | 0.55 | +48% | ya (95% CI 0.48–0.53) |
| 15 | produksi_10_15_30 | 0.65 | +42% | ya (95% CI 0.44–0.50) |
| 30 | produksi_10_15_30 | 0.79 | +34% | ya (95% CI 0.36–0.43) |
| 60 | produksi_10_15_30 | 1.05 | +26% | ya (95% CI 0.30–0.39) |

Uji signifikansi membandingkan **metode terbaik per horizon** dengan persistence memakai block bootstrap (blok 30, 2000 ulangan) atas galat per sampel dari seluruh fold uji. CI adalah selisih MAE dalam µg/m³; seluruh rentang di atas 0 berarti keunggulan bukan kebetulan.

## 4. Kategori ISPU dan kejadian memburuk

| Metode | Horizon | Akurasi kategori | Precision memburuk | Recall memburuk | Kejadian |
|---|---|---|---|---|---|
| persistence | 5 | 88% | – | 0% | 608 |
| persistence | 15 | 88% | – | 0% | 611 |
| persistence | 30 | 88% | – | 0% | 611 |
| persistence | 60 | 87% | – | 0% | 616 |
| produksi_10_15_30 | 5 | 97% | 92% | 97% | 608 |
| produksi_10_15_30 | 15 | 97% | 92% | 97% | 611 |
| produksi_10_15_30 | 30 | 97% | 92% | 97% | 611 |
| produksi_10_15_30 | 60 | 96% | 92% | 97% | 616 |
| rolling_15 | 5 | 97% | 92% | 96% | 608 |
| rolling_15 | 15 | 96% | 92% | 96% | 611 |
| rolling_15 | 30 | 96% | 92% | 96% | 611 |
| rolling_15 | 60 | 96% | 93% | 96% | 616 |

Kejadian memburuk per horizon: 616 dari sekitar 6.000 sampel uji (±10%), jadi cukup untuk disimpulkan. Persistence tidak pernah memprediksi kenaikan kategori, sehingga precision-nya tidak terdefinisi dan recall-nya nol.

## 5. Perbandingan antar metode (block bootstrap)

Pembanding utama sekarang **rolling_15**, bukan persistence. Blok bootstrap sebesar horizon, bukan 30 menit tetap.

| Horizon | Dibandingkan | Selisih MAE | 95% CI | Keputusan |
|---|---|---|---|---|
| 5 | produksi_10_15_30 | -0.02 | -0.02–-0.01 | produksi_10_15_30 lebih baik (signifikan) |
| 5 | rolling_30 | +0.02 | +0.01–+0.04 | rolling_15 lebih baik (signifikan) |
| 5 | rolling_5 | +0.07 | +0.06–+0.09 | rolling_15 lebih baik (signifikan) |
| 15 | produksi_10_15_30 | -0.01 | -0.01–+0.00 | seri (tidak signifikan) |
| 15 | rolling_30 | +0.04 | +0.02–+0.06 | rolling_15 lebih baik (signifikan) |
| 15 | rolling_5 | +0.06 | +0.04–+0.08 | rolling_15 lebih baik (signifikan) |
| 30 | produksi_10_15_30 | -0.01 | -0.02–-0.00 | produksi_10_15_30 lebih baik (signifikan) |
| 30 | rolling_30 | +0.04 | +0.01–+0.06 | rolling_15 lebih baik (signifikan) |
| 30 | rolling_5 | +0.04 | +0.02–+0.06 | rolling_15 lebih baik (signifikan) |
| 60 | produksi_10_15_30 | -0.01 | -0.01–-0.00 | produksi_10_15_30 lebih baik (signifikan) |
| 60 | rolling_30 | +0.04 | +0.01–+0.06 | rolling_15 lebih baik (signifikan) |
| 60 | rolling_5 | +0.03 | +0.00–+0.05 | rolling_15 lebih baik (signifikan) |

Selisih positif berarti rolling_15 memiliki galat lebih kecil.

## 6. Interval konformal (P10–P90 residual)

Kuantil residual dihitung dari data latih tiap fold, lalu diterapkan ke data uji. Tidak ada test yang dipakai untuk menghitung kuantil.

| Horizon | Cakupan empiris | Lebar rata-rata | q10 | q90 | n |
|---|---|---|---|---|---|
| 5 | 80% | 1.80 µg/m³ | -0.90 | +0.90 | 6043 |
| 15 | 79% | 2.02 µg/m³ | -1.00 | +1.02 | 6033 |
| 30 | 77% | 2.41 µg/m³ | -1.21 | +1.19 | 6018 |
| 60 | 75% | 3.02 µg/m³ | -1.54 | +1.48 | 5988 |

Nominal 80%. Diekspor ke `results/residual_quantiles.json` agar bisa dibaca dashboard.

## 7. Interval LightGBM kuantil

| Target | Horizon | Cakupan P10–P90 | Lebar rata-rata |
|---|---|---|---|
| A | 5 | 66% | 2.65 µg/m³ |
| A | 15 | 67% | 2.88 µg/m³ |
| A | 30 | 62% | 2.80 µg/m³ |
| A | 60 | 57% | 2.82 µg/m³ |
| B | 5 | 58% | 1.32 µg/m³ |
| B | 15 | 53% | 1.41 µg/m³ |
| B | 30 | 45% | 1.33 µg/m³ |
| B | 60 | 39% | 1.52 µg/m³ |

Nominal 80%. Cakupan jauh di bawah itu berarti interval terlalu sempit.

## 8. Perbandingan dengan GRU/LSTM produksi

Tidak dibandingkan secara langsung. Model produksi memakai kontrak fitur berbeda (50 fitur termasuk lag dan rolling dari `build_features`), hanya memprediksi t+60, dan tidak boleh dilatih ulang dalam eksperimen ini. Memaksakan perbandingan akan menyesatkan karena input dan skala berbeda.

## 9. Pemeriksaan kewarasan

- Uji kebocoran fitur: **lulus** (fitur pada t tidak berubah saat data setelah t diubah).
- Target A: simpangan baku prediksi 1.84 vs aktual 1.83 (rasio 1.01). Tidak collapse.
- Target B: simpangan baku prediksi 1.79 vs aktual 1.51 (rasio 1.19). Tidak collapse.

## 10. Rekomendasi

Pembanding utama adalah **rolling_15**. Pada h=60, rolling_15 MAE 1.05 µg/m³ (skill +26% vs persistence).
 Selisih galat terhadap persistence 0.34 µg/m³ (95% CI 0.30–0.39).

Perhitungan produksi saat ini (`produksi_10_15_30`) mencapai MAE 1.05 µg/m³ pada h=60.

**Perhitungan produksi saat ini sudah yang terbaik.** Selisihnya terhadap rolling_15 hanya 0.01 µg/m³ pada h=60, dan pada h=15 keduanya seri secara statistik. Artinya **tidak ada alasan mengganti dasar forecast produksi**. LightGBM, EWMA, Ridge, dan rolling_5/30/auto semuanya lebih buruk.

## 11. Keterbatasan

- Data hanya 7.0 hari. Pola harian dan mingguan belum bisa disimpulkan.
- Tidak ada data cuaca eksternal (angin, hujan) yang biasanya menjelaskan sebagian besar variasi PM2.5.
- Sensor debu masih berderau; sebagian galat berasal dari pengukuran, bukan dari model.
- Perbandingan antar fold memakai data yang tumpang-tindih secara alami; block bootstrap dipakai untuk mengurangi klaim berlebih.
