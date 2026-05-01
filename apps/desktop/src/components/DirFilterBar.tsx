import { useEffect, useRef, useState } from "react";
import {
  describeFilter,
  setDefaultDirFilter,
  type DirFilter,
} from "../lib/dirFilter";

type Props = {
  filter: DirFilter;
  defaultFilter: DirFilter | null;
  focused: boolean;
  onChange: (next: DirFilter) => void;
  onDefaultSaved: (saved: DirFilter | null) => void;
};

const PRESETS: DirFilter[] = [
  { kind: "all" },
  { kind: "last", n: 7, unit: "day" },
  { kind: "last", n: 30, unit: "day" },
  { kind: "this", unit: "month" },
  { kind: "this", unit: "year" },
];

function sameFilter(a: DirFilter | null, b: DirFilter | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === "all") return true;
  if (a.kind === "last" && b.kind === "last") {
    return a.n === b.n && a.unit === b.unit;
  }
  if (a.kind === "this" && b.kind === "this") {
    return a.unit === b.unit;
  }
  return false;
}

export default function DirFilterBar({
  filter,
  defaultFilter,
  focused,
  onChange,
  onDefaultSaved,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [customN, setCustomN] = useState(
    filter.kind === "last" ? filter.n : 7,
  );
  const [customUnit, setCustomUnit] = useState<"day" | "month" | "year">(
    filter.kind === "last"
      ? filter.unit
      : filter.kind === "this"
        ? filter.unit
        : "day",
  );
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (filter.kind === "last") {
      setCustomN(filter.n);
      setCustomUnit(filter.unit);
    } else if (filter.kind === "this") {
      setCustomUnit(filter.unit);
    }
  }, [filter]);

  function pickPreset(p: DirFilter) {
    onChange(p);
  }

  function applyCustomLast() {
    onChange({ kind: "last", n: Math.max(1, customN), unit: customUnit });
  }

  function applyCustomThis() {
    onChange({ kind: "this", unit: customUnit });
  }

  async function toggleDefault(checked: boolean) {
    const next = checked ? filter : null;
    await setDefaultDirFilter(next);
    onDefaultSaved(next);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      setExpanded((v) => !v);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (expanded) setExpanded(false);
      else (e.target as HTMLElement).blur();
    }
  }

  const isDefault = sameFilter(filter, defaultFilter);

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={
        "dir-filter-bar" +
        (focused ? " focused" : "") +
        (filter.kind !== "all" ? " active" : "")
      }
      onKeyDown={onKeyDown}
    >
      <button
        className="dir-filter-trigger"
        onClick={() => setExpanded((v) => !v)}
        title="Filter by recency"
      >
        <span className="dir-filter-icon">⏱</span>
        <span className="dir-filter-label">{describeFilter(filter)}</span>
        <span className="dir-filter-caret">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && (
        <div
          className="dir-filter-panel"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="dir-filter-presets">
            {PRESETS.map((p, i) => (
              <button
                key={i}
                className={
                  "dir-filter-chip" + (sameFilter(p, filter) ? " active" : "")
                }
                onClick={() => pickPreset(p)}
              >
                {describeFilter(p)}
              </button>
            ))}
          </div>
          <div className="dir-filter-custom">
            <span>Last</span>
            <input
              type="number"
              min={1}
              max={999}
              value={customN}
              onChange={(e) => setCustomN(Math.max(1, Number(e.target.value)))}
            />
            <select
              value={customUnit}
              onChange={(e) =>
                setCustomUnit(e.target.value as "day" | "month" | "year")
              }
            >
              <option value="day">days</option>
              <option value="month">months</option>
              <option value="year">years</option>
            </select>
            <button onClick={applyCustomLast}>apply</button>
          </div>
          <div className="dir-filter-custom">
            <span>This</span>
            <select
              value={customUnit}
              onChange={(e) =>
                setCustomUnit(e.target.value as "day" | "month" | "year")
              }
            >
              <option value="day">day</option>
              <option value="month">month</option>
              <option value="year">year</option>
            </select>
            <button onClick={applyCustomThis}>apply</button>
          </div>
          <label className="dir-filter-default">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => void toggleDefault(e.target.checked)}
            />
            <span>Set as default for this vault</span>
          </label>
        </div>
      )}
    </div>
  );
}
