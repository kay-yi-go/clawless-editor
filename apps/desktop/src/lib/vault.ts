import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type VaultEntry = {
  rel_path: string;
  is_dir: boolean;
};

export type Vault = {
  id: string;
  name: string;
  path: string;
  github_remote: string | null;
  github_pat: string | null;
  open_tabs: string[];
  active_tab_path: string | null;
  bookmarks: string[];
  color: string | null;
};

export type Session = {
  open_tabs: string[];
  active_tab_path: string | null;
};

export async function listVaults(): Promise<Vault[]> {
  return invoke<Vault[]>("list_vaults");
}

export async function getActiveVault(): Promise<Vault | null> {
  const v = await invoke<Vault | null>("get_active_vault");
  return v ?? null;
}

export async function addVault(
  path: string,
  opts: {
    name?: string;
    github_remote?: string;
    github_pat?: string;
  } = {},
): Promise<Vault> {
  return invoke<Vault>("add_vault", {
    path,
    name: opts.name ?? null,
    githubRemote: opts.github_remote ?? null,
    githubPat: opts.github_pat ?? null,
  });
}

export async function removeVault(id: string): Promise<void> {
  await invoke("remove_vault", { id });
}

export async function updateVault(
  id: string,
  patch: {
    name?: string;
    path?: string;
    github_remote?: string;
    github_pat?: string;
    color?: string;
  },
): Promise<Vault> {
  return invoke<Vault>("update_vault", { id, patch });
}

export async function setActiveVault(id: string): Promise<void> {
  await invoke("set_active_vault", { id });
}

export async function pickFolder(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false });
  if (!picked || Array.isArray(picked)) return null;
  return picked;
}

export async function readFile(relPath: string): Promise<string> {
  return invoke<string>("read_file", { relPath });
}

export async function writeFile(
  relPath: string,
  content: string,
): Promise<void> {
  await invoke("write_file", { relPath, content });
}

export async function listVault(): Promise<VaultEntry[]> {
  return invoke<VaultEntry[]>("list_vault");
}

export async function getSession(): Promise<Session> {
  return invoke<Session>("get_session");
}

export async function setSession(
  openTabs: string[],
  activeTabPath: string | null,
): Promise<void> {
  await invoke("set_session", {
    openTabs,
    activeTabPath,
  });
}
