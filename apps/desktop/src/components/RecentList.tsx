import { useEffect, useRef, useState } from "react";

type RecentItem = {
  rel_path: string;
  last_modified: string;
};

type Props = {
  items: RecentItem[];
  focused: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpen: (relPath: string) => void;
};

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

export default function RecentList({
  items,
  focused,
  expanded,
  onToggleExpand,
  onOpen,
}: Props) {
  const [focusIdx, setFocusIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFocusIdx((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!expanded) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIdx((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[focusIdx];
      if (it) onOpen(it.rel_path);
    }
  }

  return (
    <div
      ref={ref}
      role="list"
      tabIndex={0}
      className={"recent-list" + (focused ? " focused" : "")}
      onKeyDown={onKeyDown}
    >
      <div
        className="sidebar-section-title clickable"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand();
        }}
      >
        {expanded ? "▾" : "▸"} Recent (7d)
      </div>
      {expanded &&
        items.map((it, i) => (
          <div
            key={it.rel_path}
            role="listitem"
            aria-selected={i === focusIdx}
            className={"bookmark-item" + (i === focusIdx ? " selected" : "")}
            onClick={() => {
              setFocusIdx(i);
              onOpen(it.rel_path);
            }}
            title={`${it.rel_path} · ${it.last_modified}`}
          >
            <span className="recent-date">{it.last_modified.slice(5)}</span>
            <span className="bookmark-label">{basename(it.rel_path)}</span>
          </div>
        ))}
    </div>
  );
}
