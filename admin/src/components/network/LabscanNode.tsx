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
  const isSubnet = data.nodeType === "subnet";
  const sizeClass = isGateway ? "w-20 h-20" : isSubnet ? "w-28 h-10 rounded-md" : "w-16 h-16";
  const labelText = isAdmin ? "ADMIN" : isGateway ? "GW" : isHub ? "HUB" : isSubnet ? "SUBNET" : data.label.slice(0, 8);

  return (
    <div
      className="relative min-w-0"
      onMouseEnter={() => data.onHover?.(id)}
      onMouseLeave={() => data.onHover?.(undefined)}
      onClick={() => data.onSelect?.(id)}
    >
      <Handle type="target" position={Position.Left} className="opacity-0 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="opacity-0 !w-2 !h-2" />

      <div
        className={cn(
          "relative rounded-full border border-white/10 bg-card/80 shadow-[0_0_22px_rgba(56,189,248,0.15)]",
          sizeClass,
          "flex items-center justify-center backdrop-blur-sm transition-all",
          data.selected && "ring-2 ring-cyan/70 shadow-[0_0_28px_rgba(56,189,248,0.32)]",
          isSubnet && "rounded-md border-dashed",
          offline && "opacity-65 saturate-50",
        )}
      >
        <div
          className={cn(
            "absolute inset-2 rounded-full opacity-45",
            isGateway ? "bg-emerald-400/35" : isAdmin ? "bg-blue/40" : isHub ? "bg-amber-300/35" : isSubnet ? "bg-slate-500/20 rounded-sm" : "bg-cyan/25",
          )}
        />
        {!isSubnet && <div className={cn("absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-black/30", color)} />}

        {isGateway && <Router className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-emerald-300" />}
        {isAdmin && <Shield className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-sky-300" />}
        {isHub && <SquareStack className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-amber-300" />}
        {data.nodeType === "unknown_hub" && <Unplug className="absolute -bottom-2 right-1 w-3 h-3 text-amber-300" />}

        {data.nodeType === "host" && (
          <div className="absolute -right-2 top-6 flex flex-col gap-1">
            <span className={cn("inline-flex w-4 h-4 rounded-full bg-black/35 border border-border/60 items-center justify-center", boolColor(data.internet))}>
              <Globe className="w-2.5 h-2.5" />
            </span>
            <span className={cn("inline-flex w-4 h-4 rounded-full bg-black/35 border border-border/60 items-center justify-center", boolColor(data.dns))}>
              <ShieldCheck className="w-2.5 h-2.5" />
            </span>
          </div>
        )}

        <span className="relative z-10 text-[11px] font-mono text-foreground text-center px-1">
          {labelText}
        </span>
      </div>

      <div className="mt-1.5 text-center min-w-0 max-w-[120px]">
        <p className="text-[10px] text-foreground truncate">{data.label}</p>
        {(isGateway || isHub) && <p className="text-[9px] text-muted-foreground">{data.attachedCount ?? 0} attached</p>}
      </div>
    </div>
  );
}

export const LabscanNode = memo(LabscanNodeComponent);
