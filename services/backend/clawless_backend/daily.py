import re

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

BULLET_RE = re.compile(r"^(\s*)- \[([ xX])\]\s+(.*)$")

DEFAULT_PROJECTS = ("Conveyd", "TimeTree", "Personal")
REFLECTIONS_TEMPLATE = (
    "## Reflections\n"
    "### 오늘 하루 루틴\n"
    "### 오늘의 운동\n"
    "### Highlights\n"
    "### Lowlights\n"
)


class DailyLogInput(BaseModel):
    yesterday_content: str | None = None
    today_date: str


class DailyLogOutput(BaseModel):
    content: str


def _parse_bullet(line: str) -> tuple[int, str, str] | None:
    m = BULLET_RE.match(line)
    if not m:
        return None
    return len(m.group(1)), m.group(2).lower(), m.group(3)


def _split_sections(text: str, level: int) -> list[tuple[str, list[str]]]:
    prefix = "#" * level + " "
    sections: list[tuple[str, list[str]]] = [("", [])]
    for line in text.splitlines():
        if line.startswith(prefix):
            sections.append((line[len(prefix):].strip(), []))
        else:
            sections[-1][1].append(line)
    return sections


def _carry_forward(lines: list[str]) -> list[str]:
    out: list[str] = []
    i, n = 0, len(lines)
    while i < n:
        bullet = _parse_bullet(lines[i])
        if bullet is None:
            out.append(lines[i])
            i += 1
            continue
        indent, marker, _ = bullet
        end = i + 1
        while end < n:
            cb = _parse_bullet(lines[end])
            if cb is None or cb[0] <= indent:
                break
            end += 1
        children = range(i + 1, end)
        if marker == "x":
            for ci in children:
                cb = _parse_bullet(lines[ci])
                if cb and cb[1] == " ":
                    out.append(" " * indent + f"- [ ] {cb[2]}")
        else:
            out.append(lines[i])
            for ci in children:
                cb = _parse_bullet(lines[ci])
                if cb is None:
                    out.append(lines[ci])
                elif cb[1] == " ":
                    out.append(lines[ci])
        i = end
    return out


def _trim_blank_edges(lines: list[str]) -> list[str]:
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def generate_daily(yesterday: str | None, today_date: str) -> str:
    todo_subsections: list[tuple[str, list[str]]] = []
    if yesterday:
        for heading, body in _split_sections(yesterday, level=2):
            if heading != "To Do":
                continue
            for sub_heading, sub_lines in _split_sections("\n".join(body), level=3):
                if not sub_heading:
                    continue
                carried = _trim_blank_edges(_carry_forward(sub_lines))
                todo_subsections.append((sub_heading, carried))

    if not todo_subsections:
        todo_subsections = [(p, []) for p in DEFAULT_PROJECTS]

    todo_parts: list[str] = []
    for heading, items in todo_subsections:
        todo_parts.append(f"### {heading}")
        todo_parts.extend(items)
        todo_parts.append("")
    todo_md = "\n".join(todo_parts).rstrip()

    return (
        f"# {today_date}\n\n"
        f"## To Do\n{todo_md}\n\n"
        f"## Thoughts\n\n"
        f"{REFLECTIONS_TEMPLATE}"
    )


@router.post("/daily-log", response_model=DailyLogOutput)
async def daily_log(input: DailyLogInput) -> DailyLogOutput:
    return DailyLogOutput(content=generate_daily(input.yesterday_content, input.today_date))
