# WildGuard — Smart Wildlife Intrusion Monitoring

Sistem monitoring real-time untuk deteksi intrusi satwa liar berbasis ESP32-CAM, MQTT, dan YOLOv8.

## Arsitektur

```
┌──────────────┐   MQTT    ┌───────────────┐  HTTP   ┌──────────────────┐  Realtime  ┌────────────┐
│  ESP32-CAM   │──────────▶│ YOLOv8 Worker │────────▶│ Lovable Cloud    │───────────▶│  Dashboard │
│  (firmware)  │  publish  │ (Python)      │  POST   │ /functions/      │   subscribe│  (Web UI)  │
│              │           │ Subscribe MQTT│ /ingest │   v1/ingest      │            │            │
└──────────────┘           └───────────────┘         └──────────────────┘            └────────────┘
```

1. **ESP32-CAM** menangkap gambar (trigger PIR atau periodik), publish ke topik MQTT `wildguard/<device_id>/frame`.
2. **YOLOv8 Worker** subscribe topik tersebut, jalankan inference, upload snapshot ke storage publik, lalu POST hasil deteksi ke `/functions/v1/ingest`.
3. **Lovable Cloud** menyimpan ke Postgres + memicu realtime subscription.
4. **Dashboard** menampilkan live stream, riwayat, analitik, dan notifikasi.

## Endpoint Ingest

`POST <SUPABASE_URL>/functions/v1/ingest` (publik — auth via `device_api_key`)

```json
{
  "device_api_key": "abc123...",
  "image_url": "https://cdn.example.com/snap.jpg",
  "detected_objects": [
    { "label": "monkey", "confidence": 0.92, "bbox": [0.12, 0.30, 0.40, 0.55] }
  ],
  "timestamp": "2025-01-01T12:00:00Z"
}
```

`bbox` dalam koordinat ternormalisasi `[x, y, w, h]` (0..1).

Sistem otomatis mengklasifikasikan `threat_level`:
- **high** — person, wild_boar, tiger, elephant
- **medium** — monkey, deer, wild_dog
- **low** — selainnya

Jika **high**, baris notifikasi dibuat otomatis dan disiarkan ke semua dashboard via Supabase Realtime.

## Cara Pakai (Singkat)

1. Login dashboard → menu **Manajemen Perangkat** → **Tambah Perangkat**.
2. Salin **API key** perangkat.
3. Konfigurasikan worker MQTT/YOLO dengan API key + URL ingest.
4. Saat worker mengirim deteksi, buka menu **Live Monitoring** untuk melihat overlay realtime.

Lihat folder `docs/` untuk:
- `esp32_cam_publisher.ino` — firmware contoh ESP32-CAM
- `yolo_worker.py` — bridge MQTT ↔ YOLOv8 ↔ ingest

## Stack

- **Frontend**: TanStack Start (React 19) + TailwindCSS v4
- **Backend**: Lovable Cloud (Postgres + Auth + Realtime + Edge Functions)
- **IoT**: MQTT (Mosquitto/EMQX) + ESP32-CAM
- **ML**: YOLOv8 (Ultralytics) di Python worker terpisah
