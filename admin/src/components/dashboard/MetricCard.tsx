import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  status?: "cyan" | "green" | "amber" | "red";
  delay?: number;
}

const statusStyles = {
  cyan: {
    iconBg: "bg-cyan/10",
    iconColor: "text-cyan",
    glow: "glow-cyan",
    valueBg: "text-cyan",
  },
  green: {
    iconBg: "bg-green/10",
    iconColor: "text-green",
    glow: "glow-green",
    valueBg: "text-green",
  },
  amber: {
    iconBg: "bg-amber/10",
    iconColor: "text-amber",
    glow: "glow-amber",
    valueBg: "text-amber",
  },
  red: {
    iconBg: "bg-red/10",
    iconColor: "text-red",
    glow: "glow-red",
    valueBg: "text-red",
  },
};

export function MetricCard({ label, value, icon: Icon, trend, status = "cyan", delay = 0 }: MetricCardProps) {
  const styles = statusStyles[status];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="glass-panel p-4 group hover:border-white/[0.1] transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center", styles.iconBg, styles.glow)}>
          <Icon className={cn("w-4.5 h-4.5", styles.iconColor)} />
        </div>
        {trend && (
          <span className="text-[10px] font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-accent">
            {trend}
          </span>
        )}
      </div>
      <div className={cn("text-2xl font-semibold font-mono tracking-tight", styles.valueBg)}>
        {value}
      </div>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}
