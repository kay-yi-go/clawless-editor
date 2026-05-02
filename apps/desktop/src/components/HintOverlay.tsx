import type { Hint } from "../hooks/useHintMode";

type Props = {
  hints: Hint[];
  input: string;
};

export default function HintOverlay({ hints, input }: Props) {
  if (hints.length === 0) return null;
  return (
    <div className="hint-layer" aria-hidden="true">
      {hints.map(({ label, rect }) => {
        if (input && !label.startsWith(input)) return null;
        const matched = label.slice(0, input.length);
        const remaining = label.slice(input.length);
        return (
          <span
            key={label}
            className="hint-tag"
            style={{
              top: Math.max(0, rect.top - 2),
              left: Math.max(0, rect.left - 2),
            }}
          >
            <span className="hint-typed">{matched}</span>
            {remaining}
          </span>
        );
      })}
    </div>
  );
}
