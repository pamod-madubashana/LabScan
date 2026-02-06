import { Activity, Clock, Server, User, Wifi } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TopStatusBar() {
  return (
    <header className="flex items-center justify-between h-11 px-4 border-b border-border/50 bg-card/40 backdrop-blur-sm">
      {/* Left: Status indicators */}
      <div className="flex items-center gap-5">
        {/* Server Status */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green pulse-dot" />
                <span className="text-green font-medium font-mono">ONLINE</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            Server Status: All systems operational
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-4 bg-border" />

        {/* Connected Clients */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground font-mono">
                <span className="text-primary font-semibold">24</span>
                <span className="text-muted-foreground"> clients</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            24 of 30 agents connected
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-4 bg-border" />

        {/* Last Scan */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-mono">
                Last scan: <span className="text-foreground">2m ago</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            Last network scan completed at 14:32:18
          </TooltipContent>
        </Tooltip>

        {/* Separator */}
        <div className="w-px h-4 bg-border" />

        {/* Real-time indicator */}
        <div className="flex items-center gap-2 text-xs">
          <Activity className="w-3.5 h-3.5 text-primary animate-glow-pulse" />
          <span className="text-muted-foreground font-mono">Live</span>
        </div>
      </div>

      {/* Right: Profile */}
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-xs font-medium text-foreground">admin@labscan.io</p>
          <p className="text-[10px] text-muted-foreground font-mono">Super Admin</p>
        </div>
        <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
          <User className="w-3.5 h-3.5 text-primary" />
        </div>
      </div>
    </header>
  );
}
