# Clawless Mobile (Flutter)

**Status:** Phase 2 — not yet implemented.

The Flutter app will:
- Connect to the FastAPI backend (`services/backend/`) for all file CRUD and git operations (no local clone on device)
- PAT-based auth to the backend
- Offline write queue, flushed to backend on reconnect
- On-device Whisper for voice dictation, with backend-side Claude refinement before commit

See the PRD §3.4 and §4.2 (F17–F20) for the full Phase 2 spec.
