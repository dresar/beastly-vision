import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { updateProfileFn } from "@/lib/api";

export const Route = createFileRoute("/settings")({
  component: () => (
    <DashboardLayout>
      <Settings />
    </DashboardLayout>
  ),
});

const INGEST_URL = typeof window !== 'undefined' ? `${window.location.origin}/_server?_serverFnId=ingestFn` : '';
const PYTHON_API_BASE =
  (import.meta.env.VITE_PYTHON_AI_URL as string | undefined) ||
  "http://localhost:8000";

type MqttConfigResponse = {
  host?: string;
  port?: number;
  device_id?: string;
  topic_prefix?: string;
  telegram_enabled?: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  alert_min_confidence?: number;
  alert_threat_only?: boolean;
  threat_labels?: string[];
};

type MqttStatusResponse = {
  connected?: boolean;
};

function Settings() {
  const { user, isAdmin } = useAuth();
  const [fullName, setFullName] = useState("");
  const [mqttHost, setMqttHost] = useState("broker.emqx.io");
  const [mqttPort, setMqttPort] = useState("1883");
  const [deviceId, setDeviceId] = useState("esp32-cam-2");
  const [topicPrefix, setTopicPrefix] = useState("wildguard");
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [alertMinConfidence, setAlertMinConfidence] = useState("0.5");
  const [alertThreatOnly, setAlertThreatOnly] = useState(false);
  const [threatLabelsText, setThreatLabelsText] = useState("person, boar, tiger, elephant");
  const [testMessage, setTestMessage] = useState("Test realtime dari dashboard WildGuard");
  const [telegramTokenConfigured, setTelegramTokenConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState("unknown");

  useEffect(() => {
    if (user) {
      setFullName(user.fullName || "");
    }
  }, [user]);

  const loadMqttConfig = async () => {
    try {
      const res = await fetch(`${PYTHON_API_BASE}/mqtt/config`);
      if (!res.ok) return;
      const cfg = (await res.json()) as MqttConfigResponse;
      setMqttHost(cfg.host || "broker.emqx.io");
      setMqttPort(String(cfg.port || 1883));
      setDeviceId(cfg.device_id || "esp32-cam-2");
      setTopicPrefix(cfg.topic_prefix || "wildguard");
      setTelegramEnabled(Boolean(cfg.telegram_enabled));
      setTelegramTokenConfigured(cfg.telegram_bot_token === "***hidden***");
      setTelegramToken(cfg.telegram_bot_token === "***hidden***" ? "" : (cfg.telegram_bot_token || ""));
      setTelegramChatId(cfg.telegram_chat_id || "");
      setAlertMinConfidence(String(cfg.alert_min_confidence ?? 0.5));
      setAlertThreatOnly(Boolean(cfg.alert_threat_only));
      setThreatLabelsText((cfg.threat_labels || ["person", "boar", "tiger", "elephant"]).join(", "));
    } catch {
      // Python service may not be running.
    }
  };

  const loadMqttStatus = async () => {
    try {
      const res = await fetch(`${PYTHON_API_BASE}/mqtt/status`);
      if (!res.ok) return;
      const status = (await res.json()) as MqttStatusResponse;
      setBridgeStatus(status.connected ? "connected" : "disconnected");
    } catch {
      setBridgeStatus("offline");
    }
  };

  useEffect(() => {
    loadMqttConfig();
    loadMqttStatus();
  }, []);

  const saveProfile = async () => {
    if (!user) return;
    try {
      await updateProfileFn({ data: { full_name: fullName } });
      toast.success("Profil disimpan");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const copy = (s: string) => {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clipboard?.writeText) {
      clipboard.writeText(s);
      toast.success("Disalin ke clipboard");
      return;
    }
    toast.error("Clipboard tidak tersedia di browser ini");
  };

  const saveMqttConfig = async () => {
    setSaving(true);
    try {
      const labels = threatLabelsText
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        host: mqttHost,
        port: Number(mqttPort || 1883),
        device_id: deviceId,
        topic_prefix: topicPrefix,
        telegram_enabled: telegramEnabled,
        telegram_chat_id: telegramChatId,
        alert_min_confidence: Number(alertMinConfidence || 0.5),
        alert_threat_only: alertThreatOnly,
        threat_labels: labels,
        ...(telegramToken ? { telegram_bot_token: telegramToken } : {}),
      };
      const res = await fetch(`${PYTHON_API_BASE}/mqtt/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      await loadMqttConfig();
      await loadMqttStatus();
      toast.success("Konfigurasi MQTT/Telegram disimpan");
    } catch (error: any) {
      toast.error(error.message || "Gagal simpan konfigurasi");
    } finally {
      setSaving(false);
    }
  };

  const testTelegram = async () => {
    setTestingTelegram(true);
    try {
      const res = await fetch(`${PYTHON_API_BASE}/mqtt/telegram/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: testMessage }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }
      toast.success("Pesan test Telegram terkirim");
    } catch (error: any) {
      toast.error(error.message || "Gagal kirim test Telegram");
    } finally {
      setTestingTelegram(false);
    }
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
              <h3 className="font-semibold mb-2">MQTT Bridge (Realtime)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                ESP32 publish frame ke MQTT, Python subscribe realtime, inferensi YOLOv8, lalu kirim alert ke Telegram.
              </p>
              <div className="text-xs mb-3">
                Status bridge: <span className="font-semibold uppercase">{bridgeStatus}</span>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <Label>MQTT Host</Label>
                  <Input value={mqttHost} onChange={(e) => setMqttHost(e.target.value)} />
                </div>
                <div>
                  <Label>MQTT Port</Label>
                  <Input value={mqttPort} onChange={(e) => setMqttPort(e.target.value)} />
                </div>
                <div>
                  <Label>Device ID</Label>
                  <Input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} />
                </div>
                <div>
                  <Label>Topic Prefix</Label>
                  <Input value={topicPrefix} onChange={(e) => setTopicPrefix(e.target.value)} />
                </div>
                <div className="md:col-span-2">
                  <Label>Telegram Bot Token</Label>
                  <Input
                    type="password"
                    placeholder="Isi jika ingin update token"
                    value={telegramToken}
                    onChange={(e) => setTelegramToken(e.target.value)}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Status token saat ini: {telegramTokenConfigured ? "tersimpan" : "belum disimpan"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Telegram Chat ID</Label>
                  <Input value={telegramChatId} onChange={(e) => setTelegramChatId(e.target.value)} />
                </div>
                <div className="md:col-span-2 flex items-center justify-between rounded-md border border-border/50 p-3">
                  <div>
                    <Label>Telegram Aktif</Label>
                    <p className="text-[11px] text-muted-foreground">Jika aktif, alert akan dikirim ke Telegram sesuai filter.</p>
                  </div>
                  <Switch checked={telegramEnabled} onCheckedChange={setTelegramEnabled} />
                </div>
                <div>
                  <Label>Minimum Confidence (0.0 - 1.0)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={alertMinConfidence}
                    onChange={(e) => setAlertMinConfidence(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border/50 p-3">
                  <div>
                    <Label>Kirim Hanya Label Ancaman</Label>
                    <p className="text-[11px] text-muted-foreground">Jika aktif, hanya label di daftar ancaman yang dikirim.</p>
                  </div>
                  <Switch checked={alertThreatOnly} onCheckedChange={setAlertThreatOnly} />
                </div>
                <div className="md:col-span-2">
                  <Label>Daftar Label Ancaman (pisahkan koma)</Label>
                  <Input
                    placeholder="person, boar, tiger, elephant"
                    value={threatLabelsText}
                    onChange={(e) => setThreatLabelsText(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Test Message Telegram</Label>
                  <Textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    className="min-h-[90px]"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={saveMqttConfig} disabled={saving}>
                  {saving ? "Menyimpan..." : "Simpan Konfigurasi"}
                </Button>
                <Button variant="outline" onClick={testTelegram} disabled={testingTelegram}>
                  {testingTelegram ? "Mengirim..." : "Test Telegram"}
                </Button>
                <Button variant="ghost" onClick={() => { loadMqttConfig(); loadMqttStatus(); }}>
                  Refresh Status
                </Button>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Endpoint Ingest (REST)</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Bridge MQTT atau perangkat ESP32-CAM dapat mengirim hasil deteksi YOLOv8 ke endpoint berikut menggunakan POST.
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
                <strong className="text-foreground">YOLOv8 Worker</strong> menjalankan inference, meng-upload snapshot ke storage publik, lalu HTTP POST hasil deteksi ke endpoint ingest di atas.
              </li>
              <li>
                <strong className="text-foreground">WildGuard Server (Neon + Vercel)</strong> menyimpan ke database Neon dan menyegarkan dashboard secara otomatis. Notifikasi otomatis dibuat jika threat_level = high.
              </li>
            </ol>

            <h3 className="font-semibold mb-2 mt-6">Klasifikasi Ancaman</h3>
            <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
              <li><span className="text-destructive font-medium">high</span> — manusia, babi hutan, harimau, gajah</li>
              <li><span className="text-warning font-medium">medium</span> — monyet, rusa, anjing liar</li>
              <li><span className="text-success font-medium">low</span> — burung dan hewan kecil lain</li>
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
