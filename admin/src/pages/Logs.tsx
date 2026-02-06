import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, ArrowDown, Pause, Play, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
}

const levelColors: Record<LogLevel, string> = {
  INFO: "text-green",
  WARN: "text-amber",
  ERROR: "text-red",
  DEBUG: "text-cyan",
};

const logEntries: LogEntry[] = [
  { id: "1", timestamp: "2025-02-06 14:32:18.445", level: "INFO", source: "scanner", message: "Network scan completed — 24 hosts discovered on subnet 10.0.1.0/24" },
  { id: "2", timestamp: "2025-02-06 14:31:05.112", level: "WARN", source: "agent-mgr", message: "Agent ws-node-07 reconnected after 45s timeout (retry #2)" },
  { id: "3", timestamp: "2025-02-06 14:28:44.889", level: "DEBUG", source: "task-svc", message: "Port scan task queued: target=10.0.2.0/24, ports=1-65535, threads=128" },
  { id: "4", timestamp: "2025-02-06 14:25:12.003", level: "ERROR", source: "auth", message: "Unauthorized SSH attempt detected on db-prod-01 from 192.168.1.105 (blocked)" },
  { id: "5", timestamp: "2025-02-06 14:22:33.774", level: "INFO", source: "heartbeat", message: "Agent lin-srv-03 heartbeat restored after 2m15s gap" },
  { id: "6", timestamp: "2025-02-06 14:20:01.551", level: "DEBUG", source: "scheduler", message: "Scheduled vulnerability scan queued for 3 targets: k8s-master, db-prod-01, proxy-gw" },
  { id: "7", timestamp: "2025-02-06 14:18:47.220", level: "WARN", source: "cert-mon", message: "Certificate expiry warning: proxy-gw.internal expires in 7 days (SHA-256: 4a:bc:...)" },
  { id: "8", timestamp: "2025-02-06 14:15:22.901", level: "WARN", source: "fw-monitor", message: "Firewall rule change detected on edge-fw-01: rule #47 modified (outbound 443)" },
  { id: "9", timestamp: "2025-02-06 14:12:05.667", level: "INFO", source: "agent-mgr", message: "Agent mail-srv registered successfully (version 1.4.2, OS: Debian 11)" },
  { id: "10", timestamp: "2025-02-06 14:10:33.440", level: "ERROR", source: "dns", message: "DNS resolution failure for internal.corp.local — fallback to secondary resolver" },
  { id: "11", timestamp: "2025-02-06 14:08:11.215", level: "DEBUG", source: "metrics", message: "Metric collection cycle #4821 complete: 10 agents, 47 data points ingested" },
  { id: "12", timestamp: "2025-02-06 14:05:49.887", level: "INFO", source: "scanner", message: "Vulnerability scan started: CVE database v2025.02.06, 245,118 signatures loaded" },
  { id: "13", timestamp: "2025-02-06 14:03:22.112", level: "WARN", source: "perf", message: "High memory usage on k8s-master: 71% (threshold: 70%) — monitoring escalated" },
  { id: "14", timestamp: "2025-02-06 14:01:00.001", level: "INFO", source: "system", message: "LabScan Admin server started — listening on 0.0.0.0:8443 (TLS 1.3)" },
];

const Logs = () => {
  const [search, setSearch] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [activeFilters, setActiveFilters] = useState<LogLevel[]>(["INFO", "WARN", "ERROR", "DEBUG"]);

  const toggleFilter = (level: LogLevel) => {
    setActiveFilters((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : [...prev, level]
    );
  };

  const filteredLogs = logEntries.filter(
    (log) =>
      activeFilters.includes(log.level) &&
      (log.message.toLowerCase().includes(search.toLowerCase()) ||
        log.source.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Logs</h2>
          <p className="text-xs text-muted-foreground font-mono">{filteredLogs.length} entries</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Level filters */}
          <div className="flex items-center gap-1 mr-2">
            {(["INFO", "WARN", "ERROR", "DEBUG"] as LogLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => toggleFilter(level)}
                className={cn(
                  "px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all border",
                  activeFilters.includes(level)
                    ? cn(levelColors[level], "border-current/20 bg-current/5")
                    : "text-muted-foreground/40 border-transparent"
                )}
              >
                {level}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter logs..."
              className="pl-8 h-8 w-56 bg-muted/50 border-border/50 text-xs font-mono"
            />
          </div>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              "h-8 w-8 rounded-md border border-border/50 flex items-center justify-center transition-colors",
              autoScroll ? "text-primary bg-primary/10" : "text-muted-foreground"
            )}
          >
            {autoScroll ? <ArrowDown className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Terminal-style log viewer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-panel flex-1 overflow-hidden"
      >
        <div className="h-full overflow-y-auto custom-scrollbar p-3 font-mono text-[11px] space-y-0">
          {filteredLogs.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.02 }}
              className="flex gap-3 py-1 px-2 -mx-2 rounded hover:bg-accent/30 transition-colors group"
            >
              <span className="text-muted-foreground/60 flex-shrink-0 w-[185px]">{log.timestamp}</span>
              <span className={cn("w-[42px] flex-shrink-0 font-semibold", levelColors[log.level])}>
                {log.level}
              </span>
              <span className="text-muted-foreground flex-shrink-0 w-[80px] truncate">[{log.source}]</span>
              <span className="text-foreground/80 group-hover:text-foreground transition-colors">{log.message}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Logs;
