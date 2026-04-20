# WildGuard — Smart Wildlife Intrusion Monitoring

Sistem monitoring real-time untuk deteksi intrusi satwa liar berbasis ESP32-CAM, MQTT, dan YOLOv8.

## Arsitektur

```
┌──────────────┐   MQTT    ┌───────────────┐  HTTP   ┌──────────────────┐  Realtime  ┌────────────┐
│  ESP32-CAM   │──────────▶│ YOLOv8 Worker │────────▶│ Lovable Cloud    │───────────▶│  Dashboard │
│  ESP32-CAM   │──────────▶│ YOLOv8 Worker │────────▶│ TanStack Server  │───────────▶│  Dashboard │
│  (firmware)  │  publish  │ (Python)      │  POST   │ /_server?_serverF│   polling  │  (Web UI)  │
│              │           │ Subscribe MQTT│ /ingest │ nId=ingestFn     │            │            │
└──────────────┘           └───────────────┘         └──────────────────┘            └────────────┘
```

1. **ESP32-CAM** menangkap gambar (trigger PIR atau periodik), publish ke topik MQTT `wildguard/<device_id>/frame`.
2. **YOLOv8 Worker** subscribe topik tersebut, jalankan inference, upload snapshot ke storage publik, lalu POST hasil deteksi ke `/_server?_serverFnId=ingestFn`.
3. **Neon Database** menyimpan data ke Postgres.
4. **Dashboard** menampilkan live stream, riwayat, analitik, dan notifikasi.

### 🌐 Backend & Database
- **Neon Database**: PostgreSQL serverless untuk penyimpanan data persisten.
- **TanStack Start Server Functions**: Logika backend stateless yang berjalan di Vercel Edge/Serverless.
- **Custom JWT Auth**: Sistem autentikasi mandiri berbasis JSON Web Token dan HTTP-only cookies.
- **REST Ingest**: Endpoint `/_server?_serverFnId=ingestFn` untuk menerima deteksi dari worker Python/IoT.

### 🚀 Deployment
Web app ini dioptimalkan untuk **Vercel**. Pastikan variabel lingkungan berikut diset:
- `DATABASE_URL`: Connection string dari Neon (pooler recommended).
- `JWT_SECRET`: String acak panjang untuk menandatangani token.

### 🛠️ Ingest Endpoint
`POST /_server?_serverFnId=ingestFn` (auth via `device_api_key`)

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
