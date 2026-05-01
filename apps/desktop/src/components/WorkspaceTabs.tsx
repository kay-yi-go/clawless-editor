import { useRef } from "react";
import type { Vault } from "../lib/vault";

type Props = {
  vaults: Vault[];
  activeId: string | null;
  focused: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
};

function initialFor(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2).toUpperCase();
}

export default function WorkspaceTabs({
  vaults,
  activeId,
  focused,
  onSelect,
  onAdd,
}: Props) {
  const navRef = useRef<HTMLElement | null>(null);

  function focusButton(idx: number) {
    const btns = navRef.current?.querySelectorAll<HTMLButtonElement>(
      ".vault-avatar",
    );
    if (!btns) return;
    const clamped = Math.max(0, Math.min(btns.length - 1, idx));
    btns[clamped]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const btns = navRef.current?.querySelectorAll<HTMLButtonElement>(
      ".vault-avatar",
    );
    if (!btns || btns.length === 0) return;
    const cur = Array.from(btns).indexOf(
      document.activeElement as HTMLButtonElement,
    );
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      focusButton((cur + 1) % btns.length);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      focusButton((cur - 1 + btns.length) % btns.length);
    }
  }

  return (
    <nav
      ref={navRef}
      className={"workspace-tabs" + (focused ? " focused" : "")}
      aria-label="Vaults"
      onKeyDown={onKeyDown}
    >
      {vaults.map((v) => {
        const active = v.id === activeId;
        const color = v.color ?? "#6a5acd";
        return (
          <button
            key={v.id}
            className={"vault-avatar" + (active ? " active" : "")}
            style={{ background: color }}
            title={`${v.name}\n${v.path}`}
            onClick={() => onSelect(v.id)}
          >
            {initialFor(v.name)}
          </button>
        );
      })}
      <button
        className="vault-avatar vault-add"
        title="Add vault"
        onClick={onAdd}
      >
        +
      </button>
    </nav>
  );
}
