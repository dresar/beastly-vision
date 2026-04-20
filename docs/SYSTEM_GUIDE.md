# WildGuard System Documentation 🛡️

WildGuard adalah sistem monitoring satwa liar berbasis IoT yang mengintegrasikan Computer Vision (YOLOv8) dengan infrastruktur cloud modern untuk deteksi ancaman real-time.

---

## 1. Arsitektur Sistem (High-Level)

Sistem ini terdiri dari empat lapisan utama: Perangkat Lapangan (IoT), Pemrosesan AI (Worker), Backend API, dan Frontend Dashboard.

```mermaid
graph TD
    subgraph "Perangkat Lapangan"
        ESP["ESP32-CAM (IoT)"]
        Sens["PIR/Motion Sensor"]
    end

    subgraph "Infrastruktur Cloud (Backend)"
        API["WildGuard API (TanStack Start)"]
        Ingest["Standalone Ingest Server (Node)"]
        DB[(Neon PostgreSQL)]
        IK["ImageKit Cloud (CDN/Storage)"]
    end

    subgraph "AI Processing Buffer"
        MQTT["MQTT Broker (Mosquitto/EMQX)"]
        Worker["YOLOv8 Worker (Python)"]
    end

    subgraph "Client App"
        Dash["Web Dashboard (React/Vite)"]
        Upload["Manual Image Upload"]
    end

    Sens -->|Trigger| ESP
    ESP -->|Publish Frame| MQTT
    MQTT -->|Subscribe| Worker
    Worker -->|Inference| API
    Worker -->|Inference| Ingest
    Upload -->|Base64| API
    API -->|Store| IK
    API --- DB
    Ingest --- DB
    DB --- Dash
```

---

## 2. Alur Ingesti Data (Sequence)

Bagaimana sebuah kejadian di hutan sampai ke aplikasi mobile Anda.

```mermaid
sequenceDiagram
    participant IoT as ESP32-CAM
    participant MQTT as MQTT Broker
    participant AI as YOLOv8 Worker
    participant API as Ingest Server
    participant DB as Neon DB
    participant WS as Web Dashboard

    IoT->>MQTT: Publish JPEG (Topic: wildguard/id/frame)
    MQTT->>AI: Push Frame to Subscriber
    AI->>AI: Perform YOLOv8 Inference
    AI->>API: HTTP POST (Detect Results + Image URL)
    API->>API: Validate API Key
    API->>DB: Save Detection & Trigger Notification
    DB-->>WS: Data Refreshed (Next Poll/Refetch)
    WS->>WS: Push Toast Alert (if Threat = High)
```

---

## 3. Skema Database (ERD)

Struktur data yang disimpan di Neon PostgreSQL.

```mermaid
erDiagram
    users {
        uuid id PK
        string email
        string password_hash
    }
    devices {
        uuid id PK
        string name
        string api_key
        string status
        timestamp last_seen
    }
    detections {
        uuid id PK
        uuid device_id FK
        string image_url
        string primary_label
        float max_confidence
        string threat_level
        jsonb detected_objects
        timestamp detected_at
    }
    notifications {
        uuid id PK
        uuid detection_id FK
        string title
        string message
        string severity
        boolean is_read
        timestamp created_at
    }
    datasets {
        uuid id PK
        string name
        string status
        int image_count
    }
    models {
        uuid id PK
        string version
        float accuracy
        string status
    }

    devices ||--o{ detections : "records"
    detections ||--o{ notifications : "triggers"
```

---

## 4. Siklus Pelatihan ML (State)

Bagaimana dataset diubah menjadi model yang siap pakai.

```mermaid
stateDiagram-v2
    [*] --> Collecting: Data Ingestion
    Collecting --> Labeling: Manual/Auto Tagging
    Labeling --> Ready: Dataset Sufficient
    Ready --> Training: User Trigger
    state Training {
        [*] --> Processing
        Processing --> Simulating: Mock Mode
        Processing --> RealYOLO: GPU Mode
        Simulating --> Finalizing
        RealYOLO --> Finalizing
    }
    Training --> Evaluated: Accuracy > 85%
    Evaluated --> Production: Model Updated
    Production --> [*]
```

---

## 5. Konfigurasi Endpoint

- **Frontend**: `http://localhost:8080/`
- **Ingest API (Standalone)**: `http://localhost:8090/ingest`
- **YOLO Worker**: Tergantung konfigurasi `MQTT_HOST`.

> [!NOTE]
> Dokumentasi ini diperbarui secara otomatis seiring dengan perubahan standar teknis WildGuard.
