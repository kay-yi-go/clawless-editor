import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
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

type DecoEntry = {
  from: number;
  to: number;
  deco: Decoration;
  side: number;
};

function buildDecorations(view: EditorView): DecorationSet {
  const cursor = view.state.selection.main.head;
  const cursorLineNo = view.state.doc.lineAt(cursor).number;
  const tree = syntaxTree(view.state);
  const entries: DecoEntry[] = [];

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter: (node: { from: number; to: number; type: { name: string } }) => {
        const name = node.type.name;

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

        const nodeLine = view.state.doc.lineAt(node.from).number;
        const onCursorLine = nodeLine === cursorLineNo;
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

  entries.sort((a, b) => a.from - b.from || a.side - b.side || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  let lastFrom = -1;
  let lastTo = -1;
  for (const e of entries) {
    if (e.from < lastFrom) continue;
    if (e.from === lastFrom && e.to === lastTo) continue;
    if (e.from < lastTo) continue;
    builder.add(e.from, e.to, e.deco);
    lastFrom = e.from;
    lastTo = e.to;
  }
  return builder.finish();
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
