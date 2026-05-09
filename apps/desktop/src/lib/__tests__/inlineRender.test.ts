import { afterEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { inlineRender } from "../inlineRender";

type Setup = {
  view: EditorView;
  cleanup: () => void;
};

function setup(doc: string, cursorPos = 0): Setup {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursorPos },
    extensions: [markdown({ base: markdownLanguage }), inlineRender],
  });
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ state, parent });
  return {
    view,
    cleanup: () => {
      view.destroy();
      parent.remove();
    },
  };
}

function visibleText(view: EditorView): string {
  return view.contentDOM.textContent ?? "";
}

let toCleanup: Array<() => void> = [];
afterEach(() => {
  toCleanup.forEach((fn) => fn());
  toCleanup = [];
});

function track(s: Setup): EditorView {
  toCleanup.push(s.cleanup);
  return s.view;
}

// Position right after the first character of the doc (line 1) — cursor lives
// on line 1, so all decorations on subsequent lines are "off-cursor".
const ON_LINE_1 = 0;

describe("inlineRender — inline code", () => {
  it("applies .cm-inline-code class to code spans", () => {
    const view = track(setup("hello\n`code` here", ON_LINE_1));
    const matches = view.contentDOM.querySelectorAll(".cm-inline-code");
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toBe("code");
  });

  it("hides backticks off cursor line", () => {
    const view = track(setup("first line\n`hidden` text", ON_LINE_1));
    const text = visibleText(view);
    expect(text).toContain("hidden");
    expect(text).not.toContain("`");
  });

  it("shows backticks when cursor is on the line", () => {
    const doc = "first line\n`shown` text";
    const cursorOnLine2 = doc.indexOf("shown");
    const view = track(setup(doc, cursorOnLine2));
    const text = visibleText(view);
    expect(text).toContain("`shown`");
  });

  it("ignores empty inline code (just two backticks)", () => {
    const view = track(setup("ok\n`` here", ON_LINE_1));
    const matches = view.contentDOM.querySelectorAll(".cm-inline-code");
    expect(matches.length).toBe(0);
  });
});

describe("inlineRender — links", () => {
  it("applies .cm-link to link text", () => {
    const view = track(
      setup("intro\n[Anthropic](https://anthropic.com)", ON_LINE_1),
    );
    const matches = view.contentDOM.querySelectorAll(".cm-link");
    expect(matches.length).toBe(1);
    expect(matches[0].textContent).toBe("Anthropic");
  });

  it("hides URL portion off cursor line", () => {
    const view = track(setup("intro\n[click](https://example.com)", ON_LINE_1));
    const text = visibleText(view);
    expect(text).toContain("click");
    expect(text).not.toContain("https://example.com");
    expect(text).not.toContain("[");
    expect(text).not.toContain("](");
  });

  it("shows full source on cursor line", () => {
    const doc = "intro\n[click](https://example.com)";
    const cursorOnLink = doc.indexOf("click");
    const view = track(setup(doc, cursorOnLink));
    const text = visibleText(view);
    expect(text).toContain("[click](https://example.com)");
  });
});

describe("inlineRender — images", () => {
  it("renders <img> for http URLs", () => {
    const view = track(
      setup("title\n![cat](https://example.com/cat.png)", ON_LINE_1),
    );
    const img = view.contentDOM.querySelector(
      "img.cm-image",
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toBe("https://example.com/cat.png");
    expect(img!.alt).toBe("cat");
  });

  it("falls back to .cm-image-fallback for relative URLs", () => {
    const view = track(setup("title\n![local](./pic.png)", ON_LINE_1));
    const img = view.contentDOM.querySelector("img.cm-image");
    expect(img).toBeNull();
    const fallback = view.contentDOM.querySelector(".cm-image-fallback");
    expect(fallback).not.toBeNull();
    expect(fallback!.textContent).toContain("local");
  });

  it("shows source on cursor line", () => {
    const doc = "title\n![cat](https://example.com/cat.png)";
    const cursorOnImage = doc.indexOf("cat");
    const view = track(setup(doc, cursorOnImage));
    const img = view.contentDOM.querySelector("img.cm-image");
    expect(img).toBeNull();
    expect(visibleText(view)).toContain("![cat]");
  });
});

describe("inlineRender — blockquotes", () => {
  it("applies .cm-blockquote line class to every line in the quote", () => {
    const view = track(setup("intro\n> first\n> second\n> third", ON_LINE_1));
    const lines = view.contentDOM.querySelectorAll(".cm-blockquote");
    expect(lines.length).toBe(3);
  });

  it("hides > markers off cursor line", () => {
    const view = track(setup("intro\n> quoted text", ON_LINE_1));
    const text = visibleText(view);
    expect(text).toContain("quoted text");
    expect(text).not.toContain(">");
  });
});

describe("inlineRender — fenced code", () => {
  it("applies .cm-fenced-code to every line in the block", () => {
    const view = track(
      setup("intro\n```bash\nls -la\necho hi\n```", ON_LINE_1),
    );
    const lines = view.contentDOM.querySelectorAll(".cm-fenced-code");
    expect(lines.length).toBe(4); // opening fence + 2 code lines + closing fence
  });

  it("hides opening fence + lang tag off cursor line", () => {
    const view = track(setup("intro\n```bash\nls -la\n```", ON_LINE_1));
    const text = visibleText(view);
    expect(text).toContain("ls -la");
    expect(text).not.toContain("```bash");
  });

  it("shows opening fence on cursor line", () => {
    const doc = "intro\n```bash\nls -la\n```";
    const cursorOnFence = doc.indexOf("```");
    const view = track(setup(doc, cursorOnFence));
    const text = visibleText(view);
    expect(text).toContain("```bash");
  });
});

describe("inlineRender — mixed content (regression)", () => {
  it("handles inline code and link on the same line", () => {
    const view = track(
      setup(
        "intro\nrun `npm install` then check [docs](https://npm.dev)",
        ON_LINE_1,
      ),
    );
    expect(view.contentDOM.querySelectorAll(".cm-inline-code").length).toBe(1);
    expect(view.contentDOM.querySelectorAll(".cm-link").length).toBe(1);
    const text = visibleText(view);
    expect(text).not.toContain("`");
    expect(text).not.toContain("https://npm.dev");
  });

  it("preserves heading rendering alongside new constructs", () => {
    const view = track(setup("# Title\n\n`code` rest", ON_LINE_1));
    expect(view.contentDOM.querySelector(".cm-h1")).not.toBeNull();
    expect(view.contentDOM.querySelector(".cm-inline-code")).not.toBeNull();
  });
});
