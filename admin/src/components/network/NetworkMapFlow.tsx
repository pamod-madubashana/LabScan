import { useMemo, useRef, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, type Edge, type EdgeTypes, type Node, type NodeTypes } from "reactflow";
import { BackgroundVariant } from "reactflow";
import "reactflow/dist/style.css";
import { formatSince, useLabScan } from "@/lib/labscan";
import { LabscanNode } from "./LabscanNode";
import { LabscanOrthogonalEdge } from "./LabscanOrthogonalEdge";

const nodeTypes: NodeTypes = {
  labscanNode: LabscanNode,
};

const edgeTypes: EdgeTypes = {
  labscanOrthogonal: LabscanOrthogonalEdge,
};

function ipToNumber(ip?: string | null): number | null {
  if (!ip) return null;
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function compareNodeIdsByIpLike(a: string, b: string): number {
  const aIp = a.startsWith("gw:") ? a.slice(3) : null;
  const bIp = b.startsWith("gw:") ? b.slice(3) : null;
  const aNum = ipToNumber(aIp ?? a);
  const bNum = ipToNumber(bIp ?? b);
  if (aNum === null && bNum !== null) return 1;
  if (aNum !== null && bNum === null) return -1;
  if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
  return a.localeCompare(b);
}

function compareByNumericIp(a?: string | null, b?: string | null): number {
  const aNum = ipToNumber(a);
  const bNum = ipToNumber(b);
  if (aNum === null && bNum !== null) return 1;
  if (aNum !== null && bNum === null) return -1;
  if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function edgeLabelFromIp(ip?: string | null): string | undefined {
  if (!ip) return undefined;
  const parts = ip.split(".");
  if (parts.length !== 4) return undefined;
  return parts[3];
}

export function NetworkMapFlow() {
  const { state, focusedAgentId, setFocusedAgentId } = useLabScan();
  const [hoveredId, setHoveredId] = useState<string | undefined>();

  const devicesByAgent = useMemo(() => new Map(state.devices.map((d) => [d.agent_id, d])), [state.devices]);
  const topology = state.topology;
  const topologyKey = `rev:${topology.revision}`;

  const nodeById = useMemo(() => new Map(topology.nodes.map((node) => [node.id, node])), [topology.nodes]);
  const hostIpByNodeId = useMemo(() => {
    const map = new Map<string, string | undefined>();
    for (const node of topology.nodes) {
      if (!node.agent_id) continue;
      const device = devicesByAgent.get(node.agent_id);
      map.set(node.id, device?.ip ?? device?.ips[0]);
    }
    return map;
  }, [topology.nodes, devicesByAgent]);

  const attachmentOrderByParent = useMemo(() => {
    const perParent = new Map<string, string[]>();
    for (const edge of topology.edges) {
      const childNode = nodeById.get(edge.child_id);
      const parentNode = nodeById.get(edge.parent_id);
      if (!childNode || !parentNode) continue;
      if (childNode.node_type !== "host" && childNode.node_type !== "admin") continue;
      if (parentNode.node_type !== "gateway" && parentNode.node_type !== "unknown_hub" && parentNode.node_type !== "switch") continue;
      const list = perParent.get(edge.parent_id) ?? [];
      list.push(edge.child_id);
      perParent.set(edge.parent_id, list);
    }

    for (const [parentId, childIds] of perParent) {
      childIds.sort((a, b) => {
        const ipCmp = compareByNumericIp(hostIpByNodeId.get(a), hostIpByNodeId.get(b));
        if (ipCmp !== 0) return ipCmp;
        return a.localeCompare(b);
      });
      perParent.set(parentId, childIds);
    }
    return perParent;
  }, [topology.edges, nodeById, hostIpByNodeId]);

  const handleCountByGateway = useMemo(() => {
    const map = new Map<string, number>();
    for (const node of topology.nodes) {
      if (node.node_type !== "gateway") continue;
      const count = attachmentOrderByParent.get(node.id)?.length ?? 0;
      map.set(node.id, Math.min(32, Math.max(8, count * 2 || 8)));
    }
    return map;
  }, [topology.nodes, attachmentOrderByParent]);

  const positionsRef = useRef<Record<string, { x: number; y: number }>>({});
  const lastTopologyKeyRef = useRef("");

  if (lastTopologyKeyRef.current !== topologyKey) {
    const nextPositions: Record<string, { x: number; y: number }> = {};
    const nodesById = new Map(topology.nodes.map((node) => [node.id, node]));
    const childrenByParent = new Map<string, string[]>();
    for (const edge of topology.edges) {
      const list = childrenByParent.get(edge.parent_id) ?? [];
      list.push(edge.child_id);
      childrenByParent.set(edge.parent_id, list);
    }

    const gateways = topology.nodes
      .filter((node) => node.node_type === "gateway")
      .map((node) => node.id)
      .sort(compareNodeIdsByIpLike);

    const colCount = Math.max(1, Math.ceil(Math.sqrt(gateways.length || 1)));
    gateways.forEach((gatewayId, index) => {
      const col = index % colCount;
      const row = Math.floor(index / colCount);
      nextPositions[gatewayId] = { x: 340 + col * 520, y: 280 + row * 420 };
    });

    const subnetIds = topology.nodes
      .filter((node) => node.node_type === "subnet")
      .map((node) => node.id)
      .sort((a, b) => a.localeCompare(b));
    subnetIds.forEach((subnetId, i) => {
      nextPositions[subnetId] = { x: 110 + i * 520, y: 70 };
    });

    const fallbackParent = gateways[0];
    for (const node of topology.nodes) {
      if (node.node_type === "admin") {
        const parentId = topology.edges.find((edge) => edge.child_id === node.id)?.parent_id ?? fallbackParent;
        const parentPos = (parentId && nextPositions[parentId]) || { x: 340, y: 280 };
        nextPositions[node.id] = { x: parentPos.x - 170, y: parentPos.y - 135 };
      }
    }

    for (const parentId of [...gateways, ...topology.nodes.filter((n) => n.node_type === "unknown_hub" || n.node_type === "switch").map((n) => n.id)]) {
      if (!nextPositions[parentId]) {
        const parentNode = nodesById.get(parentId);
        const gwParent = topology.edges.find((edge) => edge.child_id === parentId)?.parent_id;
        const anchor = gwParent ? nextPositions[gwParent] : undefined;
        nextPositions[parentId] = anchor ? { x: anchor.x + 130, y: anchor.y + 120 } : { x: 500, y: 360 };
        if (parentNode?.node_type === "unknown_hub") {
          nextPositions[parentId] = { x: nextPositions[parentId].x + 80, y: nextPositions[parentId].y + 50 };
        }
      }

      const children = (childrenByParent.get(parentId) ?? [])
        .filter((childId) => nodesById.get(childId)?.node_type === "host")
        .sort((a, b) => {
          const aAgent = nodesById.get(a)?.agent_id;
          const bAgent = nodesById.get(b)?.agent_id;
          const aIp = aAgent ? devicesByAgent.get(aAgent)?.ip ?? devicesByAgent.get(aAgent)?.ips[0] : undefined;
          const bIp = bAgent ? devicesByAgent.get(bAgent)?.ip ?? devicesByAgent.get(bAgent)?.ips[0] : undefined;
          const aNum = ipToNumber(aIp);
          const bNum = ipToNumber(bIp);
          if (aNum === null && bNum !== null) return 1;
          if (aNum !== null && bNum === null) return -1;
          if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
          return a.localeCompare(b);
        });

      const center = nextPositions[parentId];
      const radius = parentId.startsWith("gw:") ? 230 : 120;
      const hostXBias = 26;
      children.forEach((childId, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(1, children.length) - Math.PI / 2;
        nextPositions[childId] = {
          x: center.x + Math.cos(angle) * radius + hostXBias,
          y: center.y + Math.sin(angle) * radius,
        };
      });
    }

    positionsRef.current = nextPositions;
    lastTopologyKeyRef.current = topologyKey;
  }

  const nodes: Node[] = useMemo(() => {
    return topology.nodes.map((node) => {
      const device = node.agent_id ? devicesByAgent.get(node.agent_id) : undefined;
      const nodeIp = device?.ip ?? device?.ips[0] ?? node.ip ?? (node.node_type === "gateway" ? node.gateway_ip : undefined);
      return {
        id: node.id,
        type: "labscanNode",
        position: positionsRef.current[node.id] ?? { x: 400, y: 300 },
        data: {
          label: node.label,
          nodeType: node.node_type,
          ip: nodeIp,
          status: device?.status,
          internet: device?.internet_reachable,
          dns: device?.dns_ok,
          interfaceType: device?.interface_type ?? node.interface_type,
          subnet: device?.subnet_cidr ?? node.subnet_cidr,
          lastSeenMs: device?.last_seen_ms,
          attachedCount: node.attached_count,
          handleCount: node.node_type === "gateway" ? handleCountByGateway.get(node.id) ?? 16 : undefined,
          selected: focusedAgentId === (node.agent_id ?? node.id),
          onHover: setHoveredId,
          onSelect: (id: string) => setFocusedAgentId(node.agent_id ?? id),
        },
      };
    });
  }, [topology.nodes, devicesByAgent, focusedAgentId, setFocusedAgentId, handleCountByGateway]);

  const edges: Edge[] = useMemo(() => {
    return topology.edges.reduce<Edge[]>((acc, edge) => {
      const parentNode = nodeById.get(edge.parent_id);
      const childNode = nodeById.get(edge.child_id);
      if (!parentNode || !childNode) {
        return acc;
      }

      const orderedChildren = attachmentOrderByParent.get(edge.parent_id) ?? [];
      const index = orderedChildren.indexOf(edge.child_id);
      const count = orderedChildren.length;

      if (childNode.node_type === "subnet") {
        return acc;
      }

      const laneSpacing = parentNode.node_type === "gateway" ? 10 : 8;
      const rawLaneOffset = count > 0 ? (index - (count - 1) / 2) * laneSpacing : 0;
      const laneOffset = Math.max(-48, Math.min(48, rawLaneOffset));

      const connectedToHovered = hoveredId ? hoveredId === edge.child_id || hoveredId === edge.parent_id : false;
      const dimmed = hoveredId ? !connectedToHovered : false;
      const highlighted = connectedToHovered || focusedAgentId === childNode.agent_id;

      const safeIndex = index >= 0 ? index : 0;
      const gatewayLike = parentNode.node_type === "gateway" || parentNode.node_type === "unknown_hub" || parentNode.node_type === "switch";
      const handleCount = gatewayLike ? handleCountByGateway.get(edge.parent_id) ?? 16 : 1;
      const targetHandle = gatewayLike ? `t-${safeIndex % handleCount}` : "t-0";

      const hostIp = childNode.agent_id ? devicesByAgent.get(childNode.agent_id)?.ip ?? devicesByAgent.get(childNode.agent_id)?.ips[0] : undefined;

      const renderedEdge: Edge = {
        id: edge.id,
        source: edge.child_id,
        target: edge.parent_id,
        sourceHandle: "s-0",
        targetHandle,
        type: gatewayLike ? "labscanOrthogonal" : "step",
        animated: false,
        data: {
          laneOffset,
          dimmed,
          highlighted,
          method: edge.method,
          markerLabel: childNode.node_type === "host" ? edgeLabelFromIp(hostIp) : undefined,
        },
        style: {
          stroke: edge.method === "heuristic" ? "#f59e0b" : highlighted ? "#67e8f9" : "#9ad9e2",
          strokeOpacity: dimmed ? 0.2 : highlighted ? 0.96 : 0.82,
          strokeWidth: highlighted ? 5.2 : 3.6,
          filter: highlighted
            ? "drop-shadow(0 0 8px rgba(103,232,249,0.45))"
            : dimmed
              ? "none"
              : "drop-shadow(0 0 4px rgba(15,23,42,0.35))",
        },
      };

      acc.push(renderedEdge);
      return acc;
    }, []);
  }, [topology.edges, topology.nodes, nodeById, attachmentOrderByParent, hoveredId, focusedAgentId, handleCountByGateway, devicesByAgent]);

  const hoveredNode = hoveredId ? topology.nodes.find((node) => node.id === hoveredId) : undefined;
  const hoveredDevice = hoveredNode?.agent_id ? devicesByAgent.get(hoveredNode.agent_id) : undefined;
  const hoveredIp = hoveredDevice?.ip ?? hoveredDevice?.ips[0] ?? hoveredNode?.ip ?? (hoveredNode?.node_type === "gateway" ? hoveredNode.gateway_ip : undefined);

  return (
    <div className="relative h-full min-h-[520px] w-full rounded-lg border border-border/50 bg-card/40 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.08),transparent_62%)]" />
      <ReactFlow
        fitView
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        zoomOnScroll
        minZoom={0.35}
        maxZoom={1.75}
        className="bg-transparent labscan-map"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.1} color="rgba(148,163,184,0.20)" />
        <MiniMap pannable zoomable nodeStrokeWidth={2} className="!bg-card/80 !border !border-border/60 !rounded-md" maskColor="rgba(2,6,23,0.65)" />
        <Controls className="!bg-card/80 !border !border-border/60 !rounded-md" showInteractive={false} />
      </ReactFlow>

      {hoveredNode && (
        <div className="absolute right-4 top-4 w-72 glass-panel p-3 text-xs">
          <p className="text-foreground font-semibold">{hoveredNode.label}</p>
          <p className="text-muted-foreground font-mono mt-0.5">{hoveredIp ?? "-"}</p>
          <div className="mt-2 space-y-1 text-muted-foreground">
            <p>Type: <span className="uppercase text-foreground">{hoveredNode.node_type}</span></p>
            <p>Gateway: {hoveredDevice?.default_gateway_ip ?? hoveredNode.gateway_ip ?? "Unknown"}</p>
            <p>Subnet: {hoveredDevice?.subnet_cidr ?? hoveredNode.subnet_cidr ?? "Unknown"}</p>
            <p>Interface: {hoveredDevice?.interface_type ?? hoveredNode.interface_type ?? "Unknown"}</p>
            {hoveredDevice && <p>Internet: {hoveredDevice.internet_reachable === null ? "Unknown" : hoveredDevice.internet_reachable ? "Reachable" : "Down"}</p>}
            {hoveredDevice && <p>DNS: {hoveredDevice.dns_ok === null ? "Unknown" : hoveredDevice.dns_ok ? "OK" : "Fail"}</p>}
            {hoveredDevice && <p>Last seen: {formatSince(hoveredDevice.last_seen_ms)}</p>}
            {(hoveredNode.node_type === "gateway" || hoveredNode.node_type === "unknown_hub") && (
              <p>Attached devices: {hoveredNode.attached_count ?? 0}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
