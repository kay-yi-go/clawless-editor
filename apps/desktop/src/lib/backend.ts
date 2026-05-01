import { invoke } from "@tauri-apps/api/core";

export type BackendConfig = {
  url: string;
  key: string;
};

export async function getBackendConfig(): Promise<BackendConfig> {
  return invoke<BackendConfig>("get_backend_config");
}

export async function setBackendConfig(
  url: string,
  key: string,
): Promise<void> {
  await invoke("set_backend_config", { url, key });
}

async function call<T>(
  cfg: BackendConfig,
  path: string,
  body: unknown,
): Promise<T> {
  const resp = await fetch(`${cfg.url.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Clawless-Key": cfg.key,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`backend ${path} ${resp.status}: ${text}`);
  }
  return (await resp.json()) as T;
}

export async function postDailyLog(
  cfg: BackendConfig,
  yesterdayContent: string | null,
  todayDate: string,
): Promise<{ content: string }> {
  return call(cfg, "/daily-log", {
    yesterday_content: yesterdayContent,
    today_date: todayDate,
  });
}

export async function postRenameSuggest(
  cfg: BackendConfig,
  contentPreview: string,
  todayDate: string,
): Promise<{ suggested_name: string }> {
  return call(cfg, "/rename-suggest", {
    content_preview: contentPreview,
    today_date: todayDate,
  });
}

type FileEntry = { rel_path: string; last_modified: string };
type ArchiveAction = { rel_path: string; archive_path: string };

export async function postArchivePlan(
  cfg: BackendConfig,
  files: FileEntry[],
  todayDate: string,
  thresholdDays: number,
): Promise<{ actions: ArchiveAction[] }> {
  return call(cfg, "/archive-plan", {
    files,
    today_date: todayDate,
    threshold_days: thresholdDays,
  });
}
