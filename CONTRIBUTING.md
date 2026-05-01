# Contributing to Clawless

Thanks for your interest. Clawless is in early Phase 2 development; the workflow below applies to the maintainer's daily flow as much as to any external contributor.

## Workflow

```
main
 │
 ├─ feat/your-feature       ← work happens here
 │   └─ commits…
 │
 └─ ← squash-merged via PR
```

- **Never push directly to `main`.** Every change — including tiny fixes — goes through a feature branch and a PR.
- **Branch naming**:
  - `feat/` — new feature
  - `fix/` — bug fix
  - `docs/` — docs only
  - `chore/` — tooling, deps, refactor with no behavior change
  - `phase-N/` — work tied to a PRD phase
- **One PR = one logical change.** Keep them small enough to review in one sitting.

## Commit messages

Loose [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(desktop): add hint-mode keyboard click
fix(backend): handle empty vault on daily-log generate
docs: clarify dev setup
chore(deps): bump @codemirror/view to 6.41.2
```

Why bother solo? Because squash-merging a PR with a clean conventional title makes `git log` self-documenting, and changelog generation is automatic when we get there.

## Local dev

See the per-component README:
- `apps/desktop/` — Tauri + React + CodeMirror 6
- `services/backend/` — FastAPI (uv-managed)
- `apps/mobile/` — Flutter (Phase 2; not yet started)

Run `pnpm build` (desktop) and `cargo check` (Tauri) before opening a PR. CI will run both anyway, but catching it locally is faster.

## Reporting issues

GitHub Issues. Include:
- OS + version
- What you tried
- What happened
- What you expected

For security-sensitive reports (e.g., a vault read/write boundary leak), email kay.yi.go@gmail.com instead of opening a public issue.

## Code style

- TypeScript: strict mode is on; let the compiler help you.
- Rust: `cargo fmt` + `cargo clippy` clean before merging.
- Python: `ruff` clean (`uv run ruff check .`).
- No bikeshedding on style — if a tool can format it, the tool wins.

## License

By contributing you agree your contributions are licensed under MIT, the same as the project.
