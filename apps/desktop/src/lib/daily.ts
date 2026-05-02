import { invoke } from "@tauri-apps/api/core";
import { getBackendConfig, postDailyLog } from "./backend";
import { writeFile, readFile } from "./vault";

const DAILY_DIR = "daily-log";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dailyPath(d: Date): string {
  return `${DAILY_DIR}/${dateStr(d)}_daily.md`;
}

export async function generateDailyLog(): Promise<string> {
  const cfg = await getBackendConfig();
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const todayPath = dailyPath(today);
  const yesterdayPath = dailyPath(yesterday);

  let yesterdayContent: string | null = null;
  try {
    yesterdayContent = await readFile(yesterdayPath);
  } catch {
    yesterdayContent = null;
  }

  let alreadyExists = false;
  try {
    await readFile(todayPath);
    alreadyExists = true;
  } catch {
    // not yet created
  }

  if (!alreadyExists) {
    const result = await postDailyLog(cfg, yesterdayContent, dateStr(today));
    await writeFile(todayPath, result.content);
  }

  return todayPath;
}

export async function triggerDailyLogSync(): Promise<void> {
  await invoke("trigger_sync");
}
