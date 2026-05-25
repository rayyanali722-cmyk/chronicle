---
name: chronicle-weekly
description: >
  Generates the weekly Chronicle review for Rayyan — an Obsidian-formatted markdown summary
  covering velocity (tasks completed), per-project progress, blockers, focus, and recommended
  next actions. Also appends a compact snapshot entry to CHRONICLE_LOG.md. Use this skill
  whenever the user asks for a weekly review, weekly summary, Chronicle digest, or says
  things like "run the weekly", "generate the weekly", "what happened this week in Chronicle",
  or "update the log". Trigger it proactively at the start of any Chronicle Dev session if
  no summary exists for the current week.
---

# Chronicle Weekly Review

Generate Rayyan's weekly Chronicle summary for Obsidian and append a compact entry to the
master log. Rayyan is a final-year engineering student at University of Guelph using Chronicle
as his primary project-tracking dashboard.

## Paths (hardcoded for Rayyan's machine)

- **data.json** (live): `https://raw.githubusercontent.com/rayyanali722-cmyk/chronicle/main/data.json`
- **compute script**: `C:\Users\owner\ClaudeProjects\chronicle\skills\chronicle-weekly\scripts\compute_metrics.js`
- **Obsidian output**: `C:\Users\owner\ClaudeProjects\chronicle\weekly-summaries\<YYYY-MM-DD>.md`
- **Chronicle log**: `C:\Users\owner\ClaudeProjects\chronicle\CHRONICLE_LOG.md`

---

## Step 1 — Compute metrics

1. WebFetch the live data.json URL above.
2. Write the JSON to a temp file: `C:\Users\owner\AppData\Local\Temp\chronicle-data.json`
3. Run the compute script:
   ```
   node "C:\Users\owner\ClaudeProjects\chronicle\skills\chronicle-weekly\scripts\compute_metrics.js" "C:\Users\owner\AppData\Local\Temp\chronicle-data.json"
   ```
4. Parse the JSON output. It contains: `velocity_count`, `velocity_rate`, `velocity_chart`,
   `completed_this_week`, `project_stats`, `focus_tasks`, `focus_note`, `all_blocked`,
   `week_start`, `week_end`, `today`, `status_counts`.

**Error handling:**
- WebFetch fails → report "Could not reach Chronicle data" and stop.
- Node not found → report "Node.js required" and stop.
- Script error → show the error output and stop.

---

## Step 2 — Write the Obsidian summary

Filename: `C:\Users\owner\ClaudeProjects\chronicle\weekly-summaries\<today-date>.md`

Use this exact template, filled with computed values:

```markdown
---
date: <today>
week: <week_start> → <week_end>
tags: [chronicle, weekly-review]
velocity: <velocity_count>
---

# Chronicle Weekly Review — <Month D, YYYY>

## Velocity

\`\`\`
<velocity_chart rows: "Day, Mon D  ███░░░░  N">
\`\`\`

**<velocity_count> tasks completed · <velocity_rate> tasks/day**

---

## Projects

<for each active project in project_stats:>

### <name> — <pct>% · <done_tasks>/<total_tasks> tasks
Due <deadline formatted as Mon D, YYYY> · <days_until_deadline>d

| Phase | Done |
|---|---|
<phase rows>

In progress:
<doing tasks as bullet list, or "nothing">

Next: <next_todo.title or "nothing unblocked">

<if blocked:>
> [!warning] Blocked
> - **<title>**: <notes>

---
<end project loop>

## Completed This Week

<completed_this_week as bullets: "- [<project>] <title> · <completedDay>">

---

## Today's Focus

_<focus_note or "Add session notes here.">_

<focus_tasks as bullets: "- [<status>] <title> (<project>)">

---

## Blocked — All Projects

<all_blocked grouped by project as callouts>

---

## Recommended Next Actions

<numbered list, 3–5 items — unblocking items first, then nearest deadline.
One sentence per item explaining what it unlocks.>

---

## Notes

_Add session notes here._
```

---

## Step 3 — Append to CHRONICLE_LOG.md

Read `C:\Users\owner\ClaudeProjects\chronicle\CHRONICLE_LOG.md`.
Find `<!-- APPEND NEW ENTRIES BELOW THIS LINE -->`.
Insert this compact entry **above** that marker:

```markdown
## Weekly Snapshot — <today>

**Velocity:** <velocity_count> tasks in 7 days (<velocity_rate>/day)
**Status:** <todo> todo · <doing> doing · <done> done · <blocked> blocked
**Projects:** <"Name X%", comma-separated>

### Completed This Week
<bullet list, or "None.">

### Lessons / Notes
_Add any lessons or session notes here._

---

```

---

## Step 4 — Report back

4–5 lines: velocity, project progress percentages, blocker count, output file path, log updated.
