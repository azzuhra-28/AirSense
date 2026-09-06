/**
 * AIRLYTIC - MICS6814 Sensor Read Module
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
  float vout = (sensorValue_CO / 4095.0) * VREF; 
  float RL = 10000.0;
  float R0_CO = 7100.0; 
  
  if (vout > 0.1 && vout < VREF) {
    float Rs = ((VREF * RL) / vout) - RL;
    float ratio = Rs / R0_CO;
    coPPM = pow(ratio, -1.18); 
    cougm3 = coPPM * (28.01 / 24.45) * 1000;
  } else {
    cougm3 = 0;
  }
  coISPU = convertCOToISPU(cougm3);
}

void readNO2() {
  sensorValue_NO2 = analogRead(NO2_ANALOG_PIN);
  float voutNO2 = (sensorValue_NO2 / 4095.0) * VREF;

  if (sensorValue_NO2 >= 4090) {
    no2PPM = 0;
    no2ugm3 = 0;
  } 
  else if (voutNO2 > 0.05) {
    no2PPM = voutNO2 * 0.05; 
    no2ugm3 = no2PPM * (46.01 / 24.45) * 1000;
  } else {
    no2ugm3 = 0;
  }
  no2ISPU = convertNo2ToISPU(no2ugm3);
}