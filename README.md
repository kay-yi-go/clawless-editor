# Clawless

> A keyboard-first, GitHub-backed markdown editor for people who think in plain text and hate friction.

Clawless runs natively on Windows (Tauri), with iOS + Android coming next via Flutter, all sharing a small FastAPI backend for LLM calls and (Phase 2) mobile git operations. The vault is a plain GitHub repo — no proprietary database, no cloud lock-in.

**Status:** Phase 1 (desktop) feature-complete and in dogfood. Phase 2 (mobile + hosted backend) starts next.

## What's in this repo

```
clawless/
├── apps/
│   ├── desktop/         Tauri v2 + React + CodeMirror 6
│   └── mobile/          Flutter (Phase 2)
├── services/
│   └── backend/         FastAPI (LLM, daily-log, auto-rename, auto-archive)
├── docs/                Architecture notes (PRD lives elsewhere for now)
└── .github/workflows/   CI
```

## Quick start

### Prereqs

- **Desktop**: Rust toolchain (`rustup`), Node 20+, [pnpm](https://pnpm.io)
- **Backend**: Python 3.11+, [uv](https://docs.astral.sh/uv/)
- **System**: Windows 10/11 (macOS support is Phase 1.5; Linux untested)

### Run the desktop app

```powershell
cd apps/desktop
pnpm install
pnpm tauri dev
```

First run opens a wizard to pick the vault folder(s) you want to edit.

### Run the backend (optional in Phase 1)

The backend powers daily-log generation, auto-rename via Claude Haiku, and auto-archive. Without it, those features no-op gracefully.

```powershell
cd services/backend
uv sync
copy .env.example .env  # then edit values
uv run uvicorn clawless_backend.main:app --reload --port 8787
```

In the desktop app's Settings → Backend, point URL at `http://127.0.0.1:8787` and paste the `CLAWLESS_API_KEY` you set in `.env`.

## Phase 1 features

- Keyboard-first navigation: F6 cycles every pane (vault → recent → filter → tree → tabs → editor → search), Vimium-style hint mode (`F` or `Ctrl+;`) clicks anything by keystroke
- Multi-vault workspaces with Slack-style left tab bar; per-vault settings sync to git via `.clawless/`
- Inline markdown rendering (Typora-style headings, bullets, checkboxes hide their markup off the cursor line)
- Slack-style search bar with operators: `filename:` `content:` `folder:` `modified:` `before:` `after:` `created:`
- Foldable directories, draggable + resizable sidebar panes (filter / recent / tree)
- Background git sync (no console popup), auto-rename via Claude Haiku, daily-log carry-forward, auto-archive
- Customizable theme (3 vivid + 3 pastel palette, 10 presets, "surprise me", custom font), light/dark/system mode
- Fully rebindable shortcuts (Settings → Keybindings or edit `<vault>/keybindings.json`)
- Persists open tabs and active tab per vault across launches

See [the original PRD](docs/) for the full specification.

## License

MIT — see [LICENSE](LICENSE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch + PR workflow.
