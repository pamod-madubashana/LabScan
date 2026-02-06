import { useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import { formatSince, useLabScan, type DeviceRecord } from "@/lib/labscan";
import { LabscanNode } from "./LabscanNode";

const nodeTypes: NodeTypes = {
  labscanNode: LabscanNode,
};

function ipNum(ip?: string): number | null {
  if (!ip) return null;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function compareByNumericIp(a: DeviceRecord, b: DeviceRecord): number {
  const aVal = ipNum(a.ips[0]);
  const bVal = ipNum(b.ips[0]);
  if (aVal === null && bVal !== null) return 1;
  if (aVal !== null && bVal === null) return -1;
  if (aVal !== null && bVal !== null && aVal !== bVal) return aVal - bVal;
  const hostCmp = a.hostname.localeCompare(b.hostname);
  if (hostCmp !== 0) return hostCmp;
  return a.agent_id.localeCompare(b.agent_id);
}

export function NetworkMapFlow() {
  const { state, focusedAgentId, setFocusedAgentId } = useLabScan();
  const [hoveredId, setHoveredId] = useState<string | undefined>();

  const sortedDevices = useMemo(() => [...state.devices].sort(compareByNumericIp), [state.devices]);
  const topologyKey = useMemo(() => sortedDevices.map((d) => d.agent_id).join("|"), [sortedDevices]);

  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const lastTopologyKeyRef = useRef("");

  if (lastTopologyKeyRef.current !== topologyKey) {
    const nextPositions: Record<string, { x: number; y: number }> = { admin: { x: 360, y: 250 } };
    const radius = 220;
    sortedDevices.forEach((device, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, sortedDevices.length) - Math.PI / 2;
      nextPositions[device.agent_id] = {
        x: 360 + Math.cos(angle) * radius,
        y: 250 + Math.sin(angle) * radius,
      };
    });
    positionsRef.current = nextPositions;
    lastTopologyKeyRef.current = topologyKey;
  }

  const nodes: Node[] = useMemo(() => {
    const base: Node[] = [
      {
        id: "admin",
        type: "labscanNode",
        position: positionsRef.current.admin ?? { x: 360, y: 250 },
        data: {
          label: "LabScan Admin",
          isAdmin: true,
          selected: focusedAgentId === "admin",
          onHover: setHoveredId,
          onSelect: setFocusedAgentId,
        },
      },
    ];

    sortedDevices.forEach((device) => {
      base.push({
        id: device.agent_id,
        type: "labscanNode",
        position: positionsRef.current[device.agent_id] ?? { x: 360, y: 250 },
        data: {
          label: device.hostname,
          ip: device.ips[0],
          status: device.status,
          internet: device.internet_reachable,
          dns: device.dns_ok,
          selected: focusedAgentId === device.agent_id,
          onHover: setHoveredId,
          onSelect: setFocusedAgentId,
        },
      });
    });

    return base;
  }, [sortedDevices, focusedAgentId, setFocusedAgentId]);

  const edges: Edge[] = useMemo(() => {
    return sortedDevices.map((device) => {
      const highlighted = hoveredId === device.agent_id || focusedAgentId === device.agent_id;
      return {
        id: `admin-${device.agent_id}`,
        source: "admin",
        target: device.agent_id,
        type: "smoothstep",
        style: {
          stroke: highlighted ? "#38bdf8" : "#334155",
          strokeOpacity: highlighted ? 0.95 : 0.45,
          strokeWidth: highlighted ? 2 : 1.2,
        },
      };
    });
  }, [sortedDevices, hoveredId, focusedAgentId]);

  const hoveredDevice = state.devices.find((device) => device.agent_id === hoveredId);

  return (
    <div className="relative h-full min-h-[520px] w-full rounded-lg border border-border/50 bg-card/40 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_62%)]" />
      <ReactFlow
        fitView
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        minZoom={0.5}
        maxZoom={1.6}
        className="bg-transparent"
      >
        <Background variant={1} gap={24} size={1.1} color="rgba(148,163,184,0.20)" />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          className="!bg-card/80 !border !border-border/60 !rounded-md"
          maskColor="rgba(2,6,23,0.65)"
        />
        <Controls className="!bg-card/80 !border !border-border/60 !rounded-md" showInteractive={false} />
      </ReactFlow>

      {hoveredDevice && (
        <div className="absolute right-4 top-4 w-64 glass-panel p-3 text-xs">
          <p className="text-foreground font-semibold">{hoveredDevice.hostname}</p>
          <p className="text-muted-foreground font-mono mt-0.5">{hoveredDevice.ips[0] ?? "-"}</p>
          <div className="mt-2 space-y-1 text-muted-foreground">
            <p>Status: <span className="uppercase text-foreground">{hoveredDevice.status}</span></p>
            <p>Internet: {hoveredDevice.internet_reachable === null ? "Unknown" : hoveredDevice.internet_reachable ? "Reachable" : "Down"}</p>
            <p>DNS: {hoveredDevice.dns_ok === null ? "Unknown" : hoveredDevice.dns_ok ? "OK" : "Fail"}</p>
            <p>Last seen: {formatSince(hoveredDevice.last_seen_ms)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
