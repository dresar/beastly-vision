import { cn } from "@/lib/utils";

export function ThreatBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    high: "bg-destructive/20 text-destructive border-destructive/40",
    medium: "bg-warning/20 text-warning border-warning/40",
    low: "bg-success/20 text-success border-success/40",
  };
  const cls = map[level] ?? map.low;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border font-semibold",
        cls,
      )}
    >
      {level}
    </span>
  );
}

export function StatusDot({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          online ? "bg-success animate-pulse" : "bg-muted-foreground/50",
        )}
      />
      <span className={cn(online ? "text-success" : "text-muted-foreground")}>
        {status}
      </span>
    </span>
  );
}
