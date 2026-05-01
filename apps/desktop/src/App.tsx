import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Editor from "./components/Editor";
import FileTree from "./components/FileTree";
import TabStrip from "./components/TabStrip";
import Prompt from "./components/Prompt";
import SyncIndicator from "./components/SyncIndicator";
import Settings, { applyTheme, loadStoredTheme } from "./components/Settings";
import RecentList from "./components/RecentList";
import WorkspaceTabs from "./components/WorkspaceTabs";
import FirstRun from "./components/FirstRun";
import DirFilterBar from "./components/DirFilterBar";
import SearchDropdown from "./components/SearchDropdown";
import PaneStack, { type PaneDef } from "./components/PaneStack";
import {
  applyDirFilter,
  getDefaultDirFilter,
  type DirFilter,
} from "./lib/dirFilter";
import {
  listVaults,
  getActiveVault,
  setActiveVault as setActiveVaultCmd,
  pickFolder,
  addVault,
  readFile,
  writeFile,
  listVault,
  getSession,
  setSession,
  type Vault,
  type VaultEntry,
} from "./lib/vault";
import { flatTree } from "./lib/tree";
import { loadKeybindings, type Keybinding } from "./lib/keybindings";
import { useKeybindings } from "./hooks/useKeybindings";
import { useHintMode } from "./hooks/useHintMode";
import HintOverlay from "./components/HintOverlay";
import HelpModal from "./components/HelpModal";
import { onSyncReport, onDailyLogTrigger, triggerSync } from "./lib/sync";
import { generateDailyLog } from "./lib/daily";
import { suggestRename } from "./lib/rename";
import { runAutoArchive } from "./lib/archive";
import { applySearch, type ParsedSearch, parseSearch } from "./lib/search";
import "./App.css";

type FileTab = {
  kind: "file";
  id: string;
  relPath: string;
  initialDoc: string;
  current: string;
  dirty: boolean;
};

type ScratchTab = {
  kind: "scratch";
  id: string;
  label: string;
  current: string;
};

type Tab = FileTab | ScratchTab;

type Pane =
  | "vault"
  | "recent"
  | "filter"
  | "tree"
  | "tabs"
  | "editor"
  | "search";

type FileMeta = { rel_path: string; last_modified: string };

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function tabLabel(t: Tab): string {
  return t.kind === "file" ? basename(t.relPath) : t.label;
}

function App() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [activeVault, setActiveVault] = useState<Vault | null>(null);
  const [loading, setLoading] = useState(true);

  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bindings, setBindings] = useState<Keybinding[]>([]);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [treeRefresh, setTreeRefresh] = useState(0);
  type PromptConfig = {
    label: string;
    initial: string;
    placeholder?: string;
    onSubmit: (value: string) => void | Promise<void>;
  };
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);
  const [, setClosedStack] = useState<string[]>([]);
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [meta, setMeta] = useState<FileMeta[]>([]);
  const [searchText, setSearchText] = useState("");
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [focusedPane, setFocusedPane] = useState<Pane | null>(null);
  const [recentExpanded, setRecentExpanded] = useState(true);
  const [pasteBuffer, setPasteBuffer] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [dirFilter, setDirFilter] = useState<DirFilter>({ kind: "all" });
  const [defaultDirFilter, setDefaultDirFilter] = useState<DirFilter | null>(
    null,
  );
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contentMatches, setContentMatches] = useState<Set<string> | null>(
    null,
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hint = useHintMode();

  async function refreshVaults() {
    const [vs, av] = await Promise.all([listVaults(), getActiveVault()]);
    setVaults(vs);
    setActiveVault(av);
  }

  useEffect(() => {
    applyTheme(loadStoredTheme());
    refreshVaults().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadKeybindings().then(setBindings);
    if (activeVault) {
      invoke<string[]>("get_bookmarks")
        .then(setBookmarks)
        .catch(() => setBookmarks([]));
    }
  }, [activeVault?.id]);

  useEffect(() => {
    if (!activeVault) return;
    listVault()
      .then(setEntries)
      .catch(() => setEntries([]));
    invoke<FileMeta[]>("list_vault_meta")
      .then(setMeta)
      .catch(() => setMeta([]));
  }, [activeVault?.id, treeRefresh]);

  useEffect(() => {
    if (!activeVault) {
      setDirFilter({ kind: "all" });
      setDefaultDirFilter(null);
      setExpandedDirs(new Set());
      return;
    }
    getDefaultDirFilter().then((f) => {
      setDefaultDirFilter(f);
      setDirFilter(f ?? { kind: "all" });
    });
    try {
      const raw = localStorage.getItem(`clawless.expanded.${activeVault.id}`);
      setExpandedDirs(raw ? new Set(JSON.parse(raw)) : new Set());
    } catch {
      setExpandedDirs(new Set());
    }
  }, [activeVault?.id]);

  useEffect(() => {
    if (!activeVault) return;
    localStorage.setItem(
      `clawless.expanded.${activeVault.id}`,
      JSON.stringify(Array.from(expandedDirs)),
    );
  }, [expandedDirs, activeVault?.id]);

  function toggleDirExpand(relPath: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) next.delete(relPath);
      else next.add(relPath);
      return next;
    });
  }

  useEffect(() => {
    if (!activeVault) return;
    setSessionRestored(false);
    setTabs([]);
    setActiveId(null);
    (async () => {
      try {
        const session = await getSession();
        const restored: FileTab[] = [];
        for (const relPath of session.open_tabs) {
          try {
            const doc = await readFile(relPath);
            restored.push({
              kind: "file",
              id: crypto.randomUUID(),
              relPath,
              initialDoc: doc,
              current: doc,
              dirty: false,
            });
          } catch {
            // missing file — skip
          }
        }
        setTabs(restored);
        if (session.active_tab_path) {
          const match = restored.find(
            (t) => t.relPath === session.active_tab_path,
          );
          setActiveId(match?.id ?? restored[0]?.id ?? null);
        } else {
          setActiveId(restored[0]?.id ?? null);
        }
      } finally {
        setSessionRestored(true);
      }
    })();
  }, [activeVault?.id]);

  useEffect(() => {
    if (!activeVault || !sessionRestored) return;
    const filePaths = tabs
      .filter((t): t is FileTab => t.kind === "file")
      .map((t) => t.relPath);
    const active = tabs.find((t) => t.id === activeId);
    const activeFilePath =
      active && active.kind === "file" ? active.relPath : null;
    void setSession(filePaths, activeFilePath);
  }, [tabs, activeId, sessionRestored, activeVault?.id]);

  const allNodes = useMemo(() => flatTree(entries), [entries]);
  const metaByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of meta) m.set(e.rel_path, e.last_modified);
    return m;
  }, [meta]);

  const projects = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) {
      const top = e.rel_path.split("/")[0];
      if (top) s.add(top);
    }
    return Array.from(s).sort();
  }, [entries]);

  const parsedSearch = useMemo<ParsedSearch>(
    () => parseSearch(searchText),
    [searchText],
  );

  useEffect(() => {
    const q = parsedSearch.content;
    if (q === null) {
      setContentMatches(null);
      return;
    }
    let cancelled = false;
    invoke<string[]>("grep_vault", { query: q })
      .then((paths) => {
        if (!cancelled) setContentMatches(new Set(paths));
      })
      .catch(() => {
        if (!cancelled) setContentMatches(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [parsedSearch.content]);

  const dirFilteredNodes = useMemo(
    () => applyDirFilter(allNodes, dirFilter, metaByPath),
    [allNodes, dirFilter, metaByPath],
  );

  const searchActive =
    parsedSearch.text.length > 0 || parsedSearch.hasOperators;

  const searchResults = useMemo(
    () =>
      searchActive
        ? applySearch(allNodes, parsedSearch, metaByPath, contentMatches)
        : [],
    [searchActive, allNodes, parsedSearch, metaByPath, contentMatches],
  );

  const treeNodes = useMemo(() => {
    return dirFilteredNodes.filter((n) => {
      if (n.depth === 0) return true;
      const parts = n.rel_path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/");
        if (!expandedDirs.has(ancestor)) return false;
      }
      return true;
    });
  }, [dirFilteredNodes, expandedDirs]);

  const contentLoading =
    parsedSearch.content !== null && contentMatches === null;

  const recentFiles = useMemo(() => {
    const today = new Date();
    const cutoff = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
    return [...meta]
      .filter((m) => m.last_modified >= cutoffStr)
      .sort((a, b) => b.last_modified.localeCompare(a.last_modified))
      .slice(0, 20);
  }, [meta]);

  useEffect(() => {
    function getPane(): Pane | null {
      const a = document.activeElement;
      if (!a) return null;
      if (a.classList?.contains("filter-input")) return "search";
      if (a.closest(".cm-content")) return "editor";
      if (a.closest(".tabs")) return "tabs";
      if (a.closest(".recent-list")) return "recent";
      if (a.closest(".dir-filter-bar")) return "filter";
      if (a.closest(".file-tree")) return "tree";
      if (a.closest(".workspace-tabs")) return "vault";
      return null;
    }
    function handler() {
      setFocusedPane(getPane());
    }
    window.addEventListener("focusin", handler);
    window.addEventListener("focusout", handler);
    handler();
    return () => {
      window.removeEventListener("focusin", handler);
      window.removeEventListener("focusout", handler);
    };
  }, []);

  useEffect(() => {
    const unlistenP = onSyncReport((report) => {
      if (report.state === "conflict") {
        for (const f of report.conflict_files) {
          void openFile(f);
        }
        setTreeRefresh((n) => n + 1);
      } else if (
        report.state === "idle" &&
        report.message?.includes("pulled")
      ) {
        setTreeRefresh((n) => n + 1);
      }
    });
    return () => {
      unlistenP.then((fn) => fn());
    };
  }, [tabs]);

  useEffect(() => {
    const unlistenP = onDailyLogTrigger(async () => {
      try {
        const todayPath = await generateDailyLog();
        setTreeRefresh((n) => n + 1);
        await openFile(todayPath);
        await triggerSync();
      } catch (e) {
        console.error("daily log trigger failed:", e);
      }
    });
    return () => {
      unlistenP.then((fn) => fn());
    };
  }, [tabs]);

  useEffect(() => {
    const unlistenP = listen<string>("vault-rename-candidate", async (e) => {
      try {
        const newPath = await suggestRename(e.payload);
        if (newPath) {
          setTreeRefresh((n) => n + 1);
          await triggerSync();
        }
      } catch (err) {
        console.warn("auto-rename failed:", err);
      }
    });
    return () => {
      unlistenP.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlistenP = listen("archive-trigger", async () => {
      try {
        const count = await runAutoArchive();
        if (count > 0) setTreeRefresh((n) => n + 1);
      } catch (e) {
        console.error("archive failed:", e);
      }
    });
    return () => {
      unlistenP.then((fn) => fn());
    };
  }, []);

  async function selectVault(id: string) {
    if (activeVault?.id === id) return;
    await setActiveVaultCmd(id);
    await refreshVaults();
  }

  async function addVaultFromPicker() {
    const path = await pickFolder();
    if (!path) return;
    try {
      await addVault(path);
      await refreshVaults();
    } catch (e) {
      console.error("add vault failed:", e);
      window.alert(`Failed to add vault: ${e}`);
    }
  }

  async function openFile(relPath: string) {
    const existing = tabs.find(
      (t) => t.kind === "file" && t.relPath === relPath,
    );
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const doc = await readFile(relPath);
    const tab: FileTab = {
      kind: "file",
      id: crypto.randomUUID(),
      relPath,
      initialDoc: doc,
      current: doc,
      dirty: false,
    };
    setTabs((t) => [...t, tab]);
    setActiveId(tab.id);
  }

  function closeTab(id: string) {
    const closing = tabs.find((t) => t.id === id);
    if (closing && closing.kind === "file") {
      setClosedStack((prev) => [...prev.slice(-19), closing.relPath]);
    }
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = prev.filter((t) => t.id !== id);
      if (id === activeId) {
        const fallback = next[idx] ?? next[idx - 1] ?? null;
        setActiveId(fallback?.id ?? null);
      }
      return next;
    });
  }

  function onTabDocChange(id: string, doc: string) {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.kind === "file") {
          return { ...t, current: doc, dirty: doc !== t.initialDoc };
        }
        return { ...t, current: doc };
      }),
    );
  }

  async function saveTab(id: string) {
    const t = tabs.find((tab) => tab.id === id);
    if (!t || t.kind !== "file") return;
    await writeFile(t.relPath, t.current);
    setTabs((prev) =>
      prev.map((x) =>
        x.id === id && x.kind === "file"
          ? { ...x, initialDoc: x.current, dirty: false }
          : x,
      ),
    );
  }

  function newScratch() {
    const count = tabs.filter((t) => t.kind === "scratch").length + 1;
    const tab: ScratchTab = {
      kind: "scratch",
      id: crypto.randomUUID(),
      label: `scratch ${count}`,
      current: "",
    };
    setTabs((t) => [...t, tab]);
    setActiveId(tab.id);
  }

  async function toggleBookmark(relPath: string) {
    const next = bookmarks.includes(relPath)
      ? bookmarks.filter((p) => p !== relPath)
      : [...bookmarks, relPath];
    setBookmarks(next);
    await invoke("set_bookmarks", { bookmarks: next });
  }

  async function deleteFile(relPath: string) {
    if (!relPath) return;
    const ok = window.confirm(
      `Delete ${relPath}? This cannot be undone outside git.`,
    );
    if (!ok) return;
    await invoke("delete_vault_file", { relPath });
    setTabs((prev) =>
      prev.filter((t) => !(t.kind === "file" && t.relPath === relPath)),
    );
    setBookmarks((prev) => {
      const next = prev.filter((p) => p !== relPath);
      if (next.length !== prev.length) {
        void invoke("set_bookmarks", { bookmarks: next });
      }
      return next;
    });
    setTreeRefresh((n) => n + 1);
  }

  function nextCopyName(relPath: string): string {
    const lastSlash = relPath.lastIndexOf("/");
    const dir = lastSlash >= 0 ? relPath.slice(0, lastSlash + 1) : "";
    const base = relPath.slice(lastSlash + 1);
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : "";
    let n = 1;
    let candidate = `${dir}${stem}_copy${ext}`;
    const existing = new Set(entries.map((e) => e.rel_path));
    while (existing.has(candidate)) {
      n += 1;
      candidate = `${dir}${stem}_copy${n}${ext}`;
    }
    return candidate;
  }

  async function duplicateFile(relPath: string) {
    if (!relPath) return;
    const content = await readFile(relPath);
    const target = nextCopyName(relPath);
    await writeFile(target, content);
    setTreeRefresh((n) => n + 1);
  }

  async function pasteAsCopy() {
    if (!pasteBuffer) return;
    await duplicateFile(pasteBuffer);
  }

  function visiblePanes(): Pane[] {
    const out: Pane[] = ["vault"];
    if (sidebarVisible) {
      if (recentFiles.length > 0) out.push("recent");
      out.push("filter", "tree");
    }
    if (tabs.length > 0) out.push("tabs", "editor");
    out.push("search");
    return out;
  }

  function focusPane(p: Pane) {
    if (p === "vault") {
      const target =
        document.querySelector<HTMLElement>(
          ".workspace-tabs .vault-avatar.active",
        ) ??
        document.querySelector<HTMLElement>(".workspace-tabs .vault-avatar");
      target?.focus();
    } else if (p === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else if (p === "recent") {
      if (!sidebarVisible) setSidebarVisible(true);
      if (!recentExpanded) setRecentExpanded(true);
      setTimeout(
        () => document.querySelector<HTMLElement>(".recent-list")?.focus(),
        0,
      );
    } else if (p === "filter") {
      if (!sidebarVisible) setSidebarVisible(true);
      setTimeout(
        () => document.querySelector<HTMLElement>(".dir-filter-bar")?.focus(),
        0,
      );
    } else if (p === "tree") {
      if (!sidebarVisible) setSidebarVisible(true);
      setTimeout(
        () => document.querySelector<HTMLElement>(".file-tree")?.focus(),
        0,
      );
    } else if (p === "tabs") {
      document.querySelector<HTMLElement>(".tabs")?.focus();
    } else {
      document
        .querySelector<HTMLElement>(".editor-host:not(.hidden) .cm-content")
        ?.focus();
    }
  }

  function cyclePane(direction: 1 | -1) {
    const panes = visiblePanes();
    if (panes.length === 0) return;
    const cur = focusedPane;
    const idx = cur ? panes.indexOf(cur) : -1;
    if (idx < 0) {
      focusPane(direction === 1 ? panes[0] : panes[panes.length - 1]);
      return;
    }
    const next = panes[(idx + direction + panes.length) % panes.length];
    focusPane(next);
  }

  function cycleTab(direction: 1 | -1) {
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeId);
    const start = idx >= 0 ? idx : 0;
    const next = tabs[(start + direction + tabs.length) % tabs.length];
    setActiveId(next.id);
  }

  function gotoTab(index: number) {
    if (tabs[index]) setActiveId(tabs[index].id);
  }

  function nextUntitledName(): string {
    const taken = new Set(entries.map((e) => e.rel_path));
    let n = 1;
    let candidate = `untitled-${n}.md`;
    while (taken.has(candidate)) {
      n += 1;
      candidate = `untitled-${n}.md`;
    }
    return candidate;
  }

  async function newFileUnderRoot() {
    const name = nextUntitledName();
    await writeFile(name, "");
    setTreeRefresh((n) => n + 1);
    await openFile(name);
  }

  async function moveActiveFile(newRelPath: string) {
    const t = tabs.find((tab) => tab.id === activeId);
    if (!t || t.kind !== "file") return;
    let target = newRelPath.trim();
    if (!target) return;
    if (!target.endsWith(".md")) target = `${target}.md`;
    if (target === t.relPath) return;
    await invoke("rename_vault_file", {
      relPath: t.relPath,
      newRelPath: target,
    });
    setTabs((prev) =>
      prev.map((x) =>
        x.kind === "file" && x.relPath === t.relPath
          ? { ...x, relPath: target }
          : x,
      ),
    );
    setBookmarks((prev) => {
      if (!prev.includes(t.relPath)) return prev;
      const next = prev.map((p) => (p === t.relPath ? target : p));
      void invoke("set_bookmarks", { bookmarks: next });
      return next;
    });
    setTreeRefresh((n) => n + 1);
  }

  function reopenLastClosedTab() {
    setClosedStack((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const path = next.pop()!;
      void openFile(path);
      return next;
    });
  }

  const commands = useMemo<Record<string, () => void>>(() => {
    const cmds: Record<string, () => void> = {
      "pane.next": () => cyclePane(1),
      "pane.prev": () => cyclePane(-1),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.goto.last": () => {
        if (tabs.length > 0) setActiveId(tabs[tabs.length - 1].id);
      },
      "tab.close": () => {
        if (activeId) closeTab(activeId);
      },
      "tab.closeAll": () => {
        setTabs([]);
        setActiveId(null);
      },
      "app.quit": () => {
        void invoke("quit_app");
      },
      "file.save": () => {
        if (activeId) void saveTab(activeId);
      },
      "file.new": () => void newFileUnderRoot(),
      "file.newScratch": newScratch,
      "file.move": () => {
        const t = tabs.find((tab) => tab.id === activeId);
        if (!t || t.kind !== "file") return;
        setPrompt({
          label: "Move to (path/to/file.md)",
          initial: t.relPath,
          onSubmit: async (value) => {
            await moveActiveFile(value);
            setPrompt(null);
          },
        });
      },
      "file.rename": () => {
        const t = tabs.find((tab) => tab.id === activeId);
        if (!t || t.kind !== "file") return;
        const slash = t.relPath.lastIndexOf("/");
        const dir = slash >= 0 ? t.relPath.slice(0, slash + 1) : "";
        const base = t.relPath.slice(slash + 1);
        setPrompt({
          label: "Rename to",
          initial: base,
          onSubmit: async (value) => {
            const v = value.trim();
            if (!v) return;
            await moveActiveFile(`${dir}${v}`);
            setPrompt(null);
          },
        });
      },
      "view.refresh": () => setTreeRefresh((n) => n + 1),
      "tab.reopen": () => reopenLastClosedTab(),
      "view.toggleSidebar": () => setSidebarVisible((v) => !v),
      "view.focusTree": () => focusPane("tree"),
      "view.search": () => {
        if (document.activeElement?.closest(".cm-content")) return;
        focusPane("search");
      },
      "file.fuzzyOpen": () => focusPane("search"),
      "view.commandPalette": () => {},
      "view.settings": () => setSettingsOpen(true),
      "view.help": () => setHelpOpen(true),
      "view.hint": () => hint.activate(),
    };
    for (let i = 1; i <= 8; i++) {
      cmds[`tab.goto.${i}`] = () => gotoTab(i - 1);
    }
    return cmds;
  }, [
    activeId,
    tabs,
    sidebarVisible,
    recentExpanded,
    recentFiles.length,
    focusedPane,
    hint,
  ]);

  useKeybindings(bindings, commands);

  if (loading) {
    return (
      <>
        <div className="status">loading…</div>
        {hint.active && <HintOverlay hints={hint.hints} input={hint.input} />}
      </>
    );
  }

  if (vaults.length === 0) {
    return (
      <>
        <FirstRun onDone={() => void refreshVaults()} />
        {hint.active && <HintOverlay hints={hint.hints} input={hint.input} />}
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="vault-path" title={activeVault?.path ?? ""}>
            {activeVault?.path ?? ""}
          </span>
        </div>
        <div
          className={
            "topbar-search" + (focusedPane === "search" ? " focused" : "")
          }
        >
          <input
            ref={searchInputRef}
            className="filter-input"
            placeholder="search… (filename: content: folder: modified: before: after:)"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearchText("");
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {parsedSearch.error && (
            <span className="search-error-inline">{parsedSearch.error}</span>
          )}
          {searchActive && focusedPane === "search" && (
            <SearchDropdown
              nodes={searchResults}
              metaByPath={metaByPath}
              loading={contentLoading}
              onOpen={(p) => {
                void openFile(p);
                setSearchText("");
              }}
              onClose={() => setSearchText("")}
            />
          )}
        </div>
        <div className="topbar-right">
          <SyncIndicator />
        </div>
      </header>
      <div className="workspace">
        <WorkspaceTabs
          vaults={vaults}
          activeId={activeVault?.id ?? null}
          focused={focusedPane === "vault"}
          onSelect={(id) => void selectVault(id)}
          onAdd={() => void addVaultFromPicker()}
        />
        {sidebarVisible && (
          <aside className="sidebar pane">
            {bookmarks.length > 0 && (
              <div className="sidebar-section">
                <div className="sidebar-section-title">Bookmarks</div>
                {bookmarks.map((p) => (
                  <div
                    key={p}
                    className="bookmark-item"
                    onClick={() => openFile(p)}
                    title={p}
                  >
                    <span className="bookmark-star">★</span>
                    <span className="bookmark-label">{basename(p)}</span>
                  </div>
                ))}
              </div>
            )}
            <PaneStack
              storageKey={
                activeVault ? `clawless.panes.${activeVault.id}` : null
              }
              defaultOrder={["filter", "recent", "tree"]}
              panes={(() => {
                const list: PaneDef[] = [
                  {
                    id: "filter",
                    label: "Filter",
                    defaultHeight: 80,
                    content: (
                      <DirFilterBar
                        filter={dirFilter}
                        defaultFilter={defaultDirFilter}
                        focused={focusedPane === "filter"}
                        onChange={setDirFilter}
                        onDefaultSaved={setDefaultDirFilter}
                      />
                    ),
                  },
                ];
                if (recentFiles.length > 0) {
                  list.push({
                    id: "recent",
                    label: "Recent",
                    defaultHeight: 180,
                    content: (
                      <RecentList
                        items={recentFiles}
                        focused={focusedPane === "recent"}
                        expanded={recentExpanded}
                        onToggleExpand={() => setRecentExpanded((v) => !v)}
                        onOpen={openFile}
                      />
                    ),
                  });
                }
                list.push({
                  id: "tree",
                  label: "Files",
                  content: (
                    <FileTree
                      nodes={treeNodes}
                      bookmarks={bookmarks}
                      flatten={false}
                      focused={focusedPane === "tree"}
                      expandedDirs={expandedDirs}
                      onToggleExpand={toggleDirExpand}
                      onOpen={openFile}
                      onToggleBookmark={toggleBookmark}
                      onDelete={deleteFile}
                      onDuplicate={duplicateFile}
                      onCopyPath={(p) => {
                        setPasteBuffer(p);
                        void navigator.clipboard.writeText(p).catch(() => {});
                      }}
                      onPasteCopy={pasteAsCopy}
                      projects={projects}
                      onProjectClick={(p) => setSearchText(`folder:${p} `)}
                    />
                  ),
                });
                return list;
              })()}
            />
          </aside>
        )}
        <main
          className={
            "editor-area pane" +
            (focusedPane === "tabs" || focusedPane === "editor"
              ? " pane-active"
              : "")
          }
        >
          <TabStrip
            tabs={tabs.map((t) => ({
              id: t.id,
              label: tabLabel(t),
              dirty: t.kind === "file" && t.dirty,
              kind: t.kind,
            }))}
            activeId={activeId}
            focused={focusedPane === "tabs"}
            onSelect={setActiveId}
            onClose={closeTab}
          />
          <div className="editor-stack">
            {tabs.map((t) => (
              <Editor
                key={t.id}
                initialDoc={t.kind === "file" ? t.initialDoc : ""}
                visible={t.id === activeId}
                onChange={(doc) => onTabDocChange(t.id, doc)}
              />
            ))}
            {tabs.length === 0 && (
              <div className="empty">Open a file from the tree.</div>
            )}
          </div>
        </main>
      </div>
      {prompt && (
        <Prompt
          label={prompt.label}
          initial={prompt.initial}
          placeholder={prompt.placeholder}
          onSubmit={(v) => void prompt.onSubmit(v)}
          onCancel={() => setPrompt(null)}
        />
      )}
      {settingsOpen && (
        <Settings
          onClose={() => setSettingsOpen(false)}
          onVaultsChanged={() => void refreshVaults()}
          onBindingsChanged={() => void loadKeybindings().then(setBindings)}
        />
      )}
      {helpOpen && (
        <HelpModal bindings={bindings} onClose={() => setHelpOpen(false)} />
      )}
      {hint.active && <HintOverlay hints={hint.hints} input={hint.input} />}
    </div>
  );
}

export default App;
