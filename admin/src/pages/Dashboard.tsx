import { Monitor, MonitorOff, Gauge, AlertTriangle } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ThreatSummary } from "@/components/dashboard/ThreatSummary";
import { useLabScan } from "@/lib/labscan";

const Dashboard = () => {
  const { state } = useLabScan();

  const online = state.devices.filter((device) => device.status !== "offline").length;
  const offline = state.devices.filter((device) => device.status === "offline").length;
  const recentError = state.logs.find((entry) => entry.level === "ERROR");

  return (
    <div className="p-5 space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Active Clients"
          value={online}
          icon={Monitor}
          trend={state.server.online ? "live" : "server offline"}
          status="cyan"
          delay={0}
        />
        <MetricCard
          label="Offline Clients"
          value={offline}
          icon={MonitorOff}
          trend={state.devices.length === 0 ? "no devices" : undefined}
          status="amber"
          delay={0.05}
        />
        <MetricCard
          label="Running Tasks"
          value={state.tasks.filter((task) => task.status === "running").length}
          icon={Gauge}
          trend={`${state.tasks.length} total`}
          status="green"
          delay={0.1}
        />
        <MetricCard
          label="Active Alerts"
          value={state.logs.filter((entry) => entry.level === "ERROR").length}
          icon={AlertTriangle}
          trend={recentError ? "error events detected" : "none"}
          status="red"
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ActivityFeed />
        </div>
        <div className="space-y-4">
          <SystemHealth />
          <ThreatSummary />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
