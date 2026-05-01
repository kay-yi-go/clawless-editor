import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  addVault,
  listVaults,
  pickFolder,
  removeVault,
  updateVault,
  type Vault,
} from "../lib/vault";
import KeybindingsEditor from "./KeybindingsEditor";
import {
  applyTheme,
  DEFAULT_THEME,
  FONT_PRESETS,
  loadStoredTheme,
  PALETTES,
  pastelOf,
  randomPalette,
  saveTheme,
  type Theme,
} from "../lib/theme";

export { applyTheme, loadStoredTheme };

type AppSettings = {
  sync_interval_seconds: number;
  sync_enabled: boolean;
  autostart_enabled: boolean;
  archive_threshold_days: number;
};

type BackendConfig = {
  url: string;
  key: string;
};

type Props = {
  onClose: () => void;
  onVaultsChanged: () => void;
  onBindingsChanged: () => void;
};

export default function Settings({
  onClose,
  onVaultsChanged,
  onBindingsChanged,
}: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [backend, setBackend] = useState<BackendConfig | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [theme, setTheme] = useState<Theme>(loadStoredTheme());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reloadVaults() {
    listVaults().then(setVaults).catch((e) => setError(String(e)));
  }

  useEffect(() => {
    Promise.all([
      invoke<AppSettings>("get_settings"),
      invoke<BackendConfig>("get_backend_config"),
    ])
      .then(([s, b]) => {
        setSettings(s);
        setBackend(b);
      })
      .catch((e) => setError(String(e)));
    reloadVaults();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  async function save() {
    if (!settings || !backend) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("update_settings", { settings });
      await invoke("set_backend_config", {
        url: backend.url,
        key: backend.key,
      });
      saveTheme(theme);
      applyTheme(theme);
      onVaultsChanged();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  function resetTheme() {
    setTheme(JSON.parse(JSON.stringify(DEFAULT_THEME)) as Theme);
  }

  function setVivid(key: "primary" | "accent" | "highlight", value: string) {
    setTheme({
      ...theme,
      vivid: { ...theme.vivid, [key]: value },
    });
  }

  function setPastelOverride(
    key: "primary" | "accent" | "highlight",
    value: string,
  ) {
    setTheme({
      ...theme,
      pastelOverrides: { ...theme.pastelOverrides, [key]: value },
    });
  }

  function clearPastelOverride(key: "primary" | "accent" | "highlight") {
    const next = { ...theme.pastelOverrides };
    delete next[key];
    setTheme({ ...theme, pastelOverrides: next });
  }

  function setUiOverride(
    key: "text" | "bg" | "surface" | "border",
    value: string,
  ) {
    setTheme({
      ...theme,
      uiOverrides: { ...theme.uiOverrides, [key]: value },
    });
  }

  function clearUiOverride(key: "text" | "bg" | "surface" | "border") {
    const next = { ...theme.uiOverrides };
    delete next[key];
    setTheme({ ...theme, uiOverrides: next });
  }

  function applyPaletteByName(name: string) {
    const p = PALETTES.find((x) => x.name === name);
    if (!p) return;
    setTheme({
      ...theme,
      vivid: { primary: p.primary, accent: p.accent, highlight: p.highlight },
      pastelOverrides: {},
    });
  }

  function surpriseMe() {
    const v = randomPalette();
    setTheme({ ...theme, vivid: v, pastelOverrides: {} });
  }

  async function onAddVault() {
    setError(null);
    try {
      const path = await pickFolder();
      if (!path) return;
      await addVault(path);
      reloadVaults();
      onVaultsChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onRemoveVault(id: string, name: string) {
    if (!window.confirm(`Remove vault "${name}" from Clawless? Files on disk are not deleted.`)) return;
    try {
      await removeVault(id);
      reloadVaults();
      onVaultsChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onUpdateVault(id: string, patch: Parameters<typeof updateVault>[1]) {
    try {
      await updateVault(id, patch);
      reloadVaults();
      onVaultsChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function onChangeVaultPath(id: string) {
    const path = await pickFolder();
    if (!path) return;
    await onUpdateVault(id, { path });
  }

  if (!settings || !backend) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-body">
            {error ? `error: ${error}` : "loading…"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose} onKeyDown={onKeyDown}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          <section>
            <h3>Vaults</h3>
            {vaults.map((v) => (
              <VaultRow
                key={v.id}
                vault={v}
                onChange={(patch) => onUpdateVault(v.id, patch)}
                onChangePath={() => onChangeVaultPath(v.id)}
                onRemove={() => onRemoveVault(v.id, v.name)}
              />
            ))}
            <button onClick={onAddVault}>+ add vault</button>
          </section>

          <section>
            <h3>Backend</h3>
            <label>
              URL
              <input
                value={backend.url}
                onChange={(e) =>
                  setBackend({ ...backend, url: e.target.value })
                }
                placeholder="http://127.0.0.1:8787"
              />
            </label>
            <label>
              API key
              <input
                type="password"
                value={backend.key}
                onChange={(e) =>
                  setBackend({ ...backend, key: e.target.value })
                }
                placeholder="shared secret"
              />
            </label>
          </section>

          <section>
            <h3>Sync</h3>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.sync_enabled}
                onChange={(e) =>
                  setSettings({ ...settings, sync_enabled: e.target.checked })
                }
              />
              <span>Background sync enabled</span>
            </label>
            <label>
              Sync interval (minutes)
              <input
                type="number"
                min={1}
                max={240}
                value={Math.round(settings.sync_interval_seconds / 60)}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    sync_interval_seconds:
                      Math.max(1, Number(e.target.value)) * 60,
                  })
                }
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={settings.autostart_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    autostart_enabled: e.target.checked,
                  })
                }
              />
              <span>Start on login</span>
            </label>
          </section>

          <section>
            <h3>Archive</h3>
            <label>
              Archive files older than (days)
              <input
                type="number"
                min={1}
                max={365}
                value={settings.archive_threshold_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    archive_threshold_days: Math.max(1, Number(e.target.value)),
                  })
                }
              />
            </label>
          </section>

          <section>
            <h3>Appearance</h3>
            <label>
              Color scheme
              <select
                value={theme.colorScheme}
                onChange={(e) =>
                  setTheme({
                    ...theme,
                    colorScheme: e.target.value as
                      | "light"
                      | "dark"
                      | "system",
                  })
                }
              >
                <option value="system">System (follow OS)</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <div className="theme-row">
              <label>
                Editor font size
                <input
                  type="number"
                  min={10}
                  max={28}
                  value={theme.fontSize}
                  onChange={(e) =>
                    setTheme({ ...theme, fontSize: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Line height
                <input
                  type="number"
                  step="0.1"
                  min={1}
                  max={2.5}
                  value={theme.lineHeight}
                  onChange={(e) =>
                    setTheme({ ...theme, lineHeight: Number(e.target.value) })
                  }
                />
              </label>
            </div>
            <label>
              Editor font
              <select
                value={
                  FONT_PRESETS.find((f) => f.value === theme.fontFamily)
                    ?.value ?? ""
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v) setTheme({ ...theme, fontFamily: v });
                }}
              >
                {FONT_PRESETS.map((f) => (
                  <option key={f.name} value={f.value}>
                    {f.name}
                  </option>
                ))}
                {!FONT_PRESETS.some((f) => f.value === theme.fontFamily) && (
                  <option value={theme.fontFamily}>{theme.fontFamily}</option>
                )}
              </select>
            </label>
            <label>
              Custom font (CSS font-family value)
              <input
                placeholder='e.g. "JetBrains Mono", monospace'
                value={theme.fontFamily}
                onChange={(e) =>
                  setTheme({ ...theme, fontFamily: e.target.value })
                }
              />
            </label>

            <h4 className="theme-subhead">Palette presets</h4>
            <div className="theme-presets">
              {PALETTES.map((p) => {
                const active =
                  p.primary === theme.vivid.primary &&
                  p.accent === theme.vivid.accent &&
                  p.highlight === theme.vivid.highlight;
                return (
                  <button
                    key={p.name}
                    className={"theme-preset" + (active ? " active" : "")}
                    onClick={() => applyPaletteByName(p.name)}
                    title={p.name}
                  >
                    <span
                      className="theme-preset-swatch"
                      style={{ background: p.primary }}
                    />
                    <span
                      className="theme-preset-swatch"
                      style={{ background: p.accent }}
                    />
                    <span
                      className="theme-preset-swatch"
                      style={{ background: p.highlight }}
                    />
                    <span className="theme-preset-name">{p.name}</span>
                  </button>
                );
              })}
              <button className="theme-surprise" onClick={surpriseMe}>
                ✨ Surprise me
              </button>
            </div>

            <h4 className="theme-subhead">Vivid colors (required)</h4>
            <ColorTriple
              labels={["Primary", "Accent", "Highlight"]}
              values={[
                theme.vivid.primary,
                theme.vivid.accent,
                theme.vivid.highlight,
              ]}
              onChange={(idx, v) => {
                const key =
                  idx === 0 ? "primary" : idx === 1 ? "accent" : "highlight";
                setVivid(key, v);
              }}
            />

            <h4 className="theme-subhead">
              Pastel pairs (auto-computed; override if you like)
            </h4>
            <ColorTriple
              labels={["Primary pastel", "Accent pastel", "Highlight pastel"]}
              values={[
                theme.pastelOverrides.primary ?? pastelOf(theme.vivid.primary),
                theme.pastelOverrides.accent ?? pastelOf(theme.vivid.accent),
                theme.pastelOverrides.highlight ??
                  pastelOf(theme.vivid.highlight),
              ]}
              dimmed={[
                !theme.pastelOverrides.primary,
                !theme.pastelOverrides.accent,
                !theme.pastelOverrides.highlight,
              ]}
              onChange={(idx, v) => {
                const key =
                  idx === 0 ? "primary" : idx === 1 ? "accent" : "highlight";
                setPastelOverride(key, v);
              }}
              onClear={(idx) => {
                const key =
                  idx === 0 ? "primary" : idx === 1 ? "accent" : "highlight";
                clearPastelOverride(key);
              }}
            />

            <h4 className="theme-subhead">UI colors (override if you like)</h4>
            <UiColorRow
              label="Text"
              value={theme.uiOverrides.text}
              onChange={(v) => setUiOverride("text", v)}
              onClear={() => clearUiOverride("text")}
            />
            <UiColorRow
              label="Background"
              value={theme.uiOverrides.bg}
              onChange={(v) => setUiOverride("bg", v)}
              onClear={() => clearUiOverride("bg")}
            />
            <UiColorRow
              label="Surface"
              value={theme.uiOverrides.surface}
              onChange={(v) => setUiOverride("surface", v)}
              onClear={() => clearUiOverride("surface")}
            />
            <UiColorRow
              label="Border"
              value={theme.uiOverrides.border}
              onChange={(v) => setUiOverride("border", v)}
              onClear={() => clearUiOverride("border")}
            />

            <button onClick={resetTheme}>Reset appearance</button>
          </section>

          <section>
            <h3>Keybindings</h3>
            <KeybindingsEditor onChanged={onBindingsChanged} />
          </section>

          {error && <div className="settings-error">{error}</div>}
        </div>
        <footer className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button onClick={save} disabled={saving} className="primary">
            {saving ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ColorTriple(props: {
  labels: [string, string, string];
  values: [string, string, string];
  dimmed?: [boolean, boolean, boolean];
  onChange: (idx: number, value: string) => void;
  onClear?: (idx: number) => void;
}) {
  return (
    <div className="theme-triple">
      {props.values.map((v, i) => (
        <div
          key={i}
          className={
            "theme-triple-cell" +
            (props.dimmed?.[i] ? " is-auto" : "")
          }
        >
          <label>
            <span>{props.labels[i]}</span>
            <input
              type="color"
              value={v}
              onChange={(e) => props.onChange(i, e.target.value)}
            />
          </label>
          <code className="theme-color-code">{v}</code>
          {props.onClear && !props.dimmed?.[i] && (
            <button
              className="theme-clear"
              onClick={() => props.onClear?.(i)}
              title="Reset to auto-computed"
            >
              ↺
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function UiColorRow(props: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  const isOverride = props.value !== undefined;
  return (
    <label className="row theme-ui-row">
      <span style={{ flex: 1 }}>{props.label}</span>
      <input
        type="color"
        value={props.value ?? "#888888"}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {isOverride && (
        <button
          className="theme-clear"
          onClick={props.onClear}
          title="Reset to default"
        >
          ↺
        </button>
      )}
    </label>
  );
}

type VaultRowProps = {
  vault: Vault;
  onChange: (patch: {
    name?: string;
    github_remote?: string;
    github_pat?: string;
  }) => void;
  onChangePath: () => void;
  onRemove: () => void;
};

function VaultRow({ vault, onChange, onChangePath, onRemove }: VaultRowProps) {
  const [name, setName] = useState(vault.name);
  const [remote, setRemote] = useState(vault.github_remote ?? "");
  const [pat, setPat] = useState(vault.github_pat ?? "");
  const [expanded, setExpanded] = useState(false);

  function commitField(field: "name" | "github_remote" | "github_pat", value: string) {
    const patch: { name?: string; github_remote?: string; github_pat?: string } = {};
    patch[field] = value;
    onChange(patch);
  }

  return (
    <div className="vault-row">
      <div className="vault-row-head">
        <span
          className="vault-row-color"
          style={{ background: vault.color ?? "#6a5acd" }}
        />
        <input
          className="vault-row-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== vault.name && commitField("name", name)}
        />
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? "▾" : "▸"}
        </button>
        <button onClick={onRemove} aria-label="Remove">×</button>
      </div>
      {expanded && (
        <div className="vault-row-body">
          <label>
            Path
            <div className="vault-row-path">
              <code>{vault.path}</code>
              <button onClick={onChangePath}>change…</button>
            </div>
          </label>
          <label>
            GitHub remote URL
            <input
              value={remote}
              placeholder="https://github.com/you/your-vault.git"
              onChange={(e) => setRemote(e.target.value)}
              onBlur={() =>
                remote !== (vault.github_remote ?? "") &&
                commitField("github_remote", remote)
              }
            />
          </label>
          <label>
            GitHub PAT
            <input
              type="password"
              value={pat}
              placeholder="ghp_…"
              onChange={(e) => setPat(e.target.value)}
              onBlur={() =>
                pat !== (vault.github_pat ?? "") &&
                commitField("github_pat", pat)
              }
            />
          </label>
        </div>
      )}
    </div>
  );
}
