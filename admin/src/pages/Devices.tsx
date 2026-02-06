import { useMemo, useState } from "react";
import { Monitor, Play, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatSince, useLabScan, type DeviceRecord } from "@/lib/labscan";

const statusStyle: Record<string, string> = {
  online: "text-green",
  idle: "text-cyan",
  scanning: "text-amber",
  offline: "text-red",
};

function boolBadge(value: boolean | null) {
  if (value === true) return "YES";
  if (value === false) return "NO";
  return "UNK";
}

const Devices = () => {
  const { state, startTask } = useLabScan();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return state.devices;
    return state.devices.filter((device) =>
      [device.hostname, device.agent_id, device.os, ...device.ips].join(" ").toLowerCase().includes(needle),
    );
  }, [search, state.devices]);

  const selectedAgentIds = Object.entries(selected)
    .filter(([, isSelected]) => isSelected)
    .map(([agentId]) => agentId);

  const runTask = async (kind: "ping" | "port_scan" | "arp_snapshot") => {
    if (selectedAgentIds.length === 0) return;
    const params =
      kind === "ping"
        ? { target: "8.8.8.8", timeout_ms: 1200 }
        : kind === "port_scan"
          ? { target: "127.0.0.1", ports: [22, 80, 443], timeout_ms: 600 }
          : {};
    await startTask(kind, selectedAgentIds, params);
  };

  const renderRow = (device: DeviceRecord) => (
    <tr key={device.agent_id} className="border-b border-border/20 hover:bg-accent/30 transition-colors">
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={Boolean(selected[device.agent_id])}
          onChange={(event) => setSelected((prev) => ({ ...prev, [device.agent_id]: event.target.checked }))}
        />
      </td>
      <td className="px-3 py-2 text-xs font-mono text-foreground">{device.hostname}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{device.ips.join(", ") || "-"}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{device.os}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{device.version}</td>
      <td className="px-3 py-2">
        <span className={cn("text-xs font-mono uppercase", statusStyle[device.status] ?? "text-muted-foreground")}>{device.status}</span>
      </td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{boolBadge(device.internet_reachable)}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{boolBadge(device.dns_ok)}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{device.latency_ms ?? "-"}</td>
      <td className="px-3 py-2 text-xs font-mono text-muted-foreground" title={new Date(device.last_seen_ms).toLocaleString()}>
        {formatSince(device.last_seen_ms)}
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => startTask("ping", [device.agent_id], { target: "1.1.1.1", timeout_ms: 1200 })}
          className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80"
        >
          <Play className="w-3 h-3" /> Ping
        </button>
      </td>
    </tr>
  );

  return (
    <div className="p-5 flex flex-col h-full gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Devices</h2>
          <p className="text-xs text-muted-foreground font-mono">
            {state.devices.length} agents · stable order by first seen · {selectedAgentIds.length} selected
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
          <button onClick={() => runTask("ping")} disabled={!selectedAgentIds.length} className="h-8 px-3 rounded-md bg-primary/10 border border-primary/20 text-xs text-primary disabled:opacity-40">Ping</button>
          <button onClick={() => runTask("port_scan")} disabled={!selectedAgentIds.length} className="h-8 px-3 rounded-md bg-amber/10 border border-amber/20 text-xs text-amber disabled:opacity-40">Port Scan</button>
          <button onClick={() => runTask("arp_snapshot")} disabled={!selectedAgentIds.length} className="h-8 px-3 rounded-md bg-cyan/10 border border-cyan/20 text-xs text-cyan disabled:opacity-40">ARP Snapshot</button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden flex-1">
        {state.devices.length === 0 ? (
          <div className="h-full min-h-[240px] grid place-items-center text-center p-6">
            <div>
              <p className="text-sm text-foreground">No devices connected</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">{state.server.online ? "Waiting for agents to register." : "Server offline."}</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                {[
                  "SEL",
                  "HOST",
                  "IPS",
                  "OS",
                  "VER",
                  "STATUS",
                  "INTERNET",
                  "DNS",
                  "LAT(ms)",
                  "LAST SEEN",
                  "QUICK",
                ].map((label) => (
                  <th key={label} className="px-3 py-2 text-left text-[10px] font-mono text-muted-foreground">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>{filtered.map(renderRow)}</tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
        <Monitor className="w-3.5 h-3.5" />
        Internet/DNS indicators are from agent probes; no simulated values.
      </div>
    </div>
  );
};

export default Devices;
