/**
 * AIRSENSE - MICS6814 Sensor Read Module
 * Perbaikan: Deteksi saturasi NO2 (4095 -> 0) & Kalibrasi CO (R0=7100)
 */

// --- FUNGSI KONVERSI ISPU NO2 ---
float convertNo2ToISPU(float x) {
  float Ia, Ib, Xa, Xb;
  if (x <= 80)      { Ia = 50;  Ib = 0;   Xa = 80;   Xb = 0; } 
  else if (x <= 200) { Ia = 100; Ib = 50;  Xa = 200;  Xb = 80; } 
  else if (x <= 1130){ Ia = 200; Ib = 100; Xa = 1130; Xb = 200; } 
  else if (x <= 2260){ Ia = 300; Ib = 200; Xa = 2260; Xb = 1130; } 
  else { return 301; } 
  return ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib;
}

// --- FUNGSI KONVERSI ISPU CO ---
float convertCOToISPU(float x) {
  float Ia, Ib, Xa, Xb;
  if (x <= 4000)      { Ia = 50;  Ib = 0;   Xa = 4000;  Xb = 0; } 
  else if (x <= 8000)  { Ia = 100; Ib = 50;  Xa = 8000;  Xb = 4000; } 
  else if (x <= 15000) { Ia = 200; Ib = 100; Xa = 15000; Xb = 8000; } 
  else if (x <= 30000) { Ia = 300; Ib = 200; Xa = 30000; Xb = 15000; } 
  else { return 301; }
  return ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib;
}

void readCO() {
  sensorValue_CO = analogRead(CO_ANALOG_PIN);
  float vout = (sensorValue_CO / ADC_RESOLUTION) * VREF;
  float RL = 10000.0;
  float R0_CO = 7100.0;

  // Nilai yang tidak dapat dikonversi dikirim sebagai sentinel -999,
  // bukan 0, supaya analytics bisa membedakan "sensor tidak terbaca"
  // dari "konsentrasi benar-benar nol".
  if (vout > 0.1 && vout < VREF) {
    float Rs = ((VREF * RL) / vout) - RL;
    float ratio = Rs / R0_CO;
    coPPM = pow(ratio, -1.18);
    cougm3 = coPPM * (28.01 / 24.45) * 1000;
    coISPU = convertCOToISPU(cougm3);
  } else {
    cougm3 = -999.0;   // sentinel: pembacaan tidak valid
    coISPU = 0;
  }
}

void readNO2() {
  sensorValue_NO2 = analogRead(NO2_ANALOG_PIN);
  float voutNO2 = (sensorValue_NO2 / ADC_RESOLUTION) * VREF;

  // Pin NO2 mengambang: tanpa sensor terpasang ADC mentok di
  // rel (0 atau 4095). Dulu kondisi itu dikirim sebagai 0 sehingga
  // terbaca "udara bebas NO2", padahal artinya sensor tidak ada.
  if (sensorValue_NO2 >= 4090 || sensorValue_NO2 <= 5) {
    no2ugm3 = -999.0;  // sentinel: tidak ada sensor / pin mengambang
    no2ISPU = 0;
    return;
  }

  // Kurva MiCS-6814 untuk kanal NO2: Rs/R0 terhadap konsentrasi.
  // Konstanta dari datasheet, bukan faktor linear 0,05 yang dipakai
  // versi lama (faktor itu membuat nilai selalu 0 atau 309,59).
  float RL = 10000.0;
  float R0_NO2 = 10000.0;

  if (voutNO2 > 0.05 && voutNO2 < VREF) {
    float Rs = ((VREF * RL) / voutNO2) - RL;
    float ratio = Rs / R0_NO2;
    // Rs/R0 ~ 1 pada udara bersih; makin kecil makin tinggi NO2.
    no2PPM = pow(ratio, -1.60) * 0.1;
    no2ugm3 = no2PPM * (no2MolarMass / molarVolume) * 1000;
    no2ISPU = convertNo2ToISPU(no2ugm3);
  } else {
    no2ugm3 = -999.0;
    no2ISPU = 0;
  }
}