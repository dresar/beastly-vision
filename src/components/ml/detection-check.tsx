import { useState } from "react";
import { Upload, Camera, Loader2, Search, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { detectImageFn } from "@/lib/ml-api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DetectionResult {
  url: string;
  objects: Array<{
    label: string,
    confidence: number,
    bbox: [number, number, number, number]
  }>;
  timestamp: string;
  source?: string;
}

export function DetectionCheck() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Preview
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setLoading(true);
    setResult(null);

    try {
      const base64 = await toBase64(file);
      const res = await detectImageFn({ data: { image: base64 } });
      setResult(res as unknown as DetectionResult);
      if ((res as any).objects.length > 0) {
        toast.success("Objek berhasil dideteksi!");
      } else {
        toast.info("Analisis selesai: Tidak ada objek terdeteksi.");
      }
    } catch (error: any) {
      toast.error("Gagal melakukan deteksi", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const reset = () => {
    setResult(null);
    setPreview(null);
  };

  return (
    <Card className="p-6 relative overflow-hidden bg-gradient-to-br from-background to-primary/5 border-primary/20">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="w-full md:w-1/2">
          <div className="mb-6">
            <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" /> Real-Time AI Detection
            </h2>
            <p className="text-sm text-muted-foreground">
              Aktif: <b>Roboflow YOLO-World (Zero-Shot)</b>. Deteksi instan tanpa perlu pelatihan dataset lokal.
            </p>
          </div>

          {!preview ? (
            <div className="relative border-2 border-dashed border-primary/20 rounded-xl p-12 flex flex-col items-center justify-center bg-primary/5 hover:bg-primary/10 transition-colors group cursor-pointer">
              <input 
                type="file" 
                accept="image/*" 
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
              />
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <p className="font-medium">Pilih foto satwa untuk deteksi real-time</p>
              <p className="text-xs text-muted-foreground mt-2 uppercase tracking-widest">PNG, JPG up to 5MB</p>
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border shadow-2xl bg-black/40">
              <img 
                src={preview} 
                alt="Upload preview" 
                className={cn("w-full h-auto object-contain", loading && "opacity-50 grayscale")}
              />
              
              {/* Detection Overlay */}
              {result && (
                <svg 
                  className="absolute inset-0 w-full h-full pointer-events-none" 
                  viewBox="0 0 1 1" 
                  preserveAspectRatio="none"
                >
                  {result.objects.map((obj, i) => (
                    <g key={i}>
                      <rect 
                        x={obj.bbox[0]} 
                        y={obj.bbox[1]} 
                        width={obj.bbox[2]} 
                        height={obj.bbox[3]} 
                        fill="none" 
                        stroke="#10b981" 
                        strokeWidth="0.005"
                        className="animate-pulse"
                      />
                      <foreignObject 
                        x={obj.bbox[0]} 
                        y={obj.bbox[1] - 0.05} 
                        width="0.3" 
                        height="0.05"
                      >
                        <div className="bg-emerald-500 text-white text-[8px] font-bold px-1 py-0.5 rounded-sm w-fit uppercase flex items-center gap-1 shadow-lg">
                          <ShieldCheck className="h-2 w-2" /> {obj.label} ({(obj.confidence * 100).toFixed(0)}%)
                        </div>
                      </foreignObject>
                    </g>
                  ))}
                </svg>
              )}

              {loading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm">
                  <div className="relative h-20 w-20">
                     <div className="absolute inset-0 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
                     <div className="absolute inset-2 border-4 border-primary/10 border-b-primary rounded-full animate-spin-slow"></div>
                     <Camera className="absolute inset-0 m-auto h-6 w-6 text-primary animate-pulse" />
                  </div>
                  <p className="text-white text-[10px] font-bold mt-4 uppercase tracking-[0.3em] glow-text">Neural Analysis...</p>
                </div>
              )}

              <Button 
                variant="destructive" 
                size="icon" 
                className="absolute top-4 right-4 h-8 w-8 rounded-full"
                onClick={reset}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div className="w-full md:w-1/2 space-y-4">
          <div className="p-4 rounded-lg bg-background/50 border border-border/40 min-h-[100px]">
             <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">Inference Engine Results</h3>
             {loading ? (
                <div className="space-y-2">
                    <div className="h-4 w-full bg-muted animate-pulse rounded"></div>
                    <div className="h-4 w-3/4 bg-muted animate-pulse rounded"></div>
                </div>
             ) : result ? (
               <div className="space-y-4">
                 <div className="flex items-center justify-between border-b pb-2">
                    <span className="text-sm font-medium">Source</span>
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 font-mono text-[10px]">
                        ROBOFLOW · YOLO_WORLD_LARGE
                    </Badge>
                 </div>
                 
                 {result.objects.length > 0 ? (
                    <div className="space-y-3">
                        {result.objects.map((obj, i) => (
                            <div key={i} className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="text-sm font-medium capitalize">{obj.label}</span>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-emerald-500" 
                                            style={{ width: `${obj.confidence * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs text-primary font-mono font-bold">{(obj.confidence * 100).toFixed(0)}%</span>
                                </div>
                            </div>
                        ))}
                    </div>
                 ) : (
                    <p className="text-xs text-muted-foreground italic py-2 text-center">Tidak ada objek satwa yang terdeteksi dalam gambar ini.</p>
                 )}

                 <div className="pt-2">
                    <div className="text-[9px] text-muted-foreground uppercase flex items-center gap-2 mb-1">
                      <Camera className="h-3 w-3" /> ImageKit Stable URL
                    </div>
                    <div className="text-[10px] text-primary truncate opacity-60 hover:opacity-100 transition-opacity cursor-help">{result.url}</div>
                 </div>
               </div>
             ) : (
               <div className="flex flex-col items-center justify-center p-8 opacity-40">
                  <div className="h-12 w-12 border-2 border-primary/40 border-dashed rounded-full flex items-center justify-center mb-3 animate-spin-slow">
                      <Search className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-xs text-center">Menunggu input gambar untuk memulai analisis neural zero-shot.</p>
               </div>
             )}
          </div>
          <div className="p-4 rounded-lg border border-dashed border-primary/20 text-xs text-muted-foreground">
             <p className="leading-relaxed"><b>Info Sinergi:</b> Gambar di-hosting melalui ImageKit CDN agar tetap optimal di Vercel, kemudian diproses oleh model YOLO-World Large di infrastruktur Roboflow.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
