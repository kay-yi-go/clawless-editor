import { useMemo } from "react";
import { COMMAND_REGISTRY, type CommandDef } from "../lib/commands";
import type { Keybinding } from "../lib/keybindings";

type Props = {
  bindings: Keybinding[];
  onClose: () => void;
};

export default function HelpModal({ bindings, onClose }: Props) {
  const keysByCommand = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const b of bindings) {
      const list = m.get(b.command) ?? [];
      list.push(b.key);
      m.set(b.command, list);
    }
    return m;
  }, [bindings]);

  const grouped = useMemo(() => {
    const g = new Map<string, CommandDef[]>();
    for (const c of COMMAND_REGISTRY) {
      const arr = g.get(c.category) ?? [];
      arr.push(c);
      g.set(c.category, arr);
    }
    return g;
  }, []);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={onKeyDown}>
      <div
        className="modal help-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Keyboard shortcuts</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          {Array.from(grouped.entries()).map(([category, cmds]) => (
            <section key={category}>
              <h3>{category}</h3>
              <table className="help-table">
                <tbody>
                  {cmds.map((c) => {
                    const keys = keysByCommand.get(c.id) ?? [];
                    return (
                      <tr key={c.id}>
                        <td className="help-keys">
                          {keys.length === 0 ? (
                            <span className="help-unbound">unbound</span>
                          ) : (
                            keys.map((k) => (
                              <kbd key={k} className="help-kbd">
                                {k}
                              </kbd>
                            ))
                          )}
                        </td>
                        <td className="help-label">{c.label}</td>
                        <td className="help-desc">{c.description}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
