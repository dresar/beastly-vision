"""
yolo_worker.py — Bridge MQTT ↔ YOLOv8 ↔ Lovable Cloud ingest endpoint

Subscribe ke topik MQTT yang berisi frame JPEG (atau base64) dari ESP32-CAM,
jalankan deteksi YOLOv8, upload snapshot ke storage publik, lalu POST ke
endpoint ingest.

Dependencies:
    pip install ultralytics paho-mqtt requests pillow

Konfigurasi via environment variable:
    MQTT_HOST, MQTT_PORT, MQTT_TOPIC (default: wildguard/+/frame)
    INGEST_URL (https://<project>.supabase.co/functions/v1/ingest)
    DEVICE_API_KEY  (per worker; atau parse dari topik)
    SNAPSHOT_BUCKET_URL (URL prefix untuk upload, mis. S3 / Supabase storage)
"""

import base64
import io
import json
import os
import time
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import requests
from PIL import Image
from ultralytics import YOLO

INGEST_URL = os.environ["INGEST_URL"]
DEVICE_API_KEY = os.environ["DEVICE_API_KEY"]
MQTT_HOST = os.environ.get("MQTT_HOST", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MQTT_TOPIC = os.environ.get("MQTT_TOPIC", "wildguard/+/frame")

model = YOLO("yolov8n.pt")  # ganti dengan model custom jika perlu


def detect(image_bytes: bytes):
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
            "bbox": [
                round(x1 / w, 4),
                round(y1 / h, 4),
                round((x2 - x1) / w, 4),
                round((y2 - y1) / h, 4),
            ],
        })
    return objects


def upload_snapshot(image_bytes: bytes) -> str:
    """
    Implementasikan sesuai storage Anda. Contoh sederhana: simpan lokal &
    serve via reverse proxy / CDN. Idealnya gunakan Supabase Storage / S3.
    """
    filename = f"snap_{int(time.time()*1000)}.jpg"
    path = f"/var/www/snapshots/{filename}"
    with open(path, "wb") as f:
        f.write(image_bytes)
    return f"https://your-cdn.example.com/snapshots/{filename}"


def post_ingest(image_url: str, objects: list):
    payload = {
        "device_api_key": DEVICE_API_KEY,
        "image_url": image_url,
        "detected_objects": objects,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    r = requests.post(INGEST_URL, json=payload, timeout=10)
    print("→ ingest", r.status_code, r.text[:200])


def on_message(_client, _userdata, msg):
    try:
        # Payload bisa raw JPEG bytes ATAU JSON {"image_b64": "..."}
        if msg.payload[:2] == b"\xff\xd8":  # JPEG magic
            image_bytes = msg.payload
        else:
            data = json.loads(msg.payload.decode())
            image_bytes = base64.b64decode(data["image_b64"])

        objects = detect(image_bytes)
        if not objects:
            return  # skip frame tanpa deteksi

        url = upload_snapshot(image_bytes)
        post_ingest(url, objects)
    except Exception as e:
        print("error:", e)


def main():
    client = mqtt.Client()
    client.on_message = on_message
    client.connect(MQTT_HOST, MQTT_PORT, 60)
    client.subscribe(MQTT_TOPIC)
    print(f"Subscribed to {MQTT_TOPIC} on {MQTT_HOST}:{MQTT_PORT}")
    client.loop_forever()


if __name__ == "__main__":
    main()
