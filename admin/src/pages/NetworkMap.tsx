import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface NetworkNode {
  id: string;
  label: string;
  x: number;
  y: number;
  status: "online" | "idle" | "scanning" | "unreachable";
  type: "server" | "workstation" | "gateway" | "switch";
}

interface NetworkLink {
  from: string;
  to: string;
  active: boolean;
}

const nodes: NetworkNode[] = [
  { id: "gw", label: "proxy-gw", x: 400, y: 80, status: "online", type: "gateway" },
  { id: "fw", label: "edge-fw-01", x: 400, y: 180, status: "online", type: "switch" },
  { id: "db", label: "db-prod-01", x: 200, y: 300, status: "online", type: "server" },
  { id: "ws4", label: "ws-node-04", x: 350, y: 320, status: "scanning", type: "workstation" },
  { id: "ws7", label: "ws-node-07", x: 500, y: 280, status: "online", type: "workstation" },
  { id: "k8s", label: "k8s-master", x: 600, y: 340, status: "online", type: "server" },
  { id: "lin3", label: "lin-srv-03", x: 150, y: 420, status: "idle", type: "server" },
  { id: "lin8", label: "lin-srv-08", x: 280, y: 440, status: "unreachable", type: "server" },
  { id: "dns", label: "dns-internal", x: 450, y: 430, status: "idle", type: "server" },
  { id: "mail", label: "mail-srv", x: 580, y: 460, status: "online", type: "server" },
];

const links: NetworkLink[] = [
  { from: "gw", to: "fw", active: true },
  { from: "fw", to: "db", active: true },
  { from: "fw", to: "ws4", active: true },
  { from: "fw", to: "ws7", active: true },
  { from: "fw", to: "k8s", active: true },
  { from: "db", to: "lin3", active: false },
  { from: "db", to: "lin8", active: false },
  { from: "ws4", to: "dns", active: true },
  { from: "k8s", to: "mail", active: true },
  { from: "ws7", to: "dns", active: false },
];

const statusColors = {
  online: { fill: "hsl(155, 75%, 45%)", glow: "hsl(155, 75%, 45%)" },
  idle: { fill: "hsl(190, 95%, 45%)", glow: "hsl(190, 95%, 45%)" },
  scanning: { fill: "hsl(40, 90%, 55%)", glow: "hsl(40, 90%, 55%)" },
  unreachable: { fill: "hsl(0, 75%, 55%)", glow: "hsl(0, 75%, 55%)" },
};

const nodeById = (id: string) => nodes.find((n) => n.id === id)!;

const NetworkMap = () => {
  return (
    <div className="p-5 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Network Map</h2>
          <p className="text-xs text-muted-foreground font-mono">{nodes.length} nodes · {links.length} connections</p>
        </div>
        <div className="flex items-center gap-1">
          {[
            { icon: ZoomIn, label: "Zoom In" },
            { icon: ZoomOut, label: "Zoom Out" },
            { icon: Maximize2, label: "Fit View" },
            { icon: RotateCcw, label: "Reset" },
          ].map((tool) => (
            <Tooltip key={tool.label} delayDuration={0}>
              <TooltipTrigger asChild>
                <button className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                  <tool.icon className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="bg-card border-border text-foreground text-xs">{tool.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="glass-panel flex-1 overflow-hidden relative"
      >
        <svg viewBox="0 0 800 560" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            {/* Glow filter */}
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            {/* Active line animation */}
            <linearGradient id="activeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="hsl(190, 95%, 45%)" stopOpacity="0.1" />
              <stop offset="50%" stopColor="hsl(190, 95%, 45%)" stopOpacity="0.6" />
              <stop offset="100%" stopColor="hsl(190, 95%, 45%)" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Links */}
          {links.map((link, i) => {
            const from = nodeById(link.from);
            const to = nodeById(link.to);
            return (
              <line
                key={`${link.from}-${link.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke={link.active ? "hsl(190, 95%, 45%)" : "hsl(220, 15%, 20%)"}
                strokeWidth={link.active ? 1.5 : 1}
                strokeOpacity={link.active ? 0.4 : 0.2}
                strokeDasharray={link.active ? "none" : "4 4"}
              />
            );
          })}

          {/* Nodes */}
          {nodes.map((node) => {
            const colors = statusColors[node.status];
            return (
              <g key={node.id} className="cursor-pointer">
                {/* Glow ring */}
                {node.status === "online" || node.status === "scanning" ? (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={18}
                    fill="none"
                    stroke={colors.glow}
                    strokeWidth={1}
                    opacity={0.2}
                    filter="url(#glow)"
                  >
                    <animate
                      attributeName="r"
                      values="16;20;16"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.2;0.4;0.2"
                      dur="3s"
                      repeatCount="indefinite"
                    />
                  </circle>
                ) : null}

                {/* Node circle */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={8}
                  fill={colors.fill}
                  fillOpacity={0.15}
                  stroke={colors.fill}
                  strokeWidth={1.5}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={3}
                  fill={colors.fill}
                />

                {/* Label */}
                <text
                  x={node.x}
                  y={node.y + 22}
                  textAnchor="middle"
                  fill="hsl(210, 20%, 60%)"
                  fontSize={9}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-4 text-[10px] font-mono text-muted-foreground">
          {Object.entries(statusColors).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.fill }}
              />
              <span className="capitalize">{status}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default NetworkMap;
