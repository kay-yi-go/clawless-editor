import { invoke } from "@tauri-apps/api/core";
import { getBackendConfig, postRenameSuggest } from "./backend";
import { readFile } from "./vault";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sanitize(name: string): string {
  return name
    .split(/\s+/)[0]
    .replace(/[^A-Za-z0-9_\-]/g, "")
    .slice(0, 80);
}

export async function suggestRename(relPath: string): Promise<string | null> {
  const content = await readFile(relPath);
  if (content.length < 50) return null;
  const cfg = await getBackendConfig();
  const today = dateStr(new Date());
  let suggested: string;
  try {
    const result = await postRenameSuggest(cfg, content.slice(0, 1000), today);
    suggested = sanitize(result.suggested_name);
  } catch {
    suggested = `${today}_untitled`;
  }
  if (!suggested.startsWith(today)) suggested = `${today}_${suggested}`;
  if (!suggested) suggested = `${today}_untitled`;

  const lastSlash = relPath.lastIndexOf("/");
  const dir = lastSlash >= 0 ? relPath.slice(0, lastSlash + 1) : "";
  const newRelPath = `${dir}${suggested}.md`;
  if (newRelPath === relPath) return relPath;
  await invoke("rename_vault_file", { relPath, newRelPath });
  return newRelPath;
}
