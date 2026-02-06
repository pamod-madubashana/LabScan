import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type DeviceStatus = "online" | "idle" | "scanning" | "unreachable";

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
  context?: Record<string, unknown>;
}

export interface SettingsRecord {
  bind_addr: string;
  port: number;
  shared_secret: string;
  heartbeat_timeout_secs: number;
}

export interface ServerStatus {
  running: boolean;
  bind_addr: string;
  port: number;
  connected_agents: number;
}

export interface LabStateSnapshot {
  server: ServerStatus;
  settings: SettingsRecord;
  devices: DeviceRecord[];
  tasks: TaskRecord[];
  logs: LogRecord[];
}

interface LabScanContextValue {
  state: LabStateSnapshot;
  ready: boolean;
  error?: string;
  startTask: (kind: TaskRecord["kind"], agentIds: string[], params?: Record<string, unknown>) => Promise<void>;
  updateSharedSecret: (secret: string) => Promise<void>;
  generatePairToken: () => Promise<string>;
}

const defaultState: LabStateSnapshot = {
  server: { running: false, bind_addr: "0.0.0.0", port: 8148, connected_agents: 0 },
  settings: { bind_addr: "0.0.0.0", port: 8148, shared_secret: "", heartbeat_timeout_secs: 20 },
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

  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setReady(true);
      return;
    }

    const snapshot = await invoke<LabStateSnapshot>("get_state_snapshot");
    setState(snapshot);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void (async () => {
      try {
        if (isTauri()) {
          await invoke("start_server", { port: null });
          await refresh();
          unlisten = await listen<LabStateSnapshot>("labscan://state", (event) => {
            setState(event.payload);
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to initialize LabScan runtime");
      } finally {
        setReady(true);
      }
    })();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [refresh]);

  const startTask = useCallback(
    async (kind: TaskRecord["kind"], agentIds: string[], params: Record<string, unknown> = {}) => {
      if (!isTauri()) {
        return;
      }
      await invoke("start_task", { kind, agentIds, params });
      await refresh();
    },
    [refresh],
  );

  const updateSharedSecret = useCallback(
    async (secret: string) => {
      if (!isTauri()) {
        return;
      }
      await invoke("update_shared_secret", { secret });
      await refresh();
    },
    [refresh],
  );

  const generatePairToken = useCallback(async () => {
    if (!isTauri()) {
      return "";
    }
    return invoke<string>("generate_pair_token");
  }, []);

  const value = useMemo(
    () => ({ state, ready, error, startTask, updateSharedSecret, generatePairToken }),
    [state, ready, error, startTask, updateSharedSecret, generatePairToken],
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
