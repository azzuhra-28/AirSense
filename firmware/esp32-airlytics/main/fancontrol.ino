//fancontrol.ino

void controlFan_NonBlocking() {
  if (temperatureC_val != -999.0) {
    if (temperatureC_val >= 35.0) {
      digitalWrite(FAN_RELAY_PIN, HIGH);
    } else {
      digitalWrite(FAN_RELAY_PIN, LOW);
    }
  } else {
    digitalWrite(FAN_RELAY_PIN, LOW);
  }
}