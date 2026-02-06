import { Activity, Clock, Server, Wifi } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatSince, useLabScan } from "@/lib/labscan";

export function TopStatusBar() {
  const { state, ready } = useLabScan();

  const onlineAgents = state.devices.filter((device) => device.status !== "offline").length;
  const lastLog = state.logs[0];

  return (
    <header className="flex items-center justify-between h-11 px-4 border-b border-border/50 bg-card/40 backdrop-blur-sm">
      <div className="flex items-center gap-5">
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Server className="w-3.5 h-3.5 text-muted-foreground" />
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${state.server.online ? "bg-green pulse-dot" : "bg-amber"}`} />
                <span className={`font-medium font-mono ${state.server.online ? "text-green" : "text-amber"}`}>
                  {state.server.online ? "ONLINE" : ready ? "OFFLINE" : "STARTING"}
                </span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            Server {state.server.online ? "online" : "offline"} on ws:{state.server.port_ws} udp:{state.server.port_udp}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border" />

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground font-mono">
                <span className="text-primary font-semibold">{onlineAgents}</span>
                <span className="text-muted-foreground"> / {state.devices.length} online</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            {state.devices.filter((device) => device.status !== "offline").length} currently connected websocket sessions
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border" />

        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-mono">
                Last event: <span className="text-foreground">{lastLog ? formatSince(lastLog.ts) : "-"}</span>
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="bg-card border-border text-foreground">
            {lastLog ? lastLog.message : "No events yet"}
          </TooltipContent>
        </Tooltip>

        <div className="w-px h-4 bg-border" />

        <div className="flex items-center gap-2 text-xs">
          <Activity className="w-3.5 h-3.5 text-primary animate-glow-pulse" />
          <span className="text-muted-foreground font-mono">Live</span>
        </div>
      </div>

      <div className="flex items-center gap-3 min-w-0 pl-3 border-l border-border/40">
        <div className="text-right leading-tight min-w-0 max-w-[260px]">
          <p className="text-xs text-foreground">LabScan Admin</p>
          <a
            href="mailto:contact@pamod.is-a.dev"
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline transition-colors truncate block"
          >
            Contact: contact@pamod.is-a.dev
          </a>
        </div>
      </div>
    </header>
  );
}
