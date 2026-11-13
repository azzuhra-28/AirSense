# Benchmark Forecast PM2.5 — AirSense

Dijalankan: 13 Nov 2026 20:47 WIB  
Seed: 42 · Fold: 3 · Gap: 60 menit

## 1. Profil data

| Item | Nilai |
|---|---|
| Baris mentah | 9997 |
| Rentang | 06 Nov 13:44 – 13 Nov 13:43 UTC |
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
| ewma_0.05 | 0.69 (+36%) | 0.87 (+24%) | 1.14 (+10%) | 1.66 (+1%) |
| ewma_0.1 | 0.55 (+47%) | 0.55 (+50%) | 0.60 (+46%) | 0.68 (+42%) |
| ewma_0.2 | - | 0.69 (+37%) | 0.80 (+32%) | 0.96 (+26%) |
| global_mean | 1.83 (-73%) | 1.83 (-63%) | 1.83 (-52%) | 1.82 (-29%) |
| lightgbm | 0.75 (+29%) | 0.89 (+21%) | 1.02 (+14%) | 1.27 (+8%) |
| lightgbm_quantile | 0.73 (+31%) | 0.87 (+22%) | 0.99 (+17%) | 1.17 (+16%) |
| persistence | 1.05 (+0%) | 1.11 (+0%) | 1.18 (+0%) | 1.38 (+0%) |
| ridge | 0.57 (+46%) | 0.68 (+39%) | 0.84 (+30%) | 1.10 (+22%) |
| rolling_15 | 0.57 (+46%) | 0.65 (+41%) | 0.80 (+33%) | 1.04 (+26%) |
| rolling_30 | 0.59 (+44%) | 0.69 (+38%) | 0.83 (+31%) | 1.08 (+24%) |
| rolling_5 | 0.64 (+39%) | 0.72 (+36%) | 0.84 (+30%) | 1.07 (+23%) |

Format: MAE µg/m³ (skill vs persistence). Skill positif = lebih baik.

## 3. Metode terbaik per horizon

| Horizon | Terbaik | MAE | Skill | Signifikan? |
|---|---|---|---|---|
| 5 | ewma_0.1 | 0.55 | +47% | ya (95% CI 0.47–0.53) |
| 15 | ewma_0.1 | 0.55 | +50% | ya (95% CI 0.50–0.59) |
| 30 | ewma_0.1 | 0.60 | +46% | ya (95% CI 0.46–0.56) |
| 60 | ewma_0.1 | 0.68 | +42% | ya (95% CI 0.44–0.55) |

Uji signifikansi membandingkan **metode terbaik per horizon** dengan persistence memakai block bootstrap (blok 30, 2000 ulangan) atas galat per sampel dari seluruh fold uji. CI adalah selisih MAE dalam µg/m³; seluruh rentang di atas 0 berarti keunggulan bukan kebetulan.

## 4. Interval prediksi (LightGBM kuantil)

| Target | Horizon | Cakupan P10–P90 | Lebar rata-rata |
|---|---|---|---|
| A | 5 | 66% | 2.66 µg/m³ |
| A | 15 | 66% | 2.83 µg/m³ |
| A | 30 | 63% | 2.79 µg/m³ |
| A | 60 | 57% | 2.78 µg/m³ |
| B | 5 | 57% | 1.30 µg/m³ |
| B | 15 | 51% | 1.34 µg/m³ |
| B | 30 | 45% | 1.34 µg/m³ |
| B | 60 | 39% | 1.44 µg/m³ |

Nominal 80%. Cakupan jauh di bawah itu berarti interval terlalu sempit.

## 5. Perbandingan dengan GRU/LSTM produksi

Tidak dibandingkan secara langsung. Model produksi memakai kontrak fitur berbeda (50 fitur termasuk lag dan rolling dari `build_features`), hanya memprediksi t+60, dan tidak boleh dilatih ulang dalam eksperimen ini. Memaksakan perbandingan akan menyesatkan karena input dan skala berbeda.

## 6. Pemeriksaan kewarasan

- Uji kebocoran fitur: **lulus** (fitur pada t tidak berubah saat data setelah t diubah).
- Target A: simpangan baku prediksi 1.77 vs aktual 1.85 (rasio 0.96). Tidak collapse.
- Target B: simpangan baku prediksi 1.72 vs aktual 1.53 (rasio 1.13). Tidak collapse.

## 7. Rekomendasi

**ewma_0.1** mengalahkan persistence pada h=60 (MAE 0.68 vs 1.17, skill +42%). Selisih galat 0.49 µg/m³ dengan 95% CI 0.44–0.55, seluruhnya di atas nol, jadi keunggulannya bukan kebetulan.

Catatan penting: metode terbaik adalah **perataan/EWMA**, bukan LightGBM. Model gradien boosting tidak mengungguli perataan sederhana pada data ini. Rekomendasi: ganti dasar forecast produksi ke EWMA alpha 0,1 (atau perataan 15 menit) dan pertahankan LightGBM hanya sebagai pembanding.

## 8. Keterbatasan

- Data hanya 7.0 hari. Pola harian dan mingguan belum bisa disimpulkan.
- Tidak ada data cuaca eksternal (angin, hujan) yang biasanya menjelaskan sebagian besar variasi PM2.5.
- Sensor debu masih berderau; sebagian galat berasal dari pengukuran, bukan dari model.
- Perbandingan antar fold memakai data yang tumpang-tindih secara alami; block bootstrap dipakai untuk mengurangi klaim berlebih.
