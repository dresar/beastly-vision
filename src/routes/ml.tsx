import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, Upload } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { localDetectFn } from "@/lib/training-api";

export const Route = createFileRoute("/ml")({
  component: () => (
    <DashboardLayout>
      <MLManagement />
    </DashboardLayout>
  ),
});

interface DetectionItem {
  label: string;
  confidence: number;
  bbox: number[];
  bbox_px: number[];
}

function MLManagement() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [confidence, setConfidence] = useState(0.1);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStep, setAnalysisStep] = useState("Menunggu gambar...");
  const [result, setResult] = useState<{
    count: number;
    primary_label: string | null;
    max_confidence: number;
    model: string;
    detections: DetectionItem[];
  } | null>(null);

  const topDetections = useMemo(
    () => (result?.detections || []).slice(0, 8),
    [result]
  );

  useEffect(() => {
    if (!loading) return;
    setAnalysisProgress(5);
    setAnalysisStep("Memuat gambar...");

    const interval = setInterval(() => {
      setAnalysisProgress((prev) => {
        const next = Math.min(prev + 7, 95);
        if (next >= 15 && next < 40) setAnalysisStep("Preprocessing gambar...");
        else if (next >= 40 && next < 70) setAnalysisStep("Analisis objek oleh YOLO...");
        else if (next >= 70) setAnalysisStep("Menyusun hasil deteksi...");
        return next;
      });
    }, 300);

    return () => clearInterval(interval);
  }, [loading]);

  const mapLabel = (label: string | null | undefined) => {
    if (!label) return "-";
    return label === "cat" ? "kucing" : label;
  };

  const onSelectFile = (f?: File) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(String(reader.result || ""));
    reader.readAsDataURL(f);
  };

  const handleDetect = async () => {
    if (!file || !preview) {
      toast.error("Pilih gambar dulu");
      return;
    }
    setLoading(true);
    try {
      const base64 = preview.includes(",") ? preview.split(",")[1] : preview;
      const res = (await localDetectFn({
        data: { image: base64, confidence },
      })) as any;
      setAnalysisProgress(100);
      setAnalysisStep("Selesai");
      setResult(res);
      toast.success("Deteksi selesai");
    } catch (error: any) {
      setAnalysisProgress(0);
      setAnalysisStep("Gagal analisis");
      toast.error("Deteksi gagal", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="ML Operations"
        description="Sederhana: upload gambar biasa lalu jalankan deteksi YOLO."
      />

      <div className="mx-auto w-full max-w-6xl grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <Upload className="h-4 w-4 text-primary" /> Upload Gambar
          </h2>
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">File Gambar</Label>
              <Input
                type="file"
                accept="image/*"
                className="mt-1"
                onChange={(e) => onSelectFile(e.target.files?.[0])}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleDetect}
              disabled={loading || !file}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {loading ? "Mendeteksi..." : "Deteksi YOLO"}
            </Button>
            <div>
              <Label className="text-xs text-muted-foreground">Confidence ({confidence.toFixed(2)})</Label>
              <Input
                type="number"
                min={0.05}
                max={0.9}
                step={0.05}
                value={confidence}
                onChange={(e) => setConfidence(Math.min(0.9, Math.max(0.05, Number(e.target.value) || 0.1)))}
                className="mt-1"
              />
              <div className="text-[11px] text-muted-foreground mt-1">
                Saran untuk gambar kucing sulit: pakai 0.10 - 0.20
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Model yang dipakai: <span className="font-medium">yolov8n.pt</span>
            </div>
            {preview && (
              <div className="rounded-lg border border-border overflow-hidden bg-muted/20">
                <img src={preview} alt="preview" className="w-full object-contain max-h-[420px]" />
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-primary" /> Hasil Deteksi
          </h2>
          {loading && (
            <div className="mb-4 p-3 rounded-md border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="h-4 w-4 animate-spin" /> Analisis mendalam sedang berjalan...
              </div>
              <div className="text-xs text-muted-foreground mt-1">{analysisStep}</div>
              <Progress value={analysisProgress} className="h-2 mt-2" />
              <div className="text-xs text-muted-foreground mt-1">{analysisProgress}%</div>
            </div>
          )}
          {!result && (
            <p className="text-sm text-muted-foreground">
              Upload gambar lalu klik <strong>Deteksi YOLO</strong> untuk melihat hasil.
            </p>
          )}
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-md bg-muted/20 border border-border/30">
                  <div className="text-[10px] text-muted-foreground">Total Deteksi</div>
                  <div className="text-xl font-bold">{result.count}</div>
                </div>
                <div className="p-3 rounded-md bg-muted/20 border border-border/30">
                  <div className="text-[10px] text-muted-foreground">Label Utama</div>
                  <div className="text-sm font-semibold">{mapLabel(result.primary_label)}</div>
                </div>
                <div className="p-3 rounded-md bg-muted/20 border border-border/30">
                  <div className="text-[10px] text-muted-foreground">Confidence Max</div>
                  <div className="text-sm font-semibold">{(result.max_confidence * 100).toFixed(1)}%</div>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                Model: <span className="font-medium">{result.model}</span>
              </div>
              <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
                {topDetections.length === 0 && (
                  <p className="text-sm text-muted-foreground">Tidak ada objek terdeteksi.</p>
                )}
                {topDetections.map((det, idx) => (
                  <div key={`${det.label}-${idx}`} className="p-3 rounded-md border border-border/30 bg-background/80 flex items-center justify-between">
                    <div className="text-sm font-medium">{mapLabel(det.label)}</div>
                    <Badge variant="outline">{(det.confidence * 100).toFixed(1)}%</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
