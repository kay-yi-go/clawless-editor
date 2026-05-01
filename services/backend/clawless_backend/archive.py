from datetime import date as Date, timedelta

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class FileEntry(BaseModel):
    rel_path: str
    last_modified: str


class ArchivePlanInput(BaseModel):
    files: list[FileEntry]
    today_date: str
    threshold_days: int = 30


class ArchiveAction(BaseModel):
    rel_path: str
    archive_path: str


class ArchivePlanOutput(BaseModel):
    actions: list[ArchiveAction]


@router.post("/archive-plan", response_model=ArchivePlanOutput)
async def archive_plan(input: ArchivePlanInput) -> ArchivePlanOutput:
    try:
        today = Date.fromisoformat(input.today_date)
    except ValueError:
        return ArchivePlanOutput(actions=[])
    threshold = today - timedelta(days=input.threshold_days)

    actions: list[ArchiveAction] = []
    for f in input.files:
        if f.rel_path.startswith("archive/") or f.rel_path == "archive":
            continue
        try:
            mtime = Date.fromisoformat(f.last_modified[:10])
        except ValueError:
            continue
        if mtime < threshold:
            actions.append(
                ArchiveAction(
                    rel_path=f.rel_path,
                    archive_path=f"archive/{f.rel_path}",
                )
            )
    return ArchivePlanOutput(actions=actions)
