import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type SyncState =
  | "idle"
  | "syncing"
  | "conflict"
  | "error"
  | "disconnected";

export type SyncReport = {
  state: SyncState;
  message: string | null;
  conflict_files: string[];
};

export async function syncNow(): Promise<SyncReport> {
  return invoke<SyncReport>("sync_now");
}

export async function triggerSync(): Promise<void> {
  await invoke("trigger_sync");
}

export function onSyncState(
  handler: (state: SyncState) => void,
): Promise<UnlistenFn> {
  return listen<SyncState>("sync-state", (e) => handler(e.payload));
}

export function onSyncReport(
  handler: (report: SyncReport) => void,
): Promise<UnlistenFn> {
  return listen<SyncReport>("sync-report", (e) => handler(e.payload));
}

export function onDailyLogTrigger(handler: () => void): Promise<UnlistenFn> {
  return listen("daily-log-trigger", () => handler());
}
