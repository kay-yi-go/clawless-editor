import { snippet } from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";

const PLACEHOLDER_GLOBAL =
  /<[^<>\n]+>|(?<![$#\\])\{[^{}\n]+\}|(?<!\])\[[^\[\]\n]+\](?!\()/g;

const PLACEHOLDER_DETECT =
  /<[^<>\n]+>|(?<![$#\\])\{[^{}\n]+\}|(?<!\])\[[^\[\]\n]+\](?!\()/;

function hasPlaceholders(text: string): boolean {
  return PLACEHOLDER_DETECT.test(text);
}

function joinAwkwardLineBreaks(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();
    if (
      trimmed.endsWith("\\") &&
      i + 1 < lines.length &&
      lines[i + 1].trim().length > 0
    ) {
      out.push(trimmed.slice(0, -1).trimEnd() + " " + lines[i + 1].trimStart());
      i += 1;
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function toSnippetTemplate(text: string): string {
  const escaped = text.replace(/([$#])(?=\{|\w)/g, "\\$1");
  let i = 0;
  return escaped.replace(PLACEHOLDER_GLOBAL, (m) => {
    const inner = m.slice(1, -1);
    return `\${${++i}:${inner}}`;
  });
}

export const commandPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || !hasPlaceholders(text)) return false;
    event.preventDefault();
    const joined = joinAwkwardLineBreaks(text);
    const tpl = toSnippetTemplate(joined);
    const sel = view.state.selection.main;
    snippet(tpl)(view, null, sel.from, sel.to);
    return true;
  },
});
