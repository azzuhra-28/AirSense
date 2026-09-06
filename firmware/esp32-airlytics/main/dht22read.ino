// dht22read.ino

void readDHT22Sensor() {
  // temp = dht.readTemperature();
  humidity_val = dht.readHumidity();
  // humidity_val = 2.6923 * humid - 132.4231;
  temperatureC_val = dht.readTemperature();
  

  if (isnan(humidity_val) || isnan(temperatureC_val)) {
    Serial.println("Gagal membaca dari sensor DHT!");
    humidity_val = -999.0;
    temperatureC_val = -999.0;
  }

  // Serial.print("Kelembaban: ");
  // Serial.print(humidity_val);
  // Serial.println(" %");
  // Serial.print("Suhu: ");
  // Serial.print(temperatureC_val);
  // Serial.println(" *C ");
}