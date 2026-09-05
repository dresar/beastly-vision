import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Brain, Play, Square, Upload, Plus, Loader2, CheckCircle, XCircle, Clock, Trash2 } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  startTrainingFn,
  getTrainingStatusFn,
  listTrainingJobsFn,
  cancelTrainingFn,
  listAIDatasetsFn,
  createAIDatasetFn,
  deleteAIDatasetFn,
  getAIStatusFn,
} from "@/lib/training-api";

export const Route = createFileRoute("/training")({
  component: () => (
    <DashboardLayout>
      <TrainingPage />
    </DashboardLayout>
  ),
});

const FIXED_MODEL_VARIANT = "yolov8n.pt";
const FIXED_BATCH_SIZE = 8;
const FIXED_IMGSZ = 640;
const PYTHON_AI_URL = (import.meta.env.VITE_PYTHON_AI_URL as string | undefined) || "http://localhost:8000";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TrainingJob {
  job_id: string;
  dataset_name: string;
  model_variant: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  current_epoch: number;
  epochs: number;
  metrics: Record<string, number>;
  error_msg?: string;
  created_at: string;
}

interface AIDataset {
  name: string;
  total_images: number;
  total_labels: number;
  class_names: string[];
  description: string;
  has_yaml: boolean;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
  if (status === "completed") return <CheckCircle className="h-4 w-4 text-green-400" />;
  if (status === "failed") return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === "cancelled") return <XCircle className="h-4 w-4 text-yellow-400" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function TrainingPage() {
  const [datasets, setDatasets] = useState<AIDataset[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [aiOnline, setAiOnline] = useState<boolean | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJobState, setActiveJobState] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const logsRef = useRef<HTMLDivElement>(null);

  // Create dataset state
  const [newDatasetName, setNewDatasetName] = useState("");
  const [newDatasetClasses, setNewDatasetClasses] = useState("musang, babi_hutan, kucing, manusia");
  const [creatingDataset, setCreatingDataset] = useState(false);

  // Training config state
  const [selectedDataset, setSelectedDataset] = useState("");
  const [epochs, setEpochs] = useState(10);
  const [startingTraining, setStartingTraining] = useState(false);

  // Upload state
  const [uploadDataset, setUploadDataset] = useState("");
  const [uploadSplit, setUploadSplit] = useState("train");
  const [uploadImages, setUploadImages] = useState<FileList | null>(null);
  const [uploadLabels, setUploadLabels] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadDone, setUploadDone] = useState(0);
  const [uploadCurrentName, setUploadCurrentName] = useState("");

  const loadData = async () => {
    const [statusRes, datasetRes, jobsRes] = await Promise.allSettled([
      getAIStatusFn(),
      listAIDatasetsFn(),
      listTrainingJobsFn(),
    ]);

    if (statusRes.status === "fulfilled") {
      setAiOnline((statusRes.value as any)?.status === "online");
    } else {
      setAiOnline(false);
    }

    if (datasetRes.status === "fulfilled") {
      setDatasets(((datasetRes.value as any)?.datasets || []) as AIDataset[]);
    }

    if (jobsRes.status === "fulfilled") {
      setJobs(jobsRes.value as TrainingJob[]);
    } else {
      setJobs([]);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Poll active job
  useEffect(() => {
    if (!activeJobId) return;
    const poll = async () => {
      try {
        const state = await getTrainingStatusFn({ data: { job_id: activeJobId } });
        setActiveJobState(state);
        setLogs((state as any).log_lines || []);
        if ((state as any).status === "completed" || (state as any).status === "failed") {
          setActiveJobId(null);
          loadData();
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [activeJobId]);

  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCreateDataset = async () => {
    const normalizedName = newDatasetName.trim();
    if (!normalizedName) return toast.error("Nama dataset diperlukan");
    const classes = newDatasetClasses.split(",").map((c) => c.trim()).filter(Boolean);
    if (!classes.length) return toast.error("Minimal 1 kelas diperlukan");
    setCreatingDataset(true);
    try {
      await createAIDatasetFn({ data: { name: normalizedName, class_names: classes } });
      toast.success(`Dataset "${normalizedName}" berhasil dibuat!`);
      setSelectedDataset(normalizedName);
      setUploadDataset(normalizedName);
      setNewDatasetName("");
      await loadData();
    } catch (e: any) {
      const raw = String(e?.message || "");
      const alreadyExists = raw.includes("already exists") || raw.includes("409");
      if (alreadyExists) {
        setSelectedDataset(normalizedName);
        setUploadDataset(normalizedName);
        await loadData();
        toast.info(`Dataset "${normalizedName}" sudah ada, langsung dipakai.`);
      } else {
        toast.error("Gagal membuat dataset", { description: raw });
      }
    } finally {
      setCreatingDataset(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadDataset || !uploadImages?.length) return toast.error("Pilih dataset dan gambar");
    setUploading(true);
    setUploadTotal(uploadImages.length);
    setUploadDone(0);
    setUploadCurrentName("");
    try {
      const images = Array.from(uploadImages);
      const labelMap = new Map<string, File>();
      if (uploadLabels?.length) {
        for (const label of Array.from(uploadLabels)) {
          const dot = label.name.lastIndexOf(".");
          const base = dot > 0 ? label.name.slice(0, dot) : label.name;
          labelMap.set(base.toLowerCase(), label);
        }
      }

      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        setUploadCurrentName(image.name);

        const fd = new FormData();
        fd.append("dataset_name", uploadDataset);
        fd.append("split", uploadSplit);
        fd.append("images", image);

        const dot = image.name.lastIndexOf(".");
        const base = dot > 0 ? image.name.slice(0, dot) : image.name;
        const matchedLabel = labelMap.get(base.toLowerCase());
        if (matchedLabel) {
          fd.append("labels", matchedLabel);
        }

        const res = await fetch(`${PYTHON_AI_URL}/datasets/upload`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          failedCount += 1;
        } else {
          successCount += Number(data?.images_saved || 0);
        }

        setUploadDone(i + 1);
        if (i < images.length - 1) {
          await sleep(1000);
        }
      }

      if (failedCount > 0) {
        toast.warning(`Upload selesai: ${successCount} berhasil, ${failedCount} gagal`);
      } else {
        toast.success(`Upload selesai: ${successCount} gambar berhasil`);
      }
      setUploadImages(null);
      setUploadLabels(null);
      setUploadModalOpen(false);
      await loadData();
    } catch (e: any) {
      toast.error("Upload gagal", { description: String(e?.message || e) });
    } finally {
      setUploading(false);
      setUploadCurrentName("");
    }
  };

  const handleDeleteDataset = async (name: string) => {
    const ok = window.confirm(`Hapus dataset "${name}"? Semua file gambar/label akan dihapus permanen.`);
    if (!ok) return;
    try {
      await deleteAIDatasetFn({ data: { name } });
      if (selectedDataset === name) setSelectedDataset("");
      if (uploadDataset === name) setUploadDataset("");
      toast.success(`Dataset "${name}" dihapus`);
      await loadData();
    } catch (e: any) {
      toast.error("Gagal hapus dataset", { description: String(e?.message || e) });
    }
  };

  const handleStartTraining = async () => {
    if (!selectedDataset) return toast.error("Pilih dataset terlebih dahulu");
    if (!aiOnline) return toast.error("Python AI Service tidak online");
    setStartingTraining(true);
    try {
      const res = await startTrainingFn({
        data: {
          dataset_name: selectedDataset,
          model_variant: FIXED_MODEL_VARIANT,
          epochs,
          batch_size: FIXED_BATCH_SIZE,
          imgsz: FIXED_IMGSZ,
        },
      });
      setActiveJobId((res as any).job_id);
      setLogs([]);
      toast.success("Training dimulai!", { description: `Job ID: ${(res as any).job_id.slice(0, 8)}` });
    } catch (e: any) {
      toast.error("Gagal memulai training", { description: e.message });
    } finally {
      setStartingTraining(false);
    }
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await cancelTrainingFn({ data: { job_id: activeJobId } });
      setActiveJobId(null);
      toast.info("Training dibatalkan");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const isTraining = activeJobState?.status === "running";
  const progress = activeJobState?.progress ?? 0;
  const totalImages = datasets.reduce((acc, d) => acc + d.total_images, 0);
  const runningJobs = jobs.filter((j) => j.status === "running").length;

  return (
    <>
      <PageHeader
        title="ML Operations Sederhana"
        description="Alur simpel: buat dataset, upload gambar+label, lalu mulai training dengan yolov8n.pt."
        action={
          <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${aiOnline ? "border-green-500/40 text-green-400 bg-green-500/10" : aiOnline === false ? "border-red-500/40 text-red-400 bg-red-500/10" : "border-border text-muted-foreground"}`}>
            <span className={`h-2 w-2 rounded-full ${aiOnline ? "bg-green-400 animate-pulse" : "bg-red-400"}`} />
            {aiOnline ? "AI Engine Online" : aiOnline === false ? "AI Engine Offline" : "Checking..."}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-7xl space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total Dataset</div>
            <div className="text-2xl font-bold mt-1">{datasets.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Total Gambar</div>
            <div className="text-2xl font-bold mt-1">{totalImages}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-muted-foreground">Training Berjalan</div>
            <div className="text-2xl font-bold mt-1">{runningJobs}</div>
          </Card>
        </div>

        <Card className="p-4 border-primary/30 bg-primary/5">
          <div className="text-sm font-medium">Langkah Cepat</div>
          <div className="text-xs text-muted-foreground mt-1">
            1) Buat dataset, 2) Upload gambar + label, 3) Pilih dataset, 4) Klik Mulai Training
          </div>
        </Card>

        <div className="grid xl:grid-cols-12 gap-6">
        {/* ─── Left Column: Dataset Manager ─── */}
        <div className="space-y-4 xl:col-span-4">
          {/* Create Dataset */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" /> Buat Dataset Baru
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Nama Dataset</Label>
                <Input value={newDatasetName} onChange={(e) => setNewDatasetName(e.target.value)} placeholder="satwa_sederhana_v1" className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Kelas (pisahkan koma)</Label>
                <Input value={newDatasetClasses} onChange={(e) => setNewDatasetClasses(e.target.value)} placeholder="musang, babi_hutan, kucing, manusia" className="mt-1 h-8 text-sm" />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => setNewDatasetClasses("musang, babi_hutan, kucing, manusia")}
              >
                Pakai Kelas Rekomendasi
              </Button>
              <Button size="sm" className="w-full" onClick={handleCreateDataset} disabled={creatingDataset}>
                {creatingDataset ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : <Plus className="h-3 w-3 mr-2" />}
                Buat Dataset
              </Button>
            </div>
          </Card>

          {/* Upload Images */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" /> Upload Dataset
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">Dataset Target</Label>
                <select value={uploadDataset} onChange={(e) => setUploadDataset(e.target.value)} className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2">
                  <option value="">-- Pilih Dataset --</option>
                  {datasets.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Split</Label>
                <select value={uploadSplit} onChange={(e) => setUploadSplit(e.target.value)} className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2">
                  <option value="train">Train</option>
                  <option value="val">Validation</option>
                  <option value="test">Test</option>
                </select>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => {
                  if (!uploadDataset) {
                    toast.error("Pilih dataset target dulu");
                    return;
                  }
                  setUploadModalOpen(true);
                }}
                disabled={uploading}
              >
                <Upload className="h-3 w-3 mr-2" />
                Buka Modal Upload
              </Button>
              {uploading && uploadTotal > 0 && (
                <div className="rounded-md border border-border/40 p-2 bg-muted/20">
                  <div className="text-[11px] text-muted-foreground">
                    Upload {uploadDone}/{uploadTotal} {uploadCurrentName ? `- ${uploadCurrentName}` : ""}
                  </div>
                  <Progress value={(uploadDone / uploadTotal) * 100} className="h-1.5 mt-1.5" />
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Jeda otomatis 1 detik per gambar.
                  </div>
                </div>
              )}
            </div>
          </Card>

        </div>

        {/* ─── Right Column: Training Control + Monitor ─── */}
        <div className="space-y-4 xl:col-span-8">
          {/* Training Config */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" /> Mulai Training (Simple)
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Dataset Terpilih</Label>
                <Input value={selectedDataset} readOnly placeholder="Pilih dari kiri" className="mt-1 h-8 text-sm bg-muted/30" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Model YOLO</Label>
                <Input value={FIXED_MODEL_VARIANT} readOnly className="mt-1 h-8 text-sm bg-muted/30" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Epochs</Label>
                <Input type="number" value={epochs} onChange={(e) => setEpochs(Number(e.target.value))} min={1} max={300} className="mt-1 h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Konfigurasi Tetap</Label>
                <Input value={`batch=${FIXED_BATCH_SIZE}, imgsz=${FIXED_IMGSZ}`} readOnly className="mt-1 h-8 text-sm bg-muted/30" />
              </div>
              <div className="flex items-end gap-2">
                <Button className="flex-1 glow-primary" disabled={!selectedDataset || startingTraining || isTraining} onClick={handleStartTraining}>
                  {startingTraining ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  {isTraining ? "Training..." : "Mulai Training"}
                </Button>
                {isTraining && (
                  <Button variant="destructive" size="icon" onClick={handleCancel}>
                    <Square className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Training Monitor */}
          {activeJobState && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2">
                  <StatusIcon status={activeJobState.status} /> Training Monitor
                </h3>
                <Badge variant={activeJobState.status === "completed" ? "default" : activeJobState.status === "failed" ? "destructive" : "secondary"}>
                  {activeJobState.status}
                </Badge>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Epoch {activeJobState.current_epoch} / {activeJobState.total_epochs}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Metrics */}
              {Object.keys(activeJobState.metrics || {}).length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {Object.entries(activeJobState.metrics).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="p-2 rounded bg-muted/30 text-center">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.replace(/[()]/g, "")}</div>
                      <div className="font-mono text-sm font-bold text-primary">{(Number(v) * 100).toFixed(1)}%</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Logs */}
              <div ref={logsRef} className="h-48 overflow-y-auto rounded-md bg-black/40 border border-border/40 p-3 font-mono text-[11px] text-green-400 space-y-0.5">
                {logs.length === 0 ? <span className="text-muted-foreground">Menunggu log training...</span> : logs.map((l, i) => <div key={i}>{l}</div>)}
              </div>

              {activeJobState.model_path && (
                <div className="mt-3 p-3 rounded-md bg-green-500/10 border border-green-500/30 text-sm text-green-400">
                  ✅ Model berhasil disimpan: <code className="text-xs">{activeJobState.model_path}</code>
                </div>
              )}
            </Card>
          )}

          {/* Job History */}
          <Card className="p-5">
            <h3 className="font-semibold mb-4">Riwayat Training</h3>
            <div className="space-y-2">
              {jobs.length === 0 && <p className="text-sm text-muted-foreground">Belum ada riwayat training.</p>}
              {jobs.map((job) => (
                <div key={job.job_id} className="flex items-center justify-between p-3 rounded-md bg-muted/20 border border-border/30">
                  <div className="flex items-center gap-3">
                    <StatusIcon status={job.status} />
                    <div>
                      <div className="text-sm font-medium">{job.dataset_name}</div>
                      <div className="text-[10px] text-muted-foreground">{job.model_variant} • {job.epochs} epoch • {job.job_id.slice(0, 8)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {job.status === "running" && <Progress value={job.progress} className="w-16 h-1.5" />}
                    <Badge variant="outline" className="text-[10px]">{job.status}</Badge>
                    {job.status === "running" && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={async () => {
                        setActiveJobId(job.job_id);
                        const state = await getTrainingStatusFn({ data: { job_id: job.job_id } });
                        setActiveJobState(state);
                      }}>
                        <Brain className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Dataset Tersedia ({datasets.length})</h3>
            <div className="space-y-2">
              {datasets.length === 0 && <p className="text-xs text-muted-foreground">Belum ada dataset.</p>}
              {datasets.map((ds) => (
                <div key={ds.name} className={`p-3 rounded-md border cursor-pointer transition-all ${selectedDataset === ds.name ? "border-primary bg-primary/5" : "border-border/40 bg-muted/20 hover:border-primary/40"}`} onClick={() => setSelectedDataset(ds.name)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-sm">{ds.name}</div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDataset(ds.name);
                      }}
                      title={`Hapus ${ds.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1 flex gap-2">
                    <span>{ds.total_images} gambar</span>
                    <span>•</span>
                    <span>{ds.class_names.length} kelas</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ds.class_names.slice(0, 4).map((c) => <Badge key={c} variant="outline" className="text-[9px] h-4 px-1">{c}</Badge>)}
                    {ds.class_names.length > 4 && <Badge variant="outline" className="text-[9px] h-4 px-1">+{ds.class_names.length - 4}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">Panduan Jumlah Gambar (Pemula)</h3>
            <div className="text-xs text-muted-foreground space-y-1.5">
              <p>- 100 gambar per kelas bisa dipakai untuk awal, tapi hasil biasanya belum stabil.</p>
              <p>- Target aman: 300-500 gambar per kelas, dengan kondisi siang/malam dan sudut berbeda.</p>
              <p>- Dataset harus seimbang: jangan 500 kucing tapi 20 musang.</p>
              <p>- Selalu sisihkan data validasi/testing agar evaluasi model jujur.</p>
            </div>
          </Card>
        </div>
      </div>
      </div>

      <Dialog open={uploadModalOpen} onOpenChange={(open) => !uploading && setUploadModalOpen(open)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Upload Banyak Gambar</DialogTitle>
            <DialogDescription>
              Cocok untuk upload massal (contoh: 100 foto kucing). Proses jalan satu per satu dengan jeda 1 detik.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              Dataset: <span className="font-medium">{uploadDataset || "-"}</span> • Split:{" "}
              <span className="font-medium">{uploadSplit}</span>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Gambar (.jpg/.png)</Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setUploadImages(e.target.files)}
                className="mt-1"
                disabled={uploading}
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                {uploadImages?.length ? `${uploadImages.length} file dipilih` : "Belum ada file dipilih"}
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Label YOLO (.txt) — opsional</Label>
              <Input
                type="file"
                accept=".txt"
                multiple
                onChange={(e) => setUploadLabels(e.target.files)}
                className="mt-1"
                disabled={uploading}
              />
            </div>
            {uploading && uploadTotal > 0 && (
              <div className="rounded-md border border-border/40 p-2 bg-muted/20">
                <div className="text-[11px] text-muted-foreground">
                  Upload {uploadDone}/{uploadTotal} {uploadCurrentName ? `- ${uploadCurrentName}` : ""}
                </div>
                <Progress value={(uploadDone / uploadTotal) * 100} className="h-1.5 mt-1.5" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUploadModalOpen(false)}
              disabled={uploading}
            >
              Batal
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !uploadDataset || !uploadImages?.length}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              {uploading ? "Uploading..." : "Upload Sekarang"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
