import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  time: string;
  message: string;
  type: "info" | "warning" | "error" | "success";
}

const typeColors = {
  info: "text-cyan",
  warning: "text-amber",
  error: "text-red",
  success: "text-green",
};

const typeDots = {
  info: "bg-cyan",
  warning: "bg-amber",
  error: "bg-red",
  success: "bg-green",
};

const activities: ActivityItem[] = [
  { id: "1", time: "14:32:18", message: "Network scan completed — 24 hosts discovered", type: "success" },
  { id: "2", time: "14:31:05", message: "Agent ws-node-07 reconnected after timeout", type: "warning" },
  { id: "3", time: "14:28:44", message: "Port scan initiated on subnet 10.0.2.0/24", type: "info" },
  { id: "4", time: "14:25:12", message: "Alert: Unauthorized SSH attempt on db-prod-01", type: "error" },
  { id: "5", time: "14:22:33", message: "Agent lin-srv-03 heartbeat restored", type: "success" },
  { id: "6", time: "14:20:01", message: "Scheduled vulnerability scan queued for 3 targets", type: "info" },
  { id: "7", time: "14:18:47", message: "Certificate expiry warning: proxy-gw.internal (7 days)", type: "warning" },
  { id: "8", time: "14:15:22", message: "Firewall rule change detected on edge-fw-01", type: "warning" },
];

export function ActivityFeed() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3 }}
      className="glass-panel p-4 h-full"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Recent Activity
      </h3>
      <div className="space-y-0 custom-scrollbar overflow-y-auto max-h-[340px]">
        {activities.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: 0.05 * i }}
            className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0 group hover:bg-accent/30 px-2 -mx-2 rounded transition-colors"
          >
            <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0", typeDots[item.type])} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-foreground/90 leading-relaxed">{item.message}</p>
              <span className="text-[10px] font-mono text-muted-foreground">{item.time}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
