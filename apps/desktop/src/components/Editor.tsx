import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { search } from "@codemirror/search";
import { autoReplace } from "../lib/autoReplace";
import { commandPaste } from "../lib/commandPaste";
import { inlineRender } from "../lib/inlineRender";

type Props = {
  initialDoc: string;
  visible: boolean;
  onChange?: (doc: string) => void;
};

export default function Editor({ initialDoc, visible, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange });
  callbacks.current = { onChange };

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: initialDoc,
        extensions: [
          basicSetup,
          markdown({ base: markdownLanguage }),
          inlineRender,
          autoReplace,
          commandPaste,
          search({ top: true }),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Escape",
              run: (v) => {
                v.contentDOM.blur();
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) callbacks.current.onChange?.(u.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    if (visible) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (visible) viewRef.current?.focus();
  }, [visible]);

  return (
    <div
      ref={hostRef}
      className={"editor-host" + (visible ? "" : " hidden")}
    />
  );
}
