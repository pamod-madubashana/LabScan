import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Shield, Bell, Network, Database, Key, Globe, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface SettingsSection {
  title: string;
  icon: typeof Shield;
  items: { label: string; description: string; type: "toggle" | "link"; value?: boolean }[];
}

const sections: SettingsSection[] = [
  {
    title: "Security",
    icon: Shield,
    items: [
      { label: "Auto-block brute force", description: "Automatically block IPs after 5 failed auth attempts", type: "toggle", value: true },
      { label: "TLS enforcement", description: "Require TLS 1.3 for all agent connections", type: "toggle", value: true },
      { label: "Certificate management", description: "Manage server and agent certificates", type: "link" },
    ],
  },
  {
    title: "Notifications",
    icon: Bell,
    items: [
      { label: "Critical alerts", description: "Push notifications for critical severity events", type: "toggle", value: true },
      { label: "Agent status changes", description: "Notify when agents go offline or reconnect", type: "toggle", value: true },
      { label: "Scan completions", description: "Alert when scheduled scans finish", type: "toggle", value: false },
    ],
  },
  {
    title: "Network",
    icon: Network,
    items: [
      { label: "Auto-discovery", description: "Automatically discover new devices on monitored subnets", type: "toggle", value: true },
      { label: "Heartbeat interval", description: "Configure agent heartbeat frequency (default: 30s)", type: "link" },
      { label: "Scan profiles", description: "Manage scan configurations and schedules", type: "link" },
    ],
  },
  {
    title: "Data & Storage",
    icon: Database,
    items: [
      { label: "Log retention", description: "Configure log retention period (default: 90 days)", type: "link" },
      { label: "Auto-backup", description: "Daily automated backup of scan results and configs", type: "toggle", value: true },
      { label: "Export data", description: "Export logs, reports, and scan results", type: "link" },
    ],
  },
  {
    title: "API & Integrations",
    icon: Key,
    items: [
      { label: "REST API", description: "Enable external API access to LabScan data", type: "toggle", value: false },
      { label: "Webhook endpoints", description: "Configure webhook destinations for events", type: "link" },
      { label: "SIEM integration", description: "Forward logs to external SIEM platforms", type: "link" },
    ],
  },
];

const Settings = () => {
  return (
    <div className="p-5 max-w-3xl">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <p className="text-xs text-muted-foreground font-mono">Server configuration and preferences</p>
      </div>

      <div className="space-y-5">
        {sections.map((section, si) => (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: si * 0.05 }}
            className="glass-panel overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border/30">
              <section.icon className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">{section.title}</span>
            </div>
            <div className="divide-y divide-border/20">
              {section.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-4 py-3 hover:bg-accent/20 transition-colors cursor-pointer"
                >
                  <div>
                    <p className="text-sm text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                  {item.type === "toggle" ? (
                    <Switch defaultChecked={item.value} className="data-[state=checked]:bg-primary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Settings;
