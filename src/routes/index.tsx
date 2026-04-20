import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Cpu,
  Eye,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, subHours } from "date-fns";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { ThreatBadge, StatusDot } from "@/components/threat-badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: () => (
    <DashboardLayout>
      <DashboardHome />
    </DashboardLayout>
  ),
});

interface Detection {
  id: string;
  primary_label: string | null;
  threat_level: string;
  detected_at: string;
  max_confidence: number | null;
  device_id: string | null;
}
interface Device {
  id: string;
  name: string;
  status: string;
}

function DashboardHome() {
  const [detections, setDetections] = useState<Detection[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ data: dets }, { data: devs }, { count }] = await Promise.all([
        supabase
          .from("detections")
          .select("id, primary_label, threat_level, detected_at, max_confidence, device_id")
          .order("detected_at", { ascending: false })
          .limit(50),
        supabase.from("devices").select("id, name, status"),
        supabase
          .from("detections")
          .select("id", { count: "exact", head: true })
          .gte("detected_at", startOfDay.toISOString()),
      ]);
      setDetections(dets ?? []);
      setDevices(devs ?? []);
      setTodayCount(count ?? 0);
    };
    load();

    const channel = supabase
      .channel("dashboard-detections")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "detections" },
        (payload) => {
          const d = payload.new as Detection;
          setDetections((prev) => [d, ...prev].slice(0, 50));
          setTodayCount((c) => c + 1);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const onlineDevices = devices.filter((d) => d.status === "online").length;
  const highThreats = detections.filter((d) => d.threat_level === "high").length;

  // Top label
  const labelMap = new Map<string, number>();
  detections.forEach((d) => {
    if (d.primary_label) labelMap.set(d.primary_label, (labelMap.get(d.primary_label) ?? 0) + 1);
  });
  const topLabel =
    [...labelMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Chart: last 12h buckets
  const buckets: { time: string; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const h = subHours(new Date(), i);
    const label = format(h, "HH:00");
    buckets.push({ time: label, count: 0 });
  }
  detections.forEach((d) => {
    const dh = new Date(d.detected_at);
    const label = format(dh, "HH:00");
    const b = buckets.find((x) => x.time === label);
    if (b) b.count++;
  });

  return (
    <>
      <PageHeader
        title="Dashboard Monitoring"
        description="Ringkasan aktivitas deteksi intrusi & status perangkat lapangan."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Eye}
          label="Deteksi Hari Ini"
          value={todayCount}
          accent="primary"
        />
        <StatCard
          icon={AlertTriangle}
          label="Ancaman Tinggi"
          value={highThreats}
          accent="destructive"
        />
        <StatCard
          icon={Cpu}
          label="Perangkat Online"
          value={`${onlineDevices}/${devices.length}`}
          accent="success"
        />
        <StatCard
          icon={TrendingUp}
          label="Objek Terbanyak"
          value={topLabel}
          accent="primary"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold">Aktivitas Intrusi 12 Jam Terakhir</h2>
              <p className="text-xs text-muted-foreground">Real-time stream dari ESP32-CAM</p>
            </div>
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={buckets}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.85 0.22 150)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.85 0.22 150)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.04 160 / 0.3)" />
                <XAxis dataKey="time" stroke="oklch(0.68 0.04 155)" fontSize={11} />
                <YAxis stroke="oklch(0.68 0.04 155)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.025 160)",
                    border: "1px solid oklch(0.30 0.04 160 / 0.5)",
                    borderRadius: 8,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="oklch(0.85 0.22 150)"
                  strokeWidth={2}
                  fill="url(#g1)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Status Perangkat</h2>
          <div className="space-y-3 max-h-[280px] overflow-auto">
            {devices.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada perangkat. Tambahkan di menu Manajemen Perangkat.
              </p>
            )}
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/30 border border-border/40"
              >
                <div className="text-sm">{d.name}</div>
                <StatusDot status={d.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold mb-4">Deteksi Terbaru</h2>
        {detections.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada deteksi. Kirim payload ke endpoint ingest untuk mulai.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="py-2">Waktu</th>
                  <th>Objek</th>
                  <th>Confidence</th>
                  <th>Ancaman</th>
                </tr>
              </thead>
              <tbody>
                {detections.slice(0, 10).map((d) => (
                  <tr key={d.id} className="border-b border-border/20">
                    <td className="py-2.5 text-muted-foreground">
                      {format(new Date(d.detected_at), "dd MMM HH:mm:ss")}
                    </td>
                    <td className="font-medium">{d.primary_label ?? "unknown"}</td>
                    <td>
                      {d.max_confidence
                        ? `${(Number(d.max_confidence) * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                    <td>
                      <ThreatBadge level={d.threat_level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent: "primary" | "destructive" | "success";
}) {
  const accentMap = {
    primary: "text-primary",
    destructive: "text-destructive",
    success: "text-success",
  };
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </div>
          <div className={`text-2xl lg:text-3xl font-bold mt-1 ${accentMap[accent]}`}>
            {value}
          </div>
        </div>
        <div className={`h-10 w-10 rounded-lg bg-muted/40 flex items-center justify-center ${accentMap[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
