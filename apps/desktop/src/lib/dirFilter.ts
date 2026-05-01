import { invoke } from "@tauri-apps/api/core";
import type { TreeNode } from "./tree";

export type DirFilter =
  | { kind: "all" }
  | { kind: "last"; n: number; unit: "day" | "month" | "year" }
  | { kind: "this"; unit: "day" | "month" | "year" };

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function describeFilter(f: DirFilter): string {
  if (f.kind === "all") return "All";
  if (f.kind === "last") {
    const plural = f.n !== 1 ? "s" : "";
    return `Last ${f.n} ${f.unit}${plural}`;
  }
  return `This ${f.unit}`;
}

export function cutoffFor(f: DirFilter): string | null {
  if (f.kind === "all") return null;
  const now = new Date();
  if (f.kind === "last") {
    const d = new Date(now);
    if (f.unit === "day") d.setDate(d.getDate() - f.n);
    else if (f.unit === "month") d.setMonth(d.getMonth() - f.n);
    else d.setFullYear(d.getFullYear() - f.n);
    return dateStr(d);
  }
  const d = new Date(now);
  if (f.unit === "day") {
    return dateStr(d);
  }
  if (f.unit === "month") {
    d.setDate(1);
    return dateStr(d);
  }
  d.setMonth(0, 1);
  return dateStr(d);
}

export function applyDirFilter(
  nodes: TreeNode[],
  filter: DirFilter,
  metaByPath: Map<string, string>,
): TreeNode[] {
  if (filter.kind === "all") return nodes;
  const cutoff = cutoffFor(filter);
  if (!cutoff) return nodes;
  const keep = new Set<string>();
  for (const n of nodes) {
    if (n.is_dir) continue;
    const mtime = metaByPath.get(n.rel_path);
    if (mtime && mtime >= cutoff) {
      keep.add(n.rel_path);
      const parts = n.rel_path.split("/");
      for (let i = 1; i < parts.length; i++) {
        keep.add(parts.slice(0, i).join("/"));
      }
    }
  }
  return nodes.filter((n) => keep.has(n.rel_path));
}

export async function getDefaultDirFilter(): Promise<DirFilter | null> {
  const v = await invoke<DirFilter | null>("get_default_dir_filter");
  return v ?? null;
}

export async function setDefaultDirFilter(f: DirFilter | null): Promise<void> {
  await invoke("set_default_dir_filter", { filter: f });
}
