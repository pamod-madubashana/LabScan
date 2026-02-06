import { useState } from "react";
import { useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  Monitor,
  Network,
  ListTodo,
  ScrollText,
  AlertTriangle,
  Settings,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Devices", icon: Monitor, path: "/devices" },
  { label: "Network Map", icon: Network, path: "/network" },
  { label: "Tasks / Jobs", icon: ListTodo, path: "/tasks" },
  { label: "Logs", icon: ScrollText, path: "/logs" },
  { label: "Alerts", icon: AlertTriangle, path: "/alerts" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function Sidebar() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-border/50 bg-sidebar transition-all duration-300 relative",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border/50">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 glow-cyan">
          <Shield className="w-4.5 h-4.5 text-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-foreground tracking-wide">LabScan</span>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">Admin</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 custom-scrollbar overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const linkContent = (
            <Link
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 group relative",
                isActive
                  ? "text-primary bg-primary/[0.08] sidebar-active-bar"
                  : "text-sidebar-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <item.icon
                className={cn(
                  "w-[18px] h-[18px] flex-shrink-0 transition-colors",
                  isActive ? "text-primary" : "text-sidebar-foreground group-hover:text-foreground"
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.path} delayDuration={0}>
                <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                <TooltipContent side="right" className="bg-card border-border text-foreground">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          }

          return <div key={item.path}>{linkContent}</div>;
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-10 border-t border-border/50 text-muted-foreground hover:text-foreground transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
