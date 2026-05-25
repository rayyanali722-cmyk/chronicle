"""
Chronicle → Google Calendar Sync
Runs on every push to main (via GitHub Actions) when data.json changes.

Logic:
- Tasks with a deadline and status != "done" → create or update a GCal event
- Tasks previously synced that are now done/removed → delete the GCal event
- Uses a private extended property (chronicle_task_id) to track events — no
  write-back to data.json needed, no infinite loop risk.

Required env vars:
  GOOGLE_SERVICE_ACCOUNT_JSON   full JSON content of service account key
  GOOGLE_CALENDAR_ID            e.g. rayyanali722@gmail.com
"""

import json
import os
import sys

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("Missing deps — run: pip install google-auth google-api-python-client")
    sys.exit(1)


# ── Config ────────────────────────────────────────────────────────────────────

SCOPES = ['https://www.googleapis.com/auth/calendar']
CHRONICLE_SOURCE_KEY = 'chronicle_source'
CHRONICLE_SOURCE_VAL = 'chronicle'
CHRONICLE_TASK_ID_KEY = 'chronicle_task_id'


# ── Auth ──────────────────────────────────────────────────────────────────────

def get_service():
    sa_json = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if not sa_json:
        print("ERROR: GOOGLE_SERVICE_ACCOUNT_JSON env var not set")
        sys.exit(1)
    sa_info = json.loads(sa_json)
    creds = service_account.Credentials.from_service_account_info(sa_info, scopes=SCOPES)
    return build('calendar', 'v3', credentials=creds)


# ── Fetch existing Chronicle events from GCal ─────────────────────────────────

def fetch_existing_events(service, cal_id):
    """Return dict of { chronicle_task_id -> event } for all Chronicle-managed events."""
    existing = {}
    page_token = None
    while True:
        resp = service.events().list(
            calendarId=cal_id,
            privateExtendedProperty=f'{CHRONICLE_SOURCE_KEY}={CHRONICLE_SOURCE_VAL}',
            pageToken=page_token,
            maxResults=250,
            showDeleted=False,
        ).execute()
        for event in resp.get('items', []):
            props = event.get('extendedProperties', {}).get('private', {})
            tid = props.get(CHRONICLE_TASK_ID_KEY)
            if tid:
                existing[tid] = event
        page_token = resp.get('nextPageToken')
        if not page_token:
            break
    return existing


# ── Build event body ──────────────────────────────────────────────────────────

def build_event(task, project_name):
    deadline = task['deadline']  # YYYY-MM-DD

    status_emoji = {'todo': '○', 'doing': '◑', 'blocked': '✗'}.get(task.get('status', 'todo'), '○')
    priority_label = {'high': '🔴 High', 'medium': '🟡 Medium', 'low': '🟢 Low'}.get(task.get('priority', 'medium'), '')

    description_parts = [
        f"Project: {project_name}",
        f"Status: {status_emoji} {task.get('status', 'todo').capitalize()}",
        f"Priority: {priority_label}",
    ]
    if task.get('notes'):
        description_parts.append(f"\nNotes: {task['notes']}")
    description_parts.append("\n— Managed by Chronicle")

    return {
        'summary': f"{status_emoji} [Chronicle] {task['title']}",
        'description': '\n'.join(description_parts),
        'start': {'date': deadline},
        'end': {'date': deadline},
        'reminders': {
            'useDefault': False,
            'overrides': [{'method': 'popup', 'minutes': 60 * 9}],  # 9am reminder
        },
        'extendedProperties': {
            'private': {
                CHRONICLE_SOURCE_KEY: CHRONICLE_SOURCE_VAL,
                CHRONICLE_TASK_ID_KEY: task['id'],
            }
        },
    }


# ── Main sync ─────────────────────────────────────────────────────────────────

def main():
    cal_id = os.environ.get('GOOGLE_CALENDAR_ID')
    if not cal_id:
        print("ERROR: GOOGLE_CALENDAR_ID env var not set")
        sys.exit(1)

    # Load data.json (checked out by Actions)
    data_path = os.path.join(os.path.dirname(__file__), '..', 'data.json')
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    service = get_service()
    existing = fetch_existing_events(service, cal_id)
    print(f"Found {len(existing)} existing Chronicle event(s) in GCal")

    tasks = data.get('tasks', {})
    projects = data.get('projects', {})

    created = updated = deleted = skipped = 0
    active_ids = set()

    for tid, task in tasks.items():
        # Only sync tasks with a deadline that aren't done
        if not task.get('deadline'):
            skipped += 1
            continue
        if task.get('status') == 'done':
            continue

        active_ids.add(tid)
        project = projects.get(task.get('project', ''), {})
        project_name = project.get('name', 'Chronicle')
        event_body = build_event(task, project_name)

        try:
            if tid in existing:
                # Update existing event
                service.events().update(
                    calendarId=cal_id,
                    eventId=existing[tid]['id'],
                    body=event_body,
                ).execute()
                print(f"  ↻ Updated: {task['title']} ({task['deadline']})")
                updated += 1
            else:
                # Create new event
                service.events().insert(
                    calendarId=cal_id,
                    body=event_body,
                ).execute()
                print(f"  + Created: {task['title']} ({task['deadline']})")
                created += 1
        except HttpError as e:
            print(f"  ! Error syncing '{task['title']}': {e}")

    # Delete events for tasks that are now done or removed
    for tid, event in existing.items():
        if tid not in active_ids:
            try:
                service.events().delete(calendarId=cal_id, eventId=event['id']).execute()
                summary = event.get('summary', tid)
                print(f"  ✗ Deleted: {summary}")
                deleted += 1
            except HttpError as e:
                print(f"  ! Error deleting event {event['id']}: {e}")

    print(f"\nSync complete — {created} created, {updated} updated, {deleted} deleted, {skipped} skipped (no deadline)")


if __name__ == '__main__':
    main()
