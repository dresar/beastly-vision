-- ============================================================
-- WildGuard ML System — Database Schema Migration
-- Run this on your Neon PostgreSQL database
-- ============================================================

-- Training jobs table
CREATE TABLE IF NOT EXISTS training_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       TEXT UNIQUE NOT NULL,           -- Python service job ID
  dataset_name TEXT NOT NULL,
  model_variant TEXT NOT NULL DEFAULT 'yolov8n.pt',
  epochs       INTEGER NOT NULL DEFAULT 10,
  batch_size   INTEGER NOT NULL DEFAULT 16,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed, cancelled
  progress     INTEGER DEFAULT 0,
  current_epoch INTEGER DEFAULT 0,
  metrics      JSONB DEFAULT '{}',
  model_path   TEXT,                            -- Path to saved model
  error_msg    TEXT,
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Datasets table (metadata)
CREATE TABLE IF NOT EXISTS datasets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT UNIQUE NOT NULL,
  description   TEXT DEFAULT '',
  class_names   TEXT[] DEFAULT ARRAY[]::TEXT[],
  image_count   INTEGER DEFAULT 0,
  label_count   INTEGER DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'ready',  -- ready, training, error
  python_path   TEXT,                            -- Path on Python service
  created_by    UUID REFERENCES profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Extend models table if needed
ALTER TABLE models ADD COLUMN IF NOT EXISTS model_variant TEXT DEFAULT 'yolov8n.pt';
ALTER TABLE models ADD COLUMN IF NOT EXISTS dataset_name TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS mAP50 NUMERIC(6,4);
ALTER TABLE models ADD COLUMN IF NOT EXISTS mAP50_95 NUMERIC(6,4);
ALTER TABLE models ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;
ALTER TABLE models ADD COLUMN IF NOT EXISTS model_path TEXT;
ALTER TABLE models ADD COLUMN IF NOT EXISTS class_names TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Ensure only one active model at a time
CREATE UNIQUE INDEX IF NOT EXISTS models_active_idx ON models(is_active) WHERE is_active = TRUE;

-- Extend detections to include more ML metadata
ALTER TABLE detections ADD COLUMN IF NOT EXISTS detected_objects JSONB DEFAULT '[]';
ALTER TABLE detections ADD COLUMN IF NOT EXISTS max_confidence NUMERIC(5,4);
ALTER TABLE detections ADD COLUMN IF NOT EXISTS primary_label TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS model_name TEXT;
ALTER TABLE detections ADD COLUMN IF NOT EXISTS inference_ms INTEGER;

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS training_jobs_status_idx ON training_jobs(status);
CREATE INDEX IF NOT EXISTS training_jobs_created_at_idx ON training_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS datasets_name_idx ON datasets(name);
CREATE INDEX IF NOT EXISTS detections_detected_at_idx ON detections(detected_at DESC);
