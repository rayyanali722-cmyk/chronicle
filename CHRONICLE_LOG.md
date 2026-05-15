# Chronicle — Master History Log

Append-only record of every session, schema change, feature shipped, task completed, lesson learned, and velocity snapshot. Never delete or rewrite entries. Add new entries at the bottom.

---

## How to Read This File

- **Sessions** are numbered from v1 upward
- **Velocity** = tasks completed in the trailing 7 days (from `completedAt` timestamps in data.json)
- **Projects/Phases** section tracks structural changes (adds, removals, renames)
- **Lessons** are non-obvious gotchas — things that would trip up a future session

---

## v1 — 2026-05-14 · Initial Architecture + Build + Launch

### What Happened
- LLM Council (5-model vote) ran to decide the architecture. Verdict: GitHub Pages + `data.json` + GitHub Contents API. No server, no subscription, no build step.
- Built `index.html` from scratch. Replaced static `v2.html` mockup (dark command-center aesthetic preserved).
- Set up GitHub repo (`rayyanali722-cmyk/chronicle`), pushed, went live at `https://rayyanali722-cmyk.github.io/chronicle/`

### Features Shipped
- Dark dashboard with Bebas Neue / Barlow / JetBrains Mono type system
- Grid view (3-col project cards)
- Week view (7-day deadline grid)
- Month view (calendar)
- Table view (sortable/filterable)
- Sidebar: Today's Focus list, Projects nav, Add Task, Copy Jarvis Context
- Task drawer (slide-in from right; mobile: slides up from bottom)
- Add Task modal
- GitHub Contents API save path (PAT in localStorage)
- loadData() with 5-min auto-refresh interval

### Projects Active at End of Session
| Project | Status | Progress |
|---|---|---|
| Job Search | active | ~0% |
| CSWP Cert Prep | active | ~0% |
| Capstone Startup | active | ~0% |

### Tasks Completed This Session
None (fresh build, no user data yet)

### Velocity (7-day at session end)
0 tasks/day

### Lessons Learned
- `./data.json?t=${Date.now()}` not raw GitHub URL — raw has CORS issues in local preview
- GitHub Contents API PUT requires current SHA first or you get 409
- Preview server must serve the working directory, not just open the file

---

## v1.1 — 2026-05-14 · Round 1 Fixes

### What Happened
Second session. Bug fixes and mobile polish based on first use.

### Features Shipped / Fixed
- Mobile responsiveness (task drawer slides up from bottom on ≤600px)
- Sidebar close button (✕) and overlay for mobile
- Focus checkboxes with `checkFocusTask()` toggle
- Task detail editing (title, status, deadline, priority, notes, phase)
- Priority badges (prio-high / prio-medium / prio-low CSS classes)
- Today button on week view (`weekOffset=0`)
- Add Project modal + Add Phase (prompt-based)
- Velocity chart (`velocityChart(pid)`) — 7-bar mini chart
- "Ask Jarvis" clipboard copy per-project context

### Projects Active at End of Session
Same 3 (no structural changes)

### Lessons Learned
- Velocity chart has two modes: `velocityChart(pid)` = card mode (with wrapper), `velocityChart(pid, true)` = bare for project detail panel
- Focus list shows up to 5 items (`const SHOW=5`) — "MANAGE FOCUS" always visible
- Drawer uses a deep copy (`drawerState`) — changes don't touch APP.data until `saveDrawer()`

---

## v1.2 — 2026-05-14 · Round 2 Fixes

### What Happened
Third session. Project card polish, per-project Jarvis context, live progress.

### Features Shipped / Fixed
- Project card actions anchored to bottom (`margin-top:auto` on `.proj-card-actions`)
- Velocity chart removed from cards, moved to project detail bottom-right panel
- Per-project "⚡ ASK JARVIS" button on cards (`copyProjectContext(pid)`)
- Progress % updates live after task edits
- Table view: "+ ADD TASK" button inline
- `proj-bottom-row` two-column flex layout (Jarvis chat left, velocity right)

### Lessons Learned
- `calcProgress()` must be called after every mutation, not cached

---

## v1.3 — 2026-05-14 · UI Polish + Password Gate

### What Happened
Full UI polish pass + second LLM Council on "what to build next."

### Features Shipped / Fixed
- Text contrast improvements (`.phase-name`, `.phase-count`, `.proj-deadline`, `.pna-label`)
- Jarvis chat textarea added to project detail (bottom-left panel)
- `sendToJarvis()`: structured clipboard format, no auto-open tab, clears textarea after copy
- Password gate added (`chronicle2026`, sessionStorage — clears on tab close)
- `#loading` div hidden by default, shown only after auth passes

### Architecture Decision (LLM Council #2)
Build order voted on and locked:
1. Schema redesign (`_owner` keyed objects) — must happen before any automation
2. Jarvis system prompt (read-only first, then writes)
3. Security proxy (Cloudflare Worker — move PAT out of localStorage)
4. GitHub Actions sync (Notion + Calendar → `_owner: "sync"` fields)
5. Anthropic API integration (deferred — get comfortable with Chronicle first)

### Lessons Learned
- Password gate uses `sessionStorage` (not localStorage) — intentional, resets on tab close
- `#loading` starts with `style="display:none"` — only set to `flex` after auth
- `git pull --rebase` before push — live site may have had tasks checked off since last push

---

## v2.0 — 2026-05-15 · Schema Redesign (Priority 1)

### What Happened
Commit `efbdfcb`. Migrated `data.json` from array-based schema to keyed-object schema with `_owner` annotations. Updated all JS accordingly.

### Schema Changes
- **Before:** `"tasks": [{id, ...}]`, `"projects": [{id, ...}]`, `"events": []`
- **After:** `"tasks": {"id": {id, _owner, ...}}`, `"projects": {"id": {id, _owner, ...}}`, `"events": {}`
- `_owner` values: `"manual"` (browser UI), `"jarvis"` (Claude.ai), `"sync"` (GitHub Actions), `"any"` (meta)
- `id` field kept in record body so `t.id` / `p.id` references work without churn
- `meta._owner: "any"` added
- Version bumped `2.0` → `3.0`
- Phases remain as ordered arrays within each project (not top-level keyed)

### JS Changes (18 edits)
| Old | New |
|---|---|
| `getProjectById`: `.find(p=>p.id===id)` | Direct key lookup `APP.data.projects?.[id]` (O(1)) |
| `getTaskById`: `.find(t=>t.id===id)` | Direct key lookup `APP.data.tasks?.[id]` (O(1)) |
| `getProjectTasks`: `.filter(t=>t.project===pid)` | `Object.values(...).filter(...)` |
| `tasks.push(task)` | `tasks[id] = task` |
| `tasks.filter(t=>t.id!==x)` | `delete tasks[x]` |
| `tasks.findIndex + tasks[idx]=` | `tasks[t.id] = {...t}` |
| `projects.push(proj)` | `projects[id] = proj` |
| `projects.filter(p=>p.id!==pid)` | `delete projects[pid]` |
| `getDefaultData` returns `projects:[]` | Returns `projects:{}` |

### Projects Active at End of Session
| Project | Status | Phases | Tasks | Done |
|---|---|---|---|---|
| Job Search | active | 3 | 5 | 1 (js-t4) |
| CSWP Cert Prep | active | 2 | 3 | 1 (cswp-t1) |
| Capstone Startup | active | 2 | 3 | 0 |

### Tasks Completed (cumulative to date)
| Task ID | Title | Project | Completed |
|---|---|---|---|
| cswp-t1 | Review Part Modeling module | CSWP Cert Prep | 2026-05-10 |
| js-t4 | Follow up on pending applications | Job Search | 2026-05-14 |

### Velocity (7-day trailing as of 2026-05-15)
- js-t4: completed 2026-05-14
- cswp-t1: completed 2026-05-10 (6 days ago, in window)
- **2 tasks in trailing 7 days = 0.29 tasks/day**

### Lessons Learned
- GitHub push protection will block commits containing live PATs — redact before adding docs to repo
- Schema migration: always keep `id` in record body alongside the object key, so JS references to `t.id` work without rewriting call sites
- `git stash` needed if files are already staged before `git pull --rebase`

---

## v2.1 — 2026-05-15 · Jarvis System Prompt (Priority 2 of build order)

### What Happened
Commit `df084fd`. Created `JARVIS_SYSTEM_PROMPT.md` — paste target for the "Jarvis" Claude.ai Project.

### What Jarvis Can Now Do
- Fetch live `data.json` from raw GitHub URL (no auth)
- Create new tasks with `_owner: "jarvis"` (id format: `jarvis-t-<timestamp>`)
- Update `_owner: "jarvis"` records
- Update `focus.taskIds` and `focus.note` (shared planning surface)
- Write back via GitHub Contents API (GET SHA → PUT full file)
- Confirm before writing, report what changed, handle 409 retries

### What Jarvis Must NOT Do (yet)
- Modify `_owner: "manual"` or `_owner: "sync"` records (unless Rayyan explicitly asks)
- Create new projects or phases (Rayyan does that in the UI)
- Read Notion or Google Calendar directly (that's Priority 4)

### Lessons Learned
- The Jarvis system prompt should live in the repo so it version-controls with the schema. When the schema changes, update the prompt.
- Separate "Jarvis" (task manager assistant) from "Chronicle Dev" (development assistant) — they have different scopes and should be different Claude.ai Projects

---

## Weekly Snapshot — 2026-05-15

**Velocity:** 2 tasks in 7 days (0.29/day)  
**Status:** 6 todo · 3 doing · 2 done · 0 blocked  
**Projects:** Job Search 20%, CSWP Cert Prep 33%, Capstone Startup 0%

### Completed This Week
- Review Part Modeling module (CSWP Cert Prep) — 2026-05-10
- Follow up on pending applications (Job Search) — 2026-05-14

### Lessons / Notes
_None added this week._

---

<!-- APPEND NEW ENTRIES BELOW THIS LINE -->
