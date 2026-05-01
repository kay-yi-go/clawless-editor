import { useState } from "react";
import { addVault, pickFolder, type Vault } from "../lib/vault";

type Draft = {
  path: string;
  name: string;
  github_remote: string;
  github_pat: string;
};

type Props = {
  onDone: (vaults: Vault[]) => void;
};

function basename(p: string): string {
  const norm = p.replace(/\\/g, "/");
  return norm.split("/").filter(Boolean).pop() ?? "vault";
}

export default function FirstRun({ onDone }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function pickAndAdd() {
    setError(null);
    const path = await pickFolder();
    if (!path) return;
    const draft: Draft = {
      path,
      name: basename(path),
      github_remote: "",
      github_pat: "",
    };
    setDrafts((d) => [...d, draft]);
    setEditing(draft);
  }

  function updateDraft(patch: Partial<Draft>) {
    if (!editing) return;
    const updated = { ...editing, ...patch };
    setEditing(updated);
    setDrafts((ds) => ds.map((d) => (d.path === editing.path ? updated : d)));
  }

  function removeDraft(path: string) {
    setDrafts((ds) => ds.filter((d) => d.path !== path));
    if (editing?.path === path) setEditing(null);
  }

  async function finish() {
    if (drafts.length === 0) return;
    setSubmitting(true);
    setError(null);
    const created: Vault[] = [];
    try {
      for (const d of drafts) {
        const v = await addVault(d.path, {
          name: d.name,
          github_remote: d.github_remote || undefined,
          github_pat: d.github_pat || undefined,
        });
        created.push(v);
      }
      onDone(created);
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="firstrun">
      <div className="firstrun-card">
        <h1>Welcome to Clawless</h1>
        <p>
          Pick the folders you'll work with. You can pair each one with a GitHub
          repo for sync, or skip and add it later.
        </p>

        <div className="firstrun-list">
          {drafts.map((d) => (
            <div
              key={d.path}
              className={
                "firstrun-item" + (editing?.path === d.path ? " editing" : "")
              }
              onClick={() => setEditing(d)}
            >
              <div className="firstrun-item-main">
                <strong>{d.name}</strong>
                <div className="firstrun-item-path">{d.path}</div>
                {d.github_remote && (
                  <div className="firstrun-item-remote">
                    ↗ {d.github_remote}
                  </div>
                )}
              </div>
              <button
                className="firstrun-remove"
                onClick={(e) => {
                  e.stopPropagation();
                  removeDraft(d.path);
                }}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {editing && (
          <div className="firstrun-editor">
            <label>
              Display name
              <input
                value={editing.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
              />
            </label>
            <label>
              GitHub remote URL (optional)
              <input
                placeholder="https://github.com/you/your-vault.git"
                value={editing.github_remote}
                onChange={(e) => updateDraft({ github_remote: e.target.value })}
              />
            </label>
            <label>
              GitHub PAT (optional)
              <input
                type="password"
                placeholder="ghp_…"
                value={editing.github_pat}
                onChange={(e) => updateDraft({ github_pat: e.target.value })}
              />
            </label>
            <p className="firstrun-note">
              The PAT is stored locally in this app's config. Sync currently
              uses the system git CLI's credential manager — set it up there for
              actual auth.
            </p>
          </div>
        )}

        <div className="firstrun-actions">
          <button onClick={pickAndAdd}>+ add another folder</button>
          <button
            className="primary"
            onClick={finish}
            disabled={drafts.length === 0 || submitting}
          >
            {submitting ? "Adding…" : `Continue (${drafts.length})`}
          </button>
        </div>

        {error && <div className="firstrun-error">{error}</div>}
      </div>
    </div>
  );
}
