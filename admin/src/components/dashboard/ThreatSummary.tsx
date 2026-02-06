import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type Severity = "critical" | "high" | "medium" | "low";

interface ThreatItem {
  id: string;
  title: string;
  source: string;
  time: string;
  severity: Severity;
}

const severityConfig: Record<Severity, { bg: string; text: string; dot: string; label: string }> = {
  critical: { bg: "bg-red/10", text: "text-red", dot: "bg-red pulse-dot", label: "CRIT" },
  high: { bg: "bg-amber/10", text: "text-amber", dot: "bg-amber", label: "HIGH" },
  medium: { bg: "bg-cyan/10", text: "text-cyan", dot: "bg-cyan", label: "MED" },
  low: { bg: "bg-muted", text: "text-muted-foreground", dot: "bg-muted-foreground", label: "LOW" },
};

const threats: ThreatItem[] = [
  { id: "1", title: "Brute-force SSH detected", source: "db-prod-01", time: "3m ago", severity: "critical" },
  { id: "2", title: "Unusual outbound traffic spike", source: "ws-node-04", time: "12m ago", severity: "high" },
  { id: "3", title: "TLS cert expiring soon", source: "proxy-gw", time: "1h ago", severity: "medium" },
  { id: "4", title: "Agent version outdated", source: "lin-srv-08", time: "2h ago", severity: "low" },
];

export function ThreatSummary() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.35 }}
      className="glass-panel p-4"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Active Threats
      </h3>
      <div className="space-y-2">
        {threats.map((threat) => {
          const config = severityConfig[threat.severity];
          return (
            <div
              key={threat.id}
              className={cn(
                "flex items-center gap-3 p-2.5 rounded-md border border-transparent hover:border-border/50 transition-all cursor-pointer",
                config.bg
              )}
            >
              <div className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", config.dot)} />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{threat.title}</p>
                <p className="text-[10px] font-mono text-muted-foreground">{threat.source} · {threat.time}</p>
              </div>
              <span className={cn("text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded", config.text, config.bg)}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
