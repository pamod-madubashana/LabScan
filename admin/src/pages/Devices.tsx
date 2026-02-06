import { useMemo, useState } from "react";
import { Monitor, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatSince, useLabScan } from "@/lib/labscan";

const statusStyle: Record<string, string> = {
  online: "text-green",
  idle: "text-cyan",
  scanning: "text-amber",
  unreachable: "text-red",
};

const Devices = () => {
  const { state, startTask } = useLabScan();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return state.devices;
    }

    return state.devices.filter((device) => {
      return (
        device.hostname.toLowerCase().includes(needle) ||
        device.agent_id.toLowerCase().includes(needle) ||
        device.ips.some((ip) => ip.includes(needle)) ||
        device.os.toLowerCase().includes(needle)
      );
    });
  }, [search, state.devices]);

  const selectedAgentIds = Object.entries(selected)
    .filter(([, isSelected]) => isSelected)
    .map(([agentId]) => agentId);

  const runTask = async (kind: "ping" | "port_scan" | "arp_snapshot") => {
    if (selectedAgentIds.length === 0) {
      return;
    }

    const defaultParams =
      kind === "ping"
        ? { target: "8.8.8.8", timeout_ms: 1200 }
        : kind === "port_scan"
          ? { target: "127.0.0.1", ports: [22, 80, 443], timeout_ms: 600 }
          : {};

    await startTask(kind, selectedAgentIds, defaultParams);
  };

  return (
    <div className="p-5 flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Devices</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {state.devices.length} agents discovered, {selectedAgentIds.length} selected
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search hostname, IP, OS"
              className="pl-8 h-8 w-64 bg-muted/50 border-border/50 text-xs font-mono"
            />
          </div>

          <button
            onClick={() => runTask("ping")}
            disabled={selectedAgentIds.length === 0}
            className="h-8 px-3 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary disabled:opacity-40"
          >
            Ping
          </button>
          <button
            onClick={() => runTask("port_scan")}
            disabled={selectedAgentIds.length === 0}
            className="h-8 px-3 rounded-md bg-amber/10 border border-amber/20 text-xs text-amber disabled:opacity-40"
          >
            Port Scan
          </button>
          <button
            onClick={() => runTask("arp_snapshot")}
            disabled={selectedAgentIds.length === 0}
            className="h-8 px-3 rounded-md bg-cyan/10 border border-cyan/20 text-xs text-cyan disabled:opacity-40"
          >
            ARP Snapshot
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden flex-1">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/50">
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">SEL</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">HOST</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">IPS</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">OS</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">STATUS</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">LAST SEEN</th>
              <th className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">QUICK</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((device) => (
              <tr key={device.agent_id} className="border-b border-border/20 hover:bg-accent/30 transition-colors">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[device.agent_id])}
                    onChange={(event) =>
                      setSelected((prev) => ({
                        ...prev,
                        [device.agent_id]: event.target.checked,
                      }))
                    }
                  />
                </td>
                <td className="px-3 py-2 text-xs font-mono text-foreground">{device.hostname}</td>
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{device.ips.join(", ") || "-"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{device.os}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-xs font-mono uppercase", statusStyle[device.status] ?? "text-muted-foreground")}>
                    {device.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{formatSince(device.last_seen)}</td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => startTask("ping", [device.agent_id], { target: "1.1.1.1", timeout_ms: 1200 })}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
                  >
                    <Play className="w-3 h-3" /> Ping
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
        <Monitor className="w-3.5 h-3.5" />
        Agent control is restricted to network scan jobs only. Remote command execution is disabled.
      </div>
    </div>
  );
};

export default Devices;
