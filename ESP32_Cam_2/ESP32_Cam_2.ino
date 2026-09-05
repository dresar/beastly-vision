#include "esp_camera.h"
#include <PubSubClient.h>
#include <WiFi.h>

// ================= WIFI =================
const char *ssid = "x8promax";
const char *password = "tiara0925";

// ================= MQTT =================
const char *mqttHost = "broker.emqx.io";
const int mqttPort = 1883;
const char *deviceId = "esp32-cam-2";
const char *topicPrefix = "wildguard";

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String topicFrame;
String topicStatus;
String topicCommand;
String topicResult;
String topicLog;

// ================= PIR =================
#define PIR_PIN 13
bool lastPirState = LOW;
bool motionDetectionEnabled = true;

// ================= CAMERA =================
#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

// ================= RUNTIME =================
unsigned long lastStatusPublish = 0;
unsigned long lastReconnectAttempt = 0;

// ================= SERIAL LOG =================
const bool SERIAL_HEARTBEAT_LOG = true;

void logLine(const String &level, const String &eventName, const String &msg) {
  Serial.print("[");
  Serial.print(millis());
  Serial.print("][");
  Serial.print(level);
  Serial.print("][");
  Serial.print(eventName);
  Serial.print("] ");
  Serial.println(msg);
}

void logInfo(const String &eventName, const String &msg) { logLine("INFO", eventName, msg); }
void logWarn(const String &eventName, const String &msg) { logLine("WARN", eventName, msg); }
void logError(const String &eventName, const String &msg) { logLine("ERROR", eventName, msg); }
void debug(const String &msg) { logInfo("debug", msg); }

String escapeJson(const String &raw) {
  String out = raw;
  out.replace("\\", "\\\\");
  out.replace("\"", "\\\"");
  out.replace("\n", " ");
  out.replace("\r", " ");
  return out;
}

void publishLog(const String &level, const String &eventName, const String &message) {
  if (!mqtt.connected()) {
    debug("[LOG SKIP MQTT OFF] " + eventName + " | " + message);
    return;
  }

  String payload = "{";
  payload += "\"device_id\":\"" + String(deviceId) + "\",";
  payload += "\"level\":\"" + escapeJson(level) + "\",";
  payload += "\"event\":\"" + escapeJson(eventName) + "\",";
  payload += "\"message\":\"" + escapeJson(message) + "\",";
  payload += "\"heap\":" + String(ESP.getFreeHeap()) + ",";
  payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  payload += "\"ts_ms\":" + String(millis());
  payload += "}";

  mqtt.publish(topicLog.c_str(), payload.c_str(), false);
}

String extractJsonString(const String &json, const String &key) {
  String marker = "\"" + key + "\":\"";
  int start = json.indexOf(marker);
  if (start < 0) return "";
  start += marker.length();
  int end = json.indexOf("\"", start);
  if (end < 0) return "";
  return json.substring(start, end);
}

String extractJsonNumber(const String &json, const String &key) {
  String marker = "\"" + key + "\":";
  int start = json.indexOf(marker);
  if (start < 0) return "";
  start += marker.length();
  int end = start;
  while (end < (int)json.length()) {
    char c = json[end];
    bool valid = (c >= '0' && c <= '9') || c == '.' || c == '-';
    if (!valid) break;
    end++;
  }
  if (end <= start) return "";
  return json.substring(start, end);
}

bool connectWiFi() {
  logInfo("wifi_connect_start", "Connecting to SSID: " + String(ssid));
  WiFi.begin(ssid, password);

  int retry = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    retry++;
    if (retry % 5 == 0) {
      logWarn("wifi_retry", "Retry=" + String(retry) + ", status=" + String((int)WiFi.status()));
    }
    if (retry > 40) {
      Serial.println();
      logError("wifi_connect_failed", "Failed connect after " + String(retry) + " retries");
      return false;
    }
  }

  Serial.println();
  logInfo("wifi_connected", "WiFi connected successfully");
  logInfo("wifi_ip", WiFi.localIP().toString());
  logInfo("wifi_rssi", String(WiFi.RSSI()) + " dBm");
  return true;
}

bool initCamera() {
  logInfo("camera_init_start", "Initializing camera...");

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;

  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;

  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;

  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;

  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;

  config.xclk_freq_hz = 12000000;
  config.pixel_format = PIXFORMAT_JPEG;
  // Untuk MQTT PubSubClient, payload JPEG harus kecil agar tidak gagal publish.
  // QQVGA + quality lebih tinggi (angka lebih besar = kompresi lebih tinggi) membuat ukuran lebih aman.
  config.frame_size = FRAMESIZE_QQVGA;
  config.jpeg_quality = 15;
  config.fb_count = 1;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    logError("camera_init_failed", "esp_camera_init error code: 0x" + String((unsigned int)err, HEX));
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (!s) {
    logError("camera_sensor_failed", "esp_camera_sensor_get returned null");
    return false;
  }

  s->set_framesize(s, FRAMESIZE_QQVGA);
  s->set_brightness(s, 0);
  s->set_contrast(s, 0);
  s->set_saturation(s, 0);
  s->set_special_effect(s, 0);
  s->set_whitebal(s, 1);
  s->set_awb_gain(s, 1);
  s->set_wb_mode(s, 0);
  s->set_exposure_ctrl(s, 1);
  s->set_gain_ctrl(s, 1);
  s->set_gainceiling(s, GAINCEILING_2X);
  s->set_hmirror(s, 0);
  s->set_vflip(s, 0);

  logInfo("camera_ready", "Camera initialized and sensor configured");
  return true;
}

void publishStatus(const String &state, const String &detail) {
  if (!mqtt.connected())
    return;

  String payload = "{";
  payload += "\"device_id\":\"" + String(deviceId) + "\",";
  payload += "\"state\":\"" + state + "\",";
  payload += "\"detail\":\"" + detail + "\",";
  payload += "\"motion_enabled\":" +
             String(motionDetectionEnabled ? "true" : "false") + ",";
  payload += "\"heap\":" + String(ESP.getFreeHeap()) + ",";
  payload += "\"rssi\":" + String(WiFi.RSSI());
  payload += "}";

  mqtt.publish(topicStatus.c_str(), payload.c_str(), false);
  if (SERIAL_HEARTBEAT_LOG || detail != "heartbeat") {
    logInfo("status_publish", "state=" + state + ", detail=" + detail);
  }
  publishLog("info", "device_status", state + " | " + detail);
}

void captureAndPublish(const String &reason) {
  if (!mqtt.connected()) {
    logWarn("capture_skip", "Skip capture because MQTT disconnected");
    return;
  }

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    logError("capture_failed", "esp_camera_fb_get returned null");
    publishStatus("error", "capture_failed");
    publishLog("error", "capture_failed", "esp_camera_fb_get returned null");
    return;
  }

  size_t frameSize = fb->len;
  // Buffer MQTT diset 4096, payload efektif harus di bawah itu.
  // Jika terlalu besar, jangan paksa publish agar tidak fail berulang.
  if (frameSize > 3800) {
    logWarn("frame_too_large", "bytes=" + String(frameSize) + ", skip publish");
    esp_camera_fb_return(fb);
    publishStatus("error", "frame_too_large");
    publishLog("warn", "frame_too_large", "JPEG over MQTT limit: " + String(frameSize));
    return;
  }

  bool ok = mqtt.publish(topicFrame.c_str(), fb->buf, fb->len, false);
  esp_camera_fb_return(fb);

  if (ok) {
    logInfo("frame_publish_ok", "reason=" + reason + ", bytes=" + String(frameSize) + ", topic=" + topicFrame);
    publishStatus("frame_sent", reason);
    publishLog("info", "frame_sent", "Frame JPEG published. reason=" + reason + ", bytes=" + String(frameSize));
  } else {
    logError("frame_publish_failed", "Failed publish JPEG to topic: " + topicFrame);
    publishStatus("error", "frame_publish_failed");
    publishLog("error", "frame_publish_failed", "Failed publish JPEG to frame topic");
  }
}

void onMqttMessage(char *topic, byte *payload, unsigned int length) {
  String inTopic = String(topic);
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  msg.trim();

  if (inTopic == topicResult) {
    String label = extractJsonString(msg, "primary_label");
    String conf = extractJsonNumber(msg, "max_confidence");
    String count = extractJsonNumber(msg, "count");
    if (label.length() == 0) label = "none";
    if (conf.length() == 0) conf = "0";
    if (count.length() == 0) count = "0";

    String summary = "YOLO detected label=" + label + ", confidence=" + conf + ", count=" + count;
    logInfo("yolo_result", summary);
    publishLog("info", "yolo_result", summary);
    return;
  }

  if (inTopic != topicCommand) {
    logWarn("mqtt_unexpected_topic", "topic=" + inTopic + ", bytes=" + String(length));
    publishLog("warn", "unknown_topic", "Received payload on unexpected topic: " + inTopic);
    return;
  }

  logInfo("mqtt_command", "cmd=" + msg);
  publishLog("info", "command_received", msg);

  if (msg == "capture") {
    captureAndPublish("manual_command");
  } else if (msg == "status") {
    publishStatus("online", "status_request");
  } else if (msg == "start") {
    motionDetectionEnabled = true;
    publishStatus("online", "motion_started");
  } else if (msg == "stop") {
    motionDetectionEnabled = false;
    publishStatus("online", "motion_stopped");
  } else if (msg == "flash_on") {
    digitalWrite(4, HIGH);
    publishStatus("online", "flash_on");
  } else if (msg == "flash_off") {
    digitalWrite(4, LOW);
    publishStatus("online", "flash_off");
  } else {
    publishStatus("online", "unknown_command");
    publishLog("warn", "command_unknown", msg);
  }
}

bool connectMqtt() {
  mqtt.setServer(mqttHost, mqttPort);
  mqtt.setBufferSize(4096);
  mqtt.setCallback(onMqttMessage);

  String clientId = "esp32-cam-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  logInfo("mqtt_connect_start", "broker=" + String(mqttHost) + ":" + String(mqttPort) + ", clientId=" + clientId);
  if (!mqtt.connect(clientId.c_str())) {
    logError("mqtt_connect_failed", "state=" + String(mqtt.state()));
    return false;
  }

  mqtt.subscribe(topicCommand.c_str());
  mqtt.subscribe(topicResult.c_str());
  logInfo("mqtt_connected", "Subscribed: " + topicCommand + " and " + topicResult);
  publishLog("info", "mqtt_connected", "Connected and subscribed cmd+result topics");
  publishStatus("online", "boot");
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  logInfo("boot", "===== START MQTT MODE =====");

  topicFrame = String(topicPrefix) + "/" + String(deviceId) + "/frame/jpeg";
  topicStatus = String(topicPrefix) + "/" + String(deviceId) + "/status";
  topicCommand = String(topicPrefix) + "/" + String(deviceId) + "/cmd";
  topicResult = String(topicPrefix) + "/" + String(deviceId) + "/result";
  topicLog = String(topicPrefix) + "/" + String(deviceId) + "/log";
  logInfo("topic_frame", topicFrame);
  logInfo("topic_status", topicStatus);
  logInfo("topic_command", topicCommand);
  logInfo("topic_result", topicResult);
  logInfo("topic_log", topicLog);

  pinMode(PIR_PIN, INPUT);
  pinMode(4, OUTPUT);
  // Matikan flash default untuk hemat arus dan menghindari reset karena drop tegangan.
  digitalWrite(4, LOW);

  if (!connectWiFi())
    return;
  if (!initCamera())
    return;

  logInfo("pir_calibration", "Kalibrasi PIR 5 detik...");
  delay(5000);
  logInfo("pir_ready", "PIR siap");

  publishLog("info", "boot_sequence", "WiFi+Camera ready, starting MQTT");
  connectMqtt();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    logWarn("wifi_lost", "WiFi disconnected, reconnecting...");
    connectWiFi();
  }

  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 3000) {
      lastReconnectAttempt = now;
      logWarn("mqtt_reconnect", "MQTT disconnected, trying reconnect...");
      connectMqtt();
    }
  } else {
    mqtt.loop();

    bool motion = digitalRead(PIR_PIN);
    if (motionDetectionEnabled && motion == HIGH && lastPirState == LOW) {
      logWarn("pir_motion", "Motion detected (LOW->HIGH)");
      publishLog("warn", "motion_detected", "PIR changed LOW->HIGH");
      captureAndPublish("motion_detected");
    }
    lastPirState = motion;

    if (millis() - lastStatusPublish > 1000) {
      publishStatus("online", "heartbeat");
      lastStatusPublish = millis();
    }
  }

  delay(50);
}
