# Laporan Kondisi Sistem AirSense

**Periode:** 30 Agustus - 5 November 2026
**Disusun untuk:** diskusi dengan dosen penanggung jawab alat
**Status:** sistem berjalan, 3 dari 6 kanal sensor bermasalah

---

## 1. Ringkasan satu halaman

Sistem AirSense sudah berjalan end-to-end: ESP32 mengirim data tiap
menit ke Supabase, analitik menghitung ISPU dan alert, dashboard
menampilkan aktual serta forecast. Yang belum selesai **bukan** di sisi
perangkat lunak, melainkan di sisi sensor.

| Bagian | Kondisi |
|---|---|
| Akuisisi data (ESP32 -> Supabase) | Berjalan, 15.188 baris terkumpul |
| Analitik (ISPU, alert, insight) | Berjalan |
| Forecast (LSTM/GRU) | Berjalan, tetapi sering menolak menerbitkan karena kalah akurat |
| Dashboard | Berjalan |
| Sensor debu (PM2.5/PM10) | **Bermasalah** - membaca 4x di bawah titik nol |
| Sensor O3 | **Bermasalah** - tidak mengeluarkan tegangan |
| Sensor NO2 | **Tidak berfungsi** - pin mengambang |
| Sensor CO | Baik |
| Suhu/kelembapan | Baik |

**Inti yang perlu disampaikan:** perangkat lunak sudah jujur. Ketika
sensor tidak menghasilkan data sah, sistem menolak menampilkan angka.
Yang tersisa adalah perbaikan perangkat keras pada tiga sensor.

---

## 2. Kondisi tiap sensor

Data di bawah dari ADC mentah (0-4095) di tabel `tb_analog_out`, bukan
dari nilai yang sudah dikonversi, supaya tidak tertutup oleh rumus.

| Sensor | ADC sekarang | ADC sehat | Kesimpulan |
|---|---|---|---|
| Debu GP2Y1010AU0F | 28-167 | ~745 | sinyal 4x terlalu lemah |
| O3 MQ-131 | 46 | ratusan | nyaris tidak ada arus |
| NO2 (MiCS-6814) | 4095 (konstan) | < 4095 | pin mengambang, sensor tidak ada |
| CO (MiCS-6814) | 1758-2765 | 2301-2467 | normal |
| Suhu DHT22 | - | - | normal, 24,5-35,9 C |

### 2.1 Sensor debu

Nilai ADC 167 setara tegangan keluaran 0,133 V. Sensor tanpa debu
seharusnya 0,6 V. Artinya sensor membaca **jauh di bawah titik nolnya
sendiri**, sehingga angka yang keluar (6-20 ug/m3) bukan pengukuran,
melainkan sisa kurva.

Bukti tambahan: dalam 60 pembacaan terakhir muncul lonjakan tunggal
(525 di antara nilai ~115). Debu nyata berubah perlahan; lonjakan
sesaat seperti itu adalah derau listrik.

**Dugaan penyebab:** LED inframerah digerakkan langsung oleh pin GPIO 2.
Datasheet Sharp mewajibkan transistor NPN (saklar arus), resistor 150
ohm (pembatas), dan kapasitor 220 uF (penopang pulsa). Tanpa
transistor, LED hanya menerima sebagian kecil arus yang dibutuhkan,
sehingga cahaya terlalu lemah untuk dipantulkan ke fototransistor.

**Yang perlu diukur di lokasi:** tegangan pin Vcc modul debu.
Harus 4,8-5,2 V. Jika hanya 3,3 V, itu penyebab utamanya.

### 2.2 Sensor O3 (MQ-131)

ADC 46 setara 0,037 V. Dimasukkan ke rumus firmware menghasilkan angka
negatif, yang oleh kode dijutkan ke batas minimum 10 ppb = 19,63 ug/m3.
Nilai itu **selalu sama sepanjang waktu** karena memang bukan hasil
pengukuran.

MQ-131 membutuhkan tiga hal: pemanas 5 V, resistor beban sekitar 10
kohm, dan burn-in 24-48 jam setelah pertama dinyalakan.

### 2.3 Sensor NO2

ADC konstan 4095 sejak 13 September. Nilai ini berarti pin masukan
menerima tegangan penuh tanpa sensor, atau pin dibiarkan mengambang.

Firmware sudah menanganinya dengan benar: mengirim sentinel `-999`
alih-alih `0`, supaya analitik bisa membedakan "sensor tidak ada" dari
"konsentrasi benar-benar nol".

---

## 3. Kesalahan yang ditemukan dan sudah diperbaiki

Bagian ini penting: beberapa kesalahan ada di kode kami sendiri, bukan
di alat.

| Masalah | Dampak | Status |
|---|---|---|
| Baris data dibuang bila satu kolom sensor kosong | Seluruh data 1-4 Nov hilang dari analitik, model memakai data 33 jam lalu | Diperbaiki |
| Nilai negatif ditampilkan sebagai nol | PM2.5 terbaca "0" padahal sensor di bawah ambang | Diperbaiki, kini "-" |
| Saat sensor debu negatif, forecast tetap terbit | Kurva forecast tidak menyambung dengan kenyataan | Diperbaiki, forecast ditolak |
| ISPU batal bila satu polutan kosong | ISPU tampil kosong total | Diperbaiki |
| Query dashboard mengambil 1000 baris tertua | Dashboard terlambat 5 jam | Diperbaiki |
| Loop forecast mati bila internet putus sesaat | Forecast berhenti sampai dinyalakan manual | Diperbaiki |
| Tabel forecast tumbuh tanpa batas | Database 500 MB penuh dalam 15 hari | Diperbaiki, retensi 7 hari |
| Tabel ISPU PM2.5/PM10 di firmware terbalik | PM2.5 tinggi bisa menghasilkan ISPU lebih rendah | Diperbaiki |

---

## 4. Hasil pengukuran forecast

Forecast diuji dengan cara yang benar: prediksi yang **dulu benar-benar
diterbitkan** dibandingkan dengan pembacaan sensor sesudahnya, bukan
dengan metrik training.

Pembandingnya "persistence", yaitu menahan nilai terakhir. Ini standar
minimal yang wajar: model yang tidak bisa mengalahkan garis lurus tidak
layak ditampilkan.

Periode 12 jam, 2 November:

| Polutan | Horizon | Model | Persistence | Pemenang |
|---|---|---|---|---|
| PM2.5 | 1-10 mnt | 2,83 | **1,33** | persistence |
| PM2.5 | 11-30 mnt | 3,04 | **1,32** | persistence |
| PM2.5 | 31-60 mnt | 3,99 | **2,32** | persistence |
| PM10 | 1-10 mnt | 3,45 | **1,75** | persistence |
| PM10 | 11-30 mnt | 3,80 | **1,74** | persistence |
| PM10 | 31-60 mnt | 5,09 | **3,06** | persistence |
| CO | 1-10 mnt | 299,24 | **92,26** | persistence |
| CO | 11-30 mnt | 200,08 | **152,39** | persistence |
| CO | 31-60 mnt | **131,61** | 176,08 | **model** |

**Kesimpulan yang jujur:** model hanya unggul pada satu titik, yaitu CO
pada horizon 31-60 menit (25% lebih baik). Di luar itu, menahan nilai
terakhir lebih akurat.

Ada batas metodologis yang perlu diketahui dosen: model memprediksi
langsung t+60, lalu prediksi t+1 sampai t+59 diperoleh dengan menggeser
jendela masukan mundur. Akibatnya prediksi jangka pendek justru memakai
data yang lebih lama, sehingga wajar kalah pada horizon 1-30 menit.

Karena itu sistem sekarang menolak menerbitkan forecast yang kalah dari
pembanding tersebut, dan dashboard menjelaskan alasannya.

Fitur jam (siklus harian) belum dipakai. Ini kandidat perbaikan
berikutnya yang paling murah.

---

## 5. Kejujuran data

Prinsip yang kami pegang: **lebih baik tidak menampilkan apa pun
daripada menampilkan angka yang tidak bisa dipertanggungjawabkan.**

Penerapannya:

- Nilai negatif tampil sebagai "-" di Riwayat, bukan 0
- Grafik aktual terputus saat sensor di bawah ambang, tidak dipaksa rata
- Sensor yang gagal baca mengirim `-999`, bukan 0
- Forecast tidak terbit bila input tidak valid atau model kalah akurat
- Dashboard menuliskan alasan, bukan sekadar kosong

Konsekuensinya dashboard kadang terlihat kosong. Itu disengaja. Angka
kosong lebih jujur daripada kurva yang meyakinkan tetapi salah.

Satu hal yang belum tertangani: nilai O3 19,63 ug/m3 masih tampil
seolah pengukuran sah, padahal itu batas minimum yang dipaksakan kode.
Ini akan ditandai pada pembaruan berikutnya.

---

## 6. Yang diperlukan untuk perbaikan

### Perlu tindakan di lokasi (butuh alat ukur)

| Prioritas | Tindakan | Alat |
|---|---|---|
| 1 | Ukur Vcc modul debu (harus 5 V) | multimeter |
| 2 | Cek ada/tidaknya transistor NPN di jalur LED debu | visual |
| 3 | Cek kapasitor 220 uF pada modul debu | visual |
| 4 | Pastikan sensor NO2 benar-benar terpasang | visual |

### Perlu pengadaan

| Item | Perkiraan biaya | Untuk |
|---|---|---|
| Transistor NPN (2N2222/S8050) | Rp 2.000 | LED sensor debu |
| Resistor 150 ohm | Rp 500 | LED sensor debu |
| Kapasitor 220 uF | Rp 2.000 | catu LED sensor debu |
| Modul GP2Y1010AU0F baru | Rp 30.000-60.000 | bila modul lama rusak |
| Modul NO2 (bila memang belum ada) | menyesuaikan | kanal NO2 |

Total perbaikan termurah di bawah Rp 5.000 bila hanya soal komponen
pendukung LED.

### Sudah siap, menunggu keputusan

- Deploy ke VPS agar forecast berjalan 24/7 tanpa laptop.
  Kebutuhan: 2 GB RAM (satu siklus terukur 894 MB). Skrip dan unit
  service sudah tersedia di folder `deploy/`.
- Tanpa VPS, forecast hanya berjalan saat laptop menyala, dengan
  cadangan GitHub Actions tiap 3-7 jam.

---

## 7. Pertanyaan yang mungkin muncul

**Tanya: kenapa dashboard sering kosong?**
Karena sistem menolak menampilkan angka yang tidak lolos uji. Bila
sensor diperbaiki, isinya akan muncul sendiri.

**Tanya: apakah data yang sudah ada bisa dipakai?**
Data 30 Agustus-6 September adalah data generator (dummy), bukan
pengukuran. Sudah dipisahkan dan tidak dipakai untuk training. Data
nyata mulai 13 September, dengan kualitas berbeda-beda sesuai kondisi
sensor saat itu.

**Tanya: kenapa 12V?**
Perangkat sudah memiliki regulator internal. Adaptor 12 V 1,5 A maupun
2 A sama-sama memadai karena beban hanya sekitar 0,5 A. Penggantian
adaptor tidak memperbaiki masalah sensor; sudah diuji dengan data
perbandingan.

**Tanya: apakah model LSTM-nya salah?**
Bukan. Model berjalan benar dan dilatih hanya dari segmen data yang
bersambung. Masalahnya ada pada kualitas dan panjang data masukan.
Dengan riwayat valid yang baru beberapa jam, tidak ada model yang bisa
mengalahkan "nilai terakhir".

**Tanya: apa langkah berikutnya yang paling berdampak?**
Memperbaiki jalur LED sensor debu. Itu satu perbaikan yang berpotensi
menghidupkan dua kanal sekaligus (PM2.5 dan PM10) dan memberi data
yang cukup untuk melatih model dengan benar.

---

## 8. Angka ringkas untuk disebut saat diskusi

- Data terkumpul: 15.188 baris sensor, 15.185 baris ADC mentah
- Data dummy yang dibuang: 10.081 baris (30 Agu-6 Sep)
- Siklus forecast tersimpan: 38.040 baris
- Alert aktif: 8 baris
- Retensi: 7 hari, pemakaian stabil sekitar 48 MB dari 500 MB
- Interval kirim sensor: 60 detik
- Interval forecast lokal: 5 menit
- Waktu satu siklus forecast: sekitar 11 detik (model tersimpan)
- Kebutuhan memori satu siklus: 894 MB puncak
