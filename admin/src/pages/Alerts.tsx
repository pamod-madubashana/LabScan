import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Shield, AlertTriangle, Info, X, Clock, ExternalLink } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";

interface Alert {
  id: string;
  title: string;
  description: string;
  source: string;
  time: string;
  severity: Severity;
  acknowledged: boolean;
}

const severityConfig: Record<Severity, { icon: typeof Shield; color: string; bg: string; border: string; glow: string; label: string }> = {
  critical: { icon: Shield, color: "text-red", bg: "bg-red/5", border: "border-red/20", glow: "glow-red", label: "Critical" },
  high: { icon: AlertTriangle, color: "text-amber", bg: "bg-amber/5", border: "border-amber/20", glow: "glow-amber", label: "High" },
  medium: { icon: AlertTriangle, color: "text-cyan", bg: "bg-cyan/5", border: "border-cyan/20", glow: "", label: "Medium" },
  low: { icon: Info, color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border/30", glow: "", label: "Low" },
};

const alerts: Alert[] = [
  {
    id: "1",
    title: "Brute-force SSH Attack Detected",
    description: "Multiple failed SSH login attempts (47 in 5 minutes) detected from 192.168.1.105 targeting db-prod-01. Source IP has been temporarily blocked by firewall rule.",
    source: "db-prod-01",
    time: "3 minutes ago",
    severity: "critical",
    acknowledged: false,
  },
  {
    id: "2",
    title: "Unusual Outbound Traffic Spike",
    description: "Agent ws-node-04 reported 340% increase in outbound traffic over the last 15 minutes. Traffic is directed to external IP 203.0.113.42 on port 8443.",
    source: "ws-node-04",
    time: "12 minutes ago",
    severity: "high",
    acknowledged: false,
  },
  {
    id: "3",
    title: "TLS Certificate Expiring Soon",
    description: "The TLS certificate for proxy-gw.internal will expire in 7 days. Auto-renewal has not been configured for this endpoint.",
    source: "proxy-gw",
    time: "1 hour ago",
    severity: "medium",
    acknowledged: true,
  },
  {
    id: "4",
    title: "DNS Resolution Failures",
    description: "Internal DNS resolver failing intermittently for *.corp.local domains. Secondary resolver is handling 60% of queries. Investigation recommended.",
    source: "dns-internal",
    time: "2 hours ago",
    severity: "medium",
    acknowledged: false,
  },
  {
    id: "5",
    title: "Agent Version Outdated",
    description: "Agent on lin-srv-08 is running version 1.2.0 (latest: 1.4.2). Security patches and performance improvements are available.",
    source: "lin-srv-08",
    time: "3 hours ago",
    severity: "low",
    acknowledged: true,
  },
  {
    id: "6",
    title: "High Memory Usage Warning",
    description: "k8s-master memory usage at 71%, exceeding the 70% threshold. Kubernetes workloads may be affected if usage continues to climb.",
    source: "k8s-master",
    time: "4 hours ago",
    severity: "high",
    acknowledged: true,
  },
];

const Alerts = () => {
  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {alerts.filter((a) => !a.acknowledged).length} unacknowledged · {alerts.length} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
            const config = severityConfig[sev];
            const count = alerts.filter((a) => a.severity === sev).length;
            return (
              <div key={sev} className="flex items-center gap-1.5 text-xs">
                <span className={cn("w-2 h-2 rounded-full", config.color.replace("text-", "bg-"))} />
                <span className="text-muted-foreground font-mono">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {alerts.map((alert, i) => {
          const config = severityConfig[alert.severity];
          const IconComponent = config.icon;
          return (
            <motion.div
              key={alert.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "glass-panel border p-4 transition-all",
                config.border,
                alert.acknowledged ? "opacity-60" : config.glow
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", config.bg)}>
                  <IconComponent className={cn("w-4 h-4", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{alert.title}</h3>
                    <span className={cn("text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded", config.color, config.bg)}>
                      {config.label.toUpperCase()}
                    </span>
                    {alert.acknowledged && (
                      <span className="text-[9px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        ACK
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{alert.description}</p>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {alert.time}
                    </span>
                    <span>Source: {alert.source}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default Alerts;
