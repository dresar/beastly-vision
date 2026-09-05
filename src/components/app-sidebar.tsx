import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Radio,
  History,
  BarChart3,
  Settings,
  LogOut,
  Shield,
  Brain,
  Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const PYTHON_API_BASE =
  (import.meta.env.VITE_PYTHON_AI_URL as string | undefined) ||
  "http://localhost:8000";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/live", label: "Live Monitoring", icon: Radio },
  { to: "/history", label: "Riwayat Deteksi", icon: History },
  { to: "/analytics", label: "Analitik", icon: BarChart3 },
  { to: "/ml", label: "ML Deteksi", icon: Brain },
  { to: "/training", label: "Training Center", icon: Dumbbell },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

interface AppSidebarProps {
  isMobile?: boolean;
}

export function AppSidebar({ isMobile }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const [deviceOnline, setDeviceOnline] = useState<boolean | null>(null);
  const [bridgeConnected, setBridgeConnected] = useState<boolean>(false);
  const prevOnlineRef = useRef<boolean | null>(null);
  const lastOfflineToastAtRef = useRef<number>(0);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  useEffect(() => {
    const tick = async () => {
      let nowOnline = false;
      let nowBridge = false;
      try {
        const res = await fetch(`${PYTHON_API_BASE}/mqtt/status`);
        if (res.ok) {
          const data = await res.json();
          nowOnline = Boolean(data?.device_online);
          nowBridge = Boolean(data?.connected);
        }
      } catch {
        nowOnline = false;
        nowBridge = false;
      }

      setDeviceOnline(nowOnline);
      setBridgeConnected(nowBridge);

      const prev = prevOnlineRef.current;
      const now = Date.now();

      if (prev === null) {
        prevOnlineRef.current = nowOnline;
        if (!nowOnline) {
          toast.error("Alat offline");
          lastOfflineToastAtRef.current = now;
        }
        return;
      }

      if (nowOnline && prev !== true) {
        toast.success("Alat online");
        lastOfflineToastAtRef.current = 0;
      } else if (!nowOnline) {
        if (prev === true) {
          toast.error("Alat offline");
          lastOfflineToastAtRef.current = now;
        } else if (now - lastOfflineToastAtRef.current >= 10000) {
          toast.error("Alat masih offline");
          lastOfflineToastAtRef.current = now;
        }
      }

      prevOnlineRef.current = nowOnline;
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  const content = (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="p-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center glow-primary">
          <Shield className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <div className="font-semibold text-sidebar-foreground tracking-tight text-glow">
            WildGuard
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            IoT × YOLOv8
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all",
                active
                  ? "bg-sidebar-accent text-primary border-l-2 border-primary text-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-primary",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="px-3 py-2 rounded-md bg-sidebar-accent/40">
          <div className="text-xs text-muted-foreground">Logged in as</div>
          <div className="text-sm font-medium truncate">{user?.email}</div>
          <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wide">
            {isAdmin ? "admin" : "viewer"}
          </div>
          <div className="mt-2 space-y-1">
            <div
              className={cn(
                "text-[10px] inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border uppercase tracking-wide",
                bridgeConnected
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", bridgeConnected ? "bg-primary animate-pulse" : "bg-destructive")} />
              MQTT {bridgeConnected ? "connected" : "disconnected"}
            </div>
            <div
              className={cn(
                "text-[10px] inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded border uppercase tracking-wide",
                deviceOnline
                  ? "border-green-500/40 bg-green-500/10 text-green-600"
                  : "border-destructive/30 bg-destructive/10 text-destructive",
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", deviceOnline ? "bg-green-500 animate-pulse" : "bg-destructive")} />
              Alat {deviceOnline ? "online" : "offline"}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" /> Keluar
        </Button>
      </div>
    </div>
  );

  if (isMobile) return content;

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
      {content}
    </aside>
  );
}
