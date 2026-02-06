import { useMemo, useState } from "react";
import { formatSince, useLabScan } from "@/lib/labscan";
import { cn } from "@/lib/utils";

const nodeColor = (status: string) => {
  if (status === "offline") return "#ef4444";
  if (status === "scanning") return "#f59e0b";
  if (status === "idle") return "#22d3ee";
  return "#22c55e";
};

const boolGlyph = (value: boolean | null) => (value === null ? "?" : value ? "Y" : "N");

const NetworkMap = () => {
  const { state, focusedAgentId, setFocusedAgentId } = useLabScan();
  const [hoveredAgentId, setHoveredAgentId] = useState<string | undefined>();

  const topologyKey = useMemo(() => state.devices.map((d) => d.agent_id).join("|"), [state.devices]);

  const points = useMemo(() => {
    const radius = 180;
    const center = { x: 360, y: 240 };
    return state.devices.map((device, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, state.devices.length);
      return {
        device,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  }, [topologyKey]);

  const hoveredNode = points.find((point) => point.device.agent_id === hoveredAgentId)?.device;

  return (
    <div className="p-5 flex flex-col h-full overflow-x-hidden min-w-0">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Network Map</h2>
        <p className="text-xs text-muted-foreground font-mono">{state.devices.length} agents · deterministic stable topology</p>
      </div>

      <div className="glass-panel flex-1 p-4 min-w-0 overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_62%)]" />
        {state.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground relative z-10">No topology data available from backend.</p>
        ) : (
          <div className="relative z-10 h-full">
            <svg viewBox="0 0 760 500" className="w-full h-full">
              <defs>
                <linearGradient id="edgeGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#64748b" stopOpacity="0.2" />
                </linearGradient>
              </defs>

              <circle cx={360} cy={240} r={34} fill="#2563eb" opacity={0.95} />
              <circle cx={360} cy={240} r={42} fill="none" stroke="#38bdf8" strokeOpacity="0.35" strokeWidth={1.4} />
              <text x={360} y={245} textAnchor="middle" fontSize="11" fill="#fff">ADMIN</text>

              {points.map((point) => {
                const focused = focusedAgentId === point.device.agent_id || hoveredAgentId === point.device.agent_id;
                return (
                  <g key={point.device.agent_id}>
                    <line
                      x1={360}
                      y1={240}
                      x2={point.x}
                      y2={point.y}
                      stroke="url(#edgeGlow)"
                      strokeOpacity={focused ? 0.9 : 0.45}
                      strokeWidth={focused ? 1.6 : 1.1}
                    />
                  </g>
                );
              })}

              {points.map((point) => {
                const color = nodeColor(point.device.status);
                const focused = focusedAgentId === point.device.agent_id;

                return (
                  <g
                    key={point.device.agent_id}
                    onMouseEnter={() => setHoveredAgentId(point.device.agent_id)}
                    onMouseLeave={() => setHoveredAgentId(undefined)}
                    onClick={() => setFocusedAgentId(point.device.agent_id)}
                    className="cursor-pointer"
                  >
                    <circle cx={point.x} cy={point.y} r={22} fill={color} fillOpacity={0.2} />
                    <circle cx={point.x} cy={point.y} r={17} fill={color} fillOpacity={0.95} />
                    <circle cx={point.x} cy={point.y} r={21.5} fill="none" stroke={color} strokeOpacity={focused ? 1 : 0.5} strokeWidth={focused ? 2.4 : 1.4} />
                    <circle cx={point.x + 13} cy={point.y - 13} r={4.3} fill={color} stroke="#0f172a" strokeWidth={1} />
                    <text x={point.x} y={point.y + 4} textAnchor="middle" fontSize="9" fill="#fff" className="font-medium">
                      {point.device.hostname.slice(0, 7)}
                    </text>
                    <text x={point.x + 20} y={point.y - 3} fontSize="8" fill="#94a3b8">I:{boolGlyph(point.device.internet_reachable)}</text>
                    <text x={point.x + 20} y={point.y + 9} fontSize="8" fill="#94a3b8">D:{boolGlyph(point.device.dns_ok)}</text>
                  </g>
                );
              })}
            </svg>

            {hoveredNode && (
              <div className="absolute right-4 top-4 w-56 glass-panel p-3 text-xs">
                <p className="text-foreground font-medium">{hoveredNode.hostname}</p>
                <p className="text-muted-foreground font-mono mt-1">{hoveredNode.ips[0] ?? "-"}</p>
                <div className="mt-2 space-y-1 text-muted-foreground">
                  <p>Status: <span className={cn("uppercase", hoveredNode.status === "offline" ? "text-red" : "text-green")}>{hoveredNode.status}</span></p>
                  <p>Internet: {boolGlyph(hoveredNode.internet_reachable)}</p>
                  <p>DNS: {boolGlyph(hoveredNode.dns_ok)}</p>
                  <p>Last seen: {formatSince(hoveredNode.last_seen_ms)}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkMap;
