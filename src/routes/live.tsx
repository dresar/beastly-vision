import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Radio } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ThreatBadge } from "@/components/threat-badge";
import { toast } from "sonner";

export const Route = createFileRoute("/live")({
  component: () => (
    <DashboardLayout>
      <LiveMonitoring />
    </DashboardLayout>
  ),
});

interface DetObject {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // x, y, w, h normalized 0..1
}
interface Detection {
  id: string;
  image_url: string | null;
  detected_objects: DetObject[];
  primary_label: string | null;
  max_confidence: number | null;
  threat_level: string;
  detected_at: string;
  device_id: string | null;
}

import { getDetectionsFn } from "@/lib/api";

function LiveMonitoring() {
  const [latest, setLatest] = useState<Detection | null>(null);
  const [feed, setFeed] = useState<Detection[]>([]);

  const load = async () => {
    const data = await getDetectionsFn();
    const list = (data ?? []) as unknown as Detection[];
    setFeed(list.slice(0, 8));
    setLatest((prev) => {
      const net = list[0];
      if (net && net.id !== prev?.id) {
        if (net.threat_level === "high") {
          toast.error(`⚠️ Ancaman tinggi: ${net.primary_label || "objek"}`, {
            description: `Confidence ${((net.max_confidence || 0) * 100).toFixed(0)}%`,
          });
        }
        return net;
      }
      return prev || net;
    });
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000); // Poll every 5s for live feel
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <PageHeader
        title="Live Monitoring"
        description="Stream gambar terbaru dari ESP32-CAM dengan overlay deteksi YOLOv8."
        action={
          <div className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            <span className="text-success uppercase tracking-wider">Live</span>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" /> Frame Aktif
            </h2>
            {latest && <ThreatBadge level={latest.threat_level} />}
          </div>

          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted/20 border border-border/40 scanline">
            {latest?.image_url ? (
              <>
                <img
                  src={latest.image_url}
                  alt="Live frame"
                  className="w-full h-full object-cover"
                />
                <BoundingBoxes objects={latest.detected_objects ?? []} />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground bg-cyber-grid">
                <Radio className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Menunggu frame dari ESP32-CAM…</p>
                <p className="text-xs mt-1">Setup endpoint ingest di tab Pengaturan</p>
              </div>
            )}
          </div>

          {latest && (
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <Info label="Objek utama" value={latest.primary_label ?? "—"} />
              <Info
                label="Confidence"
                value={
                  latest.max_confidence
                    ? `${(Number(latest.max_confidence) * 100).toFixed(0)}%`
                    : "—"
                }
              />
              <Info
                label="Waktu"
                value={format(new Date(latest.detected_at), "HH:mm:ss")}
              />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Feed Terbaru</h2>
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {feed.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada deteksi.</p>
            )}
            {feed.map((d) => (
              <button
                key={d.id}
                onClick={() => setLatest(d)}
                className="w-full text-left p-2 rounded-md bg-muted/30 hover:bg-muted/60 border border-border/40 flex gap-3 items-center transition"
              >
                {d.image_url ? (
                  <img
                    src={d.image_url}
                    alt=""
                    className="h-12 w-16 object-cover rounded"
                  />
                ) : (
                  <div className="h-12 w-16 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {d.primary_label ?? "unknown"}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {format(new Date(d.detected_at), "HH:mm:ss")}
                  </div>
                </div>
                <ThreatBadge level={d.threat_level} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-md bg-muted/30 border border-border/40">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-medium mt-0.5">{value}</div>
    </div>
  );
}

function BoundingBoxes({ objects }: { objects: DetObject[] }) {
  if (!objects?.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      {objects.map((o, i) => {
        const [x, y, w, h] = o.bbox ?? [0, 0, 0, 0];
        return (
          <div
            key={i}
            className="absolute border-2 border-primary"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: `${w * 100}%`,
              height: `${h * 100}%`,
              boxShadow: "0 0 12px oklch(0.85 0.22 150 / 0.6)",
            }}
          >
            <div className="absolute -top-6 left-0 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 font-mono uppercase tracking-wider rounded">
              {o.label} {(o.confidence * 100).toFixed(0)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
