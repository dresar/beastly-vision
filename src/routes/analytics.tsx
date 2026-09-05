import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { getDetectionsFn } from "@/lib/api";

export const Route = createFileRoute("/analytics")({
  component: () => (
    <DashboardLayout>
      <Analytics />
    </DashboardLayout>
  ),
});

interface Det {
  primary_label: string | null;
  detected_at: string;
  threat_level: string;
}

const COLORS = [
  "oklch(0.85 0.22 150)",
  "oklch(0.75 0.18 200)",
  "oklch(0.78 0.18 75)",
  "oklch(0.70 0.22 320)",
  "oklch(0.65 0.25 25)",
];

function Analytics() {
  const [data, setData] = useState<Det[]>([]);

  useEffect(() => {
    getDetectionsFn().then((res) => setData(res as Det[]));
  }, []);

  // Distribution
  const labelMap = new Map<string, number>();
  data.forEach((d) => {
    const k = d.primary_label ?? "unknown";
    labelMap.set(k, (labelMap.get(k) ?? 0) + 1);
  });
  const distribution = [...labelMap.entries()].map(([name, value]) => ({ name, value }));

  // By hour of day (most rawan)
  const hourBuckets = Array.from({ length: 24 }, (_, h) => ({
    hour: `${h.toString().padStart(2, "0")}:00`,
    count: 0,
  }));
  data.forEach((d) => {
    const h = new Date(d.detected_at).getHours();
    hourBuckets[h].count++;
  });

  // Trend last 7 days
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push({ date: d.toISOString().slice(5, 10), count: 0 });
  }
  data.forEach((d) => {
    const dd = new Date(d.detected_at);
    dd.setHours(0, 0, 0, 0);
    const key = dd.toISOString().slice(5, 10);
    const b = days.find((x) => x.date === key);
    if (b) b.count++;
  });

  return (
    <>
      <PageHeader
        title="Analitik"
        description="Tren intrusi, distribusi objek, dan jam paling rawan."
      />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">Tren Deteksi 7 Hari</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={days}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.04 160 / 0.3)" />
                <XAxis dataKey="date" stroke="oklch(0.68 0.04 155)" fontSize={11} />
                <YAxis stroke="oklch(0.68 0.04 155)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.025 160)",
                    border: "1px solid oklch(0.30 0.04 160 / 0.5)",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill="oklch(0.85 0.22 150)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-semibold mb-4">Distribusi Jenis Objek</h2>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={distribution}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={4}
                >
                  {distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.025 160)",
                    border: "1px solid oklch(0.30 0.04 160 / 0.5)",
                    borderRadius: 8,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
            {distribution.map((d, i) => (
              <div key={d.name} className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: COLORS[i % COLORS.length] }}
                />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="font-semibold mb-4">Jam Paling Rawan Intrusi</h2>
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.04 160 / 0.3)" />
              <XAxis dataKey="hour" stroke="oklch(0.68 0.04 155)" fontSize={10} interval={1} />
              <YAxis stroke="oklch(0.68 0.04 155)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.20 0.025 160)",
                  border: "1px solid oklch(0.30 0.04 160 / 0.5)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="count" fill="oklch(0.78 0.18 75)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </>
  );
}
