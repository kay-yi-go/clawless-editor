import { useEffect, useRef } from "react";
import { eventToKey, isGlobalKey, type Keybinding } from "../lib/keybindings";

const CHORD_TIMEOUT_MS = 1000;

function isEditorFocused(): boolean {
  const a = document.activeElement;
  if (!a) return false;
  if (a.closest(".cm-content")) return true;
  const tag = a.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return true;
  if ((a as HTMLElement).isContentEditable) return true;
  return false;
}

export function useKeybindings(
  bindings: Keybinding[],
  commands: Record<string, () => void>,
) {
  const bindingsRef = useRef(bindings);
  const commandsRef = useRef(commands);
  bindingsRef.current = bindings;
  commandsRef.current = commands;

  useEffect(() => {
    let chord = "";
    let timer: number | null = null;

    function reset() {
      chord = "";
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    }

    function findExact(seq: string): Keybinding | undefined {
      return bindingsRef.current.find((b) => b.key === seq);
    }

    function isPrefix(seq: string): boolean {
      const prefix = seq + " ";
      return bindingsRef.current.some((b) => b.key.startsWith(prefix));
    }

    function handler(e: KeyboardEvent) {
      if (document.body.classList.contains("hint-active")) return;
      if (document.body.classList.contains("kb-recording")) return;
      const key = eventToKey(e);
      if (!key) return;

      const editorFocused = isEditorFocused();
      const isModified = isGlobalKey(key);

      if (editorFocused && !isModified && !chord) {
        return;
      }

      const seq = chord ? `${chord} ${key}` : key;
      const exact = findExact(seq);
      if (exact) {
        const fn = commandsRef.current[exact.command];
        if (fn) {
          e.preventDefault();
          fn();
        }
        reset();
        return;
      }
      if (isPrefix(seq)) {
        e.preventDefault();
        chord = seq;
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(reset, CHORD_TIMEOUT_MS);
        return;
      }
      reset();
    }

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);
}
