import { motion } from "framer-motion";
import { useLabScan } from "@/lib/labscan";

export function SystemHealth() {
  const { state } = useLabScan();

  const connected = state.devices.filter((device) => device.status !== "offline").length;
  const offline = state.devices.filter((device) => device.status === "offline").length;
  const runningTasks = state.tasks.filter((task) => task.status === "running").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.25 }}
      className="glass-panel p-4"
    >
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Server Health</h3>
      <div className="space-y-2 text-xs font-mono">
        <p className="text-foreground">WS: 0.0.0.0:{state.server.port_ws}</p>
        <p className="text-foreground">UDP: {state.server.port_udp}</p>
        <p className="text-foreground">Connected agents: {connected}</p>
        <p className="text-foreground">Offline agents: {offline}</p>
        <p className="text-foreground">Running tasks: {runningTasks}</p>
      </div>
    </motion.div>
  );
}
