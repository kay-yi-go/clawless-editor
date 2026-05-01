type Tab = {
  id: string;
  label: string;
  dirty: boolean;
  kind?: "file" | "scratch";
};

type Props = {
  tabs: Tab[];
  activeId: string | null;
  focused: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

export default function TabStrip({
  tabs,
  activeId,
  focused,
  onSelect,
  onClose,
}: Props) {
  function onKeyDown(e: React.KeyboardEvent) {
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeId);
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = tabs[(idx + 1) % tabs.length];
      onSelect(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      onSelect(prev.id);
    } else if ((e.key === "Delete" || e.key === "Backspace") && activeId) {
      e.preventDefault();
      onClose(activeId);
    }
  }

  if (tabs.length === 0) return null;
  return (
    <div
      className={"tabs" + (focused ? " focused" : "")}
      role="tablist"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === activeId}
          className={
            "tab" +
            (t.id === activeId ? " active" : "") +
            (t.kind === "scratch" ? " scratch" : "")
          }
          onClick={() => onSelect(t.id)}
        >
          <span className="tab-label">
            {t.dirty ? "● " : ""}
            {t.label}
          </span>
          <button
            className="tab-close"
            aria-label="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(t.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
