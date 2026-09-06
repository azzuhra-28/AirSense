//display.ino

void displayDHT22onLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("Temp : ");
  if (temperatureC_val == -999.0) {
    lcd.print("Error");
  } else {
    lcd.print(temperatureC_val, 1);
    lcd.print((char)223);
    lcd.print("C");
  }
  lcd.setCursor(0, 1);
  lcd.print("Humid: ");
  if (humidity_val == -999.0) {
    lcd.print("Error");
  } else {
    lcd.print(humidity_val, 1);
    lcd.print(" %RH");
  }
}

void displayMQ131onLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("Ozone: ");
  // lcd.print(ozonePPB / 1000);
  // lcd.print(" PPM");
  // lcd.print(" / ");
  // lcd.print(sensorValue_MQ131, 13);  
  // lcd.setCursor(0, 1);
  // lcd.print("Cons:");
  lcd.print(ozoneugm3, 2);
  lcd.print(" ug/m3");
}

void displayPM25onLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("PM2.5: ");
  lcd.print(pm25ugm3, 2);
  lcd.print(" ug/m3");

  // lcd.setCursor(0, 1);
  // lcd.print("PM10 : ");
  // lcd.print(pm10ugm3);
}

void displayPM10onLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("PM10:");
  lcd.print(pm10ugm3, 2); //notyet!!!
  lcd.print(" ug/m3");

  // lcd.setCursor(0, 1);
  // lcd.print("PM10: ");
  // lcd.print(voutPM10);
}

void displayNO2onLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("NO2 :");
  // lcd.print(no2PPM);
  // lcd.print(" PPM");
  // lcd.print(" | ");
  // lcd.print(sensorValue_NO2);

  // lcd.setCursor(0, 1);
  // lcd.print("Cons: ");
  lcd.print(no2ugm3, 2);
  lcd.print(" ug/m3");
}

void displayCOonLCD_NonBlocking() {
  lcd.setCursor(0, 0);
  lcd.print("CO:");
  // lcd.print(coPPM); //notyet!!!
  // lcd.print(" PPM");
  // lcd.print(sensorValue_CO);
  // lcd.setCursor(0, 1);
  // lcd.print("Cons:");
  lcd.print(cougm3);
  lcd.print(" ug/m3");
}

void displaySentMessageOnLCD() {
  lcd.setCursor(0, 0);
  lcd.print("Data has been");
  lcd.setCursor(0, 1);
  lcd.print("sent.");
}

void displaySendErrorMessageOnLCD(int errorCode) {
  lcd.setCursor(0, 0);
  lcd.print("Send Failed!");
  lcd.setCursor(0, 1);
  lcd.print("Err Code: " + String(errorCode));
}
