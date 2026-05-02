import { useEffect, useRef, useState, type ReactNode } from "react";

export type PaneDef = {
  id: string;
  label: string;
  content: ReactNode;
  defaultHeight?: number;
};

type PaneState = {
  id: string;
  height: number;
};

type Props = {
  panes: PaneDef[];
  storageKey: string | null;
  defaultOrder: string[];
};

const MIN_PANE_HEIGHT = 60;

function loadState(
  key: string | null,
  panes: PaneDef[],
  defaultOrder: string[],
): PaneState[] {
  let stored: PaneState[] | null = null;
  if (key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) stored = JSON.parse(raw);
    } catch {
      // ignore
    }
  }
  const byId = new Map(panes.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const out: PaneState[] = [];
  if (stored) {
    for (const s of stored) {
      const def = byId.get(s.id);
      if (!def || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push({
        id: s.id,
        height: s.height ?? def.defaultHeight ?? 200,
      });
    }
  }
  for (const id of defaultOrder) {
    if (seen.has(id)) continue;
    const def = byId.get(id);
    if (!def) continue;
    seen.add(id);
    out.push({ id, height: def.defaultHeight ?? 200 });
  }
  return out;
}

export default function PaneStack({ panes, storageKey, defaultOrder }: Props) {
  const [state, setState] = useState<PaneState[]>(() =>
    loadState(storageKey, panes, defaultOrder),
  );
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);

  const byId = new Map(panes.map((p) => [p.id, p]));

  function reorder(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    setState((prev) => {
      const sourceIdx = prev.findIndex((p) => p.id === sourceId);
      const targetIdx = prev.findIndex((p) => p.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return prev;
      const next = [...prev];
      const [item] = next.splice(sourceIdx, 1);
      next.splice(targetIdx, 0, item);
      return next;
    });
  }

  function startResize(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = state[idx].height;
    function onMove(ev: MouseEvent) {
      const delta = ev.clientY - startY;
      setState((prev) => {
        const next = [...prev];
        if (!next[idx]) return prev;
        next[idx] = {
          ...next[idx],
          height: Math.max(MIN_PANE_HEIGHT, startHeight + delta),
        };
        return next;
      });
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div ref={containerRef} className="pane-stack">
      {state.map((s, idx) => {
        const def = byId.get(s.id);
        if (!def) return null;
        const isLast = idx === state.length - 1;
        const heightStyle = isLast
          ? { flex: 1, minHeight: MIN_PANE_HEIGHT }
          : { height: s.height, flex: "0 0 auto" };
        return (
          <div
            key={s.id}
            className={"pane-cell" + (dragOverId === s.id ? " drag-over" : "")}
            style={heightStyle}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverId(s.id);
            }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={(e) => {
              e.preventDefault();
              const sourceId = e.dataTransfer.getData("text/pane-id");
              if (sourceId) reorder(sourceId, s.id);
              setDragOverId(null);
            }}
          >
            <div
              className="pane-handle"
              draggable
              title="Drag to reorder"
              onDragStart={(e) => {
                e.dataTransfer.setData("text/pane-id", s.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              <span className="pane-grip">⋮⋮</span>
              <span className="pane-handle-label">{def.label}</span>
            </div>
            <div className="pane-cell-body">{def.content}</div>
            {!isLast && (
              <div
                className="pane-resize"
                onMouseDown={(e) => startResize(e, idx)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
