import { useEffect, useRef, useState } from "react";
import type { TreeNode } from "../lib/tree";

type Props = {
  nodes: TreeNode[];
  bookmarks: string[];
  flatten: boolean;
  focused: boolean;
  expandedDirs: Set<string>;
  onToggleExpand: (relPath: string) => void;
  onOpen: (relPath: string) => void;
  onToggleBookmark: (relPath: string) => void;
  onDelete: (relPath: string) => void;
  onDuplicate: (relPath: string) => void;
  onCopyPath: (relPath: string) => void;
  onPasteCopy: () => void;
  projects?: string[];
  onProjectClick?: (project: string) => void;
};

export default function FileTree({
  nodes,
  bookmarks,
  flatten,
  focused,
  expandedDirs,
  onToggleExpand,
  onOpen,
  onToggleBookmark,
  onDelete,
  onDuplicate,
  onCopyPath,
  onPasteCopy,
}: Props) {
  const [focusIdx, setFocusIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bookSet = new Set(bookmarks);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, nodes.length - 1)));
  }, [nodes.length]);

  function focusedPathOrNull(): string | null {
    const n = nodes[focusIdx];
    return n && !n.is_dir ? n.rel_path : null;
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, nodes.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const n = nodes[focusIdx];
      if (n?.is_dir && !expandedDirs.has(n.rel_path)) {
        onToggleExpand(n.rel_path);
      } else {
        setFocusIdx((i) => Math.min(i + 1, nodes.length - 1));
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const n = nodes[focusIdx];
      if (n?.is_dir && expandedDirs.has(n.rel_path)) {
        onToggleExpand(n.rel_path);
        return;
      }
      if (n) {
        const slash = n.rel_path.lastIndexOf("/");
        if (slash >= 0) {
          const parent = n.rel_path.slice(0, slash);
          const parentIdx = nodes.findIndex((x) => x.rel_path === parent);
          if (parentIdx >= 0) setFocusIdx(parentIdx);
        }
      }
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setFocusIdx(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setFocusIdx(nodes.length - 1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const n = nodes[focusIdx];
      if (!n) return;
      if (n.is_dir) onToggleExpand(n.rel_path);
      else onOpen(n.rel_path);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      const p = focusedPathOrNull();
      if (p) onToggleBookmark(p);
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      const p = focusedPathOrNull();
      if (p) onDelete(p);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      const p = focusedPathOrNull();
      if (p) onDuplicate(p);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      const p = focusedPathOrNull();
      if (p) onCopyPath(p);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === "v" || e.key === "V")) {
      e.preventDefault();
      onPasteCopy();
      return;
    }
  }

  return (
    <div
      ref={containerRef}
      role="tree"
      tabIndex={0}
      className={"file-tree" + (focused ? " focused" : "")}
      onKeyDown={onKeyDown}
    >
      {nodes.length === 0 && <div className="tree-empty">no matches</div>}
      {nodes.map((n, i) => {
        const isExpanded = n.is_dir && expandedDirs.has(n.rel_path);
        return (
          <div
            key={n.rel_path}
            role="treeitem"
            aria-selected={i === focusIdx}
            aria-expanded={n.is_dir ? isExpanded : undefined}
            data-path={n.rel_path}
            className={
              "tree-item" +
              (i === focusIdx ? " selected" : "") +
              (n.is_dir ? " is-dir" : "")
            }
            style={{ paddingLeft: 4 + (flatten ? 0 : n.depth) * 12 }}
            onClick={() => {
              setFocusIdx(i);
              if (n.is_dir) onToggleExpand(n.rel_path);
              else onOpen(n.rel_path);
            }}
          >
            <span className="tree-icon">
              {n.is_dir ? (isExpanded ? "▾" : "▸") : " "}
            </span>
            <span className="tree-label">{flatten ? n.rel_path : n.name}</span>
            {!n.is_dir && (
              <button
                className={"tree-star" + (bookSet.has(n.rel_path) ? " on" : "")}
                aria-label="Toggle bookmark"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark(n.rel_path);
                }}
              >
                {bookSet.has(n.rel_path) ? "★" : "☆"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
