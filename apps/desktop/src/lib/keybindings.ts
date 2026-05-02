import { invoke } from "@tauri-apps/api/core";
import { COMMAND_REGISTRY } from "./commands";

export type Keybinding = { key: string; command: string };

export const DEFAULT_BINDINGS: Keybinding[] = [
  ...COMMAND_REGISTRY.filter((c) => c.defaultKey !== null).map((c) => ({
    key: c.defaultKey as string,
    command: c.id,
  })),
  { key: "Ctrl+;", command: "view.hint" },
  { key: "Ctrl+R", command: "view.refresh" },
];

export type KeybindingConfig = {
  unmapAll?: boolean;
  bindings?: Keybinding[];
};

export async function loadKeybindings(): Promise<Keybinding[]> {
  let cfg: KeybindingConfig | null = null;
  try {
    const raw = await invoke<string>("read_file", {
      relPath: "keybindings.json",
    });
    cfg = JSON.parse(raw) as KeybindingConfig;
  } catch {
    return [...DEFAULT_BINDINGS];
  }
  const base = cfg.unmapAll ? [] : DEFAULT_BINDINGS;
  const map = new Map<string, string>();
  for (const b of base) map.set(b.key, b.command);
  for (const b of cfg.bindings ?? []) map.set(b.key, b.command);
  return Array.from(map, ([key, command]) => ({ key, command }));
}

export async function saveKeybindings(bindings: Keybinding[]): Promise<void> {
  const cfg: KeybindingConfig = { unmapAll: false, bindings };
  await invoke("write_file", {
    relPath: "keybindings.json",
    content: JSON.stringify(cfg, null, 2) + "\n",
  });
}

export function eventToKey(e: KeyboardEvent): string | null {
  if (
    e.key === "Control" ||
    e.key === "Shift" ||
    e.key === "Alt" ||
    e.key === "Meta"
  ) {
    return null;
  }
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}

export function isGlobalKey(keyStr: string): boolean {
  const tokens = keyStr.split(/[\s+]/);
  if (
    tokens.includes("Ctrl") ||
    tokens.includes("Alt") ||
    tokens.includes("Meta") ||
    tokens.includes("Cmd")
  ) {
    return true;
  }
  return tokens.some((t) => /^F\d{1,2}$/.test(t));
}
