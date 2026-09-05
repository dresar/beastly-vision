/**
 * Python AI Service Client
 * ─────────────────────────────────────────────────────────────
 * All communication with the Python FastAPI service lives here.
 * Default URL: http://localhost:8000 (configurable via PYTHON_AI_URL env var)
 */

const PYTHON_AI_URL =
  process.env.PYTHON_AI_URL ||
  process.env.VITE_PYTHON_AI_URL ||
  "http://localhost:8000";

export class PythonAIClient {
  private baseUrl: string;

  constructor(url?: string) {
    this.baseUrl = url || PYTHON_AI_URL;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI Service error ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  async getStatus() {
    return this.request<{
      status: string;
      version: string;
      model: { loaded: boolean; model_name: string; num_classes: number; class_names: string[] };
    }>("/status/");
  }

  async healthCheck() {
    return this.request<{ status: string }>("/status/health");
  }

  // ─── Detection ─────────────────────────────────────────────────────────────

  async predictBase64(imageBase64: string, confidence = 0.25) {
    return this.request<{
      success: boolean;
      image_url: string;
      detections: Array<{
        label: string;
        confidence: number;
        bbox: [number, number, number, number];
        bbox_px: [number, number, number, number];
      }>;
      count: number;
      primary_label: string | null;
      max_confidence: number;
      model: string;
      inference_ms: number;
    }>("/predict/base64", {
      method: "POST",
      body: JSON.stringify({ image: imageBase64, confidence }),
    });
  }

  async predictUrl(imageUrl: string, confidence = 0.25) {
    return this.request<{
      success: boolean;
      detections: Array<any>;
      primary_label: string | null;
      max_confidence: number;
      inference_ms: number;
    }>("/predict/url", {
      method: "POST",
      body: JSON.stringify({ url: imageUrl, confidence }),
    });
  }

  // ─── Models ────────────────────────────────────────────────────────────────

  async listModels() {
    return this.request<{
      models: Array<{
        name: string;
        path: string;
        type: "pretrained" | "custom";
        size_mb: number | null;
        is_active: boolean;
      }>;
      active: string;
    }>("/models/");
  }

  async switchModel(modelPath: string) {
    return this.request<{ success: boolean; message: string; model_info: any }>(
      "/models/switch",
      { method: "POST", body: JSON.stringify({ model_path: modelPath }) }
    );
  }

  // ─── Training ──────────────────────────────────────────────────────────────

  async startTraining(params: {
    dataset_name: string;
    model_variant?: string;
    epochs?: number;
    batch_size?: number;
    imgsz?: number;
    learning_rate?: number;
    job_id?: string;
  }) {
    return this.request<{ success: boolean; job_id: string }>("/train/start", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getTrainingJob(jobId: string) {
    return this.request<{
      job_id: string;
      status: string;
      progress: number;
      current_epoch: number;
      total_epochs: number;
      metrics: Record<string, number>;
      log_lines: string[];
      error: string | null;
      model_path: string | null;
    }>(`/train/${jobId}`);
  }

  async listTrainingJobs() {
    return this.request<{ jobs: any[] }>("/train/jobs");
  }

  async cancelTraining(jobId: string) {
    return this.request<{ success: boolean }>(`/train/${jobId}/cancel`, {
      method: "POST",
    });
  }

  // ─── Datasets ──────────────────────────────────────────────────────────────

  async listDatasets() {
    return this.request<{
      datasets: Array<{
        name: string;
        total_images: number;
        total_labels: number;
        class_names: string[];
        description: string;
        has_yaml: boolean;
      }>;
    }>("/datasets/");
  }

  async createDataset(name: string, classNames: string[], description?: string) {
    return this.request<{ success: boolean; name: string }>(
      "/datasets/create",
      {
        method: "POST",
        body: JSON.stringify({ name, class_names: classNames, description }),
      }
    );
  }
}

// Default singleton client
export const aiClient = new PythonAIClient();
