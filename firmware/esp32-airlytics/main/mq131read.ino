//mq131read.ino
float convertOzoneToISPU(float x) {
  float Ia, Ib, Xa, Xb;
  float I;

  if (x <= 120) {
    Ia = 50; Ib = 0; Xa = 120; Xb = 0;
  } else if (x <= 235) {
    Ia = 100; Ib = 50; Xa = 235; Xb = 120;
  } else if (x <= 400) {
    Ia = 200; Ib = 100; Xa = 400; Xb = 235;
  } else if (x <= 800) {
    Ia = 300; Ib = 200; Xa = 800; Xb = 400;
  } else if (x <= 1000) {
    Ia = 300; Ib = 300; Xa = 1000; Xb = 800;
  } else {
    return 301; // 300++
  }

  I = ((Ia - Ib) / (Xa - Xb)) * (x - Xb) + Ib;
  return I;
}

void readMQ131Sensor() {
  sensorValue_MQ131 = analogRead(MQ131_ANALOG_PIN);

  float Voutozone = (sensorValue_MQ131 / ADC_RESOLUTION) * 3.3;

  // if (Vout < 0.01) Vout = 0.01;  // hindari pembagian nol

  // float Rs = RLMQ131 * (VREF - Vout) / Vout;
  // float ratio = Rs / R0MQ131;

  // // Koefisien kurva MQ131-LC (Rs/Ro vs O3)
  // float A = -1.518;
  // float B = 0.737;
  // float ozonePPM = pow(10, A * log10(ratio) + B);

  float ozonePPB = 341.38 * Voutozone - 126.55;
  if (ozonePPB < 0) {
    ozonePPB = 10.0;
  }
  // ozonePPB = map(sensorValue_MQ131, 0, 4095, 10, 1000);
  ozoneugm3 = ozonePPB * (ozoneMolarMass / molarVolume);
  ozoneISPU = convertOzoneToISPU(ozoneugm3);


  // Serial.print("Nilai Analog MQ131: ");
  // Serial.println(sensorValue_MQ131);
  // Serial.print("Ozon (estimasi): ");
  // Serial.print(ozonePPB);
  // Serial.println(" ppb");
}


