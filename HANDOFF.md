# Chronicle Dashboard — Session Handoff
**Last updated:** 2026-05-15  
**Status:** Live on GitHub Pages. UI polish complete. Schema redesign (Priority 1) complete. Architecture planning done via LLM Council.

---

## What Chronicle Is

A personal project-tracking dashboard built as a single self-contained HTML file. Dark command-center aesthetic. Powered by a `data.json` file hosted on GitHub, which acts as the entire database. The user (Rayyan, final-year engineering student) checks this daily across his Dell laptop, iPhone 15 Pro, and iPad Pro.

**Live URL:** `https://rayyanali722-cmyk.github.io/chronicle/`  
**Repo:** `https://github.com/rayyanali722-cmyk/chronicle` (public)  
**Password:** `chronicle2026` (client-side sessionStorage gate — resets on tab close)  
**Local preview:** Start server on port 3457 serving `C:\Users\owner\ClaudeProjects\chronicle`

---

## Architecture

```
GitHub Pages (static host)
  └── index.html        ← entire app (HTML + CSS + JS, ~1260 lines)
  └── data.json         ← entire database (projects, tasks, focus, events)

Write path: browser → GitHub Contents API (PUT) → data.json commit
Read path:  browser → ./data.json (relative URL, works local + Pages)
Auth:       GitHub PAT stored in localStorage('chronicle_token')
Session:    Password gate via sessionStorage('chronicle_auth')
```

**GitHub API config (hardcoded in index.html):**
```js
const GH = { owner:'rayyanali722-cmyk', repo:'chronicle', branch:'main', file:'data.json' };
```

**PAT (stored in browser localStorage, not in code):**  
`ghp_…` — repo scope (do not commit the actual token)

**Why this architecture (from LLM Council session):**
- GitHub Pages = accessible from any device over cellular without Dell being on
- data.json = simple, portable, survives Obsidian migration
- GitHub Contents API = write from any device with a PAT
- No server, no subscription, no dependencies

---

## Key Files

| File | Purpose |
|------|---------|
| `C:\Users\owner\ClaudeProjects\chronicle\index.html` | The entire app. Edit HERE first. |
| `C:\Users\owner\OneDrive - University of Guelph\Documents\Claude\chronicle-mockup\index.html` | Git-tracked copy. Sync with `cp` after editing. |
| `chronicle-mockup/data.json` | The live database. Real user data. |
| `chronicle-mockup/v2.html` | Original design reference. Do NOT modify. Aesthetic baseline. |
| `.claude/launch.json` (Documents/Claude) | Preview server configs (port 3456 = mockup, port 3457 = ClaudeProjects) |

**Git workflow:**
```
1. Edit: C:\Users\owner\ClaudeProjects\chronicle\index.html
2. Sync:  cp C:\Users\owner\ClaudeProjects\chronicle\index.html \
              "C:\Users\owner\OneDrive - University of Guelph\Documents\Claude\chronicle-mockup\index.html"
3. Push:  cd to chronicle-mockup parent, git add, git commit, git pull --rebase, git push
```

---

## Design System

```css
--bg: #0a0a0a          /* page background */
--surface: #111        /* cards, sidebar */
--surface2: #181818    /* inputs, hover states */
--surface3: #222       /* inner elements */
--border: #2a2a2a      /* all borders */
--accent: #E03030      /* red — primary action color */
--accent-dim: rgba(224,48,48,0.12)
--text: #e8e8e8        /* primary text */
--text-dim: #888       /* secondary text */
--text-muted: #444     /* very subtle / metadata */
--green: #2ecc71
--yellow: #f39c12
--blue: #3498db
--sidebar-w: 260px
--header-h: 52px
```

**Fonts:**
- `Bebas Neue` — headings, project names, all-caps labels
- `Barlow` — body text
- `JetBrains Mono` — metadata, tags, timestamps, counts

---

## data.json Structure (v3.0)

```json
{
  "meta": { "lastUpdated": "ISO string", "version": "3.0", "_owner": "any" },
  "focus": {
    "date": "YYYY-MM-DD",
    "taskIds": ["id1", "id2", "id3"],
    "note": "string shown in sidebar"
  },
  "projects": {
    "job-search": {
      "id": "job-search",
      "_owner": "manual",
      "name": "Job Search",
      "status": "active",
      "deadline": "2026-08-15",
      "phases": [{
        "id": "js-p1",
        "name": "Resume & Portfolio",
        "taskIds": ["js-t1", "js-t2"],
        "order": 0
      }]
    }
  },
  "tasks": {
    "js-t1": {
      "id": "js-t1",
      "_owner": "manual",
      "title": "Update resume with capstone project",
      "project": "job-search",
      "phase": "js-p1",
      "status": "todo",           /* todo | doing | done | blocked */
      "priority": "high",         /* high | medium | low */
      "deadline": "2026-05-18",
      "blocked": false,
      "notes": "",
      "files": [],                /* [{type:'url'|'text', name, content}] */
      "createdAt": "ISO",
      "completedAt": null
    }
  },
  "events": {}
}
```

**`_owner` values:**
- `"manual"` — only the browser UI should write this
- `"sync"` — only fetch_data.py / GitHub Actions should write this
- `"jarvis"` — only Jarvis (Claude.ai) should write this
- `"any"` — any writer can update (e.g. `meta.lastUpdated`)

Phases remain as ordered arrays within each project (not top-level keyed objects). The `id` field is kept in each entity body so `t.id` / `p.id` work throughout the JS without changes.

**Current live data (as of 2026-05-14):**
- js-t4 "Follow up on pending applications" → done
- js-t2 "Refresh LinkedIn headline" → doing
- cap-t3 "Build pitch deck" → doing
- focus.taskIds: ["js-t1", "cap-t1", "cswp-t2"]
- 3 active projects: Job Search, CSWP Cert Prep, Capstone Startup

---

## App Structure (index.html)

### State Object
```js
const APP = {
  data: null,           // loaded from data.json
  view: 'grid',         // grid | week | month | table
  project: null,        // pid when in project detail view
  weekOffset: 0,
  monthOffset: 0,
  tableSort: { col:'deadline', dir:'asc' },
  tableFilters: { project:'', status:'', priority:'', deadline:'', title:'' },
  drawerTaskId: null,
  drawerState: null,    // deep copy of task being edited
  saving: false,
  lastLoaded: null
};
```

### Auth Constants (top of script)
```js
const AUTH_KEY = 'chronicle_auth';
const PASS = 'chronicle2026'; // change this to update the password
```

### Views
- **Grid** (`renderGrid()`): 3-col project cards. Clicking a card goes to project detail.
- **Project Detail** (`renderProject(pid, container)`): phases + tasks. Bottom row = Jarvis chat (left) + velocity chart panel (right).
- **Week** (`renderWeek()`): 7-day grid with tasks by deadline.
- **Month** (`renderMonth()`): Calendar month view.
- **Table** (`renderTable()`): Sortable/filterable table of all tasks.

### Key Functions
```
loadData(force)         — fetch ./data.json, fallback to default, then render()
saveData()              — PUT to GitHub Contents API, needs token
render()                — renderSidebar() + renderActiveView() + renderLastSynced()
renderFocus()           — sidebar focus list (shows up to 5, MANAGE FOCUS button)
renderProjectsNav()     — sidebar project list with % complete
renderGrid()            — main grid view OR project detail
renderProject(pid, el)  — project detail: phases + tasks + bottom row (Jarvis chat + velocity)
renderTaskRow(t)        — single task row HTML
velocityChart(pid,bare) — 7-bar mini chart; bare=true omits wrapper (for panel mode)
copyJarvisContext()     — builds markdown summary of ALL projects, copies to clipboard
copyProjectContext(pid) — builds markdown summary of ONE project, copies to clipboard
sendToJarvis(pid)       — reads jarvis-input-{pid} textarea, builds context+msg, copies clipboard
openTaskDrawer(id)      — slide-in task edit panel
saveDrawer()            — commits drawer changes to APP.data + saveData()
cycleStatus(id)         — todo→doing→done→todo (clicking status button on task row)
checkFocusTask(id)      — toggle done on sidebar focus item
openAddTaskModal(p,ph)  — NEW TASK modal
submitAddTask()         — creates task, pushes to APP.data, saves
openAddProjectModal()   — NEW PROJECT modal
submitAddProject()      — creates project with optional first phase
deleteProject(pid)      — confirm + delete project + all tasks
addPhase(pid)           — prompt for name, adds phase to project
deletePhase(pid, phId)  — confirm + delete phase + its tasks
openFocusModal()        — full focus management modal (add/remove tasks from focus)
toggleFocusTask(id)     — add/remove task from focus list
openSettingsModal()     — GitHub token input + force reload
checkAuth()             — returns sessionStorage.getItem('chronicle_auth')==='1'
submitAuth()            — validates password, sets sessionStorage, calls initApp()
initApp()               — sets up sidebar state, calls loadData(), registers keydown + interval
```

### Mobile Behavior
- Sidebar off-canvas by default on mobile, toggle via hamburger
- `@media(max-width:600px)`: task drawer slides up from bottom (not right)
- Project grid: 3 cols → 2 cols → 1 col
- Week view: horizontal scroll

---

## What "Ask Jarvis" / "Copy Jarvis Context" Does

**Not an embedded chat.** There is no Anthropic API key in this app.

- **Sidebar "COPY JARVIS CONTEXT" button** → `copyJarvisContext()` → builds a markdown summary of ALL projects + today's focus + blocked items → copies to clipboard → user pastes into Claude.ai
- **Per-project "⚡ ASK JARVIS" button** on cards → `copyProjectContext(pid)` → copies one project's summary
- **Jarvis chat textarea** at bottom of each project detail → `sendToJarvis(pid)` → builds project context + typed message → copies structured clipboard content → user pastes into Jarvis on Claude.ai

**Jarvis** is the user's Claude.ai Project (separate from Claude Code) that has Notion + Google Calendar MCP connectors. When the user pastes context + a question, Jarvis can read/write to data.json via the GitHub API.

**Clipboard format from `sendToJarvis()`:**
```
[CHRONICLE PROJECT CONTEXT]
Project: ...
Status: ...
Phase count: ...
...

[MY QUESTION / REQUEST]
<user's typed message>
```

---

## What Is Staying Unchanged

- The overall aesthetic (dark, red accents, Bebas Neue headings, Barlow body, JetBrains Mono meta)
- Single-file architecture (index.html + data.json, no build step, no dependencies)
- GitHub Pages hosting
- GitHub Contents API as the write backend
- data.json as the database
- All existing functionality: task drawer, focus sidebar, all 4 views, project/phase CRUD, add task modal

---

## What Still Needs To Be Done

### ~~Priority 1 — Schema Redesign~~ ✅ DONE (2026-05-15)

Committed `efbdfcb` — `data.json` v3.0. All entities keyed. `_owner` annotations in place.

**What shipped:**
- `projects`, `tasks`, `events` → keyed objects (`{id: {...}}`)
- `id` field kept in each body so `t.id` / `p.id` still works throughout JS
- `_owner: "manual"` on all existing records; `_owner: "any"` on `meta`
- `events: {}` (was `[]`)
- All JS array ops (`push`, `filter`, `findIndex`, `find`) replaced with `Object.values()`, `delete`, direct key assignment
- `getProjectById` / `getTaskById` are now O(1) key lookups
- `getDefaultData()` returns `projects:{}`, `tasks:{}`, `events:{}`

---

### Priority 2 — Security Proxy (Cloudflare Worker or Vercel Edge)

**Problem:** GitHub PAT is stored in `localStorage` — visible to anyone with DevTools access. Low risk for a personal tool with no public URL, but the council flagged it as the right time to fix it before adding more secrets (Anthropic API key, Notion token, etc.).

**Solution:** Deploy a Cloudflare Worker (free tier) or Vercel Edge Function that:
1. Accepts a POST with `{ action, payload }` from the browser
2. Holds the PAT server-side (env var)
3. Forwards to GitHub Contents API
4. Returns the response

Browser no longer needs the PAT in localStorage. The narrow endpoint also means Jarvis can POST to it directly without needing a PAT.

**This also enables:** storing the Anthropic API key server-side for future Option C (embedded AI features).

---

### Priority 3 — Jarvis System Prompt

Write a crafted system prompt for the Claude.ai Project "Jarvis" that teaches it:
- How to read `data.json` via GitHub raw URL
- How to interpret the schema (projects, tasks, phases, focus)
- How to write back via GitHub Contents API (fetch SHA → PUT)
- What `_owner` means and to only write `_owner: "jarvis"` fields
- What "today's focus" means
- Example: "Add task X to project Y phase Z" → how to construct the JSON diff

**Council said:** Jarvis should be read-only first. Only enable writes after schema redesign + `_owner` partitioning is in place.

---

### Priority 4 — GitHub Actions Automated Sync

`.github/workflows/sync.yml` — runs `fetch_data.py` on schedule (7am daily):
- Reads Notion API → maps to tasks/projects with `_owner: "sync"`
- Reads Google Calendar API → maps to events with `_owner: "sync"`
- Only overwrites fields where `_owner === "sync"` (never touches manual fields)
- Commits and pushes to `main`

**Council order:** Schema first → Jarvis read-only → Security proxy → Then this.

---

### Priority 5 — Anthropic API Integration (Deferred)

User wants to get familiar with Chronicle first before adding this. When ready:
- Store API key in Cloudflare Worker env var (not localStorage)
- Add a `/ai` endpoint to the worker
- Browser sends `{ pid, message, context }` → Worker calls Claude API → returns response
- Streams response into the Jarvis chat panel in the UI

---

### Future

- **Obsidian integration:** fetch_data.py outputs `.md` files to Obsidian vault after syncing
- **Real data restructuring:** Once schema is keyed objects, re-organize the 3 projects as needed
- **Mobile-specific polish:** Currently functional but unrefined on iPhone

---

## Lessons Learned / Gotchas

**1. Always read index.html before editing**  
The file is ~1260 lines. Edit tool requires reading first. Read in chunks (offset + limit).

**2. Relative URL for data.json**  
Use `./data.json?t=${Date.now()}` not a raw GitHub URL. The raw URL has CORS issues in local preview.

**3. Save path needs SHA**  
The GitHub Contents API PUT requires the current file SHA. Always fetch the SHA first before writing, or you get a 409 conflict.

**4. Git pull before push**  
If the live site has been used (tasks checked off, etc.) since the last push, git will reject a push. Do `git pull --rebase` first.

**5. Preview server for local testing**  
Working directory is `C:\Users\owner\OneDrive - University of Guelph\Documents\Claude`. Two server configs in `.claude/launch.json`:
- Port 3456 → serves `chronicle-mockup/` (git-tracked copy)
- Port 3457 → serves `C:\Users\owner\ClaudeProjects\chronicle` (working copy)
Edit ClaudeProjects, preview on 3457, then cp → chronicle-mockup → commit → push.

**6. Priority badges work with CSS classes**  
`prio-high`, `prio-medium`, `prio-low` — defined in CSS. The JS uses `t.priority?` check before rendering.

**7. Drawer uses a deep copy (drawerState)**  
Changes in the drawer don't touch APP.data until `saveDrawer()` is called. Intentional.

**8. Focus list shows up to 5 items**  
`const SHOW=5` in `renderFocus()`. The "MANAGE FOCUS →" button always shows.

**9. Velocity chart has two modes**  
`velocityChart(pid)` = card mode (with wrapper). `velocityChart(pid, true)` = bare mode for the project detail bottom panel. Bars are 60px tall. Labels show day-of-week abbreviations.

**10. Mobile sidebar**  
On desktop (>768px), sidebar starts open (`sb-open` class added on DOMContentLoaded). On mobile, starts closed. The overlay (`#sb-overlay`) only appears on mobile.

**11. Password gate is sessionStorage**  
`chronicle_auth` is stored in `sessionStorage` — clears when the tab is closed. Not localStorage. This is intentional: requires re-auth on new sessions but stays unlocked during active use.

**12. Auth gate skips loading div**  
`#loading` starts with `style="display:none"`. It's only set to `display:flex` after auth passes (either via `submitAuth()` or the `checkAuth()` shortcut on DOMContentLoaded).

---

## Who This Is For

- **Rayyan Ali** — final-year engineering student (University of Guelph), graduating soon
- In active job search mode
- Running 3 concurrent projects: Job Search, CSWP Cert Prep (SolidWorks), Capstone Startup
- Uses Claude.ai (Jarvis) for natural language task management
- Checks Chronicle daily as his primary operating view
- May migrate from Notion → Obsidian in the future
- Wants to be able to manage everything manually (not dependent on Jarvis for basic CRUD)
- Email: rayyanali722@gmail.com

---

## Session History Summary

1. **Session 1 — LLM Council** ran to determine architecture → verdict: GitHub Pages + data.json + GitHub Contents API
2. **Session 1 — Build** — Built `index.html` from scratch replacing static `v2.html` mockup
3. **Session 1 — Launch** — Set up GitHub repo (`rayyanali722-cmyk/chronicle`), pushed, went live
4. **Session 2 — Round 1 fixes:** mobile responsiveness, sidebar close button, task drawer (slide-in from right desktop / bottom mobile), focus checkboxes, task detail editing, priority badges, Today button fix, add project/phase modals, velocity chart, Ask Jarvis clipboard copy
5. **Session 2 — Round 2 fixes:** project card actions (Ask Jarvis + velocity chart), per-project context copy, progress % updating live, table mass-add
6. **Session 3 — UI Polish (COMPLETE):**
   - Card buttons anchored to bottom (`margin-top:auto` on `.proj-card-actions`)
   - Velocity chart removed from cards, moved to project detail bottom-right panel
   - Text contrast improved (`.phase-name`, `.phase-count`, `.proj-deadline`, `.pna-label`)
   - Jarvis chat textarea added to project detail (bottom-left panel)
   - Two-column `proj-bottom-row` flex layout (Jarvis left, velocity right)
   - Password gate added (`chronicle2026`, sessionStorage)
   - `sendToJarvis()` improved: structured clipboard format, no auto-open tab, clears textarea
7. **Session 3 — Architecture Planning:**
   - Second LLM Council ran on "what to build next"
   - **Verdict:** Schema redesign → Security proxy → Jarvis read-only → GitHub Actions sync → Anthropic API (deferred)
   - Single most important next step: keyed objects + `_owner` annotations in data.json

---

## Immediate Next Steps (In Order)

1. ~~Read index.html, redesign data.json, update JS, commit+push~~ ✅ Done (commit `efbdfcb`)
2. **Write Jarvis system prompt** (Priority 3) — `.md` file in repo explaining schema, `_owner` rules, read/write path
3. **Security proxy** (Priority 2) — Cloudflare Worker to hold PAT server-side
4. **GitHub Actions sync** (Priority 4) — `fetch_data.py` + `sync.yml`
