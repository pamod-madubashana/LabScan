import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Search,
  Filter,
  Monitor,
  X,
  Play,
  Radio,
  Moon,
  Power,
  Unplug,
  Terminal,
  Info,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type DeviceStatus = "online" | "idle" | "scanning" | "unreachable";

interface Device {
  id: string;
  hostname: string;
  ip: string;
  os: string;
  status: DeviceStatus;
  lastHeartbeat: string;
  cpu: number;
  mem: number;
}

const statusConfig: Record<DeviceStatus, { dot: string; label: string; textColor: string }> = {
  online: { dot: "bg-green pulse-dot", label: "Online", textColor: "text-green" },
  idle: { dot: "bg-cyan", label: "Idle", textColor: "text-cyan" },
  scanning: { dot: "bg-amber pulse-dot", label: "Scanning", textColor: "text-amber" },
  unreachable: { dot: "bg-red", label: "Unreachable", textColor: "text-red" },
};

const devices: Device[] = [
  { id: "1", hostname: "db-prod-01", ip: "10.0.1.10", os: "Ubuntu 22.04", status: "online", lastHeartbeat: "10s ago", cpu: 45, mem: 62 },
  { id: "2", hostname: "ws-node-04", ip: "10.0.1.24", os: "Windows Server 2022", status: "scanning", lastHeartbeat: "5s ago", cpu: 78, mem: 55 },
  { id: "3", hostname: "proxy-gw", ip: "10.0.0.1", os: "Debian 12", status: "online", lastHeartbeat: "3s ago", cpu: 12, mem: 34 },
  { id: "4", hostname: "lin-srv-03", ip: "10.0.2.15", os: "CentOS 9", status: "idle", lastHeartbeat: "30s ago", cpu: 5, mem: 28 },
  { id: "5", hostname: "ws-node-07", ip: "10.0.1.37", os: "Windows 11 Pro", status: "online", lastHeartbeat: "8s ago", cpu: 32, mem: 44 },
  { id: "6", hostname: "edge-fw-01", ip: "10.0.0.254", os: "pfSense 2.7", status: "online", lastHeartbeat: "2s ago", cpu: 18, mem: 22 },
  { id: "7", hostname: "lin-srv-08", ip: "10.0.2.48", os: "Ubuntu 20.04", status: "unreachable", lastHeartbeat: "5m ago", cpu: 0, mem: 0 },
  { id: "8", hostname: "k8s-master", ip: "10.0.3.1", os: "Ubuntu 22.04", status: "online", lastHeartbeat: "1s ago", cpu: 56, mem: 71 },
  { id: "9", hostname: "dns-internal", ip: "10.0.0.53", os: "Alpine Linux", status: "idle", lastHeartbeat: "45s ago", cpu: 3, mem: 15 },
  { id: "10", hostname: "mail-srv", ip: "10.0.1.25", os: "Debian 11", status: "online", lastHeartbeat: "4s ago", cpu: 22, mem: 38 },
];

const Devices = () => {
  const [search, setSearch] = useState("");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const filteredDevices = devices.filter(
    (d) =>
      d.hostname.toLowerCase().includes(search.toLowerCase()) ||
      d.ip.includes(search) ||
      d.os.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full">
      {/* Main table area */}
      <div className="flex-1 flex flex-col min-w-0 p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Devices</h2>
            <p className="text-xs text-muted-foreground font-mono">{devices.length} agents registered</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search devices..."
                className="pl-8 h-8 w-56 bg-muted/50 border-border/50 text-xs font-mono"
              />
            </div>
            <button className="h-8 px-3 rounded-md bg-muted/50 border border-border/50 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Filter className="w-3 h-3" />
              Filter
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="glass-panel overflow-hidden flex-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
                  Hostname
                </th>
                <th className="text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
                  IP Address
                </th>
                <th className="text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
                  OS
                </th>
                <th className="text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
                  Status
                </th>
                <th className="text-left text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider px-4 py-2.5">
                  Heartbeat
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.map((device, i) => {
                const status = statusConfig[device.status];
                const isSelected = selectedDevice?.id === device.id;
                return (
                  <motion.tr
                    key={device.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setSelectedDevice(device)}
                    className={cn(
                      "border-b border-border/20 cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/[0.06]"
                        : "hover:bg-accent/30"
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Monitor className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-mono text-foreground">{device.hostname}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground">{device.ip}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">{device.os}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-1.5 h-1.5 rounded-full", status.dot)} />
                        <span className={cn("text-xs font-mono", status.textColor)}>{status.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground">{device.lastHeartbeat}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selectedDevice && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="border-l border-border/50 bg-card/60 backdrop-blur-xl overflow-hidden flex-shrink-0"
          >
            <div className="w-[340px] p-4 h-full overflow-y-auto custom-scrollbar">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground font-mono">{selectedDevice.hostname}</span>
                </div>
                <button
                  onClick={() => setSelectedDevice(null)}
                  className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Status badge */}
              <div className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono mb-4",
                statusConfig[selectedDevice.status].textColor,
                "bg-accent"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig[selectedDevice.status].dot)} />
                {statusConfig[selectedDevice.status].label}
              </div>

              {/* System Info */}
              <div className="space-y-3 mb-5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="w-3 h-3" />
                  System Info
                </h4>
                <div className="space-y-2">
                  {[
                    { label: "IP Address", value: selectedDevice.ip },
                    { label: "Operating System", value: selectedDevice.os },
                    { label: "CPU Usage", value: `${selectedDevice.cpu}%` },
                    { label: "Memory Usage", value: `${selectedDevice.mem}%` },
                    { label: "Agent Version", value: "v1.4.2" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-center py-1.5 border-b border-border/20">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-mono text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Running Tasks */}
              <div className="mb-5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Clock className="w-3 h-3" />
                  Running Tasks
                </h4>
                <div className="space-y-1.5">
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2.5 py-2 font-mono">
                    <span className="text-amber">● </span>Port scan in progress (67%)
                  </div>
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2.5 py-2 font-mono">
                    <span className="text-green">● </span>Heartbeat monitor active
                  </div>
                </div>
              </div>

              {/* Recent Logs */}
              <div className="mb-5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Terminal className="w-3 h-3" />
                  Recent Logs
                </h4>
                <div className="bg-background/80 rounded border border-border/30 p-2 space-y-1 font-mono text-[10px] max-h-32 overflow-y-auto custom-scrollbar">
                  <p><span className="text-muted-foreground">14:32:18</span> <span className="text-green">[INFO]</span> Scan completed</p>
                  <p><span className="text-muted-foreground">14:31:05</span> <span className="text-cyan">[DEBUG]</span> Heartbeat sent</p>
                  <p><span className="text-muted-foreground">14:28:44</span> <span className="text-amber">[WARN]</span> High latency detected</p>
                  <p><span className="text-muted-foreground">14:25:12</span> <span className="text-green">[INFO]</span> Agent updated</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div>
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Actions
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { icon: Play, label: "Scan", color: "text-cyan hover:bg-cyan/10" },
                    { icon: Radio, label: "Ping", color: "text-green hover:bg-green/10" },
                    { icon: Moon, label: "Sleep", color: "text-amber hover:bg-amber/10" },
                    { icon: Power, label: "Wake", color: "text-green hover:bg-green/10" },
                    { icon: Unplug, label: "Disconnect", color: "text-red hover:bg-red/10" },
                  ].map((action) => (
                    <Tooltip key={action.label} delayDuration={0}>
                      <TooltipTrigger asChild>
                        <button
                          className={cn(
                            "w-9 h-9 rounded-md border border-border/50 flex items-center justify-center transition-colors",
                            action.color
                          )}
                        >
                          <action.icon className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-card border-border text-foreground text-xs">
                        {action.label}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Devices;
