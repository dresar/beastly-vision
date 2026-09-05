import { useState } from "react";
import { Upload, Camera, Loader2, Search, X, ShieldCheck, Cpu, Cloud, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectImageFn } from "@/lib/ml-api";
import { localDetectFn } from "@/lib/training-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DetObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
}
interface DetectionResult {
  url?: string;
  image_url?: string;
  objects?: DetObject[];
  detections?: DetObject[];
  timestamp?: string;
  source?: string;
  inference_ms?: number;
  model?: string;
}

type DetectionSource = "local" | "roboflow";

export function DetectionCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [source, setSource] = useState<DetectionSource>("local");
  const [confidence, setConfidence] = useState(0.25);

  const getObjects = (r: DetectionResult): DetObject[] => {
    return r.objects || r.detections || [];
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    setResult(null);

    try {
      const base64 = await toBase64(file);

      let res: any;
      if (source === "local") {
        res = await localDetectFn({ data: { image: base64, confidence } });
        // Normalize format
        res = { ...res, objects: res.detections || [], url: res.image_url };
      } else {
        res = await detectImageFn({ data: { image: base64 } });
      }

      setResult(res as DetectionResult);
      const count = getObjects(res).length;
      if (count > 0) {
        toast.success(`${count} objek terdeteksi!`, {
          description: `Menggunakan ${source === "local" ? "Local YOLOv8" : "Roboflow YOLO-World"} • ${res.inference_ms ? `${res.inference_ms}ms` : ""}`,
        });
      } else {
        toast.info("Tidak ada objek terdeteksi.");
      }
    } catch (error: any) {
      toast.error("Gagal melakukan deteksi", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  const reset = () => { setResult(null); setPreview(null); };

  const objects = result ? getObjects(result) : [];

  return (
    <Card className="p-6 relative overflow-hidden bg-gradient-to-br from-background to-primary/5 border-primary/20">
      <div className="flex flex-col md:flex-row gap-8 items-start">
        {/* Left: Upload + Preview */}
        <div className="w-full md:w-1/2">
          <div className="mb-4">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Real-Time AI Detection
            </h2>

            {/* Source Toggle */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setSource("local")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  source === "local"
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "border-border/40 text-muted-foreground hover:border-primary/20"
                )}
              >
                <Cpu className="h-3 w-3" /> Local YOLOv8
              </button>
              <button
                onClick={() => setSource("roboflow")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all",
                  source === "roboflow"
                    ? "bg-primary/20 text-primary border-primary/40"
                    : "border-border/40 text-muted-foreground hover:border-primary/20"
                )}
              >
                <Cloud className="h-3 w-3" /> Roboflow Cloud
              </button>
            </div>

            {source === "local" && (
              <div className="flex items-center gap-2 mt-3">
                <span className="text-xs text-muted-foreground">Confidence:</span>
                <input
                  type="range" min="0.1" max="0.9" step="0.05"
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                  className="flex-1 h-1.5 accent-primary"
                />
                <span className="text-xs font-mono text-primary w-8">{(confidence * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>

          {!preview ? (
            <div className="relative border-2 border-dashed border-primary/20 rounded-xl p-12 flex flex-col items-center justify-center bg-primary/5 hover:bg-primary/10 transition-colors group cursor-pointer">
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <p className="font-medium">Pilih foto untuk deteksi</p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">PNG, JPG, WEBP</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border shadow-2xl bg-black/40">
              <img src={preview} alt="Upload preview" className={cn("w-full h-auto object-contain", loading && "opacity-50 grayscale")} />

              {/* SVG Bounding Box Overlay */}
              {result && objects.length > 0 && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {objects.map((obj, i) => (
                    <g key={i}>
                      <rect x={obj.bbox[0]} y={obj.bbox[1]} width={obj.bbox[2]} height={obj.bbox[3]}
                        fill="none" stroke="oklch(0.85 0.22 150)" strokeWidth="0.004" />
                      <foreignObject x={obj.bbox[0]} y={Math.max(0, obj.bbox[1] - 0.05)} width="0.35" height="0.05">
                        <div className="bg-primary text-primary-foreground text-[7px] font-bold px-1 py-0.5 rounded-sm w-fit uppercase flex items-center gap-0.5 shadow-lg">
                          <ShieldCheck className="h-2 w-2" /> {obj.label} {(obj.confidence * 100).toFixed(0)}%
                        </div>
                      </foreignObject>
                    </g>
                  ))}
                </svg>
              )}

              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="relative h-16 w-16">
                    <div className="absolute inset-0 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                    <Camera className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
                  </div>
                  <p className="text-white text-[10px] font-bold mt-4 uppercase tracking-widest">Analyzing...</p>
                </div>
              )}

              <Button variant="destructive" size="icon" className="absolute top-3 right-3 h-7 w-7 rounded-full" onClick={reset}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="w-full md:w-1/2 space-y-3">
          <div className="p-4 rounded-lg bg-background/50 border border-border/40 min-h-[120px]">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Inference Results</h3>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${60 + i * 10}%` }} />)}
              </div>
            ) : result ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-border/30 pb-2">
                  <span className="text-xs text-muted-foreground">Engine</span>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    {result.model || (source === "local" ? "LOCAL·YOLO" : "ROBOFLOW·YOLO")}
                  </Badge>
                </div>
                {result.inference_ms && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-3 w-3" /> Inference</span>
                    <span className="font-mono text-primary">{result.inference_ms}ms</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs border-b border-border/20 pb-2">
                  <span className="text-muted-foreground">Deteksi</span>
                  <span className="font-bold text-primary">{objects.length} objek</span>
                </div>
                {objects.length > 0 ? (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {objects.map((obj, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <span className="text-sm font-medium capitalize">{obj.label}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${obj.confidence * 100}%` }} />
                          </div>
                          <span className="text-xs font-mono font-bold text-primary w-8 text-right">{(obj.confidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic text-center py-2">Tidak ada objek terdeteksi.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 opacity-40">
                <Search className="h-8 w-8 text-primary mb-2" />
                <p className="text-xs text-center">Upload gambar untuk memulai deteksi.</p>
              </div>
            )}
          </div>

          <div className="p-3 rounded-lg border border-dashed border-primary/20 text-[11px] text-muted-foreground leading-relaxed">
            <b>Local YOLOv8:</b> Inferensi berjalan di Python service lokal — gunakan model yang sudah dilatih dari Training Center.<br />
            <b>Roboflow Cloud:</b> YOLO-World zero-shot via API tanpa dataset lokal.
          </div>
        </div>
      </div>
    </Card>
  );
}
