import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDirFilter,
  cutoffFor,
  describeFilter,
  type DirFilter,
} from "../dirFilter";
import type { TreeNode } from "../tree";

function file(rel: string, depth = 0): TreeNode {
  return {
    rel_path: rel,
    is_dir: false,
    depth,
    name: rel.split("/").pop() ?? rel,
  };
}

function dir(rel: string, depth = 0): TreeNode {
  return {
    rel_path: rel,
    is_dir: true,
    depth,
    name: rel.split("/").pop() ?? rel,
  };
}

describe("describeFilter", () => {
  it("All", () => expect(describeFilter({ kind: "all" })).toBe("All"));
  it("Last 1 day singular", () =>
    expect(describeFilter({ kind: "last", n: 1, unit: "day" })).toBe(
      "Last 1 day",
    ));
  it("Last 7 days plural", () =>
    expect(describeFilter({ kind: "last", n: 7, unit: "day" })).toBe(
      "Last 7 days",
    ));
  it("This month", () =>
    expect(describeFilter({ kind: "this", unit: "month" })).toBe("This month"));
});

describe("cutoffFor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("All returns null", () => {
    expect(cutoffFor({ kind: "all" })).toBeNull();
  });

  it("Last N days subtracts days", () => {
    expect(cutoffFor({ kind: "last", n: 7, unit: "day" })).toBe("2026-05-08");
  });

  it("Last N months subtracts months", () => {
    expect(cutoffFor({ kind: "last", n: 1, unit: "month" })).toBe("2026-04-15");
  });

  it("Last N months wraps year", () => {
    expect(cutoffFor({ kind: "last", n: 6, unit: "month" })).toBe("2025-11-15");
  });

  it("Last N years subtracts years", () => {
    expect(cutoffFor({ kind: "last", n: 2, unit: "year" })).toBe("2024-05-15");
  });

  it("This day = today", () => {
    expect(cutoffFor({ kind: "this", unit: "day" })).toBe("2026-05-15");
  });

  it("This month = first of month", () => {
    expect(cutoffFor({ kind: "this", unit: "month" })).toBe("2026-05-01");
  });

  it("This year = Jan 1", () => {
    expect(cutoffFor({ kind: "this", unit: "year" })).toBe("2026-01-01");
  });
});

describe("applyDirFilter", () => {
  const nodes: TreeNode[] = [
    dir("daily-log", 0),
    file("daily-log/2026-05-10_d.md", 1),
    file("daily-log/2026-04-01_d.md", 1),
    dir("Conveyd", 0),
    file("Conveyd/notes.md", 1),
  ];
  const meta = new Map<string, string>([
    ["daily-log/2026-05-10_d.md", "2026-05-10"],
    ["daily-log/2026-04-01_d.md", "2026-04-01"],
    ["Conveyd/notes.md", "2026-05-12"],
  ]);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("All passes everything through", () => {
    const r = applyDirFilter(nodes, { kind: "all" }, meta);
    expect(r).toEqual(nodes);
  });

  it("Last 7 days keeps recent files + ancestor dirs", () => {
    const filter: DirFilter = { kind: "last", n: 7, unit: "day" };
    const r = applyDirFilter(nodes, filter, meta);
    const paths = r.map((n) => n.rel_path).sort();
    expect(paths).toEqual([
      "Conveyd",
      "Conveyd/notes.md",
      "daily-log",
      "daily-log/2026-05-10_d.md",
    ]);
  });

  it("Last 1 month drops files older than cutoff", () => {
    const filter: DirFilter = { kind: "last", n: 1, unit: "month" };
    const r = applyDirFilter(nodes, filter, meta);
    expect(
      r.find((n) => n.rel_path === "daily-log/2026-04-01_d.md"),
    ).toBeUndefined();
  });
});
