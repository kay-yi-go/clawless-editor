import { describe, expect, it } from "vitest";
import { applySearch, parseSearch } from "../search";
import type { TreeNode } from "../tree";

function file(rel: string): TreeNode {
  return {
    rel_path: rel,
    is_dir: false,
    depth: rel.split("/").length - 1,
    name: rel.split("/").pop() ?? rel,
  };
}

describe("parseSearch", () => {
  it("returns empty parsed for empty input", () => {
    const r = parseSearch("");
    expect(r.text).toBe("");
    expect(r.hasOperators).toBe(false);
    expect(r.error).toBeNull();
  });

  it("treats plain text as path match (lowercased)", () => {
    const r = parseSearch("Daily Log");
    expect(r.text).toBe("daily log");
    expect(r.hasOperators).toBe(false);
  });

  it("captures filename: operator", () => {
    const r = parseSearch("filename:foo");
    expect(r.filename).toBe("foo");
    expect(r.hasOperators).toBe(true);
    expect(r.text).toBe("");
  });

  it("captures content: operator", () => {
    const r = parseSearch("content:meeting");
    expect(r.content).toBe("meeting");
    expect(r.hasOperators).toBe(true);
  });

  it("captures folder: operator", () => {
    const r = parseSearch("folder:Conveyd");
    expect(r.folder).toBe("Conveyd");
  });

  it("strips operator from remaining text", () => {
    const r = parseSearch("standup folder:Conveyd notes");
    expect(r.folder).toBe("Conveyd");
    expect(r.text).toBe("standup  notes");
  });

  it("parses absolute date for before/after", () => {
    const r = parseSearch("after:2026-04-01");
    expect(r.modifiedAfter).toBe("2026-04-01");
    expect(r.error).toBeNull();
  });

  it("parses Nd relative date", () => {
    const r = parseSearch("after:7d");
    expect(r.modifiedAfter).toBeTruthy();
    expect(r.modifiedAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.error).toBeNull();
  });

  it("parses today/yesterday tokens", () => {
    const r1 = parseSearch("after:today");
    const r2 = parseSearch("before:yesterday");
    expect(r1.modifiedAfter).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r2.modifiedBefore).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("modified:>Nd maps to after", () => {
    const r = parseSearch("modified:>30d");
    expect(r.modifiedAfter).toBeTruthy();
    expect(r.modifiedBefore).toBeNull();
  });

  it("modified:<DATE maps to before", () => {
    const r = parseSearch("modified:<2026-01-01");
    expect(r.modifiedBefore).toBe("2026-01-01");
    expect(r.modifiedAfter).toBeNull();
  });

  it("created:DATE for date-prefixed file matching", () => {
    const r = parseSearch("created:>2026-04-01");
    expect(r.createdAfter).toBe("2026-04-01");
  });

  it("returns error on unparsable date", () => {
    const r = parseSearch("after:notadate");
    expect(r.error).toMatch(/cannot parse date/);
  });

  it("combines multiple operators", () => {
    const r = parseSearch("folder:Conveyd modified:>7d filename:notes");
    expect(r.folder).toBe("Conveyd");
    expect(r.modifiedAfter).toBeTruthy();
    expect(r.filename).toBe("notes");
  });
});

describe("applySearch", () => {
  const nodes: TreeNode[] = [
    file("daily-log/2026-04-15_daily.md"),
    file("daily-log/2026-04-20_daily.md"),
    file("Conveyd/specs/api.md"),
    file("Conveyd/notes.md"),
    file("Personal/journal.md"),
  ];

  const meta = new Map<string, string>([
    ["daily-log/2026-04-15_daily.md", "2026-04-15"],
    ["daily-log/2026-04-20_daily.md", "2026-04-20"],
    ["Conveyd/specs/api.md", "2026-03-01"],
    ["Conveyd/notes.md", "2026-04-25"],
    ["Personal/journal.md", "2026-04-10"],
  ]);

  it("returns all when no filter", () => {
    const r = applySearch(nodes, parseSearch(""), meta, null);
    expect(r.length).toBe(5);
  });

  it("filters by folder", () => {
    const r = applySearch(nodes, parseSearch("folder:Conveyd"), meta, null);
    expect(r.map((n) => n.rel_path)).toEqual([
      "Conveyd/specs/api.md",
      "Conveyd/notes.md",
    ]);
  });

  it("filters by plain text path match", () => {
    const r = applySearch(nodes, parseSearch("daily"), meta, null);
    expect(r.length).toBe(2);
  });

  it("filters by filename: only basename", () => {
    const r = applySearch(nodes, parseSearch("filename:notes"), meta, null);
    expect(r.map((n) => n.rel_path)).toEqual(["Conveyd/notes.md"]);
  });

  it("filters by modified after", () => {
    const r = applySearch(nodes, parseSearch("after:2026-04-15"), meta, null);
    expect(r.length).toBe(3);
  });

  it("filters by modified before", () => {
    const r = applySearch(nodes, parseSearch("before:2026-04-15"), meta, null);
    expect(r.map((n) => n.rel_path)).toContain("Conveyd/specs/api.md");
    expect(r.map((n) => n.rel_path)).toContain("Personal/journal.md");
    expect(r.length).toBe(3);
  });

  it("created: matches date-prefixed filenames only", () => {
    const r = applySearch(
      nodes,
      parseSearch("created:>2026-04-18"),
      meta,
      null,
    );
    expect(r.map((n) => n.rel_path)).toEqual(["daily-log/2026-04-20_daily.md"]);
  });

  it("content: requires explicit set of matching paths", () => {
    const matches = new Set(["Conveyd/notes.md"]);
    const r = applySearch(nodes, parseSearch("content:foo"), meta, matches);
    expect(r.map((n) => n.rel_path)).toEqual(["Conveyd/notes.md"]);
  });

  it("content: with null matches yields empty", () => {
    const r = applySearch(nodes, parseSearch("content:foo"), meta, null);
    expect(r).toEqual([]);
  });
});
