import { EditorState, type TransactionSpec } from "@codemirror/state";

const REPLACEMENTS: Array<[string, string]> = [
  ["->", "→"],
  ["=>", "⇒"],
  ["<-", "←"],
  ["...", "…"],
  ["(c)", "©"],
];

export const autoReplace = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input.type")) return tr;
  const newDoc = tr.newDoc;
  const followups: TransactionSpec[] = [];

  tr.changes.iterChanges((_fromA, _toA, _fromB, toB) => {
    for (const [pat, repl] of REPLACEMENTS) {
      if (toB < pat.length) continue;
      const slice = newDoc.sliceString(toB - pat.length, toB);
      if (slice === pat) {
        followups.push({
          changes: { from: toB - pat.length, to: toB, insert: repl },
        });
        return;
      }
    }
  });

  if (followups.length === 0) return tr;
  return [tr, ...followups];
});
