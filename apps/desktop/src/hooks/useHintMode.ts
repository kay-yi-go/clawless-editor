import { useCallback, useEffect, useRef, useState } from "react";

const HINT_ALPHABET = "asdfghjkl;weruio".split("");

const HINT_SELECTORS = [
  "button:not([disabled])",
  "a[href]",
  '[role="button"]',
  '[role="treeitem"]',
  '[role="tab"]',
  '[role="listitem"]',
  'input:not([type="hidden"]):not([disabled])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  ".vault-avatar",
  ".bookmark-item",
  ".tab",
  ".tree-item",
  ".firstrun-item",
];

export type Hint = {
  el: HTMLElement;
  label: string;
  rect: DOMRect;
};

function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (
    rect.bottom < 0 ||
    rect.top > window.innerHeight ||
    rect.right < 0 ||
    rect.left > window.innerWidth
  ) {
    return false;
  }
  let cur: HTMLElement | null = el;
  while (cur) {
    const style = window.getComputedStyle(cur);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    cur = cur.parentElement;
  }
  return true;
}

function generateLabels(count: number): string[] {
  if (count <= HINT_ALPHABET.length) {
    return HINT_ALPHABET.slice(0, count);
  }
  const out: string[] = [];
  for (const a of HINT_ALPHABET) {
    for (const b of HINT_ALPHABET) {
      out.push(a + b);
      if (out.length >= count) return out;
    }
  }
  return out;
}

function collectHints(): Hint[] {
  const set = new Set<HTMLElement>();
  for (const sel of HINT_SELECTORS) {
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      if (isVisible(el)) set.add(el);
    });
  }
  const arr = Array.from(set);
  arr.sort((a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 4) return ra.top - rb.top;
    return ra.left - rb.left;
  });
  const labels = generateLabels(arr.length);
  return arr.map((el, i) => ({
    el,
    label: labels[i],
    rect: el.getBoundingClientRect(),
  }));
}

export function useHintMode() {
  const [active, setActive] = useState(false);
  const [hints, setHints] = useState<Hint[]>([]);
  const [input, setInput] = useState("");
  const inputRef = useRef("");
  const hintsRef = useRef<Hint[]>([]);
  inputRef.current = input;
  hintsRef.current = hints;

  const cancel = useCallback(() => {
    setActive(false);
    setHints([]);
    setInput("");
  }, []);

  const activate = useCallback(() => {
    const collected = collectHints();
    if (collected.length === 0) return;
    setHints(collected);
    setInput("");
    setActive(true);
  }, []);

  useEffect(() => {
    if (active) document.body.classList.add("hint-active");
    else document.body.classList.remove("hint-active");
    return () => document.body.classList.remove("hint-active");
  }, [active]);

  useEffect(() => {
    if (!active) return;
    function clickElement(el: HTMLElement) {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        el.focus();
        return;
      }
      if (el instanceof HTMLSelectElement) {
        el.focus();
        return;
      }
      el.click();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setInput((s) => s.slice(0, -1));
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const ch = e.key.toLowerCase();
      const next = inputRef.current + ch;
      const exact = hintsRef.current.find((h) => h.label === next);
      if (exact) {
        cancel();
        setTimeout(() => clickElement(exact.el), 0);
        return;
      }
      const remaining = hintsRef.current.filter((h) =>
        h.label.startsWith(next),
      );
      if (remaining.length === 0) {
        cancel();
        return;
      }
      setInput(next);
    }
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", cancel, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", cancel, true);
    };
  }, [active, cancel]);

  return { active, hints, input, activate, cancel };
}
