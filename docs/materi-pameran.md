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

## 4. Angka yang boleh diklaim

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

## 5. Tanya-jawab

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

## 6. Yang jangan dikatakan

| Jangan | Katakan |
|---|---|
| "Akurasi 95%" | "MAE 1,3 µg/m³, nMAE 7%" |
| "Mendeteksi semua polutan" | "PM2.5, PM10, dan CO" |
| "Pengganti BMKG" | "Pelengkap untuk lokasi ini" |
| "Model AI canggih" | "Kandidat LSTM/GRU, dipilih lewat pengukuran" |
| "Forecast pasti benar" | "Perkiraan level dengan rentang ketidakpastian" |
| "Sensor selalu akurat" | "Ada kanal yang tidak valid, kami tandai" |

---

## 7. Rencana cadangan

| Masalah | Tindakan |
|---|---|
| Internet pameran mati | Tunjukkan screenshot yang sudah disiapkan |
| Dashboard Vercel lambat | Buka `localhost:8181` dari laptop |
| Data tidak muncul | Cek status di header; kalau terputus, jelaskan itu fitur, bukan error |
| Telegram tidak berbunyi | Tunjukkan riwayat pesan di channel |
| Ditanya angka yang tidak hafal | Buka halaman Evaluasi, jangan mengarang |

---

## 8. Satu kalimat penutup

> "AirSense bukan alat kalibrasi dan bukan pengganti BMKG. Ini sistem pemantauan terjangkau yang jujur soal batasannya—dan justru karena jujur, angkanya bisa dipertanggungjawabkan."
