# Benchmark Forecast PM2.5 — AirSense

Dijalankan: 13 Nov 2026 21:03 WIB  
Seed: 42 · Fold: 3 · Gap: 60 menit

## 1. Profil data

| Item | Nilai |
|---|---|
| Baris mentah | 9997 |
| Rentang | 06 Nov 14:00 – 13 Nov 13:59 UTC |
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
| ewma | 0.60 (+43%) | 0.70 (+37%) | 0.85 (+29%) | 1.10 (+23%) |
| global_mean | 1.82 (-73%) | 1.82 (-63%) | 1.82 (-52%) | 1.81 (-28%) |
| lightgbm | 0.75 (+29%) | 0.89 (+20%) | 1.01 (+15%) | 1.28 (+8%) |
| lightgbm_quantile | 0.72 (+32%) | 0.86 (+23%) | 0.98 (+18%) | 1.22 (+12%) |
| persistence | 1.05 (+0%) | 1.11 (+0%) | 1.18 (+0%) | 1.38 (+0%) |
| ridge | 0.57 (+46%) | 0.68 (+39%) | 0.84 (+29%) | 1.10 (+22%) |
| rolling_15 | 0.57 (+46%) | 0.65 (+41%) | 0.80 (+33%) | 1.05 (+26%) |
| rolling_30 | 0.59 (+44%) | 0.69 (+38%) | 0.83 (+30%) | 1.08 (+24%) |
| rolling_5 | 0.64 (+39%) | 0.71 (+36%) | 0.84 (+29%) | 1.07 (+23%) |

Format: MAE µg/m³ (skill vs persistence). Skill positif = lebih baik.

## 3. Metode terbaik per horizon

| Horizon | Terbaik | MAE | Skill | Signifikan? |
|---|---|---|---|---|
| 5 | rolling_15 | 0.57 | +46% | ya (95% CI 0.46–0.51) |
| 15 | rolling_15 | 0.65 | +41% | ya (95% CI 0.43–0.49) |
| 30 | rolling_15 | 0.80 | +33% | ya (95% CI 0.35–0.42) |
| 60 | rolling_15 | 1.05 | +26% | ya (95% CI 0.29–0.38) |

Uji signifikansi membandingkan **metode terbaik per horizon** dengan persistence memakai block bootstrap (blok 30, 2000 ulangan) atas galat per sampel dari seluruh fold uji. CI adalah selisih MAE dalam µg/m³; seluruh rentang di atas 0 berarti keunggulan bukan kebetulan.

## 4. Interval prediksi (LightGBM kuantil)

| Target | Horizon | Cakupan P10–P90 | Lebar rata-rata |
|---|---|---|---|
| A | 5 | 66% | 2.67 µg/m³ |
| A | 15 | 66% | 2.84 µg/m³ |
| A | 30 | 62% | 2.78 µg/m³ |
| A | 60 | 58% | 2.87 µg/m³ |
| B | 5 | 58% | 1.32 µg/m³ |
| B | 15 | 51% | 1.37 µg/m³ |
| B | 30 | 46% | 1.39 µg/m³ |
| B | 60 | 38% | 1.39 µg/m³ |

Nominal 80%. Cakupan jauh di bawah itu berarti interval terlalu sempit.

## 5. Perbandingan dengan GRU/LSTM produksi

Tidak dibandingkan secara langsung. Model produksi memakai kontrak fitur berbeda (50 fitur termasuk lag dan rolling dari `build_features`), hanya memprediksi t+60, dan tidak boleh dilatih ulang dalam eksperimen ini. Memaksakan perbandingan akan menyesatkan karena input dan skala berbeda.

## 6. Pemeriksaan kewarasan

- Uji kebocoran fitur: **lulus** (fitur pada t tidak berubah saat data setelah t diubah).
- Target A: simpangan baku prediksi 1.75 vs aktual 1.84 (rasio 0.95). Tidak collapse.
- Target B: simpangan baku prediksi 1.77 vs aktual 1.53 (rasio 1.16). Tidak collapse.

## 7. Rekomendasi

**rolling_15** mengalahkan persistence pada h=60 (MAE 1.05 vs 1.41, skill +26%). Selisih galat 0.34 µg/m³ dengan 95% CI 0.29–0.38, seluruhnya di atas nol, jadi keunggulannya bukan kebetulan.

Catatan penting: metode terbaik adalah **perataan sederhana**, bukan LightGBM maupun EWMA. Model gradien boosting tidak mengungguli rata-rata bergulir pada data ini. Rekomendasi: jadikan `rolling_15` sebagai dasar forecast produksi dan pertahankan LightGBM hanya sebagai pembanding.

## 8. Keterbatasan

- Data hanya 7.0 hari. Pola harian dan mingguan belum bisa disimpulkan.
- Tidak ada data cuaca eksternal (angin, hujan) yang biasanya menjelaskan sebagian besar variasi PM2.5.
- Sensor debu masih berderau; sebagian galat berasal dari pengukuran, bukan dari model.
- Perbandingan antar fold memakai data yang tumpang-tindih secara alami; block bootstrap dipakai untuk mengurangi klaim berlebih.
