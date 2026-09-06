//senddata.ino

int sendJson(const char* endpoint, String jsonPayload) {
  if (!WiFi.isConnected()) {
    return -1;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;

  String url = String("https://") + SUPABASE_HOST + endpoint;
  http.begin(client, url);

    // 2. Persiapan Header Supabase (Wajib)
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_API_KEY);
  // Authorization: Bearer diperlukan untuk Kebijakan RLS
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_API_KEY)); 
  
  Serial.print("Sending to: "); Serial.println(url);
  Serial.println("JSON: " + jsonPayload);

  // 3. Kirim Request POST
  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode >= 200 && httpResponseCode < 300) { 
      Serial.printf("Response Code: %d (SUCCESS)\n", httpResponseCode);
  } else {
      Serial.printf("Response Code: %d (ERROR)\n", httpResponseCode);
      Serial.println("Error Body: " + http.getString());
  }
    
  http.end();
  return httpResponseCode;
}

int sendDataToGasTable() {
  String json = "{";
  json += "\"pm25_ugm3\":" + String(pm25ugm3) + ",";
  json += "\"pm10_ugm3\":" + String(pm10ugm3) + ",";
  json += "\"co_ugm3\":" + String(cougm3) + ",";
  json += "\"no2_ugm3\":" + String(no2ugm3) + ",";
  json += "\"o3_ugm3\":" + String(ozoneugm3) + ",";
  json += "\"temperature\":" + String(temperatureC_val) + ",";
  json += "\"humidity\":" + String(humidity_val);
  json += "}";
  return sendJson(ENDPOINT_UGM3, json);
}

int sendDataToAnalogTable() {
    String json = "{";
    json += "\"o3_analog\":" + String(sensorValue_MQ131) + ",";
    json += "\"pm25_analog\":" + String(sensorValue_PM25) + ",";
    json += "\"pm10_analog\":" + String(sensorValue_PM10) + ",";
    json += "\"no2_analog\":" + String(sensorValue_NO2) + ",";
    json += "\"co_analog\":" + String(sensorValue_CO);
    json += "}";
    return sendJson(ENDPOINT_ANALOG_OUT, json);
}

int sendDataToISPUTable() {
    String json = "{";
    json += "\"pm2_5_ispu\":" + String(pm25ISPU) + ",";
    json += "\"pm10_ispu\":" + String(pm10ISPU) + ",";
    json += "\"co_ispu\":" + String(coISPU) + ",";
    json += "\"no2_ispu\":" + String(no2ISPU) + ",";
    json += "\"o3_ispu\":" + String(ozoneISPU);
    json += "}";
    return sendJson(ENDPOINT_ISPU, json);
}

int sendAllDataToSupabase() {
    if (!WiFi.isConnected()) {
        Serial.println("WiFi not Connected. Can't Send Data.");
        return -1;
    }

    Serial.println("\n--- Starting Multi-Table Send to Supabase ---");
    int httpResponseCode = 0;
    
    // 1. KIRIM DATA KONSENTRASI GAS (UGM3 & DHT)
    httpResponseCode = sendDataToGasTable();
    if (httpResponseCode < 200 || httpResponseCode >= 300) {
        Serial.println("Gagal mengirim ke tb_konsentrasi_gas. Aborting.");
        currentLcdState = LCD_SEND_ERROR;
        lcdMessageStartTime = millis();
        return httpResponseCode;
    }
    
    // 2. KIRIM DATA ANALOG (RAW ADC)
    httpResponseCode = sendDataToAnalogTable();
    if (httpResponseCode < 200 || httpResponseCode >= 300) {
        Serial.println("Gagal mengirim ke tb_analog_out. Aborting.");
        currentLcdState = LCD_SEND_ERROR;
        lcdMessageStartTime = millis();
        return httpResponseCode;
    }

    // 3. KIRIM DATA ISPU
    httpResponseCode = sendDataToISPUTable();
    if (httpResponseCode < 200 || httpResponseCode >= 300) {
        Serial.println("Gagal mengirim ke tb_prediksi_kualitas_udara. Aborting.");
        currentLcdState = LCD_SEND_ERROR;
        lcdMessageStartTime = millis();
        return httpResponseCode;
    }

    // Jika semua sukses (Kode 201), set LCD
    currentLcdState = LCD_SENDING_MESSAGE;
    lcdMessageStartTime = millis();
    Serial.println("Semua data berhasil dikirim ke 3 tabel Supabase.");
    return httpResponseCode; // Mengembalikan kode sukses terakhir (misalnya 201)
}

// int sendADCToMySQL() {
//   if (WiFi.isConnected()) {
//     HTTPClient http;
//     http.begin(serverName);
//     http.addHeader("Content-Type", "application/x-www-form-urlencoded");

//     String httpRequestData = "o3_analog=" + String(sensorValue_MQ131) +
//                              "&pm25_analog=" + String(sensorValue_PM25) +
//                              "&pm10_analog=" + String(sensorValue_PM10) +
//                              "&no2_analog=" + String(sensorValue_NO2) +
//                              "&co_analog=" + String(sensorValue_CO) +
//                              "&pm25_ugm3=" + String(pm25ugm3) +
//                              "&pm10_ugm3=" + String(pm10ugm3) +
//                              "&co_ugm3=" + String(cougm3) +
//                              "&no2_ugm3=" + String(no2ugm3) +
//                              "&o3_ugm3=" + String(ozoneugm3) +
//                              "&temperature=" + String(temperatureC_val) +
//                              "&humidity=" + String(humidity_val) +
//                              "&PM2_5_ISPU=" + String(pm25ISPU) +
//                              "&PM10_ISPU=" + String(pm10ISPU) +
//                              "&CO_ISPU=" + String(coISPU) +
//                              "&NO2_ISPU=" + String(no2ISPU) +
//                              "&O3_ISPU=" + String(ozoneISPU);
//     Serial.println("Sending data to database...");
//     int httpResponseCode = http.POST(httpRequestData);

//     if (httpResponseCode > 0) {
//       Serial.print("Kode Respon HTTP: ");
//       Serial.println(httpResponseCode);
//       String response = http.getString();
//       Serial.println(response);
//       currentLcdState = LCD_SENDING_MESSAGE;
//       lcdMessageStartTime = millis();
//     } else {
//       Serial.print("Kode Error: ");
//       Serial.println(httpResponseCode);
//       currentLcdState = LCD_SEND_ERROR;
//       lcdMessageStartTime = millis();
//     }
//     http.end();
//     return httpResponseCode;
//   } else {
//     Serial.println("WiFi not Connected. Cant Send Data.");
//     return -1;
//   }
// }