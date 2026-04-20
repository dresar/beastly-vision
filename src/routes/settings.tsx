import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  component: () => (
    <DashboardLayout>
      <Settings />
    </DashboardLayout>
  ),
});

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const INGEST_URL = `${SUPABASE_URL}/functions/v1/ingest`;

function Settings() {
  const { user, isAdmin } = useAuth();
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name ?? "");

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", user.id);
    if (error) toast.error(error.message);
    else toast.success("Profil disimpan");
  };

  const copy = (s: string) => {
    navigator.clipboard.writeText(s);
    toast.success("Disalin ke clipboard");
  };

  const samplePayload = `{
  "device_api_key": "<API_KEY_PERANGKAT>",
  "image_url": "https://...jpg",
  "detected_objects": [
    { "label": "monkey", "confidence": 0.92, "bbox": [0.12, 0.30, 0.40, 0.55] }
  ],
  "timestamp": "2025-01-01T12:00:00Z"
}`;

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Profil, integrasi, dan dokumentasi endpoint."
      />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="integration">Integrasi IoT</TabsTrigger>
          <TabsTrigger value="docs">Dokumentasi</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="p-6 max-w-xl">
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
              </div>
              <div>
                <Label>Nama Lengkap</Label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <Input value={isAdmin ? "admin" : "viewer"} disabled />
              </div>
              <Button onClick={saveProfile}>Simpan</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="integration">
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Endpoint Ingest (REST)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Bridge MQTT atau perangkat ESP32-CAM dapat mengirim hasil deteksi YOLOv8 ke endpoint berikut.
              </p>
              <div className="flex gap-2">
                <Input value={INGEST_URL} readOnly className="font-mono text-xs" />
                <Button variant="outline" onClick={() => copy(INGEST_URL)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2 mt-4">Contoh Payload</h3>
              <pre className="p-4 rounded-md bg-muted/40 border border-border/40 text-xs font-mono overflow-x-auto">
                {samplePayload}
              </pre>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="docs">
          <Card className="p-6 prose prose-invert max-w-none">
            <h3 className="font-semibold mb-2">Arsitektur Sistem</h3>
            <ol className="list-decimal pl-5 text-sm space-y-2 text-muted-foreground">
              <li>
                <strong className="text-foreground">ESP32-CAM</strong> menangkap gambar setiap N detik atau saat sensor PIR terpicu, lalu mempublikasikan ke topik MQTT
                <code className="ml-1 px-1 py-0.5 rounded bg-muted text-primary">wildguard/&lt;device_id&gt;/frame</code>.
              </li>
              <li>
                <strong className="text-foreground">MQTT Broker</strong> (Mosquitto / EMQX / HiveMQ) meneruskan pesan ke <strong className="text-foreground">YOLOv8 Worker</strong> (Python) yang subscribe ke topik tersebut.
              </li>
              <li>
                <strong className="text-foreground">YOLOv8 Worker</strong> menjalankan inference, meng-upload snapshot ke storage publik (S3/Supabase storage), lalu HTTP POST hasil deteksi ke endpoint ingest di atas.
              </li>
              <li>
                <strong className="text-foreground">Lovable Cloud</strong> menyimpan ke tabel <code className="px-1 py-0.5 rounded bg-muted text-primary">detections</code> dan menyiarkan secara realtime ke dashboard. Notifikasi otomatis dibuat jika threat_level = high.
              </li>
            </ol>

            <h3 className="font-semibold mb-2 mt-6">Klasifikasi Ancaman</h3>
            <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
              <li><span className="text-destructive font-medium">high</span> — manusia, babi hutan, harimau, gajah</li>
              <li><span className="text-warning font-medium">medium</span> — monyet, rusa, anjing liar</li>
              <li><span className="text-success font-medium">low</span> — burung dan hewan kecil lain</li>
            </ul>

            <h3 className="font-semibold mb-2 mt-6">File Referensi</h3>
            <p className="text-sm text-muted-foreground">
              Lihat folder <code className="px-1 py-0.5 rounded bg-muted text-primary">docs/</code> di repo untuk:
              <br />• <code className="text-primary">esp32_cam_publisher.ino</code> — firmware ESP32-CAM
              <br />• <code className="text-primary">yolo_worker.py</code> — bridge MQTT ↔ YOLOv8 ↔ ingest endpoint
              <br />• <code className="text-primary">README.md</code> — panduan deployment lengkap
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
