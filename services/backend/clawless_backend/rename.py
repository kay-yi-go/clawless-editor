import re

from fastapi import APIRouter
from pydantic import BaseModel

from .llm import haiku_complete

router = APIRouter()

SYSTEM_PROMPT = (
    "You suggest concise machine-readable filenames for markdown notes. "
    "Reply with ONLY the filename, no extension, no quotes, no commentary."
)

USER_TEMPLATE = """\
Suggest a filename for this markdown note in the format:
{today_date}_<topic>_<details>_v1

Rules:
- topic and details are 1-3 words each, lowercase, snake_case
- ASCII letters, digits, underscores, and hyphens only
- no .md extension
- no surrounding quotes or punctuation

Note content:
---
{preview}
---
"""

NAME_RE = re.compile(r"[A-Za-z0-9_\-]+")


class RenameInput(BaseModel):
    content_preview: str
    today_date: str


class RenameOutput(BaseModel):
    suggested_name: str


def _sanitize(raw: str, today_date: str) -> str:
    token = next(iter(NAME_RE.findall(raw.strip())), "")
    if not token:
        return f"{today_date}_untitled"
    if not token.startswith(today_date):
        token = f"{today_date}_{token}"
    return token[:120]


@router.post("/rename-suggest", response_model=RenameOutput)
async def rename_suggest(input: RenameInput) -> RenameOutput:
    preview = input.content_preview[:1000]
    user = USER_TEMPLATE.format(today_date=input.today_date, preview=preview)
    try:
        raw = await haiku_complete(system=SYSTEM_PROMPT, user=user, max_tokens=64)
        return RenameOutput(suggested_name=_sanitize(raw, input.today_date))
    except Exception:
        return RenameOutput(suggested_name=f"{input.today_date}_untitled")
