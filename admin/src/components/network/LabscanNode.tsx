import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Globe, Router, Shield, ShieldCheck, SquareStack, Unplug } from "lucide-react";
import { cn } from "@/lib/utils";

type NodeData = {
  label: string;
  nodeType: "gateway" | "admin" | "host" | "switch" | "subnet" | "unknown_hub";
  ip?: string;
  status?: "online" | "idle" | "scanning" | "offline";
  internet?: boolean | null;
  dns?: boolean | null;
  interfaceType?: string | null;
  subnet?: string | null;
  lastSeenMs?: number;
  attachedCount?: number | null;
  handleCount?: number;
  selected?: boolean;
  onHover?: (id?: string) => void;
  onSelect?: (id: string) => void;
};

const statusColor: Record<string, string> = {
  online: "bg-green",
  idle: "bg-cyan",
  scanning: "bg-amber",
  offline: "bg-red",
};

function boolColor(value?: boolean | null) {
  if (value === true) return "text-green";
  if (value === false) return "text-red";
  return "text-muted-foreground";
}

function LabscanNodeComponent({ id, data }: NodeProps<NodeData>) {
  const color = statusColor[data.status ?? "online"] ?? "bg-slate-500";
  const offline = data.status === "offline";
  const isAdmin = data.nodeType === "admin";
  const isGateway = data.nodeType === "gateway";
  const isHub = data.nodeType === "unknown_hub" || data.nodeType === "switch";
  const isGatewayLike = isGateway || isHub;
  const isSubnet = data.nodeType === "subnet";
  const hasSourceHandle = data.nodeType !== "subnet";
  const sizeClass = isGateway ? "w-20 h-20" : isSubnet ? "w-28 h-10 rounded-md" : "w-16 h-16";
  const labelText = isAdmin ? "ADMIN" : isGateway ? "GW" : isHub ? "HUB" : isSubnet ? "SUBNET" : data.label.slice(0, 8);
  const gatewayHandleCount = Math.min(32, Math.max(8, data.handleCount ?? 16));
  const hiddenHandleStyle = { width: 10, height: 10, opacity: 0, pointerEvents: "none" as const };

  const gatewayHandles = Array.from({ length: gatewayHandleCount }, (_, i) => {
    const pct = ((i + 0.5) / gatewayHandleCount) * 100;
    return (
      <Handle
        key={`gw-t-${i}`}
        id={`t-${i}`}
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5"
        style={{ ...hiddenHandleStyle, top: `${pct}%` }}
      />
    );
  });

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => data.onHover?.(id)}
      onMouseLeave={() => data.onHover?.(undefined)}
      onClick={() => data.onSelect?.(id)}
    >
      <div
        className={cn(
          "relative overflow-visible rounded-full border border-white/10 bg-card/80 shadow-[0_0_22px_rgba(56,189,248,0.15)]",
          sizeClass,
          "flex items-center justify-center backdrop-blur-sm transition-all",
          data.selected && "ring-2 ring-cyan/70 shadow-[0_0_28px_rgba(56,189,248,0.32)]",
          isSubnet && "rounded-md border-dashed",
          offline && "opacity-65 saturate-50",
        )}
      >
        {isGatewayLike ? (
          gatewayHandles
        ) : (
          <Handle id="t-0" type="target" position={Position.Left} className="!w-2.5 !h-2.5" style={hiddenHandleStyle} />
        )}
        {hasSourceHandle && <Handle id="s-0" type="source" position={Position.Right} className="!w-2.5 !h-2.5" style={hiddenHandleStyle} />}

        <div
          className={cn(
            "absolute inset-2 rounded-full opacity-45",
            isGateway ? "bg-emerald-400/35" : isAdmin ? "bg-blue/40" : isHub ? "bg-amber-300/35" : isSubnet ? "bg-slate-500/20 rounded-sm" : "bg-cyan/25",
          )}
        />
        {!isSubnet && <div className={cn("absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-black/30", color)} />}

        {isGateway && <Router className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 text-emerald-300" />}
        {isAdmin && <Shield className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 text-sky-300" />}
        {isHub && <SquareStack className="absolute top-1 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-300" />}
        {data.nodeType === "unknown_hub" && <Unplug className="absolute bottom-1 right-1 w-3 h-3 text-amber-300" />}

        {data.nodeType === "host" && (
          <div className="absolute right-1 top-3 flex flex-col gap-0.5">
            <span className={cn("inline-flex w-3.5 h-3.5 rounded-full bg-black/35 border border-border/60 items-center justify-center", boolColor(data.internet))}>
              <Globe className="w-2 h-2" />
            </span>
            <span className={cn("inline-flex w-3.5 h-3.5 rounded-full bg-black/35 border border-border/60 items-center justify-center", boolColor(data.dns))}>
              <ShieldCheck className="w-2 h-2" />
            </span>
          </div>
        )}

        <span className="relative z-10 text-[11px] font-mono text-foreground text-center px-1">
          {labelText}
        </span>
      </div>

      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 text-center min-w-0 w-[120px]">
        <p className="text-[10px] text-foreground truncate">{data.label}</p>
        {(isGateway || isHub) && <p className="text-[9px] text-muted-foreground">{data.attachedCount ?? 0} attached</p>}
      </div>
    </div>
  );
}

export const LabscanNode = memo(LabscanNodeComponent);
