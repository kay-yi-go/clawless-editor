# Clawless Desktop

Tauri v2 + React + TypeScript + CodeMirror 6.

## Dev

```powershell
pnpm install
pnpm tauri dev
```

First run launches the multi-vault setup wizard.

## Build

```powershell
pnpm tauri build
```

Outputs to `src-tauri/target/release/bundle/`.

## Stack

- **Shell**: Tauri v2 (Rust). Local file I/O via Rust commands; no console popups for git ops (uses `std::process::Command` with `CREATE_NO_WINDOW`).
- **Frontend**: React 19 + TypeScript + Vite.
- **Editor**: CodeMirror 6 with `@codemirror/lang-markdown` + custom `inlineRender` decoration plugin (Typora-style hide-markup-on-non-cursor-line).
- **Window chrome** on Windows 11: mica/acrylic via `window-vibrancy`.
- **Tray**: Tauri's built-in tray-icon API.
- **File watcher**: `notify` crate for the auto-rename watchdog.

## Per-vault settings

Most settings sync via git: each vault keeps `keybindings.json` at its root and a `.clawless/` folder containing `bookmarks.json`, `session.json`, `dir-filter.json`. App-level settings (vault list, sync interval, theme) live in `%APPDATA%\dev.clawless.app\config.json`.

## Recommended VSCode extensions

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
