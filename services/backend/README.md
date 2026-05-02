# clawless-backend

FastAPI backend for [Clawless](https://github.com/...). Hosts LLM calls, daily-log generation, auto-rename, auto-archive, and (Phase 2) git operations for mobile clients plus WebSocket sync-state broadcast.

## Run locally (with uv)

```powershell
uv sync                        # creates .venv, installs all deps including dev group
copy .env.example .env         # then edit values
uv run uvicorn clawless_backend.main:app --reload --port 8787
```

`uv run` auto-syncs the env on each invocation, so day-to-day you only need:

```powershell
uv run uvicorn clawless_backend.main:app --reload --port 8787
```

## Run locally (pip fallback)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
copy .env.example .env
uvicorn clawless_backend.main:app --reload --port 8787
```

(Note: pip fallback won't install the `dev` group — that lives under `[dependency-groups]` per PEP 735, which uv reads natively.)

## Auth

All non-`/health` endpoints require `X-Clawless-Key: <CLAWLESS_API_KEY>` header. JWT comes in Phase 3.

## Endpoints (Phase 1)

- `GET /health` — liveness
- `POST /daily-log` — generate today's daily from yesterday's content (F22/F3)
- `POST /rename-suggest` — suggest a date-prefixed filename for a new note (F23/F10)
- `POST /archive-plan` — list files older than threshold (F24/F12)
