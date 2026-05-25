#!/usr/bin/env node
/**
 * Chronicle weekly metrics calculator.
 * Usage: node compute_metrics.js <path-to-data.json>
 * Prints a JSON metrics object to stdout.
 */

const fs = require('fs');

const dataPath = process.argv[2];
if (!dataPath) { console.error('Usage: node compute_metrics.js <data.json>'); process.exit(1); }

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const tasks = data.tasks || {};
const projects = data.projects || {};
const focus = data.focus || {};

const now = new Date();
const todayStr = now.toISOString().split('T')[0];
const weekAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

const statusCounts = { todo: 0, doing: 0, done: 0, blocked: 0 };
for (const t of Object.values(tasks)) {
  const s = t.status || 'todo';
  statusCounts[s] = (statusCounts[s] || 0) + 1;
}

const days7 = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(now); d.setDate(d.getDate() - i);
  days7.push(d.toISOString().split('T')[0]);
}
const dayCounts = Object.fromEntries(days7.map(d => [d, 0]));
const completedThisWeek = [];

for (const [tid, t] of Object.entries(tasks)) {
  if (!t.completedAt) continue;
  const ms = new Date(t.completedAt).getTime();
  if (ms >= weekAgoMs) {
    const day = t.completedAt.split('T')[0];
    if (dayCounts[day] !== undefined) dayCounts[day]++;
    completedThisWeek.push({
      id: tid, title: t.title || '', project: t.project || '',
      completedAt: t.completedAt, completedDay: day
    });
  }
}
completedThisWeek.sort((a, b) => a.completedAt.localeCompare(b.completedAt));

const velocityCount = completedThisWeek.length;
const velocityRate = Math.round(velocityCount / 7 * 100) / 100;
const maxCount = Math.max(...Object.values(dayCounts), 1);

const velocityChart = days7.map(d => {
  const c = dayCounts[d];
  const dt = new Date(d + 'T12:00:00');
  const label = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const filled = maxCount > 0 ? Math.round(c / maxCount * 7) : 0;
  return { date: d, label, count: c, bar: '█'.repeat(filled) + '░'.repeat(7 - filled) };
});

const projectStats = Object.entries(projects).map(([pid, p]) => {
  const projTasks = Object.values(tasks).filter(t => t.project === pid);
  const total = projTasks.length;
  const done = projTasks.filter(t => t.status === 'done').length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const blocked = projTasks.filter(t => t.blocked && t.status !== 'done');
  const doing = projTasks.filter(t => t.status === 'doing');
  const todo = projTasks.filter(t => t.status === 'todo' && !t.blocked);

  const phases = (p.phases || []).map(ph => {
    const phTasks = (ph.taskIds || []).map(id => tasks[id]).filter(Boolean);
    return { name: ph.name || '', done: phTasks.filter(t => t.status === 'done').length, total: phTasks.length };
  });

  let daysUntil = null;
  if (p.deadline) {
    const dl = new Date(p.deadline + 'T00:00:00');
    daysUntil = Math.ceil((dl - now) / 86400000);
  }

  return {
    id: pid, name: p.name || pid, status: p.status || 'active',
    deadline: p.deadline || null, pct, total_tasks: total, done_tasks: done,
    days_until_deadline: daysUntil,
    blocked: blocked.map(t => ({ id: t.id || '', title: t.title || '', notes: t.notes || '' })),
    doing: doing.map(t => ({ id: t.id || '', title: t.title || '' })),
    next_todo: todo.length ? { id: todo[0].id || '', title: todo[0].title || '' } : null,
    phases
  };
});

const focusTasks = (focus.taskIds || []).map(id => {
  const t = tasks[id];
  return t ? { id, title: t.title || '', project: t.project || '', status: t.status || 'todo' } : null;
}).filter(Boolean);

const allBlocked = Object.entries(tasks)
  .filter(([, t]) => t.blocked && t.status !== 'done')
  .map(([tid, t]) => ({ id: tid, title: t.title || '', project: t.project || '', notes: t.notes || '' }));

const result = {
  generated_at: now.toISOString(),
  today: todayStr,
  week_start: days7[0],
  week_end: days7[6],
  status_counts: statusCounts,
  total_tasks: Object.keys(tasks).length,
  velocity_count: velocityCount,
  velocity_rate: velocityRate,
  velocity_chart: velocityChart,
  completed_this_week: completedThisWeek,
  project_stats: projectStats,
  focus_tasks: focusTasks,
  focus_note: focus.note || '',
  all_blocked: allBlocked,
  data_version: (data.meta || {}).version || '?'
};

console.log(JSON.stringify(result, null, 2));
