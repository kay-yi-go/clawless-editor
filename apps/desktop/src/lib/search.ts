import type { TreeNode } from "./tree";

export type ParsedSearch = {
  text: string;
  filename: string | null;
  content: string | null;
  hasOperators: boolean;
  folder: string | null;
  modifiedAfter: string | null;
  modifiedBefore: string | null;
  createdAfter: string | null;
  createdBefore: string | null;
  error: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const md = raw.match(/^(\d+)d$/);
  if (md) {
    const n = parseInt(md[1], 10);
    return dateToStr(new Date(Date.now() - n * 86400000));
  }
  if (raw === "today") return dateToStr(new Date());
  if (raw === "yesterday") return dateToStr(new Date(Date.now() - 86400000));
  return null;
}

const OPERATOR_RE =
  /(folder|modified|created|before|after|filename|content):(\S+)/g;

export function parseSearch(input: string): ParsedSearch {
  const result: ParsedSearch = {
    text: "",
    filename: null,
    content: null,
    hasOperators: false,
    folder: null,
    modifiedAfter: null,
    modifiedBefore: null,
    createdAfter: null,
    createdBefore: null,
    error: null,
  };
  let stripped = input;
  OPERATOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OPERATOR_RE.exec(input))) {
    result.hasOperators = true;
    const [full, op, raw] = m;
    stripped = stripped.replace(full, "");
    if (op === "folder") {
      result.folder = raw;
      continue;
    }
    if (op === "filename") {
      result.filename = raw.toLowerCase();
      continue;
    }
    if (op === "content") {
      result.content = raw.toLowerCase();
      continue;
    }
    if (op === "before" || op === "after") {
      const d = parseDate(raw);
      if (!d) {
        result.error = `cannot parse date "${raw}"`;
        continue;
      }
      if (op === "after") result.modifiedAfter = d;
      else result.modifiedBefore = d;
      continue;
    }
    const dir = raw.startsWith(">")
      ? "after"
      : raw.startsWith("<")
        ? "before"
        : "after";
    const datePart = raw.replace(/^[<>]/, "");
    const d = parseDate(datePart);
    if (!d) {
      result.error = `cannot parse date "${raw}"`;
      continue;
    }
    if (op === "modified") {
      if (dir === "after") result.modifiedAfter = d;
      else result.modifiedBefore = d;
    } else if (op === "created") {
      if (dir === "after") result.createdAfter = d;
      else result.createdBefore = d;
    }
  }
  result.text = stripped.trim().toLowerCase();
  return result;
}

const DATE_PREFIX_RE = /^(\d{4}-\d{2}-\d{2})_/;

function extractCreatedDate(relPath: string): string | null {
  const base = relPath.split("/").pop() ?? "";
  const m = base.match(DATE_PREFIX_RE);
  return m ? m[1] : null;
}

export function applySearch(
  nodes: TreeNode[],
  parsed: ParsedSearch,
  metaByPath: Map<string, string>,
  contentMatches: Set<string> | null,
): TreeNode[] {
  const hasAnyFilter =
    parsed.hasOperators || parsed.text.length > 0 || parsed.folder !== null;
  return nodes.filter((n) => {
    if (parsed.folder) {
      if (
        !n.rel_path.startsWith(parsed.folder + "/") &&
        n.rel_path !== parsed.folder
      ) {
        return false;
      }
    }
    if (parsed.text) {
      if (n.is_dir) return false;
      if (!n.rel_path.toLowerCase().includes(parsed.text)) return false;
    }
    if (parsed.filename) {
      if (n.is_dir) return false;
      const base = n.rel_path.split("/").pop() ?? "";
      if (!base.toLowerCase().includes(parsed.filename)) return false;
    }
    if (parsed.content !== null) {
      if (n.is_dir) return false;
      if (!contentMatches || !contentMatches.has(n.rel_path)) return false;
    }
    if (parsed.modifiedAfter || parsed.modifiedBefore) {
      if (n.is_dir) return false;
      const mtime = metaByPath.get(n.rel_path);
      if (!mtime) return false;
      if (parsed.modifiedAfter && mtime < parsed.modifiedAfter) return false;
      if (parsed.modifiedBefore && mtime > parsed.modifiedBefore) return false;
    }
    if (parsed.createdAfter || parsed.createdBefore) {
      if (n.is_dir) return false;
      const cdate = extractCreatedDate(n.rel_path);
      if (!cdate) return false;
      if (parsed.createdAfter && cdate < parsed.createdAfter) return false;
      if (parsed.createdBefore && cdate > parsed.createdBefore) return false;
    }
    if (hasAnyFilter && n.is_dir) return false;
    return true;
  });
}
