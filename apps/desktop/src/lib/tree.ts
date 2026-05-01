import { VaultEntry } from "./vault";

export type TreeNode = VaultEntry & {
  depth: number;
  name: string;
};

export function flatTree(entries: VaultEntry[]): TreeNode[] {
  const byParent = new Map<string, VaultEntry[]>();
  for (const e of entries) {
    const parts = e.rel_path.split("/");
    const parent = parts.slice(0, -1).join("/");
    let bucket = byParent.get(parent);
    if (!bucket) {
      bucket = [];
      byParent.set(parent, bucket);
    }
    bucket.push(e);
  }
  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      return a.rel_path.localeCompare(b.rel_path);
    });
  }
  const out: TreeNode[] = [];
  function walk(parent: string, depth: number) {
    const kids = byParent.get(parent) ?? [];
    for (const k of kids) {
      const parts = k.rel_path.split("/");
      out.push({ ...k, depth, name: parts[parts.length - 1] });
      if (k.is_dir) walk(k.rel_path, depth + 1);
    }
  }
  walk("", 0);
  return out;
}
