import { useLabScan } from "@/lib/labscan";

const NetworkMap = () => {
  const { state } = useLabScan();

  return (
    <div className="p-5 flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Network Map</h2>
        <p className="text-xs text-muted-foreground font-mono">{state.devices.length} discovered agents</p>
      </div>

      <div className="glass-panel flex-1 p-4 overflow-auto">
        {state.devices.length === 0 ? (
          <p className="text-xs text-muted-foreground">No topology data available from backend.</p>
        ) : (
          <div className="space-y-2">
            {state.devices.map((device) => (
              <div key={device.agent_id} className="border border-border/40 rounded-md p-3">
                <p className="text-sm text-foreground">{device.hostname}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{device.agent_id}</p>
                <p className="text-xs text-muted-foreground">IPs: {device.ips.join(", ") || "-"}</p>
                <p className="text-xs text-muted-foreground">Status: {device.status}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkMap;
