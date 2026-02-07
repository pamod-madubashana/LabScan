import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { logger } from "@/lib/logger";

export type DeviceStatus = "online" | "idle" | "scanning" | "offline";

export interface DeviceRecord {
  device_key: string;
  agent_id: string;
  fingerprint?: string | null;
  hostname: string;
  ips: string[];
  os: string;
  version: string;
  status: DeviceStatus;
  last_seen_ms: number;
  internet_reachable: boolean | null;
  dns_ok: boolean | null;
  gateway_reachable: boolean | null;
  latency_ms: number | null;
  last_internet_change_ms: number | null;
  last_dns_change_ms: number | null;
  first_seen_ms: number;
  ip?: string | null;
  subnet_cidr?: string | null;
  default_gateway_ip?: string | null;
  interface_type?: "wifi" | "ethernet" | "unknown" | null;
  mac?: string | null;
  gateway_mac?: string | null;
  dhcp_server_ip?: string | null;
  ssid?: string | null;
}

export interface TopologyNode {
  id: string;
  node_type: "gateway" | "admin" | "host" | "switch" | "subnet" | "unknown_hub";
  label: string;
  ip?: string | null;
  subnet_cidr?: string | null;
  gateway_ip?: string | null;
  agent_id?: string | null;
  interface_type?: string | null;
  attached_count?: number | null;
}

export interface TopologyEdge {
  id: string;
  child_id: string;
  parent_id: string;
  method: "evidence" | "heuristic" | "manual";
  confidence: number;
}

export interface TopologySnapshot {
  revision: number;
  updated_at: number;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

export interface TaskResultRecord {
  agent_id: string;
  ok: boolean;
  result: Record<string, unknown>;
  error?: string;
  ts: number;
}

export interface TaskRecord {
  task_id: string;
  kind: "ping" | "port_scan" | "arp_snapshot";
  params: Record<string, unknown>;
  assigned_agents: string[];
  status: "queued" | "running" | "done" | "failed";
  created_at: number;
  started_at?: number;
  ended_at?: number;
  results: TaskResultRecord[];
}

export interface LogRecord {
  id: string;
  ts: number;
  level: string;
  agent_id?: string;
  message: string;
}

export interface ActivityEvent {
  id: string;
  kind: string;
  agent_id?: string;
  message: string;
  ts: number;
  count?: number;
}

export interface ServerStatus {
  online: boolean;
  port_ws: number;
  port_udp: number;
}

export interface LabStateSnapshot {
  server: ServerStatus;
  devices: DeviceRecord[];
  topology: TopologySnapshot;
  tasks: TaskRecord[];
  logs: LogRecord[];
  activity: ActivityEvent[];
}

interface LabScanContextValue {
  state: LabStateSnapshot;
  ready: boolean;
  error?: string;
  focusedAgentId?: string;
  setFocusedAgentId: (agentId?: string) => void;
  startTask: (kind: TaskRecord["kind"], agentIds: string[], params?: Record<string, unknown>) => Promise<void>;
  getPairToken: () => Promise<string>;
  rotatePairToken: () => Promise<string>;
}

const defaultState: LabStateSnapshot = {
  server: { online: false, port_ws: 8148, port_udp: 8870 },
  devices: [],
  topology: { revision: 0, updated_at: 0, nodes: [], edges: [] },
  tasks: [],
  logs: [],
  activity: [],
};

const LabScanContext = createContext<LabScanContextValue | null>(null);

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function mergeStableDeviceList(current: DeviceRecord[], incoming: DeviceRecord[]): DeviceRecord[] {
  const incomingById = new Map(incoming.map((item) => [deviceStableKey(item), item]));
  const currentById = new Map(current.map((item) => [deviceStableKey(item), item]));

  const currentIds = new Set(currentById.keys());
  const incomingIds = new Set(incomingById.keys());

  let topologyChanged = currentIds.size !== incomingIds.size;
  if (!topologyChanged) {
    for (const id of incomingIds) {
      if (!currentIds.has(id)) {
        topologyChanged = true;
        break;
      }
    }
  }

  let ipChanged = false;
  if (!topologyChanged) {
    for (const [id, next] of incomingById) {
      const currentItem = currentById.get(id);
      if (!currentItem || primaryIpKey(currentItem) !== primaryIpKey(next)) {
        ipChanged = true;
        break;
      }
    }
  }

  if (!topologyChanged && !ipChanged) {
    return current.map((item) => incomingById.get(deviceStableKey(item)) ?? item);
  }

  return [...incoming].sort(compareDevicesByIp);
}

function deviceStableKey(device: DeviceRecord): string {
  return device.device_key || device.fingerprint || device.agent_id;
}

function ipToSortableNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) {
    return null;
  }

  const nums = parts.map((part) => Number(part));
  if (nums.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  return (((nums[0] << 24) >>> 0) + (nums[1] << 16) + (nums[2] << 8) + nums[3]) >>> 0;
}

function primaryIpValue(device: DeviceRecord): number | null {
  const candidates = device.ips
    .map((ip) => ipToSortableNumber(ip))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  return candidates.length > 0 ? candidates[0] : null;
}

function primaryIpKey(device: DeviceRecord): string {
  const value = primaryIpValue(device);
  return value === null ? "none" : String(value);
}

function compareDevicesByIp(a: DeviceRecord, b: DeviceRecord): number {
  const aIp = primaryIpValue(a);
  const bIp = primaryIpValue(b);

  if (aIp === null && bIp !== null) return 1;
  if (aIp !== null && bIp === null) return -1;
  if (aIp !== null && bIp !== null && aIp !== bIp) return aIp - bIp;

  const hostCmp = a.hostname.localeCompare(b.hostname);
  if (hostCmp !== 0) return hostCmp;
  return a.agent_id.localeCompare(b.agent_id);
}

export function LabScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LabStateSnapshot>(defaultState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [focusedAgentId, setFocusedAgentId] = useState<string | undefined>();

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];

    void (async () => {
      try {
        if (!isTauri()) {
          setReady(true);
          return;
        }

        const [server, devicesSnapshot, topologySnapshot, tasksSnapshot, activitySnapshot] = await Promise.all([
          invoke<ServerStatus>("get_server_status"),
          invoke<{ devices: DeviceRecord[] }>("get_devices_snapshot"),
          invoke<TopologySnapshot>("get_topology_snapshot"),
          invoke<{ tasks: TaskRecord[] }>("get_tasks_snapshot"),
          invoke<{ events: ActivityEvent[] }>("get_activity_snapshot"),
        ]);

        setState({
          server,
          devices: mergeStableDeviceList([], devicesSnapshot.devices),
          topology: topologySnapshot,
          tasks: tasksSnapshot.tasks,
          logs: [],
          activity: activitySnapshot.events,
        });

        const unlistenServer = await listen<ServerStatus>("server_status", (event) => {
          setState((prev) => ({ ...prev, server: event.payload }));
          void logger.info("[UI] server_status", { online: event.payload.online });
        });

        const unlistenDevices = await listen<{ devices: DeviceRecord[] }>("devices_snapshot", (event) => {
          setState((prev) => ({ ...prev, devices: mergeStableDeviceList(prev.devices, event.payload.devices) }));
          void logger.info("[UI] devices_snapshot", { count: event.payload.devices.length });
        });

        const unlistenTopologySnapshot = await listen<TopologySnapshot>("topology_snapshot", (event) => {
          setState((prev) => ({ ...prev, topology: event.payload }));
        });

        const unlistenTopologyChanged = await listen<TopologySnapshot>("topology_changed", (event) => {
          setState((prev) => ({ ...prev, topology: event.payload }));
        });

        const unlistenDeviceUpsert = await listen<{ device: DeviceRecord }>("device_upsert", (event) => {
          const incomingKey = deviceStableKey(event.payload.device);
          setState((prev) => ({
            ...prev,
            devices: mergeStableDeviceList(
              prev.devices,
              prev.devices.some((device) => deviceStableKey(device) === incomingKey)
                ? prev.devices.map((device) =>
                    deviceStableKey(device) === incomingKey ? event.payload.device : device,
                  )
                : [...prev.devices, event.payload.device],
            ),
          }));
        });

        const unlistenDeviceRemove = await listen<{ agent_id: string }>("device_remove", (event) => {
          setState((prev) => ({
            ...prev,
            devices: prev.devices.filter((device) => device.agent_id !== event.payload.agent_id),
          }));
          void logger.info("[UI] device_remove", { id: event.payload.agent_id });
        });

        const unlistenTaskUpdate = await listen<{ task: TaskRecord }>("task_update", (event) => {
          setState((prev) => {
            const map = new Map(prev.tasks.map((task) => [task.task_id, task]));
            map.set(event.payload.task.task_id, event.payload.task);
            return { ...prev, tasks: Array.from(map.values()) };
          });
        });

        const unlistenLog = await listen<LogRecord>("log_event", (event) => {
          setState((prev) => ({
            ...prev,
            logs: [event.payload, ...prev.logs].slice(0, 400),
          }));
        });

        const unlistenActivity = await listen<ActivityEvent>("activity_event", (event) => {
          setState((prev) => {
            const idx = prev.activity.findIndex((item) => item.id === event.payload.id);
            if (idx >= 0) {
              const next = [...prev.activity];
              next[idx] = event.payload;
              return { ...prev, activity: next };
            }
            return { ...prev, activity: [event.payload, ...prev.activity].slice(0, 200) };
          });
        });

        unsubscribers = [
          unlistenServer,
          unlistenDevices,
          unlistenDeviceUpsert,
          unlistenDeviceRemove,
          unlistenTaskUpdate,
          unlistenLog,
          unlistenActivity,
          unlistenTopologySnapshot,
          unlistenTopologyChanged,
        ];

        void logger.info("[UI] subscribed events", {
          events: ["server_status", "devices_snapshot", "device_upsert", "device_remove", "task_update", "activity_event"],
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to initialize LabScan runtime");
        setState(defaultState);
      } finally {
        setReady(true);
      }
    })();

    return () => {
      for (const dispose of unsubscribers) {
        dispose();
      }
    };
  }, []);

  const startTask = useCallback(
    async (kind: TaskRecord["kind"], agentIds: string[], params: Record<string, unknown> = {}) => {
      if (!isTauri()) {
        return;
      }
      await invoke("dispatch_task", { agents: agentIds, kind, params });
    },
    [],
  );

  const getPairToken = useCallback(async () => {
    if (!isTauri()) {
      return "";
    }
    return invoke<string>("get_pair_token");
  }, []);

  const rotatePairToken = useCallback(async () => {
    if (!isTauri()) {
      return "";
    }
    return invoke<string>("rotate_pair_token");
  }, []);

  const value = useMemo(
    () => ({ state, ready, error, focusedAgentId, setFocusedAgentId, startTask, getPairToken, rotatePairToken }),
    [state, ready, error, focusedAgentId, startTask, getPairToken, rotatePairToken],
  );

  return <LabScanContext.Provider value={value}>{children}</LabScanContext.Provider>;
}

export function useLabScan() {
  const context = useContext(LabScanContext);
  if (!context) {
    throw new Error("useLabScan must be used inside LabScanProvider");
  }

  return context;
}

export function formatSince(ts: number): string {
  const deltaMs = Date.now() - ts;
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) {
    return `${sec}s ago`;
  }
  const min = Math.floor(sec / 60);
  if (min < 60) {
    return `${min}m ago`;
  }
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
