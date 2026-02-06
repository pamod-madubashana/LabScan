import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatSince, useLabScan } from "@/lib/labscan";

const typeDots: Record<string, string> = {
  info: "bg-cyan",
  warning: "bg-amber",
  error: "bg-red",
  success: "bg-green",
};

export function ActivityFeed() {
  const { state } = useLabScan();
  const activities = state.activity.slice(0, 30).map((entry) => {
    const type = entry.kind.includes("failed") ? "error" : entry.kind.includes("disconnect") ? "warning" : "info";
    const suffix = entry.count && entry.count > 1 ? ` (x${entry.count})` : "";
    return { id: entry.id, time: formatSince(entry.ts), message: `${entry.message}${suffix}`, type };
  });

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
        {activities.length === 0 && <p className="text-xs text-muted-foreground">No recent activity</p>}
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
