from clawless_backend.daily import generate_daily


def test_no_yesterday_uses_default_projects():
    out = generate_daily(None, "2026-05-02")
    assert "# 2026-05-02" in out
    assert "## To Do" in out
    assert "### Conveyd" in out
    assert "### TimeTree" in out
    assert "### Personal" in out
    assert "## Thoughts" in out
    assert "## Reflections" in out


def test_blank_yesterday_uses_default_projects():
    out = generate_daily("", "2026-05-02")
    assert "### Conveyd" in out


def test_carries_incomplete_items():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [ ] write the spec
- [x] send the email
- [ ] review PR

## Thoughts
some text
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "- [ ] write the spec" in out
    assert "- [ ] review PR" in out
    assert "- [x] send the email" not in out
    assert "send the email" not in out


def test_completed_parent_orphans_incomplete_children():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [x] ship the feature
  - [ ] write tests
  - [x] update docs
  - [ ] announce in slack
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "ship the feature" not in out
    assert "update docs" not in out
    assert "- [ ] write tests" in out
    assert "- [ ] announce in slack" in out


def test_incomplete_parent_keeps_incomplete_children():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [ ] migrate db
  - [ ] schema diff
  - [x] backup verified
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "- [ ] migrate db" in out
    assert "schema diff" in out
    assert "backup verified" not in out


def test_preserves_subsection_structure():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [ ] item A

### TimeTree
- [ ] item B

### Personal
- [ ] item C
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "### Conveyd" in out
    assert "### TimeTree" in out
    assert "### Personal" in out
    a_pos = out.index("item A")
    b_pos = out.index("item B")
    c_pos = out.index("item C")
    assert a_pos < b_pos < c_pos


def test_drops_completed_at_top_level():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [x] done thing
- [ ] open thing
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "done thing" not in out
    assert "open thing" in out


def test_preserves_thoughts_section_as_empty():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [ ] keep me

## Thoughts
yesterday's thoughts here
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "yesterday's thoughts here" not in out
    assert "## Thoughts" in out


def test_template_includes_reflections_subsections():
    out = generate_daily(None, "2026-05-02")
    assert "### 오늘 하루 루틴" in out
    assert "### 오늘의 운동" in out
    assert "### Highlights" in out
    assert "### Lowlights" in out


def test_handles_capital_X_marker():
    yesterday = """\
# 2026-05-01

## To Do
### Conveyd
- [X] done
- [ ] open
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "done" not in out
    assert "open" in out


def test_skips_yesterday_without_to_do_section():
    yesterday = """\
# 2026-05-01

## Thoughts
just rambling
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "### Conveyd" in out
    assert "rambling" not in out


def test_today_date_in_heading():
    out = generate_daily(None, "2026-12-31")
    assert "# 2026-12-31" in out


def test_custom_project_subsections_preserved():
    yesterday = """\
# 2026-05-01

## To Do
### Convy
- [ ] custom project item

### Random
- [ ] another one
"""
    out = generate_daily(yesterday, "2026-05-02")
    assert "### Convy" in out
    assert "custom project item" in out
    assert "### Random" in out
