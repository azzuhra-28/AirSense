//main.ino

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"   // kredensial WiFi & Supabase (JANGAN di-commit, lihat secrets.h.example)

#define DHTPIN 33
#define MQ131_ANALOG_PIN 32
#define GP2Y_ANALOG_PIN 35
#define NO2_ANALOG_PIN 34
#define CO_ANALOG_PIN 39
#define FAN_RELAY_PIN 4
#define GP2Y_LED_PIN 2

#define DHTTYPE DHT22
#define RLMQ131 10000.0
#define VREF 3.3
#define ADC_RESOLUTION 4095.0
#define R0MQ131 330724.71

// ssid, password, SUPABASE_HOST, SUPABASE_API_KEY
// didefinisikan di secrets.h (lihat secrets.h.example untuk templatnya)
const char* ENDPOINT_ANALOG_OUT = "/rest/v1/tb_analog_out";
const char* ENDPOINT_UGM3 = "/rest/v1/tb_konsentrasi_gas";
const char* ENDPOINT_ISPU = "/rest/v1/tb_prediksi_kualitas_udara";


bool wifiConnected = false;

DHT dht(DHTPIN, DHTTYPE);

LiquidCrystal_I2C lcd(0x27, 16, 2);

float humidity_val = 0;
float temperatureC_val = 0;
float humid = 0;
float temp = 0;
int sensorValue_MQ131 = 0;
int sensorValue_GP2Y = 0;
int sensorValue_PM25 = 0;
int sensorValue_PM10 = 0;
int sensorValue_NO2 = 0;
int sensorValue_CO = 0;
float pm25ugm3 = 0;
float pm25ISPU = 0;
float voutPM25 = 0;
float pm10ugm3 = 0;
float pm10ISPU = 0;
float voutPM10 = 0;
float coPPM = 0;
float cougm3 = 0;
float coISPU = 0;
float ozonePPB = 0;
float ozoneugm3 = 0;
float ozoneISPU = 0;
float no2PPM = 0;
float no2ugm3 = 0;
float no2ISPU = 0;
const float ozoneMolarMass = 48;
const float no2MolarMass = 46.01;
const float coMolarMass = 28.01;
const float molarVolume = 24.45;


int lastHttpResponseCode = 0;
const int NUM_SAMPLES = 100;

unsigned long lastSensorReadTime = 0;
const unsigned long sensorReadInterval = 2000;

unsigned long lastLCDDisplayChangeTime = 0;
const unsigned long lcdDisplayChangeInterval = 3000;

unsigned long lastSendTime = 0;
const unsigned long sendDataInterval = 1000 * 60;

unsigned long lastFanCheckTime = 0;
const unsigned long fanCheckInterval = 5000;

enum LCD_STATE {
  LCD_INIT_WELCOME, // Initial welcome screen state
  LCD_DHT22,
  LCD_MQ131,
  LCD_PM25,
  LCD_PM10,
  LCD_NO2,
  LCD_CO,
  LCD_SENDING_MESSAGE, // State untuk pesan "Data has been sent."
  LCD_SEND_ERROR       // State untuk pesan error pengiriman
};
LCD_STATE currentLcdState = LCD_INIT_WELCOME;

unsigned long lcdMessageStartTime = 0;
const unsigned long messageDisplayDuration = 3000;

void readDHT22Sensor();
void readMQ131Sensor();
void readPM25();
void readPM10();
void readNO2();
void readCO();
void displayDHT22onLCD_NonBlocking();
void displayMQ131onLCD_NonBlocking();
void displayPM25onLCD_NonBlocking();
void displayPM10onLCD_NonBlocking();
void displayNO2onLCD_NonBlocking();
void displayCOonLCD_NonBlocking();
void displaySentMessageOnLCD();
void displaySendErrorMessageOnLCD(int errorCode);

void controlFan_NonBlocking();
void connectToWiFi();
int  sendDataToGasTable();
int  sendDataToAnalogTable();
int  sendDataToISPUTable();
int  sendAllDataToSupabase();



void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  Serial.println("---SETUP---");
  Serial.println("Selamat Datang");
  pinMode(FAN_RELAY_PIN, OUTPUT);
  pinMode(GP2Y_LED_PIN, OUTPUT);
  pinMode(GP2Y_ANALOG_PIN, INPUT);

  dht.begin();

  lcd.init();
  lcd.backlight();
  lcd.setCursor(1, 0);
  lcd.print("Selamat Datang");
  lcd.setCursor(2, 1);
  lcd.print("di Airlytic!");
  delay(5000);
  lcd.clear();
  Serial.println("MENGHUBUNGKAN KE WIFI...");

  connectToWiFi();

  lastSensorReadTime = millis();
  lastLCDDisplayChangeTime = millis();
  lastSendTime = millis();
  lastFanCheckTime = millis();

  currentLcdState = LCD_DHT22;
  Serial.println("SETUP SELESAI. MASUK KE LOOP");
  Serial.print("INITIAL LED STATE:");
}

void loop() {
  unsigned long currentTime = millis();

  Serial.print("\n--- Loop Cycle --- Current Time: "); Serial.println(currentTime);
  Serial.print("WiFi Connected: "); Serial.println(wifiConnected ? "YES" : "NO");

  if (wifiConnected) {
    if (currentTime - lastFanCheckTime >= fanCheckInterval) {
      Serial.println("MENGECEK KIPAS...");
      controlFan_NonBlocking();
      lastFanCheckTime = currentTime;
    }
    if (currentTime - lastSensorReadTime >= sensorReadInterval) {
      Serial.println("MEMBACA SEMUA SENSOR...");
      readDHT22Sensor();
      readMQ131Sensor();
      readPM25();
      readPM10();
      readNO2();
      readCO();
      lastSensorReadTime = currentTime;
    }

    if (currentTime - lastSendTime >= sendDataInterval) {
      Serial.println("Waktunya Kirim Data!");
      lastHttpResponseCode = sendAllDataToSupabase();
      lastSendTime = currentTime;
      Serial.println("lastHttpsResponsecode: ");
    }

    Serial.print("Current LCD State: ");
    Serial.println(currentLcdState);
    Serial.print(" | Time since last LCD Change: ");
    Serial.println(currentTime - lastLCDDisplayChangeTime);

    switch (currentLcdState) {
      case LCD_SENDING_MESSAGE:
      case LCD_SEND_ERROR:
      Serial.println("LCD State: Showing Special Message (SENDING_MESSAGE/SEND_ERROR)");
        if (currentLcdState == LCD_SENDING_MESSAGE) {
          displaySentMessageOnLCD();
          Serial.println("  - Displaying 'Data has been sent.'");
        } else {
          displaySendErrorMessageOnLCD(lastHttpResponseCode);
          Serial.print("  - Displaying 'Send Failed!' with code: "); Serial.println(lastHttpResponseCode);
        }

        if (currentTime - lcdMessageStartTime >= messageDisplayDuration) {
          Serial.println("  - Special message duration ended. Switching to DHT22.");
          currentLcdState = LCD_DHT22;
          lastLCDDisplayChangeTime = currentTime;
          lcd.clear();
        }
        break;
      
      default:
      Serial.println("LCD State: Normal Rotation");
        if (currentTime - lastLCDDisplayChangeTime >= lcdDisplayChangeInterval) {
          lcd.clear();
          Serial.print("  - LCD Cleared. Switching from state ");
          Serial.print(currentLcdState);
          Serial.print(" to next... ");

          switch (currentLcdState) {
            case LCD_DHT22:
              displayDHT22onLCD_NonBlocking();
              currentLcdState = LCD_MQ131;
              Serial.println("DHT22 displayed. Next: MQ131");
              break;
            case LCD_MQ131:
              displayMQ131onLCD_NonBlocking();
              currentLcdState = LCD_PM25;
              Serial.println("MQ131 displayed. Next: PM25");
              break;
            case LCD_PM25:
              displayPM25onLCD_NonBlocking();
              currentLcdState = LCD_PM10;
              Serial.println("MQ131 displayed. Next: PM10");
              break;
            case LCD_PM10:
              displayPM10onLCD_NonBlocking();
              currentLcdState = LCD_NO2;
              Serial.println("MQ131 displayed. Next: NO2");
              break;
            case LCD_NO2:
              displayNO2onLCD_NonBlocking();
              currentLcdState = LCD_CO;
              Serial.println("MQ131 displayed. Next: CO");
              break;
            case LCD_CO:
              displayCOonLCD_NonBlocking();
              currentLcdState = LCD_DHT22;
              Serial.println("MQ131 displayed. Next: DHT22");
              break;
            case LCD_INIT_WELCOME: // Seharusnya tidak terjadi setelah setup
              currentLcdState = LCD_DHT22;
              Serial.println("INIT_WELCOME fallback. Next: DHT22");
              break;
          }
          lastLCDDisplayChangeTime = currentTime;
          Serial.print("  - lastLCDDisplayChangeTime updated to: "); Serial.println(lastLCDDisplayChangeTime);
        } else {
          Serial.print("  - Not yet time to change LCD display.");
        }
        break;
  }
  } else {
    lcd.setCursor(0, 0);
    lcd.print("No WiFi");
    lcd.setCursor(0, 1);
    lcd.print("Restart to config");
    delay(50);
  }
}