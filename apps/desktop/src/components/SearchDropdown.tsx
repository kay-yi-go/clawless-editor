import { useEffect, useState } from "react";
import type { TreeNode } from "../lib/tree";

type Props = {
  nodes: TreeNode[];
  metaByPath: Map<string, string>;
  onOpen: (relPath: string) => void;
  onClose: () => void;
  loading: boolean;
};

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function dirname(p: string): string {
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(0, slash) : "";
}

export default function SearchDropdown({
  nodes,
  metaByPath,
  onOpen,
  onClose,
  loading,
}: Props) {
  const [focusIdx, setFocusIdx] = useState(0);

  useEffect(() => {
    setFocusIdx(0);
  }, [nodes.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const active = document.activeElement;
      if (!active?.classList.contains("filter-input")) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, nodes.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const n = nodes[focusIdx];
        if (n) onOpen(n.rel_path);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [nodes, focusIdx, onOpen]);

  return (
    <div className="search-dropdown">
      {loading && <div className="search-dropdown-loading">searching…</div>}
      {!loading && nodes.length === 0 && (
        <div className="search-dropdown-empty">no matches</div>
      )}
      {nodes.slice(0, 50).map((n, i) => {
        const dir = dirname(n.rel_path);
        const mtime = metaByPath.get(n.rel_path);
        return (
          <div
            key={n.rel_path}
            className={
              "search-dropdown-item" + (i === focusIdx ? " selected" : "")
            }
            onClick={() => onOpen(n.rel_path)}
            onMouseEnter={() => setFocusIdx(i)}
          >
            <div className="search-dropdown-name">{basename(n.rel_path)}</div>
            <div className="search-dropdown-meta">
              {dir && <span className="search-dropdown-dir">{dir}</span>}
              {mtime && <span className="search-dropdown-date">{mtime}</span>}
            </div>
          </div>
        );
      })}
      {nodes.length > 50 && (
        <div className="search-dropdown-more">
          {nodes.length - 50} more — narrow your query
        </div>
      )}
      <div className="search-dropdown-hint">
        ↑↓ to navigate · Enter to open · Esc to close
      </div>
      <div className="search-dropdown-close-spacer" onClick={onClose} />
    </div>
  );
}
