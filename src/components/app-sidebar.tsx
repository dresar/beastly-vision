import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Radio,
  History,
  BarChart3,
  Cpu,
  Bell,
  Settings,
  LogOut,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/live", label: "Live Monitoring", icon: Radio },
  { to: "/history", label: "Riwayat Deteksi", icon: History },
  { to: "/analytics", label: "Analitik", icon: BarChart3 },
  { to: "/devices", label: "Manajemen Perangkat", icon: Cpu },
  { to: "/notifications", label: "Notifikasi", icon: Bell },
  { to: "/settings", label: "Pengaturan", icon: Settings },
] as const;

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <aside className="hidden md:flex md:w-64 lg:w-72 flex-col border-r border-sidebar-border bg-sidebar h-screen sticky top-0">
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
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" /> Keluar
        </Button>
      </div>
    </aside>
  );
}
