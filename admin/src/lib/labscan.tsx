import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DeviceStatus = "online" | "idle" | "scanning" | "offline" | "unreachable";

export interface DeviceRecord {
  agent_id: string;
  hostname: string;
  ips: string[];
  os: string;
  arch: string;
  version: string;
  status: DeviceStatus;
  last_seen: number;
  connected: boolean;
  last_metrics?: Record<string, unknown>;
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

export interface ServerStatus {
  online: boolean;
  port_ws: number;
  port_udp: number;
}

export interface LabStateSnapshot {
  server: ServerStatus;
  devices: DeviceRecord[];
  tasks: TaskRecord[];
  logs: LogRecord[];
}

interface LabScanContextValue {
  state: LabStateSnapshot;
  ready: boolean;
  error?: string;
  startTask: (kind: TaskRecord["kind"], agentIds: string[], params?: Record<string, unknown>) => Promise<void>;
  getPairToken: () => Promise<string>;
  rotatePairToken: () => Promise<string>;
}

const defaultState: LabStateSnapshot = {
  server: { online: false, port_ws: 8148, port_udp: 8870 },
  devices: [],
  tasks: [],
  logs: [],
};

const LabScanContext = createContext<LabScanContextValue | null>(null);

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function LabScanProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LabStateSnapshot>(defaultState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let unsubscribers: Array<() => void> = [];

    void (async () => {
      try {
        if (!isTauri()) {
          setReady(true);
          return;
        }

        const [server, devicesSnapshot, tasksSnapshot] = await Promise.all([
          invoke<ServerStatus>("get_server_status"),
          invoke<{ devices: DeviceRecord[] }>("get_devices_snapshot"),
          invoke<{ tasks: TaskRecord[] }>("get_tasks_snapshot"),
        ]);

        setState({
          server,
          devices: devicesSnapshot.devices,
          tasks: tasksSnapshot.tasks,
          logs: [],
        });

        const unlistenServer = await listen<ServerStatus>("server_status", (event) => {
          setState((prev) => ({ ...prev, server: event.payload }));
        });
        const unlistenDevices = await listen<{ devices: DeviceRecord[] }>("devices_snapshot", (event) => {
          setState((prev) => ({ ...prev, devices: event.payload.devices }));
        });
        const unlistenDeviceUpsert = await listen<{ device: DeviceRecord }>("device_upsert", (event) => {
          setState((prev) => {
            const map = new Map(prev.devices.map((device) => [device.agent_id, device]));
            map.set(event.payload.device.agent_id, event.payload.device);
            return { ...prev, devices: Array.from(map.values()) };
          });
        });
        const unlistenDeviceRemove = await listen<{ agent_id: string }>("device_remove", (event) => {
          setState((prev) => ({
            ...prev,
            devices: prev.devices.filter((device) => device.agent_id !== event.payload.agent_id),
          }));
        });
        const unlistenTaskUpdate = await listen<{ task: TaskRecord }>("task_update", (event) => {
          setState((prev) => {
            const map = new Map(prev.tasks.map((task) => [task.task_id, task]));
            map.set(event.payload.task.task_id, event.payload.task);
            return { ...prev, tasks: Array.from(map.values()) };
          });
        });
        const unlistenLog = await listen<Omit<LogRecord, "id">>("log_event", (event) => {
          setState((prev) => ({
            ...prev,
            logs: [{ ...event.payload, id: `${event.payload.ts}-${event.payload.agent_id ?? "server"}` }, ...prev.logs].slice(0, 400),
          }));
        });

        unsubscribers = [
          unlistenServer,
          unlistenDevices,
          unlistenDeviceUpsert,
          unlistenDeviceRemove,
          unlistenTaskUpdate,
          unlistenLog,
        ];
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
    () => ({ state, ready, error, startTask, getPairToken, rotatePairToken }),
    [state, ready, error, startTask, getPairToken, rotatePairToken],
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
