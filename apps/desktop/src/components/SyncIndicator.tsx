import { useEffect, useState } from "react";
import {
  onSyncReport,
  onSyncState,
  syncNow,
  type SyncReport,
  type SyncState,
} from "../lib/sync";

const LABELS: Record<SyncState, string> = {
  idle: "synced",
  syncing: "syncing…",
  conflict: "conflict",
  error: "error",
  disconnected: "no remote",
};

const ICONS: Record<SyncState, string> = {
  idle: "✓",
  syncing: "↻",
  conflict: "⚠",
  error: "✕",
  disconnected: "⊘",
};

export default function SyncIndicator() {
  const [state, setState] = useState<SyncState>("idle");
  const [report, setReport] = useState<SyncReport | null>(null);

  useEffect(() => {
    const unsubs: Array<Promise<() => void>> = [
      onSyncState(setState),
      onSyncReport(setReport),
    ];
    return () => {
      unsubs.forEach((p) => p.then((fn) => fn()));
    };
  }, []);

  async function onClick() {
    setState("syncing");
    try {
      const r = await syncNow();
      setReport(r);
      setState(r.state);
    } catch (e) {
      setState("error");
      setReport({
        state: "error",
        message: String(e),
        conflict_files: [],
      });
    }
  }

  const tooltip = report?.message ? `${LABELS[state]} — ${report.message}` : LABELS[state];

  return (
    <button
      className={"sync-indicator sync-" + state}
      onClick={onClick}
      title={tooltip}
    >
      {ICONS[state]}
      <span className="sync-label">{LABELS[state]}</span>
    </button>
  );
}
