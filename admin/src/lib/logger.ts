import { invoke } from "@tauri-apps/api/core";

const isTauri = () => typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window);

async function log(cmd: string, message: string, context?: unknown) {
  if (!isTauri()) return;

  try {
    await invoke(cmd, { message, context: context ?? null });
  } catch {
    // Intentionally ignore logging transport errors.
  }
}

export const logger = {
  debug: (message: string, context?: any) => log("log_debug", message, context),
  info: (message: string, context?: any) => log("log_info", message, context),
  warn: (message: string, context?: any) => log("log_warn", message, context),
  error: (message: string, context?: any) => log("log_error", message, context),
};
