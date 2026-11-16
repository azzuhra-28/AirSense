# Materi Pameran AirSense

Dokumen kerja untuk pameran. Ringkas, bisa dibaca sambil berdiri.

---

## 1. Pitch 30 detik

> "AirSense memantau kualitas udara di satu lokasi secara langsung. Sensor mengirim data tiap menit ke cloud, lalu sistem menampilkan ISPU, polutan dominan, dan perkiraan 60 menit ke depan. Kalau udara memburuk atau sensor mati, notifikasi masuk ke Telegram. Yang membedakan: kami tidak mengklaim model yang belum terbukti—setiap angka forecast diuji terhadap data nyata, dan kalau model kalah dari tebakan sederhana, sistem memilih tebakan sederhana itu."

---

## 2. Alur demo 5 menit

| Urutan | Halaman | Yang ditunjukkan | Kalimat kunci |
|---|---|---|---|
| 1 | **Ringkasan** | ISPU, suhu, kelembapan, grafik aktual + forecast | "Ini kondisi saat ini dan perkiraan satu jam ke depan." |
| 2 | **Ringkasan** | 4 kartu horizon 5/15/30/60 | "Setiap horizon punya rentang ketidakpastian yang melebar." |
| 3 | **Prediksi** | Ringkasan polutan, grafik, model transparency | "Kandidat model LSTM dan GRU, tapi keluaran dipilih lewat pengukuran." |
| 4 | **Evaluasi** | MAE, tabel per horizon | "Ini bukti forecast-nya diuji, bukan diklaim." |
| 5 | **Perangkat** | Status kanal sensor | "Kami juga jujur soal sensor yang tidak berfungsi." |
| 6 | **Peringatan** | Tombol channel Telegram | "Notifikasi tetap masuk walau web ditutup." |
| 7 | **HP** | Pesan Telegram | "Ini contoh notifikasi yang diterima warga." |

**Jangan buka halaman yang datanya kosong.** Kalau Evaluasi kosong, lewati dan kembali ke Ringkasan.

---

## 3. Arsitektur (cukup gambar 4 kotak)

```
ESP32 + sensor
      │  tiap 60 detik
      ▼
Supabase (database + realtime)
      │
      ├──► VPS: forecast tiap 5 menit
      │         └──► Telegram
      │
      └──► Dashboard Next.js (Vercel)
                └──► browser pengguna
```

Kalimat: "Sensor → cloud → analitik → dashboard. Tidak ada server lokal yang harus menyala."

---

## 4. Parameter yang diukur

| Parameter | Apa itu | Satuan | Kenapa penting |
|---|---|---|---|
| **PM2.5** | Partikel sangat halus, diameter ≤ 2,5 mikrometer (sekitar 1/30 tebal rambut) | µg/m³ | Bisa masuk jauh ke paru-paru dan aliran darah. Polutan paling berbahaya untuk kesehatan. |
| **PM10** | Partikel lebih besar, diameter ≤ 10 mikrometer | µg/m³ | Debu, serbuk, jamur. Tertahan di hidung dan tenggorokan. |
| **CO** | Karbon monoksida, gas tak berwarna dan tak berbau dari pembakaran tidak sempurna | mg/m³ | Mengikat hemoglobin, mengurangi oksigen dalam darah. |
| **Suhu** | Suhu udara | °C | Mempengaruhi penyebaran polutan. |
| **Kelembapan** | Uap air di udara | % | Kelembapan tinggi bisa mengganggu sensor debu optik. |
| **ISPU** | Indeks Standar Pencemar Udara, skala 0–300+ | indeks | Menyeragamkan semua polutan ke satu angka yang mudah dibaca publik. |

### Cara membaca ISPU

| Rentang | Kategori | Arti singkat |
|---|---|---|
| 0–50 | Baik | Udara bersih |
| 51–100 | Sedang | Masih aman, kelompok sensitif perlu waspada |
| 101–200 | Tidak Sehat | Kurangi aktivitas luar |
| 201–300 | Sangat Tidak Sehat | Hindari aktivitas luar |
| >300 | Berbahaya | Tetap di dalam ruangan |

ISPU diambil dari polutan dengan nilai tertinggi saat itu. Itu yang disebut **polutan dominan**.

### µg/m³ dan mg/m³

- **µg/m³** = mikrogram per meter kubik (sepersejuta gram)
- **mg/m³** = miligram per meter kubik (seperseribu gram)
- 1 mg = 1.000 µg

CO disajikan dalam mg/m³ karena konsentrasinya lebih besar. PM2.5 dan PM10 dalam µg/m³.

---

## 5. Cara kerja forecast

### Intinya: moving average

Forecast 60 menit dihitung dari **rata-rata pembacaan terakhir**, bukan dari prediksi arah.

```
rata-rata 10 menit terakhir
rata-rata 15 menit terakhir
rata-rata 30 menit terakhir
        ↓
dirata-rata lagi
        ↓
satu angka level untuk 60 menit ke depan
```

Contoh nyata:

```
10 menit : 24,94
15 menit : 24,91
30 menit : 24,34
────────────────
hasil    : 24,73
```

Angka 24,73 diulang untuk 60 menit. Karena itu garisnya datar.

### Kenapa bukan LSTM/GRU?

Karena sudah diuji dan kalah. LSTM belajar pola mingguan ("jam 1 malam biasanya 17,7"), sedangkan malam itu aktualnya 24–26. Moving average tidak peduli pola mingguan; dia ikut level sekarang.

### Quality gate

Setiap siklus, sistem membandingkan tiga kandidat:

1. LSTM/GRU
2. Blend XGBoost + pola jam historis
3. Moving average 10/15/30

Yang galatnya paling kecil, itu yang diterbitkan. Kalau model kalah, model dibuang. Log-nya bisa dilihat di VPS.

### Penyeleksian otomatis di VPS

Penyeleksian terjadi di server, bukan di dashboard. Tiap 5 menit, untuk setiap polutan, sistem menguji tiga kandidat:

| Kandidat | Isi |
|---|---|
| LSTM/GRU | Model neural network |
| Blend | XGBoost + pola jam historis |
| Moving average 10/15/30 | Rata-rata pembacaan terakhir |

Yang galatnya paling kecil pada 300 pembacaan terakhir, itu yang diterbitkan.

Contoh log nyata:

```
[pm25] model dilewati: kalah dari garis datar (MAE 2.74 vs 2.57)
[pm25] memakai perataan 10/15/30 = 24.73
[pm25] blend kalah dari perataan (1.67 vs 0.98); memakai perataan
```

Artinya:

1. LSTM kalah → dibuang
2. Moving average dipakai sementara
3. Blend juga kalah → moving average tetap dipakai

Penyeleksian diulang tiap siklus, jadi bisa berubah. Kalau besok LSTM menang, LSTM yang dipakai.

**Batasan:** dashboard tidak menyimpan metode yang menang. Jejaknya hanya ada di log VPS.

### Rentang ketidakpastian

Pita di sekitar garis forecast berasal dari kuantil residual benchmark. Artinya: "80% kesalahan historis jatuh di dalam rentang ini." Pita melebar seiring horizon karena tebakan jangka panjang lebih tidak pasti.

### Alur lengkap satu siklus forecast

```
ESP32 ──60 detik──► Supabase ──► VPS (tiap 5 menit)
                                    │
                                    ├─ 1. ambil data terbaru
                                    ├─ 2. bersihkan & potong segmen
                                    ├─ 3. bangun fitur
                                    ├─ 4. kandidat LSTM/GRU
                                    ├─ 5. quality gate
                                    ├─ 6. blend + gate terakhir
                                    ├─ 7. hitung ISPU
                                    └─ 8. tulis 60 baris forecast
                                              │
                                              ▼
                                     Dashboard + Telegram
```

| Langkah | Yang terjadi | Kalau gagal |
|---|---|---|
| 1 | Ambil 1.000–12.000 pembacaan terakhir | Siklus dilewati |
| 2 | Buang sentinel -999, pisahkan segmen jika jeda > 3 menit | Data kurang → forecast ditahan |
| 3 | Bangun lag, rata-rata bergerak, jam, hari | — |
| 4 | Muat LSTM/GRU dari cache; latih ulang maksimal sekali sehari | Pakai cache lama |
| 5 | Bandingkan galat model vs moving average | Model dibuang, pakai moving average |
| 6 | Blend XGBoost + pola jam, lalu bandingkan lagi dengan moving average | Blend dibuang, pakai moving average |
| 7 | Konversi tiap polutan ke ISPU, ambil yang tertinggi | — |
| 8 | Tulis 60 baris (satu per menit) ke `tb_forecast` | Tidak ada forecast baru |

Setelah itu dashboard membaca siklus terbaru dan menampilkannya. Scheduler alert berjalan paralel untuk mengecek offline, ISPU tinggi, lonjakan, dan puncak forecast.

---

## 6. Angka yang boleh diklaim

| Klaim | Angka | Sumber |
|---|---|---|
| Data terkumpul | 7+ hari, ~10.000 baris | database |
| Cadence sensor | 1 menit | firmware |
| Horizon forecast | 60 menit | pipeline |
| MAE PM2.5 (live) | ~1,3 µg/m³ | halaman Evaluasi |
| nMAE PM2.5 | ~7% | halaman Evaluasi |
| Skill vs persistence (benchmark) | +48% / +42% / +34% / +26% | benchmark 7 hari |
| MAE perataan 10/15/30 | 0,55 / 0,65 / 0,79 / 1,05 µg/m³ | benchmark |
| Cakupan rentang | ~80% | kuantil residual |
| Biaya VPS | ±Rp 36.000/bulan | VPS Singapore |

**Jangan klaim "akurasi 95%"**—tidak ada angka itu.

---

## 7. Tanya-jawab

### Untuk pengunjung umum

**"Ini alat apa?"**
> "Pemantau kualitas udara. Dia mengukur partikel halus PM2.5, PM10, dan gas CO, lalu menampilkan angkanya di web dan memperkirakan satu jam ke depan."

**"Bedanya dengan BMKG atau AirVisual?"**
> "BMKG mengukur di titik resmi dengan alat terkalibrasi. Kami mengukur di lokasi ini, dengan sensor murah, untuk melihat kondisi sekitar. Angkanya tidak menggantikan ISPU resmi—kami tulis itu jelas di dashboard."

**"Kenapa ISPU-nya beda dengan situs lain?"**
> "Karena lokasi dan alatnya beda. ISPU resmi memakai rata-rata 24 jam di stasiun tertentu. Kami memakai pembacaan lokal. Yang penting adalah tren dan peringatan dini, bukan menggantikan angka resmi."

**"Apakah akurat?"**
> "Untuk level dan tren, cukup. Galat forecast PM2.5 sekitar 1,3 µg/m³, atau 7% dari konsentrasi. Untuk keputusan medis, tetap pakai alat kalibrasi."

**"Kenapa NO₂ dan O₃ tidak ada?"**
> "Sensornya tidak mengirim data. NO₂ tidak terpasang, O₃ membeku di satu nilai. Kami sembunyikan daripada menampilkan angka palsu."

**"Kenapa garis forecast datar?"**
> "Itu perkiraan level, bukan ramalan naik-turun. Kami sudah uji: model yang menggambar lekukan justru lebih buruk. Jadi yang ditampilkan adalah level terdekat yang terukur."

**"Kalau internet mati?"**
> "Data terakhir tetap tersimpan di cloud. Dashboard menampilkan status 'terputus' dan usia data, bukan angka palsu. Notifikasi Telegram juga memberi tahu kalau sensor berhenti."

**"Berapa biayanya?"**
> "Sensor dan ESP32 sekitar ratusan ribu. VPS sekitar Rp 36.000 per bulan. Dashboard gratis di Vercel."

**"Bisa dipakai di banyak lokasi?"**
> "Bisa. Arsitekturnya sudah memisahkan perangkat dan data. Tapi saat ini baru satu node."

**"Apakah ini sudah dipakai masyarakat?"**
> "Belum. Ini prototipe untuk penelitian dan pameran."

**"Apa manfaatnya untuk saya?"**
> "Tahu kapan udara di sekitar memburuk, dan dapat notifikasi sebelum keluar ruangan."

**"Apakah bisa mendeteksi asap rokok?"**
> "Sensor partikel bisa merespons asap, tapi tidak bisa membedakan asap rokok dari debu atau asap lain. Yang terukur adalah partikel halusnya."

**"Kenapa sensornya kadang aneh?"**
> "Sensor debu murah sensitif terhadap kelembapan dan posisi. Kami menandai kanal yang tidak wajar di halaman Perangkat, dan tidak memakainya untuk menyimpulkan kualitas udara."

**"Apakah ini sertifikasi resmi?"**
> "Bukan. Ini alat pemantauan, bukan alat uji terkalibrasi. ISPU di sini bersifat indikatif."

**"Data saya disimpan?"**
> "Yang disimpan hanya data sensor: waktu, konsentrasi, suhu, kelembapan. Tidak ada data pribadi pengunjung web."

**"Kenapa ada notifikasi Telegram?"**
> "Supaya peringatan tetap masuk walau web ditutup. Notifikasi browser hanya jalan saat tab terbuka."

### Untuk dosen / juri teknis

**"Model apa yang dipakai?"**
> "Kandidatnya LSTM untuk PM2.5 dan GRU untuk PM10/CO. Tapi keluaran akhir melewati quality gate: kalau model tidak mengalahkan perataan 10/15/30, yang diterbitkan adalah perataan. Kalau lolos, model digabung dengan XGBoost dan pola jam historis."

**"Kenapa LSTM/GRU?"**
> "Karena data sensor adalah deret waktu. Tapi kami tidak memaksa model. Benchmark 7 hari menunjukkan perataan 10/15/30 justru yang terbaik, jadi sistem memilih yang terukur."

**"Bagaimana validasinya?"**
> "Split kronologis, bukan acak. Benchmark memakai rolling-origin dengan gap sepanjang horizon. Hyperparameter dipilih hanya di dalam training fold. Seed 42."

**"Apa itu quality gate?"**
> "Pembanding otomatis. Model diuji pada 300 pembacaan terakhir. Kalau galatnya lebih besar dari perataan, model dibuang. Ini mencegah forecast yang lebih buruk daripada garis datar."

**"Kenapa forecast datar?"**
> "Karena targetnya level, bukan arah. Ekstrapolasi tren terbukti 22–134% lebih buruk dari persistence pada data kami. Garis datar bukan kegagalan—itu hasil pengukuran."

**"Apa baseline-nya?"**
> "Dua: persistence (nilai terakhir dipertahankan) dan perataan 10/15/30. Gate memakai yang terbaik dari keduanya."

**"Bagaimana menangani data hilang?"**
> "Baris dengan sentinel -999 dibuang. Segmen dengan jeda >3 menit dipisah supaya lag tidak melompati lubang. Kalau data kurang, forecast tidak diterbitkan."

**"Bagaimana mencegah overfitting?"**
> "Split kronologis, early stopping, dan gate. Model yang overfit akan kalah di validasi dan tidak diterbitkan."

**"Kenapa Supabase?"**
> "Database PostgreSQL + API + realtime dalam satu layanan. Tidak perlu mengelola server database sendiri."

**"Bagaimana realtime-nya?"**
> "Supabase realtime untuk update langsung, ditambah polling 30 detik sebagai cadangan."

**"Apa yang terjadi kalau sensor mati?"**
> "Scheduler menulis alert DEVICE_OFFLINE setelah 10 menit, mengirim Telegram, dan dashboard menampilkan status terputus."

**"Bagaimana keamanan API key?"**
> "Key publishable hanya bisa membaca dan menulis sesuai RLS. Key service role hanya ada di VPS, tidak di frontend."

**"Kenapa VPS, bukan serverless?"**
> "Forecast butuh proses berjalan terus dan model PyTorch. VPS 1 vCPU cukup dan lebih murah daripada layanan inferensi."

**"Berapa latency end-to-end?"**
> "Sensor ke database ~1 detik. Forecast tiap 5 menit. Dashboard update realtime."

**"Bagaimana skalabilitas ke banyak node?"**
> "Tabel sudah punya kolom device. Tinggal menambah node dan memisahkan forecast per device. Belum diuji untuk banyak node."

### Pertanyaan skeptis

**"Sensor murah, apa bisa dipercaya?"**
> "Untuk level dan tren, bisa. Untuk angka absolut, tidak seakurat alat kalibrasi. Kami menulis batasan itu di dashboard, bukan menyembunyikannya."

**"Kalau hasilnya datar, kenapa pakai AI?"**
> "Justru karena kami menguji AI. Hasil ujinya: perataan sederhana lebih baik. Sistem memilih yang terbaik, bukan yang paling canggih. Itu bagian dari kontribusi penelitian."

**"Apakah forecast-nya benar-benar belajar?"**
> "Model dilatih, tapi tidak dipaksa dipakai. Kalau kalah, sistem memakai perataan. Yang belajar adalah proses pemilihan, bukan hanya modelnya."

**"Kenapa angka ISPU beda dengan BMKG?"**
> "Lokasi, alat, dan metode rata-rata berbeda. Kami tidak mengklaim menggantikan ISPU resmi."

**"Kenapa tidak pakai sensor mahal?"**
> "Karena tujuan awalnya adalah pemantauan terjangkau yang bisa diperbanyak. Sensor mahal mengubah skala biaya."

---

## 8. Yang jangan dikatakan

| Jangan | Katakan |
|---|---|
| "Akurasi 95%" | "MAE 1,3 µg/m³, nMAE 7%" |
| "Mendeteksi semua polutan" | "PM2.5, PM10, dan CO" |
| "Pengganti BMKG" | "Pelengkap untuk lokasi ini" |
| "Model AI canggih" | "Kandidat LSTM/GRU, dipilih lewat pengukuran" |
| "Forecast pasti benar" | "Perkiraan level dengan rentang ketidakpastian" |
| "Sensor selalu akurat" | "Ada kanal yang tidak valid, kami tandai" |

---

## 9. Rencana cadangan

| Masalah | Tindakan |
|---|---|
| Internet pameran mati | Tunjukkan screenshot yang sudah disiapkan |
| Dashboard Vercel lambat | Buka `localhost:8181` dari laptop |
| Data tidak muncul | Cek status di header; kalau terputus, jelaskan itu fitur, bukan error |
| Telegram tidak berbunyi | Tunjukkan riwayat pesan di channel |
| Ditanya angka yang tidak hafal | Buka halaman Evaluasi, jangan mengarang |

---

## 10. Satu kalimat penutup

> "AirSense bukan alat kalibrasi dan bukan pengganti BMKG. Ini sistem pemantauan terjangkau yang jujur soal batasannya—dan justru karena jujur, angkanya bisa dipertanggungjawabkan."
