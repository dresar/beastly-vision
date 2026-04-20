import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { format } from "date-fns";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getNotificationsFn } from "@/lib/api";

export const Route = createFileRoute("/notifications")({
  component: () => (
    <DashboardLayout>
      <Notifications />
    </DashboardLayout>
  ),
});

interface Notif {
  id: string;
  title: string;
  message: string;
  severity: string;
  is_read: boolean;
  created_at: string;
}

function Notifications() {
  const [items, setItems] = useState<Notif[]>([]);

  useEffect(() => {
    getNotificationsFn().then((res) => setItems(res as unknown as Notif[]));
    
    // For demo purposes, we'll poll every 10 seconds
    const interval = setInterval(() => {
      getNotificationsFn().then((res) => setItems(res as unknown as Notif[]));
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const sevColor = (s: string) =>
    s === "high"
      ? "text-destructive border-destructive/40 bg-destructive/10"
      : s === "medium"
        ? "text-warning border-warning/40 bg-warning/10"
        : "text-primary border-primary/40 bg-primary/10";

  return (
    <>
      <PageHeader
        title="Notifikasi"
        description="Riwayat alert sistem terhadap deteksi ancaman."
      />

      {items.length === 0 ? (
        <Card className="p-12 text-center">
          <Bell className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
          <p className="text-sm text-muted-foreground">Belum ada notifikasi.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((n) => (
            <Card
              key={n.id}
              className={cn(
                "p-4 flex gap-4 items-start border-l-4",
                n.severity === "high"
                  ? "border-l-destructive"
                  : n.severity === "medium"
                    ? "border-l-warning"
                    : "border-l-primary",
              )}
            >
              <div className={cn("h-9 w-9 rounded-md flex items-center justify-center border", sevColor(n.severity))}>
                <BellRing className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <div className="font-semibold">{n.title}</div>
                  <span
                    className={cn(
                      "text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border",
                      sevColor(n.severity),
                    )}
                  >
                    {n.severity}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">{n.message}</div>
                <div className="text-[10px] text-muted-foreground mt-2">
                  {format(new Date(n.created_at), "dd MMM yyyy HH:mm:ss")}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
