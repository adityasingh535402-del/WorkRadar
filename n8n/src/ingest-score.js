// n8n Code node · "Apply AI signals & rank" (Run once for all items)
// Merges Gemini's triage into the normalised items, computes the same transparent
// priority score the app uses, and builds the snapshot the digest workflow reads.

const config = $('Config').first().json;
const ROSTER = /*__ROSTER__*/ [];
const MANAGER = config.managerId;
const NOW = Date.now();
const items = $('Normalize to WorkItems').all().map((i) => JSON.parse(JSON.stringify(i.json)));
const byId = new Map(items.map((i) => [i.id, i]));
const nameOf = (id) => (ROSTER.find((p) => p.id === id) || { name: id || 'Unassigned' }).name;
const first = (id) => nameOf(id).split(' ')[0];

// 1. AI triage (skipped gracefully if Gemini failed)
let ai = [];
let aiError = null;
const res = $input.first().json;
try {
  if (res.error) throw new Error(res.error.message || 'Gemini request failed');
  const parts = res.candidates[0].content.parts.filter((p) => !p.thought && p.text);
  ai = JSON.parse(parts.map((p) => p.text).join('')).results || [];
} catch (e) {
  aiError = String(e.message || e);
}
for (const r of ai) {
  const it = byId.get(r.id);
  if (!it) continue;
  if (r.priority && r.priority !== 'NONE' && !it.priority) it.priority = r.priority;
  it.signals.waitingOnMe = it.signals.waitingOnMe || !!r.waitingOnManager;
  it.signals.escalation = it.signals.escalation || !!r.escalation;
  it.signals.negative = it.signals.negative || !!r.negative;
  if (r.blocked && it.status === 'open' && it.assignee) it.status = 'blocked';
  if (r.summary) it.summary = r.summary;
  if (r.nextStep) it.nextStep = r.nextStep;
  if (r.suggestedOwner && !it.assignee) it.suggestedOwner = r.suggestedOwner;
  it.aiTriaged = true;
}

// 2. Score (mirrors src/lib/scoring.ts in the app)
const W = config.weights || { urgency: 30, impact: 25, blocking: 20, waiting: 15, staleness: 5, escalation: 5 };
const PRI = { P0: 1, P1: 0.8, P2: 0.5, P3: 0.25 };
const blocks = new Map();
for (const it of items) if (it.status !== 'done' && it.blockedBy && it.blockedBy.kind === 'item') blocks.set(it.blockedBy.ref, (blocks.get(it.blockedBy.ref) || []).concat(it.id));
const hoursSince = (iso) => (NOW - new Date(iso).getTime()) / 3600000;
const dur = (iso) => {
  const h = hoursSince(iso);
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
};

function score(it) {
  const f = { urgency: [0.1, 'No deadline'], impact: [0.4, 'Normal priority'], blocking: [0, ''], waiting: [0, ''], staleness: [0, ''], escalation: [0, ''] };
  if (it.dueAt) {
    const h = (new Date(it.dueAt).getTime() - NOW) / 3600000;
    const what = it.dueLabel || 'Due';
    f.urgency = h < 0 ? [1, `Overdue by ${dur(it.dueAt)}`] : h <= 6 ? [0.95, `${what} in ${Math.max(1, Math.round(h))}h`] : h <= 24 ? [0.75, `${what} within a day`] : h <= 72 ? [0.45, `${what} in ${Math.round(h / 24)} days`] : h <= 168 ? [0.25, `${what} this week`] : [0.1, `${what} later`];
  }
  let imp = it.priority ? PRI[it.priority] : 0.4;
  const parts = [];
  if (it.priority) parts.push(it.source === 'jira' ? it.priority : `Inferred ${it.priority}`);
  if (it.signals.learners) {
    imp += Math.min(0.4, Math.log10(1 + it.signals.learners) / 6);
    parts.push(`${it.signals.learners} learners affected`);
  }
  if (it.signals.revenue) {
    imp += 0.15;
    parts.push('Revenue at stake');
  }
  f.impact = [Math.min(1, imp), parts.join(', ') || 'Normal priority'];
  const waiting = (blocks.get(it.id) || []).map((id) => byId.get(id)).filter(Boolean);
  if (waiting.length) f.blocking = [waiting.length >= 3 ? 1 : waiting.length === 2 ? 0.85 : 0.65, `Unblocks ${[...new Set(waiting.map((w) => first(w.assignee)))].join(' and ')}`];
  if (it.signals.waitingOnMe) f.waiting = [1, `${first(it.author)} is waiting on you`];
  else if (it.signals.mentionsMe) f.waiting = [0.6, 'You were mentioned'];
  else if (!it.assignee && (it.priority === 'P0' || it.priority === 'P1')) f.waiting = [0.7, 'Unassigned and needs an owner'];
  if (it.status !== 'done') {
    const ref = it.status === 'blocked' && it.blockedBy && it.blockedBy.since ? it.blockedBy.since : it.updatedAt;
    const h = hoursSince(ref);
    const what = it.status === 'blocked' ? 'Blocked' : it.signals.waitingOnMe ? 'Unanswered' : 'No update';
    if (h >= 24) f.staleness = [1, `${what} for ${dur(ref)}`];
    else if (h >= 8) f.staleness = [0.6, `${what} for ${dur(ref)}`];
  }
  if (it.signals.escalation) f.escalation = [1, it.priority === 'P0' ? 'Live incident' : 'Escalated'];
  else if (it.signals.negative) f.escalation = [0.5, 'Frustration in the thread'];

  const keys = Object.keys(W);
  const total = keys.reduce((s, k) => s + W[k], 0) || 1;
  let sc = Math.round(Math.min(99, (keys.reduce((s, k) => s + W[k] * f[k][0], 0) / total) * 125));
  if (it.priority === 'P0' && it.status !== 'done') sc = Math.max(sc, 97);
  if (it.status === 'done') sc = 0;
  const why = keys
    .filter((k) => f[k][0] > 0.25 && f[k][1])
    .sort((a, b) => W[b] * f[b][0] - W[a] * f[a][0])
    .slice(0, 2)
    .map((k) => f[k][1])
    .join('. ');
  return { score: sc, ring: sc >= 75 ? 'now' : sc >= 50 ? 'today' : 'later', why: why || 'Low signal' };
}

const snoozed = (it) => it.snoozedUntil && new Date(it.snoozedUntil).getTime() > NOW;
const ranked = items
  .filter((it) => it.status !== 'done' && !snoozed(it))
  .map((it) => Object.assign(it, score(it)))
  .sort((a, b) => b.score - a.score);

// 3. Blocked people and today's events
const blockedPeople = items
  .filter((it) => it.status === 'blocked' && it.assignee && it.blockedBy)
  .map((it) => {
    const blocker = it.blockedBy.kind === 'item' ? byId.get(it.blockedBy.ref) : null;
    const onManager = !!(blocker && blocker.signals && blocker.signals.waitingOnMe);
    return { person: nameOf(it.assignee), personId: it.assignee, itemId: it.id, ref: it.ref, blockedOn: it.blockedBy.reason, blockedFor: it.blockedBy.since ? dur(it.blockedBy.since) : '', blockedByManager: onManager };
  });
const happenedToday = items
  .filter((it) => it.doneAt && NOW - new Date(it.doneAt).getTime() < 86400000)
  .sort((a, b) => new Date(b.doneAt) - new Date(a.doneAt))
  .slice(0, 8)
  .map((it) => ({ text: it.source === 'jira' ? `${first(it.assignee)} closed ${it.ref}: ${it.title}` : it.title, itemId: it.id, at: it.doneAt }));

const manager = ROSTER.find((p) => p.id === MANAGER);
const snapshot = {
  manager: { name: manager.name, role: manager.role, team: 'Learning Platform', company: 'Airtribe' },
  now: new Date(NOW).toISOString(),
  timezone: config.timezone,
  team: ROSTER.filter((p) => !p.external).map((p) => ({ id: p.id, name: p.name, role: p.role })),
  openItems: ranked.slice(0, 24).map((it) => ({ id: it.id, source: it.source, ref: it.ref, title: it.title, summary: it.summary, status: it.status, priority: it.priority || null, assignee: it.assignee ? nameOf(it.assignee) : null, due: it.dueAt || null, score: it.score, ring: it.ring, why: it.why, blockedBy: it.blockedBy ? it.blockedBy.reason : null, waitingOnManager: !!it.signals.waitingOnMe, suggestedNextStep: it.nextStep || null })),
  blockedPeople,
  happenedToday,
};

const out = { generatedAt: new Date(NOW).toISOString(), aiTriaged: ai.length, aiError, counts: { total: items.length, open: ranked.length, now: ranked.filter((r) => r.ring === 'now').length, blockedPeople: blockedPeople.length }, snapshot, items };
$getWorkflowStaticData('global').lastSnapshot = { generatedAt: out.generatedAt, counts: out.counts };
return [{ json: out }];
