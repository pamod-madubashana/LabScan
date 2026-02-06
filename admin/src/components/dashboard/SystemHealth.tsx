import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SystemHealthItem {
  label: string;
  value: number;
  max: number;
  unit: string;
  status: "cyan" | "green" | "amber" | "red";
}

const healthData: SystemHealthItem[] = [
  { label: "CPU Usage", value: 34, max: 100, unit: "%", status: "green" },
  { label: "Memory", value: 6.2, max: 16, unit: "GB", status: "cyan" },
  { label: "Disk I/O", value: 128, max: 500, unit: "MB/s", status: "green" },
  { label: "Network", value: 847, max: 1000, unit: "Mbps", status: "amber" },
];

const barColors = {
  cyan: "bg-cyan",
  green: "bg-green",
  amber: "bg-amber",
  red: "bg-red",
};

const barGlows = {
  cyan: "shadow-[0_0_8px_hsl(190_95%_45%/0.3)]",
  green: "shadow-[0_0_8px_hsl(155_75%_45%/0.3)]",
  amber: "shadow-[0_0_8px_hsl(40_90%_55%/0.3)]",
  red: "shadow-[0_0_8px_hsl(0_75%_55%/0.3)]",
};

export function SystemHealth() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="glass-panel p-4"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
        Server Health
      </h3>
      <div className="space-y-4">
        {healthData.map((item) => {
          const pct = (item.value / item.max) * 100;
          return (
            <div key={item.label}>
              <div className="flex justify-between items-baseline mb-1.5">
                <span className="text-xs text-foreground/80">{item.label}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {item.value} <span className="text-muted-foreground/60">{item.unit}</span>
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                  className={cn("h-full rounded-full", barColors[item.status], barGlows[item.status])}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
