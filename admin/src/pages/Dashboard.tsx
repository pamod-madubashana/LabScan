import { Monitor, MonitorOff, Gauge, AlertTriangle } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SystemHealth } from "@/components/dashboard/SystemHealth";
import { ThreatSummary } from "@/components/dashboard/ThreatSummary";

const Dashboard = () => {
  return (
    <div className="p-5 space-y-5">
      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Active Clients"
          value={24}
          icon={Monitor}
          trend="+2 today"
          status="cyan"
          delay={0}
        />
        <MetricCard
          label="Offline Clients"
          value={6}
          icon={MonitorOff}
          trend="—"
          status="amber"
          delay={0.05}
        />
        <MetricCard
          label="Avg Latency"
          value="12ms"
          icon={Gauge}
          trend="↓ 3ms"
          status="green"
          delay={0.1}
        />
        <MetricCard
          label="Active Alerts"
          value={3}
          icon={AlertTriangle}
          trend="+1 new"
          status="red"
          delay={0.15}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* Activity feed - takes 2 cols */}
        <div className="col-span-2">
          <ActivityFeed />
        </div>
        {/* Right column */}
        <div className="space-y-4">
          <SystemHealth />
          <ThreatSummary />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
