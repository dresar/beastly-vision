import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThreatBadge } from "@/components/threat-badge";


export const Route = createFileRoute("/history")({
  component: () => (
    <DashboardLayout>
      <History />
    </DashboardLayout>
  ),
});

interface Detection {
  id: string;
  primary_label: string | null;
  threat_level: string;
  detected_at: string;
  max_confidence: number | null;
  image_url: string | null;
  device_id: string | null;
}

import { getDetectionsFn } from "@/lib/api";

function History() {
  const [data, setData] = useState<Detection[]>([]);
  const [search, setSearch] = useState("");
  const [threat, setThreat] = useState<string>("all");
  const [minConf, setMinConf] = useState<string>("0");

  useEffect(() => {
    getDetectionsFn().then((res) => setData(res as unknown as Detection[]));
  }, []);

  const filtered = useMemo(() => {
    const conf = parseFloat(minConf) || 0;
    return data.filter((d) => {
      if (threat !== "all" && d.threat_level !== threat) return false;
      if ((d.max_confidence ?? 0) * 100 < conf) return false;
      if (search && !(d.primary_label ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, search, threat, minConf]);

  return (
    <>
      <PageHeader
        title="Riwayat Deteksi"
        description="Arsip seluruh kejadian intrusi yang tercatat di sistem."
      />

      <Card className="p-4 mb-6">
        <div className="grid sm:grid-cols-3 gap-3">
          <Input
            placeholder="Cari label objek…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={threat} onValueChange={setThreat}>
            <SelectTrigger>
              <SelectValue placeholder="Tingkat ancaman" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua ancaman</SelectItem>
              <SelectItem value="high">Tinggi</SelectItem>
              <SelectItem value="medium">Sedang</SelectItem>
              <SelectItem value="low">Rendah</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            placeholder="Min. confidence (%)"
            value={minConf}
            onChange={(e) => setMinConf(e.target.value)}
          />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground bg-muted/30">
              <tr>
                <th className="py-3 px-4">Snapshot</th>
                <th>Waktu</th>
                <th>Label</th>
                <th>Confidence</th>
                <th>Ancaman</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted-foreground">
                    Tidak ada data yang cocok dengan filter.
                  </td>
                </tr>
              )}
              {filtered.map((d) => (
                <tr key={d.id} className="border-t border-border/30 hover:bg-muted/20">
                  <td className="py-2 px-4">
                    {d.image_url ? (
                      <img src={d.image_url} alt="" className="h-12 w-16 rounded object-cover" />
                    ) : (
                      <div className="h-12 w-16 rounded bg-muted" />
                    )}
                  </td>
                  <td className="text-muted-foreground">
                    {format(new Date(d.detected_at), "dd MMM yyyy HH:mm:ss")}
                  </td>
                  <td className="font-medium">{d.primary_label ?? "unknown"}</td>
                  <td>
                    {d.max_confidence
                      ? `${(Number(d.max_confidence) * 100).toFixed(1)}%`
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
      </Card>
    </>
  );
}
