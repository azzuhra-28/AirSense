// --- FUNGSI ISPU PM2.5 ---
//
// Pembanding di file ini dulunya BUKAN tabel ISPU baku: pada pita
// tertinggi nilainya berbalik (300 turun ke 200, lalu 300 ke 300 pada
// pita 250,4-500), sehingga PM2.5 tinggi bisa menghasilkan ISPU lebih
// rendah daripada PM2.5 sedang. Disamakan dengan analytics/src/ispu.py.
float convertpm25ToISPU(float x) {
  float Ia, Ib, Xa, Xb;
  if (x <= 15.5)       { Ia = 50;  Ib = 0;   Xa = 15.5;  Xb = 0; }
  else if (x <= 55.4)  { Ia = 100; Ib = 50;  Xa = 55.4;  Xb = 15.5; }
  else if (x <= 150.4) { Ia = 200; Ib = 100; Xa = 150.4; Xb = 55.4; }
  else if (x <= 250.4) { Ia = 300; Ib = 200; Xa = 250.4; Xb = 150.4; }
  else if (x <= 500)   { Ia = 500; Ib = 300; Xa = 500;   Xb = 250.4; }
  else { return 500; }
  return ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib;
}

// --- FUNGSI ISPU PM10 ---
// Pita 420-500 dulu memetakan 300 -> 300, jadi kenaikan konsentrasi
// tidak pernah menaikkan ISPU.
float convertpm10ToISPU(float x) {
  float Ia, Ib, Xa, Xb;
  if (x <= 50)        { Ia = 50;  Ib = 0;   Xa = 50;   Xb = 0; }
  else if (x <= 150)  { Ia = 100; Ib = 50;  Xa = 150;  Xb = 50; }
  else if (x <= 350)  { Ia = 200; Ib = 100; Xa = 350;  Xb = 150; }
  else if (x <= 420)  { Ia = 300; Ib = 200; Xa = 420;  Xb = 350; }
  else if (x <= 500)  { Ia = 500; Ib = 300; Xa = 500;  Xb = 420; }
  else { return 500; }
  return ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib;
}

// --- BACA SENSOR DEBU GP2Y1010AU0F ---
//
// Satu kali sampling dipakai bersama PM2.5 dan PM10. Versi lama
// menjalankan loop sampling dua kali penuh dengan pin dan urutan
// timing yang sama persis, hanya beda koefisien.
//
// Durasi total dijaga tetap ~1 detik seperti versi lama (100 sampel)
// supaya loop() tidak memblokir lebih lama dari sebelumnya. Median 5
// blok dipakai untuk membuang lonjakan tunggal tanpa menambah waktu.
void readDustSensors() {
  const int BLOCKS = 5;              // median dari 5 blok
  const int PER_BLOCK = NUM_SAMPLES / BLOCKS;
  int blockValue[BLOCKS];

  for (int b = 0; b < BLOCKS; b++) {
    long total = 0;
    for (int j = 0; j < PER_BLOCK; j++) {
      digitalWrite(GP2Y_LED_PIN, LOW);
      delayMicroseconds(280);
      total += analogRead(GP2Y_ANALOG_PIN);
      delayMicroseconds(40);
      digitalWrite(GP2Y_LED_PIN, HIGH);
      delayMicroseconds(9680);
    }
    blockValue[b] = (int)(total / PER_BLOCK);
  }

  // Insertion sort 5 elemen, lalu ambil median.
  for (int i = 1; i < BLOCKS; i++) {
    int key = blockValue[i];
    int j = i - 1;
    while (j >= 0 && blockValue[j] > key) {
      blockValue[j + 1] = blockValue[j];
      j--;
    }
    blockValue[j + 1] = key;
  }

  int raw = blockValue[BLOCKS / 2];
  float vout = (raw / ADC_RESOLUTION) * VREF;

  sensorValue_PM25 = raw;
  sensorValue_PM10 = raw;
  voutPM25 = vout;
  voutPM10 = vout;

  // Kurva datasheet GP2Y1010AU0F. Di bawah titik potong kurva
  // menghasilkan nilai negatif; itu berarti konsentrasi di bawah ambang
  // deteksi sensor, jadi dijutkan ke 0. Data negatif merusak training.
  pm25ugm3 = 218.7 * vout - 9.7854;
  if (pm25ugm3 < 0.0) pm25ugm3 = 0.0;

  pm10ugm3 = 288.27 * vout - 15.753;
  if (pm10ugm3 < 0.0) pm10ugm3 = 0.0;

  pm25ISPU = convertpm25ToISPU(pm25ugm3);
  pm10ISPU = convertpm10ToISPU(pm10ugm3);
}
