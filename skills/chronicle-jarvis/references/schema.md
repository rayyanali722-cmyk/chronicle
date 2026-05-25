# Chronicle data.json Schema (v3.0 + Jarvis extensions)

## Top-level structure
```json
{
  "meta": { "lastUpdated": "ISO", "version": "3.0", "_owner": "any" },
  "focus": { "date": "YYYY-MM-DD", "taskIds": ["<tid>", ...], "note": "" },
  "projects": { "<pid>": { ...project } },
  "tasks":    { "<tid>": { ...task } },
  "events":   {}
}
```

## Project record
```json
{
  "id": "<pid>",
  "_owner": "manual" | "jarvis" | "sync",
  "name": "string",
  "status": "active" | "paused" | "done",
  "deadline": "YYYY-MM-DD" | null,
  "parentId": "<pid>" | null,
  "phases": [
    { "id": "<ph-id>", "name": "string", "taskIds": ["<tid>", ...], "order": 0 }
  ]
}
```

`parentId` — Jarvis extension. Marks this project as a subproject of another. Null = top-level project.

## Task record
```json
{
  "id": "<tid>",
  "_owner": "manual" | "jarvis" | "sync",
  "title": "string",
  "project": "<pid>",
  "phase": "<ph-id>",
  "status": "todo" | "doing" | "done" | "blocked",
  "priority": "high" | "medium" | "low",
  "deadline": "YYYY-MM-DD" | null,
  "blocked": false,
  "notes": "string",
  "files": [],
  "parentId": "<tid>" | null,
  "createdAt": "ISO",
  "completedAt": "ISO" | null
}
```

`parentId` — Jarvis extension. Marks this task as a subtask of another. Null = standalone task.

## ID conventions
- Projects: `<short-slug>` e.g. `job-search`, `capstone`
- Jarvis-created projects: `jarvis-p-<timestamp>`
- Tasks: `<project-slug>-t<N>` e.g. `js-t5`, `capstone-t3`
- Jarvis-created tasks: `jarvis-t-<timestamp>`
- Phases: `<pid>-ph<N>` e.g. `job-search-ph1`
- Jarvis-created phases: `jarvis-ph-<timestamp>`

## _owner values
| Value | Who writes it | Who can modify it |
|---|---|---|
| `"manual"` | Browser UI (Rayyan) | Jarvis has full access |
| `"jarvis"` | Jarvis | Jarvis (primary owner) |
| `"sync"` | GitHub Actions | Jarvis should not modify |
| `"any"` | meta fields only | anyone |

Jarvis has full write access to any task regardless of `_owner`. When modifying a `_owner: "sync"` record, note it in your report.

## Phases are ordered arrays
`phase.taskIds` is authoritative for task display order within a phase.
When creating a task, append its ID to the correct `phase.taskIds`.
When deleting a task, remove its ID from `phase.taskIds`.

## focus object
`focus.taskIds` is the sidebar "Today's Focus" list (max 5 shown, unlimited stored).
`focus.date` should be set to today's date when updating focus.

## Subproject / subtask relationships
When creating a subproject, set `parentId` on the child project.
When creating a subtask, set `parentId` on the child task.
The parent task/project does NOT need to be modified — relationships are tracked on the child.
When displaying, group subtasks under their parent task for clarity.
