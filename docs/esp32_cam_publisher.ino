/*
 * esp32_cam_publisher.ino
 * Capture frame periodik dari ESP32-CAM dan publish ke MQTT broker.
 *
 * Library: PubSubClient, ESP32 Camera (built-in)
 *
 * Topik publish: wildguard/<DEVICE_ID>/frame  (raw JPEG bytes)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include "esp_camera.h"

#define DEVICE_ID "esp32cam-01"

const char* WIFI_SSID = "your-wifi";
const char* WIFI_PASS = "your-pass";
const char* MQTT_HOST = "192.168.1.100";
const int   MQTT_PORT = 1883;
const long  CAPTURE_INTERVAL_MS = 5000;  // kirim tiap 5 detik
                                         // (atau trigger via PIR sensor)

// AI Thinker pinout
#define PWDN_GPIO_NUM  32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  0
#define SIOD_GPIO_NUM  26
#define SIOC_GPIO_NUM  27
#define Y9_GPIO_NUM    35
#define Y8_GPIO_NUM    34
#define Y7_GPIO_NUM    39
#define Y6_GPIO_NUM    36
#define Y5_GPIO_NUM    21
#define Y4_GPIO_NUM    19
#define Y3_GPIO_NUM    18
#define Y2_GPIO_NUM    5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM  23
#define PCLK_GPIO_NUM  22

WiFiClient net;
PubSubClient mqtt(net);
unsigned long lastCapture = 0;

void setupCamera() {
  camera_config_t c;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM;
  c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = PWDN_GPIO_NUM; c.pin_reset = RESET_GPIO_NUM;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_VGA;     // 640x480
  c.jpeg_quality = 12;
  c.fb_count = 1;
  esp_camera_init(&c);
}

void connectMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect(DEVICE_ID)) break;
    delay(1000);
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  setupCamera();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(60000);  // cukup untuk JPEG VGA
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  if (millis() - lastCapture > CAPTURE_INTERVAL_MS) {
    lastCapture = millis();
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) return;
    String topic = String("wildguard/") + DEVICE_ID + "/frame";
    mqtt.publish(topic.c_str(), fb->buf, fb->len);
    esp_camera_fb_return(fb);
  }
}
