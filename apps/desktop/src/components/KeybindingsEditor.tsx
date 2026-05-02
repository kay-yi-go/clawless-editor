import { useEffect, useMemo, useState } from "react";
import { COMMAND_REGISTRY } from "../lib/commands";
import {
  eventToKey,
  loadKeybindings,
  saveKeybindings,
  type Keybinding,
} from "../lib/keybindings";

type Props = {
  onChanged: () => void;
};

export default function KeybindingsEditor({ onChanged }: Props) {
  const [bindings, setBindings] = useState<Keybinding[] | null>(null);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadKeybindings()
      .then(setBindings)
      .catch((e) => setError(String(e)));
  }, []);

  const keysByCommand = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!bindings) return m;
    for (const b of bindings) {
      const list = m.get(b.command) ?? [];
      list.push(b.key);
      m.set(b.command, list);
    }
    return m;
  }, [bindings]);

  useEffect(() => {
    if (!recordingFor) return;
    document.body.classList.add("kb-recording");
    function onKey(e: KeyboardEvent) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") {
        setRecordingFor(null);
        return;
      }
      const key = eventToKey(e);
      if (!key) return;
      setBindings((prev) => {
        if (!prev) return prev;
        const filtered = prev.filter(
          (b) => !(b.key === key) && !(b.command === recordingFor),
        );
        const next: Keybinding[] = [
          ...filtered,
          { key, command: recordingFor! },
        ];
        void saveKeybindings(next).then(() => onChanged());
        return next;
      });
      setRecordingFor(null);
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.classList.remove("kb-recording");
    };
  }, [recordingFor, onChanged]);

  function clearBinding(commandId: string) {
    setBindings((prev) => {
      if (!prev) return prev;
      const next = prev.filter((b) => b.command !== commandId);
      void saveKeybindings(next).then(() => onChanged());
      return next;
    });
  }

  async function resetAll() {
    if (!window.confirm("Reset all keybindings to defaults?")) return;
    try {
      await saveKeybindings([]);
      const reloaded = await loadKeybindings();
      setBindings(reloaded);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  if (!bindings) return <p>loading shortcuts…</p>;

  return (
    <div className="kb-editor">
      <p className="kb-help">
        Click a binding to record a new key. Press Esc while recording to
        cancel. Saved to <code>keybindings.json</code> in the active vault.
      </p>
      <table className="help-table">
        <tbody>
          {COMMAND_REGISTRY.map((c) => {
            const keys = keysByCommand.get(c.id) ?? [];
            const recording = recordingFor === c.id;
            return (
              <tr key={c.id}>
                <td className="help-keys">
                  {recording ? (
                    <span className="kb-recording">press a key…</span>
                  ) : keys.length === 0 ? (
                    <button
                      className="kb-rebind"
                      onClick={() => setRecordingFor(c.id)}
                    >
                      set…
                    </button>
                  ) : (
                    <button
                      className="kb-rebind kb-rebind-keys"
                      onClick={() => setRecordingFor(c.id)}
                    >
                      {keys.map((k) => (
                        <kbd key={k} className="help-kbd">
                          {k}
                        </kbd>
                      ))}
                    </button>
                  )}
                </td>
                <td className="help-label">{c.label}</td>
                <td className="help-actions">
                  {keys.length > 0 && (
                    <button
                      className="kb-clear"
                      onClick={() => clearBinding(c.id)}
                      aria-label="Clear binding"
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={resetAll}>Reset to defaults</button>
      {error && <div className="settings-error">{error}</div>}
    </div>
  );
}
