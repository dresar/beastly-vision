# ML Operations Sederhana (YOLO) - WildGuard

Dokumen ini menjelaskan cara paling simpel untuk menjalankan Machine Learning di project ini.

## 1) Model yang dipakai

- Project ini dikunci ke **1 model cepat**: `yolov8n.pt`
- Tidak perlu ganti model lain
- Endpoint model tetap ada untuk kompatibilitas, tapi hanya menerima `yolov8n.pt`

## 2) "Database" dataset ada di mana?

Di project ini, dataset training tidak disimpan di database SQL.
Dataset disimpan sebagai **folder/file** di disk:

- Root dataset: `python/datasets`
- Struktur per dataset:
  - `python/datasets/{nama_dataset}/train/images`
  - `python/datasets/{nama_dataset}/train/labels`
  - `python/datasets/{nama_dataset}/val/images`
  - `python/datasets/{nama_dataset}/val/labels`
  - `python/datasets/{nama_dataset}/test/images`
  - `python/datasets/{nama_dataset}/test/labels`
  - `python/datasets/{nama_dataset}/dataset.yaml`

Anda juga bisa cek via API:

- `GET /datasets/storage-info`

## 3) Format label YOLO

Setiap gambar punya file label `.txt` dengan nama sama.

Contoh:

- Gambar: `lion_001.jpg`
- Label: `lion_001.txt`

Isi label (1 baris 1 objek):

`class_id center_x center_y width height`

Semua nilai bbox memakai format normalisasi `0..1`.

## 4) Cara pakai paling cepat

1. Jalankan backend FastAPI (folder `python`)
2. Buat dataset
   - `POST /datasets/create`
3. Upload gambar + label
   - `POST /datasets/upload`
4. Mulai training
   - `POST /train/start`
   - Model otomatis `yolov8n.pt`
5. Lihat progress
   - `GET /train/jobs`
   - `GET /train/{job_id}`

## 5) Contoh payload API

### Buat dataset

`POST /datasets/create`

```json
{
  "name": "satwa_sederhana_v1",
  "class_names": ["musang", "babi_hutan", "kucing", "manusia"],
  "description": "Dataset awal untuk monitoring satwa dan manusia"
}
```

### Start training

`POST /train/start`

```json
{
  "dataset_name": "satwa_sederhana_v1",
  "epochs": 10,
  "batch_size": 8,
  "imgsz": 640,
  "learning_rate": 0.01
}
```

## 6) Lokasi hasil training

Hasil training disimpan di:

- `python/runs/job_xxxxxxxx/`
- Model terbaik dicopy ke:
  - `python/models/custom_{dataset}_{job}.pt`

Catatan: walau model custom tetap disimpan sebagai artefak training, mode operasi inference di project ini tetap fokus ke `yolov8n.pt` agar simpel dan cepat.
