import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cpu, Plus, Copy, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusDot } from "@/components/threat-badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export const Route = createFileRoute("/devices")({
  component: () => (
    <DashboardLayout>
      <Devices />
    </DashboardLayout>
  ),
});

interface Device {
  id: string;
  name: string;
  location: string | null;
  status: string;
  last_seen: string | null;
  api_key: string;
}

import { getDevicesFn, addDeviceFn, removeDeviceFn } from "@/lib/api";

function Devices() {
  const { isAdmin } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  const load = async () => {
    const data = await getDevicesFn();
    setDevices(data as Device[]);
  };

  useEffect(() => {
    load();
    // For demo purposes, we'll poll every 10 seconds
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const addDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDeviceFn({ data: { name, location } });
      toast.success("Perangkat ditambahkan");
      setOpen(false);
      setName("");
      setLocation("");
      load();
    } catch (error: any) {
      toast.error("Gagal menambah perangkat", { description: error.message });
    }
  };

  const removeDevice = async (id: string) => {
    if (!confirm("Hapus perangkat ini?")) return;
    try {
      await removeDeviceFn({ data: { id } });
      toast.success("Perangkat dihapus");
      load();
    } catch (error: any) {
      toast.error("Gagal menghapus perangkat", { description: error.message });
    }
  };

  return (
    <>
      <PageHeader
        title="Manajemen Perangkat"
        description="Daftar ESP32-CAM yang terhubung. Gunakan API key untuk autentikasi ingest."
        action={
          isAdmin && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="glow-primary">
                  <Plus className="h-4 w-4 mr-2" /> Tambah Perangkat
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Perangkat Baru</DialogTitle>
                </DialogHeader>
                <form onSubmit={addDevice} className="space-y-4">
                  <div>
                    <Label>Nama</Label>
                    <Input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ESP32-CAM Hutan-A"
                    />
                  </div>
                  <div>
                    <Label>Lokasi</Label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Pos pengamatan utara"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Simpan
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          )
        }
      />

      {devices.length === 0 ? (
        <Card className="p-12 text-center">
          <Cpu className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">
            Belum ada perangkat terdaftar. {isAdmin ? "Klik tombol di atas untuk menambah." : "Hubungi admin untuk menambahkan."}
          </p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                    <Cpu className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.location ?? "—"}</div>
                  </div>
                </div>
                <StatusDot status={d.status} />
              </div>
              <div className="text-xs text-muted-foreground mb-3">
                Last seen:{" "}
                {d.last_seen ? format(new Date(d.last_seen), "dd MMM HH:mm") : "—"}
              </div>
              <div className="p-2 rounded bg-muted/40 border border-border/40 flex items-center justify-between gap-2">
                <code className="text-[10px] font-mono truncate text-primary">
                  {d.api_key}
                </code>
                <button
                  className="text-muted-foreground hover:text-primary"
                  onClick={() => {
                    navigator.clipboard.writeText(d.api_key);
                    toast.success("API key disalin");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeDevice(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Hapus
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
