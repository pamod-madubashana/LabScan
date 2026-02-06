import { useLabScan } from "@/lib/labscan";

const Alerts = () => {
  const { state } = useLabScan();
  const alerts = state.logs.filter((entry) => entry.level === "ERROR" || entry.level === "WARN");

  return (
    <div className="p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">Alerts</h2>
        <p className="text-xs text-muted-foreground font-mono">{alerts.length} active alerts from backend events</p>
      </div>

      <div className="space-y-3">
        {alerts.length === 0 && <div className="glass-panel p-5 text-xs text-muted-foreground">No active alerts.</div>}
        {alerts.map((alert) => (
          <div key={alert.id} className="glass-panel border p-4 border-border/40">
            <p className="text-sm text-foreground">{alert.message}</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-1">
              {alert.level} · <span className="selectable">{alert.agent_id ?? "server"}</span> · {new Date(alert.ts).toLocaleString()}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Alerts;
