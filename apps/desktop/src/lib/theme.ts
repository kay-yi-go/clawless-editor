export type Vivid = {
  primary: string;
  accent: string;
  highlight: string;
};

export type ColorScheme = "light" | "dark" | "system";

export type Theme = {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  colorScheme: ColorScheme;
  vivid: Vivid;
  pastelOverrides: Partial<Vivid>;
  uiOverrides: Partial<{
    text: string;
    bg: string;
    surface: string;
    border: string;
  }>;
};

export const PALETTES: Array<{ name: string } & Vivid> = [
  { name: "Conveyd", primary: "#6a5acd", accent: "#1e90ff", highlight: "#ff66b3" },
  { name: "Sunset", primary: "#ee4266", accent: "#ff6b35", highlight: "#ffd23f" },
  { name: "Ocean", primary: "#0077b6", accent: "#00b4d8", highlight: "#90e0ef" },
  { name: "Forest", primary: "#2d6a4f", accent: "#52b788", highlight: "#95d5b2" },
  { name: "Cyberpunk", primary: "#ff006e", accent: "#fb5607", highlight: "#ffbe0b" },
  { name: "Mauve", primary: "#5e548e", accent: "#9f86c0", highlight: "#be95c4" },
  { name: "Spring", primary: "#ec4899", accent: "#34d399", highlight: "#fbbf24" },
  { name: "Slate", primary: "#475569", accent: "#0ea5e9", highlight: "#f43f5e" },
  { name: "Berry", primary: "#7c3aed", accent: "#db2777", highlight: "#f97316" },
  { name: "Mint", primary: "#0d9488", accent: "#10b981", highlight: "#84cc16" },
];

export const FONT_PRESETS: Array<{ name: string; value: string }> = [
  {
    name: "System mono (default)",
    value:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  },
  {
    name: "System sans",
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  {
    name: "System serif",
    value: 'Georgia, Cambria, "Times New Roman", Times, serif',
  },
  { name: "JetBrains Mono", value: '"JetBrains Mono", monospace' },
  { name: "Fira Code", value: '"Fira Code", monospace' },
  { name: "Inter", value: 'Inter, sans-serif' },
  { name: "IBM Plex Mono", value: '"IBM Plex Mono", monospace' },
  { name: "Source Code Pro", value: '"Source Code Pro", monospace' },
];

const DEFAULT_PALETTE = PALETTES[0];

export const DEFAULT_THEME: Theme = {
  fontSize: 14,
  lineHeight: 1.6,
  fontFamily: FONT_PRESETS[0].value,
  colorScheme: "system",
  vivid: {
    primary: DEFAULT_PALETTE.primary,
    accent: DEFAULT_PALETTE.accent,
    highlight: DEFAULT_PALETTE.highlight,
  },
  pastelOverrides: {},
  uiOverrides: {},
};

const THEME_KEY = "clawless.theme";

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [
    hue2rgb(h + 1 / 3) * 255,
    hue2rgb(h) * 255,
    hue2rgb(h - 1 / 3) * 255,
  ];
}

export function pastelOf(vivid: string): string {
  const [r, g, b] = hexToRgb(vivid);
  const [h, s, _l] = rgbToHsl(r, g, b);
  const newS = Math.max(20, Math.min(s, 55));
  const newL = 84;
  const [pr, pg, pb] = hslToRgb(h, newS, newL);
  return rgbToHex(pr, pg, pb);
}

function rgbAt(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

export function loadStoredTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Theme>;
      return {
        ...DEFAULT_THEME,
        ...parsed,
        vivid: { ...DEFAULT_THEME.vivid, ...(parsed.vivid ?? {}) },
        pastelOverrides: parsed.pastelOverrides ?? {},
        uiOverrides: parsed.uiOverrides ?? {},
      };
    }
  } catch {
    // ignore
  }
  return JSON.parse(JSON.stringify(DEFAULT_THEME));
}

export function saveTheme(t: Theme): void {
  localStorage.setItem(THEME_KEY, JSON.stringify(t));
}

export function applyTheme(t: Theme): void {
  const html = document.documentElement;
  if (t.colorScheme === "system") {
    html.removeAttribute("data-color-scheme");
  } else {
    html.setAttribute("data-color-scheme", t.colorScheme);
  }
  const root = html.style;
  root.setProperty("--editor-font-size", `${t.fontSize}px`);
  root.setProperty("--editor-line-height", String(t.lineHeight));
  root.setProperty("--editor-font-family", t.fontFamily);

  root.setProperty("--color-primary", t.vivid.primary);
  root.setProperty("--color-accent", t.vivid.accent);
  root.setProperty("--color-highlight", t.vivid.highlight);

  const pp = t.pastelOverrides.primary ?? pastelOf(t.vivid.primary);
  const ap = t.pastelOverrides.accent ?? pastelOf(t.vivid.accent);
  const hp = t.pastelOverrides.highlight ?? pastelOf(t.vivid.highlight);
  root.setProperty("--color-primary-pastel", pp);
  root.setProperty("--color-accent-pastel", ap);
  root.setProperty("--color-highlight-pastel", hp);

  if (t.uiOverrides.text) root.setProperty("--color-text", t.uiOverrides.text);
  if (t.uiOverrides.bg) {
    root.setProperty("--color-bg-solid", t.uiOverrides.bg);
    root.setProperty(
      "--color-bg",
      `rgba(${rgbAt(t.uiOverrides.bg)}, 0.78)`,
    );
  }
  if (t.uiOverrides.surface) {
    root.setProperty("--color-surface-solid", t.uiOverrides.surface);
    root.setProperty(
      "--color-surface",
      `rgba(${rgbAt(t.uiOverrides.surface)}, 0.78)`,
    );
  }
  if (t.uiOverrides.border) root.setProperty("--color-border", t.uiOverrides.border);
}

export function randomPalette(): Vivid {
  const list = PALETTES.filter((p) => p.name !== DEFAULT_PALETTE.name);
  const pick = list[Math.floor(Math.random() * list.length)];
  return { primary: pick.primary, accent: pick.accent, highlight: pick.highlight };
}
