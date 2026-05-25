"""
Chronicle → Notion Sync
Runs on every push to main (via GitHub Actions) when data.json changes.

Logic:
- Chronicle projects → Notion Projects database (upsert by Chronicle ID)
- Chronicle tasks    → Notion Tasks database    (upsert by Chronicle ID)
- Computes project Health from task state (blocked → At Risk, else On Track)
- Preserves Notion-only fields (notes, comments, manual edits)

Required env vars:
  NOTION_TOKEN          Notion integration secret (secret_...)
  NOTION_PROJECTS_DB    Notion Projects database ID
  NOTION_TASKS_DB       Notion Tasks database ID
"""

import json
import os
import sys
import time

try:
    import requests
except ImportError:
    print("Missing dep — run: pip install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

NOTION_VERSION = "2022-06-28"
PROJECTS_DB = os.environ.get("NOTION_PROJECTS_DB", "27ac3ecae7894841bb68ca431429aacb")
TASKS_DB    = os.environ.get("NOTION_TASKS_DB",    "cdf9f898559243dc9846c9e1cfe05c11")

STATUS_MAP_PROJECT = {"active": "Active", "paused": "Paused", "done": "Done"}
STATUS_MAP_TASK    = {"todo": "Todo", "doing": "Doing", "done": "Done", "blocked": "Doing"}
PRIORITY_MAP       = {"high": "High", "medium": "Medium", "low": "Low"}


# ── Notion API helpers ────────────────────────────────────────────────────────

def notion(method, endpoint, token, **kwargs):
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }
    for attempt in range(3):
        resp = requests.request(
            method,
            f"https://api.notion.com/v1/{endpoint}",
            headers=headers,
            **kwargs,
        )
        if resp.status_code == 429:
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()


def query_db(db_id, token, filter_payload=None):
    """Return all pages in a database, handling pagination."""
    pages = []
    cursor = None
    while True:
        body = {"page_size": 100}
        if filter_payload:
            body["filter"] = filter_payload
        if cursor:
            body["start_cursor"] = cursor
        data = notion("POST", f"databases/{db_id}/query", token, json=body)
        pages.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
    return pages


def get_text(page, prop):
    """Extract plain text from a Notion rich_text or title property."""
    p = page.get("properties", {}).get(prop, {})
    items = p.get("rich_text") or p.get("title") or []
    return "".join(i.get("plain_text", "") for i in items)


# ── Build index of existing Notion entries ────────────────────────────────────

def build_index(db_id, token):
    """Return { chronicle_id → notion_page_id } for all entries with a Chronicle ID."""
    pages = query_db(db_id, token)
    index = {}
    for p in pages:
        cid = get_text(p, "Chronicle ID")
        if cid:
            index[cid] = p["id"]
    return index


# ── Property builders ─────────────────────────────────────────────────────────

def text_prop(value):
    return {"rich_text": [{"text": {"content": str(value)[:2000]}}]} if value else {"rich_text": []}

def title_prop(value):
    return {"title": [{"text": {"content": str(value)[:2000]}}]}

def select_prop(value):
    return {"select": {"name": value}} if value else {"select": None}

def date_prop(value):
    return {"date": {"start": value}} if value else {"date": None}

def checkbox_prop(value):
    return {"checkbox": bool(value)}

def relation_prop(page_ids):
    return {"relation": [{"id": pid} for pid in page_ids if pid]}


# ── Compute project health ────────────────────────────────────────────────────

def compute_health(pid, tasks):
    project_tasks = [t for t in tasks.values() if t.get("project") == pid]
    if not project_tasks:
        return "On Track"
    if any(t.get("status") == "blocked" or t.get("blocked") for t in project_tasks):
        return "At Risk"
    return "On Track"


# ── Sync projects ─────────────────────────────────────────────────────────────

def sync_projects(projects, tasks, token):
    index = build_index(PROJECTS_DB, token)
    created = updated = 0

    for pid, proj in projects.items():
        health = compute_health(pid, tasks)
        props = {
            "Name":         title_prop(proj.get("name", pid)),
            "Status":       select_prop(STATUS_MAP_PROJECT.get(proj.get("status", "active"), "Active")),
            "Deadline":     date_prop(proj.get("deadline")),
            "Health":       select_prop(health),
            "Slug":         text_prop(pid),
            "Chronicle ID": text_prop(pid),
        }

        if pid in index:
            notion("PATCH", f"pages/{index[pid]}", token, json={"properties": props})
            print(f"  ↻ Project updated: {proj.get('name', pid)}")
            updated += 1
        else:
            notion("POST", "pages", token, json={
                "parent": {"database_id": PROJECTS_DB},
                "properties": props,
            })
            print(f"  + Project created: {proj.get('name', pid)}")
            created += 1

    print(f"  Projects: {created} created, {updated} updated")
    return created + updated


# ── Sync tasks ────────────────────────────────────────────────────────────────

def sync_tasks(tasks, projects, token):
    task_index    = build_index(TASKS_DB, token)
    project_index = build_index(PROJECTS_DB, token)  # chronicle pid → notion page id
    created = updated = 0

    for tid, task in tasks.items():
        status   = STATUS_MAP_TASK.get(task.get("status", "todo"), "Todo")
        priority = PRIORITY_MAP.get(task.get("priority", "medium"), "Medium")
        blocked  = task.get("status") == "blocked" or task.get("blocked", False)

        # Resolve project relation
        cpid = task.get("project", "")
        notion_project_id = project_index.get(cpid)

        # Resolve phase name from project
        phase_name = ""
        if cpid and cpid in projects:
            for ph in projects[cpid].get("phases", []):
                if ph.get("id") == task.get("phase"):
                    phase_name = ph.get("name", "")
                    break

        props = {
            "Task":         title_prop(task.get("title", tid)),
            "Status":       select_prop(status),
            "Priority":     select_prop(priority),
            "Deadline":     date_prop(task.get("deadline")),
            "Phase":        text_prop(phase_name),
            "Blocked":      checkbox_prop(blocked),
            "Blocked Reason": text_prop(task.get("notes", "") if blocked else ""),
            "Chronicle ID": text_prop(tid),
        }

        if notion_project_id:
            props["Project"] = relation_prop([notion_project_id])

        if tid in task_index:
            notion("PATCH", f"pages/{task_index[tid]}", token, json={"properties": props})
            print(f"  ↻ Task updated: {task.get('title', tid)}")
            updated += 1
        else:
            notion("POST", "pages", token, json={
                "parent": {"database_id": TASKS_DB},
                "properties": props,
            })
            print(f"  + Task created: {task.get('title', tid)}")
            created += 1

    print(f"  Tasks: {created} created, {updated} updated")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("ERROR: NOTION_TOKEN env var not set")
        sys.exit(1)

    data_path = os.path.join(os.path.dirname(__file__), "..", "data.json")
    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    projects = data.get("projects", {})
    tasks    = data.get("tasks", {})

    print(f"Syncing {len(projects)} projects, {len(tasks)} tasks → Notion...")
    sync_projects(projects, tasks, token)
    sync_tasks(tasks, projects, token)
    print("Notion sync complete.")


if __name__ == "__main__":
    main()
