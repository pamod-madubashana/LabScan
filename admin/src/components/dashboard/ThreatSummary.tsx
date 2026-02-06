import { motion } from "framer-motion";
import { useLabScan } from "@/lib/labscan";

export function ThreatSummary() {
  const { state } = useLabScan();

  const errors = state.logs.filter((entry) => entry.level === "ERROR").slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.35 }}
      className="glass-panel p-4"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active Alerts</h3>
      <div className="space-y-2">
        {errors.length === 0 && <p className="text-xs text-muted-foreground">No active alerts from backend events.</p>}
        {errors.map((entry) => (
          <div key={entry.id} className="bg-red/10 border border-red/20 rounded-md p-2">
            <p className="text-xs text-foreground">{entry.message}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{entry.agent_id ?? "server"}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
