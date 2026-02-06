import { useMemo } from "react";
import { useLabScan } from "@/lib/labscan";

const nodeColor = (status: string) => {
  if (status === "offline") return "#ef4444";
  if (status === "scanning") return "#f59e0b";
  if (status === "idle") return "#22d3ee";
  return "#22c55e";
};

const badge = (value: boolean | null) => (value === null ? "?" : value ? "Y" : "N");

const NetworkMap = () => {
  const { state } = useLabScan();

  const points = useMemo(() => {
    const radius = 180;
    const center = { x: 320, y: 230 };
    return state.devices.map((device, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, state.devices.length);
      return {
        device,
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      };
    });
  }, [state.devices]);

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Network Map</h2>
        <p className="text-xs text-muted-foreground font-mono">{state.devices.length} agents · layout changes only on add/remove</p>
      </div>

      <div className="glass-panel flex-1 p-4 overflow-auto">
        {state.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No topology data available from backend.</p>
        ) : (
          <svg width={700} height={460} className="max-w-full">
            <circle cx={320} cy={230} r={26} fill="#2563eb" opacity={0.9} />
            <text x={320} y={235} textAnchor="middle" fontSize="11" fill="#fff">ADMIN</text>

            {points.map((point) => (
              <g key={point.device.agent_id}>
                <line x1={320} y1={230} x2={point.x} y2={point.y} stroke="#334155" strokeWidth={1.2} />
                <circle cx={point.x} cy={point.y} r={18} fill={nodeColor(point.device.status)} opacity={0.9} />
                <text x={point.x} y={point.y + 3} textAnchor="middle" fontSize="9" fill="#fff">
                  {point.device.hostname.slice(0, 6)}
                </text>
                <text x={point.x + 22} y={point.y - 7} fontSize="9" fill="#94a3b8">I:{badge(point.device.internet_reachable)}</text>
                <text x={point.x + 22} y={point.y + 7} fontSize="9" fill="#94a3b8">D:{badge(point.device.dns_ok)}</text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  );
};

export default NetworkMap;
