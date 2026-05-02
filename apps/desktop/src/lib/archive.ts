import { invoke } from "@tauri-apps/api/core";
import { getBackendConfig, postArchivePlan } from "./backend";
import { triggerSync } from "./sync";

type FileMeta = {
  rel_path: string;
  last_modified: string;
};

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function todayDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function runAutoArchive(): Promise<number> {
  const cfg = await getBackendConfig();
  const files = await invoke<FileMeta[]>("list_vault_meta");
  const today = todayDate();
  const plan = await postArchivePlan(cfg, files, today, 30);

  for (const action of plan.actions) {
    try {
      await invoke("rename_vault_file", {
        relPath: action.rel_path,
        newRelPath: action.archive_path,
      });
    } catch (e) {
      console.warn(`archive ${action.rel_path}:`, e);
    }
  }

  if (plan.actions.length > 0) {
    await triggerSync();
  }
  return plan.actions.length;
}
