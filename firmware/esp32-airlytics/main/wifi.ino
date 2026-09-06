//wifi.ino

void connectToWiFi() {
  WiFiManager wm;

  Serial.println("Connecting to WiFi using WifiManager...");
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Connecting WiFi");
  lcd.setCursor(0, 1);
  lcd.print("via Portal AP...");

  bool res = wm.autoConnect("Air Quality Access Point");

  if (!res) {
    Serial.println("Failed to connect to WiFi, starting config portal...");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Failed!");
    lcd.setCursor(0, 1);
    lcd.print("Restart to retry.");
    wifiConnected = false;
  } else {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi Connected!");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    // delay(3000);  // Tampilkan IP sebentar
    // lcd.clear();
    wifiConnected = true;
  }
}