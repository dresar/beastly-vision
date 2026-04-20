import base64
import io
import json
import os
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import requests
from PIL import Image

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except ImportError:
    HAS_YOLO = False

INGEST_URL = os.environ.get("INGEST_URL", "http://localhost:8080/_server?_serverFnId=ingestFn")
DEVICE_API_KEY = os.environ.get("DEVICE_API_KEY", "7d4f...mock")
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC = os.environ.get("MQTT_TOPIC", "wildguard/+/frame")

if HAS_YOLO:
    model = YOLO("yolov8n.pt")
else:
    print("WARNING: ultralytics not found. Running in MOCK INFERENCE mode.")

def detect(image_bytes: bytes):
    if not HAS_YOLO:
        # Mock detection
        return [{"label": "monkey", "confidence": 0.88, "bbox": [0.1, 0.2, 0.3, 0.4]}]
    
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    w, h = img.size
    results = model(img, verbose=False)[0]
    objects = []
    for box in results.boxes:
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        label = model.names[cls_id]
        objects.append({
            "label": label,
            "confidence": round(conf, 3),
            "bbox": [round(x1/w, 4), round(y1/h, 4), round((x2-x1)/w, 4), round((y2-y1)/h, 4)],
        })
    return objects

def post_ingest(image_url: str, objects: list):
    payload = {
        "device_api_key": DEVICE_API_KEY,
        "image_url": image_url,
        "detected_objects": objects,
        "primary_label": objects[0]["label"] if objects else None,
        "threat_level": "high" if any(o["label"] in ["person", "wild_boar", "tiger"] for o in objects) else "low",
        "max_confidence": max((o["confidence"] for o in objects), default=0),
    }
    try:
        r = requests.post(INGEST_URL, json=payload, timeout=5)
        print(f"→ Ingest: {r.status_code}")
    except Exception as e:
        print(f"Error posting ingest: {e}")

def on_message(_client, _userdata, msg):
    print(f"Received message on {msg.topic}")
    # Simplified for demo: we treat everything as JPEG bytes for now
    objects = detect(msg.payload)
    if objects:
        post_ingest("https://images.unsplash.com/photo-1540573133985-87b6da6d54a9", objects)

def main():
    client = mqtt.Client()
    client.on_message = on_message
    try:
        client.connect(MQTT_HOST, MQTT_PORT, 60)
        client.subscribe(MQTT_TOPIC)
        print(f"YOLO Worker Started. Subscribed to {MQTT_TOPIC}")
        client.loop_forever()
    except Exception as e:
        print(f"Connection Error: {e}")

if __name__ == "__main__":
    main()
