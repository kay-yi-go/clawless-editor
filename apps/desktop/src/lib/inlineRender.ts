import { syntaxTree } from "@codemirror/language";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

const HEADING_CLASS: Record<string, string> = {
  ATXHeading1: "cm-h1",
  ATXHeading2: "cm-h2",
  ATXHeading3: "cm-h3",
  ATXHeading4: "cm-h4",
  ATXHeading5: "cm-h5",
  ATXHeading6: "cm-h6",
};

const HIDE_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrongMark",
  "QuoteMark",
]);

class CheckboxWidget extends WidgetType {
  constructor(
    public checked: boolean,
    public from: number,
  ) {
    super();
  }
  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.from === this.from;
  }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.className = "cm-task-checkbox";
    input.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const replacement = this.checked ? "[ ]" : "[x]";
      view.dispatch({
        changes: {
          from: this.from,
          to: this.from + 3,
          insert: replacement,
        },
      });
    });
    return input;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = "•";
    span.className = "cm-bullet";
    return span;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    public url: string,
    public alt: string,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt;
  }
  toDOM() {
    const isHttp = /^https?:\/\//i.test(this.url);
    if (isHttp) {
      const img = document.createElement("img");
      img.src = this.url;
      img.alt = this.alt;
      img.className = "cm-image";
      img.addEventListener("error", () => {
        img.className = "cm-image cm-image-broken";
      });
      return img;
    }
    const span = document.createElement("span");
    span.className = "cm-image-fallback";
    span.textContent = `🖼 ${this.alt || this.url}`;
    span.title = this.url;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}

type DecoEntry = {
  from: number;
  to: number;
  deco: Decoration;
  side: number;
};

function findInlineLink(
  source: string,
): { textStart: number; textEnd: number; urlEnd: number } | null {
  // Source is the full `[text](url)` or `[text](url "title")` slice.
  const closeBracket = source.indexOf("](");
  if (closeBracket <= 0) return null;
  if (!source.endsWith(")")) return null;
  return {
    textStart: 1,
    textEnd: closeBracket,
    urlEnd: source.length - 1,
  };
}

function findInlineImage(source: string): {
  altStart: number;
  altEnd: number;
  urlStart: number;
  urlEnd: number;
} | null {
  // Source is the full `![alt](url)` slice.
  if (!source.startsWith("!")) return null;
  const closeBracket = source.indexOf("](");
  if (closeBracket <= 1) return null;
  if (!source.endsWith(")")) return null;
  return {
    altStart: 2,
    altEnd: closeBracket,
    urlStart: closeBracket + 2,
    urlEnd: source.length - 1,
  };
}

function buildDecorations(view: EditorView): DecorationSet {
  const cursor = view.state.selection.main.head;
  const cursorLineNo = view.state.doc.lineAt(cursor).number;
  const tree = syntaxTree(view.state);
  const entries: DecoEntry[] = [];

  const addLineDecoRange = (from: number, to: number, className: string) => {
    const firstLine = view.state.doc.lineAt(from);
    const lastLine = view.state.doc.lineAt(Math.max(from, to - 1));
    for (let n = firstLine.number; n <= lastLine.number; n++) {
      const line = view.state.doc.line(n);
      entries.push({
        from: line.from,
        to: line.from,
        deco: Decoration.line({ class: className }),
        side: -1,
      });
    }
  };

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node: { from: number; to: number; type: { name: string } }) => {
        const name = node.type.name;
        const nodeLine = view.state.doc.lineAt(node.from).number;
        const onCursorLine = nodeLine === cursorLineNo;

        // ─── Always-applied (regardless of cursor) ─────────────────

        if (HEADING_CLASS[name]) {
          const line = view.state.doc.lineAt(node.from);
          entries.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ class: HEADING_CLASS[name] }),
            side: -1,
          });
          return;
        }

        if (name === "InlineCode") {
          const length = node.to - node.from;
          if (length >= 2) {
            const innerStart = node.from + 1;
            const innerEnd = node.to - 1;
            if (innerEnd > innerStart) {
              entries.push({
                from: innerStart,
                to: innerEnd,
                deco: Decoration.mark({ class: "cm-inline-code" }),
                side: 0,
              });
            }
            if (!onCursorLine) {
              entries.push({
                from: node.from,
                to: innerStart,
                deco: Decoration.replace({}),
                side: 0,
              });
              entries.push({
                from: innerEnd,
                to: node.to,
                deco: Decoration.replace({}),
                side: 0,
              });
            }
          }
          return;
        }

        if (name === "Link") {
          const source = view.state.sliceDoc(node.from, node.to);
          const parts = findInlineLink(source);
          if (parts) {
            const textStart = node.from + parts.textStart;
            const textEnd = node.from + parts.textEnd;
            if (textEnd > textStart) {
              entries.push({
                from: textStart,
                to: textEnd,
                deco: Decoration.mark({ class: "cm-link" }),
                side: 0,
              });
            }
            if (!onCursorLine) {
              entries.push({
                from: node.from,
                to: textStart,
                deco: Decoration.replace({}),
                side: 0,
              });
              entries.push({
                from: textEnd,
                to: node.to,
                deco: Decoration.replace({}),
                side: 0,
              });
            }
          }
          return;
        }

        if (name === "Image") {
          if (!onCursorLine) {
            const source = view.state.sliceDoc(node.from, node.to);
            const parts = findInlineImage(source);
            if (parts) {
              const alt = source.slice(parts.altStart, parts.altEnd);
              const url = source.slice(parts.urlStart, parts.urlEnd);
              entries.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({
                  widget: new ImageWidget(url, alt),
                }),
                side: 0,
              });
            }
          }
          return;
        }

        if (name === "Blockquote") {
          addLineDecoRange(node.from, node.to, "cm-blockquote");
          return;
        }

        if (name === "FencedCode") {
          addLineDecoRange(node.from, node.to, "cm-fenced-code");
          const firstLine = view.state.doc.lineAt(node.from);
          const lastLine = view.state.doc.lineAt(
            Math.max(node.from, node.to - 1),
          );
          if (
            firstLine.number !== cursorLineNo &&
            firstLine.to > firstLine.from
          ) {
            entries.push({
              from: firstLine.from,
              to: firstLine.to,
              deco: Decoration.replace({}),
              side: 0,
            });
          }
          if (
            lastLine.number !== firstLine.number &&
            lastLine.number !== cursorLineNo &&
            lastLine.to > lastLine.from
          ) {
            entries.push({
              from: lastLine.from,
              to: lastLine.to,
              deco: Decoration.replace({}),
              side: 0,
            });
          }
          return;
        }

        // ─── Off-cursor only below ─────────────────────────────────
        if (onCursorLine) return;

        if (HIDE_MARKS.has(name)) {
          let end = node.to;
          if (name === "HeaderMark" || name === "QuoteMark") {
            const next = view.state.sliceDoc(node.to, node.to + 1);
            if (next === " ") end = node.to + 1;
          }
          if (end > node.from) {
            entries.push({
              from: node.from,
              to: end,
              deco: Decoration.replace({}),
              side: 0,
            });
          }
          return;
        }

        if (name === "TaskMarker") {
          const text = view.state.sliceDoc(node.from, node.to);
          const checked = /\[[xX]\]/.test(text);
          entries.push({
            from: node.from,
            to: node.to,
            deco: Decoration.replace({
              widget: new CheckboxWidget(checked, node.from),
            }),
            side: 0,
          });
          return;
        }

        if (name === "ListMark") {
          const lookahead = view.state.sliceDoc(
            node.to,
            Math.min(node.to + 5, view.state.doc.length),
          );
          const isTaskItem = /^\s*\[[ xX]\]/.test(lookahead);
          const next = lookahead.charAt(0);
          const consumeSpace = next === " " ? 1 : 0;
          if (isTaskItem) {
            entries.push({
              from: node.from,
              to: node.to + consumeSpace,
              deco: Decoration.replace({}),
              side: 0,
            });
          } else {
            entries.push({
              from: node.from,
              to: node.to + consumeSpace,
              deco: Decoration.replace({ widget: new BulletWidget() }),
              side: 0,
            });
          }
          return;
        }
      },
    });
  }

  return Decoration.set(
    entries.map((e) => e.deco.range(e.from, e.to)),
    true,
  );
}

export const inlineRender = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged || u.selectionSet) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);
