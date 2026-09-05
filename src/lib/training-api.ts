/**
 * Training API — Server functions for ML training management.
 * These run on the Node.js (TanStack Start) side and proxy to the Python service.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "./auth-middleware";

const AI_URL =
  process.env.PYTHON_AI_URL ||
  process.env.VITE_PYTHON_AI_URL ||
  "http://localhost:8000";

// ─── Helper ─────────────────────────────────────────────────────────────────

async function callAI<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${AI_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI Service ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── AI Status ──────────────────────────────────────────────────────────────

export const getAIStatusFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    try {
      return await callAI("/status/");
    } catch {
      return { status: "offline", error: "Python AI service not reachable" };
    }
  });

// ─── Models ─────────────────────────────────────────────────────────────────

export const listAIModelsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    return callAI("/models/");
  });

export const switchAIModelFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ model_path: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    return callAI("/models/switch", {
      method: "POST",
      body: JSON.stringify({ model_path: data.model_path }),
    });
  });

// ─── Training ────────────────────────────────────────────────────────────────

const StartTrainingSchema = z.object({
  dataset_name: z.string().min(1),
  model_variant: z.string().default("yolov8n.pt"),
  epochs: z.number().int().min(1).max(300).default(10),
  batch_size: z.number().int().min(1).max(128).default(16),
  imgsz: z.number().int().default(640),
  learning_rate: z.number().default(0.01),
});

export const startTrainingFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => StartTrainingSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { default: sql } = await import("./db.server");

    // Start training on Python service
    const result = await callAI<{ success: boolean; job_id: string }>(
      "/train/start",
      { method: "POST", body: JSON.stringify(data) }
    );

    // Record in DB
    await sql`
      INSERT INTO training_jobs (job_id, dataset_name, model_variant, epochs, batch_size, status, created_by)
      VALUES (
        ${result.job_id},
        ${data.dataset_name},
        ${data.model_variant},
        ${data.epochs},
        ${data.batch_size},
        'running',
        ${context.userId}
      )
      ON CONFLICT (job_id) DO NOTHING
    `;

    return result;
  });

export const getTrainingStatusFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ job_id: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    const jobState = await callAI(`/train/${data.job_id}`);

    // Sync status to DB
    const { default: sql } = await import("./db.server");
    await sql`
      UPDATE training_jobs
      SET 
        status = ${(jobState as any).status},
        progress = ${(jobState as any).progress},
        current_epoch = ${(jobState as any).current_epoch},
        metrics = ${JSON.stringify((jobState as any).metrics)}::jsonb,
        model_path = ${(jobState as any).model_path ?? null},
        error_msg = ${(jobState as any).error ?? null},
        started_at = ${(jobState as any).started_at ?? null},
        finished_at = ${(jobState as any).finished_at ?? null}
      WHERE job_id = ${data.job_id}
    `;

    return jobState;
  });

export const listTrainingJobsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    const { default: sql } = await import("./db.server");
    return sql`
      SELECT * FROM training_jobs ORDER BY created_at DESC LIMIT 50
    `;
  });

export const cancelTrainingFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ job_id: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    const result = await callAI(`/train/${data.job_id}/cancel`, {
      method: "POST",
    });
    const { default: sql } = await import("./db.server");
    await sql`UPDATE training_jobs SET status = 'cancelled' WHERE job_id = ${data.job_id}`;
    return result;
  });

// ─── Datasets ────────────────────────────────────────────────────────────────

export const listAIDatasetsFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async () => {
    return callAI("/datasets/");
  });

const CreateDatasetSchema = z.object({
  name: z.string().min(1),
  class_names: z.array(z.string()).min(1),
  description: z.string().optional(),
});

export const createAIDatasetFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => CreateDatasetSchema.parse(data))
  .handler(async ({ data }) => {
    return callAI("/datasets/create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  });

export const getAIDatasetFn = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.string() }).parse(data)
  )
  .handler(async ({ data }) => {
    return callAI(`/datasets/${data.name}`);
  });

export const deleteAIDatasetFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    return callAI(`/datasets/${encodeURIComponent(data.name)}`, {
      method: "DELETE",
    });
  });

// ─── Local YOLO Inference ────────────────────────────────────────────────────

const LocalDetectSchema = z.object({
  image: z.string().min(1),  // base64
  confidence: z.number().default(0.25),
});

export const localDetectFn = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((data: unknown) => LocalDetectSchema.parse(data))
  .handler(async ({ data }) => {
    return callAI("/predict/base64", {
      method: "POST",
      body: JSON.stringify({ image: data.image, confidence: data.confidence }),
    });
  });
