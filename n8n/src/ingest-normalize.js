// n8n Code node · "Normalize to WorkItems" (Run once for all items)
// Maps four different API shapes (Slack threads, Jira issues, GitHub PRs/issues,
// Gmail messages) into one WorkItem schema, and adds first-pass signals with
// simple rules. Gemini refines the unstructured ones in the next step.

const ROSTER = /*__ROSTER__*/ [];
const config = $('Config').first().json;
const MANAGER = config.managerId;
const NOW = Date.now();

const slack = $('Slack: threads').first().json;
const jira = $('Jira: issues').first().json;
const github = $('GitHub: pulls & issues').first().json;
const gmail = $('Gmail: messages').first().json;

const byAny = new Map();
for (const p of ROSTER) for (const k of [p.id, p.name, p.email, p.slack_id, p.github_login]) if (k) byAny.set(String(k).toLowerCase(), p.id);
const pid = (u) => {
  if (!u) return undefined;
  if (typeof u === 'string') return byAny.get(u.toLowerCase()) || byAny.get(u.replace(/.*<|>.*/g, '').toLowerCase());
  return byAny.get(String(u.id || u.email || u.login || u.name || u.displayName || '').toLowerCase()) || (u.name && byAny.get(u.name.toLowerCase()));
};
const first = (id) => (ROSTER.find((p) => p.id === id) || { name: id || '' }).name.split(' ')[0];
const at = (minAgo) => (minAgo === null || minAgo === undefined ? undefined : new Date(NOW - minAgo * 60000).toISOString());
const inMin = (m) => (m === null || m === undefined ? undefined : new Date(Math.round((NOW + m * 60000) / 900000) * 900000).toISOString());

const managerName = first(MANAGER).toLowerCase();
function textSignals(text, opts = {}) {
  const t = String(text || '').toLowerCase();
  const learners = Number((t.match(/(\d+)\s+(learners|sessions|tickets)/) || [])[1] || 0);
  const s = {
    learners: learners || undefined,
    mentionsMe: t.includes('@' + managerName),
    escalation: /incident|outage|escalat|p0\b/.test(t) || opts.channel === 'incidents',
    negative: /upset|complain|frustrat|still waiting|still nothing|too generic|disputed/.test(t),
    revenue: /payment|revenue|enrol|deal|pricing|refund|launch/.test(t),
  };
  s.waitingOnMe = s.mentionsMe || (!!opts.direct && /\?|can you|could you|need a (call|decision)|should we|who should/.test(t));
  return s;
}
const blockedHint = (t) => /waiting on|still waiting|blocked on|still nothing|is blocked/.test(String(t).toLowerCase());

const items = [];

// Slack: one WorkItem per thread
for (const th of slack.threads || []) {
  const msgs = th.messages || [];
  const all = msgs.map((m) => m.text).join('\n');
  const wr = th.workradar || {};
  const sig = textSignals(all, { channel: th.channel.name, direct: th.channel.is_im });
  const author = pid(msgs[0] && msgs[0].user);
  const done = wr.done_minutes_ago !== null && wr.done_minutes_ago !== undefined;
  items.push({
    id: wr.item_id || `slack-${th.channel.id}-${th.thread_ts_minutes_ago}`,
    source: 'slack',
    ref: th.channel.is_im ? `DM ${first(author)}` : `#${th.channel.name}`,
    url: th.permalink,
    project: wr.project || 'platform',
    title: wr.title || String(msgs[0] ? msgs[0].text : '').slice(0, 90),
    summary: String(msgs[0] ? msgs[0].text : ''),
    status: done ? 'done' : blockedHint(all) && wr.assignee ? 'blocked' : 'open',
    priority: sig.escalation && th.channel.name === 'incidents' ? 'P0' : undefined,
    assignee: wr.assignee || undefined,
    author,
    createdAt: at(th.thread_ts_minutes_ago),
    updatedAt: at(msgs.length ? msgs[msgs.length - 1].minutes_ago : th.thread_ts_minutes_ago),
    dueAt: inMin(wr.due_minutes_from_now),
    dueLabel: wr.due_label || undefined,
    doneAt: done ? at(wr.done_minutes_ago) : undefined,
    labels: [],
    signals: sig,
    detail: { kind: 'thread', channel: th.channel.is_im ? 'Direct message' : `#${th.channel.name}`, messages: msgs.map((m) => ({ by: pid(m.user), at: at(m.minutes_ago), text: m.text, reactions: (m.reactions || []).map((r) => `${r.name} ${r.count}`) })) },
    activity: [],
  });
}

// Jira
const JIRA_STATUS = { 'To Do': 'open', Open: 'open', 'In Progress': 'in_progress', 'In Review': 'in_review', Blocked: 'blocked', Done: 'done' };
for (const is of jira.issues || []) {
  const f = is.fields;
  const wr = f.workradar || {};
  const link = (f.issuelinks || []).find((l) => l.inwardIssue && /block/i.test(l.type.inward || l.type.name));
  items.push({
    id: wr.item_id || `jira-${is.key}`,
    source: 'jira',
    ref: is.key,
    url: is.self,
    project: wr.project || 'platform',
    title: f.summary,
    summary: f.description,
    status: JIRA_STATUS[f.status.name] || 'open',
    priority: f.priority ? f.priority.name : undefined,
    assignee: pid(f.assignee),
    author: pid(f.reporter),
    createdAt: at(f.created_minutes_ago),
    updatedAt: at(f.updated_minutes_ago),
    dueAt: inMin(f.duedate_minutes_from_now),
    dueLabel: f.due_label || undefined,
    doneAt: at(f.resolved_minutes_ago),
    snoozedUntil: inMin(wr.snoozed_minutes_from_now),
    labels: f.labels || [],
    signals: { learners: wr.learners || undefined, revenue: !!wr.revenue, escalation: !!wr.escalation },
    blockedBy: link ? { kind: 'item', ref: link.inwardIssue.workradar_item_id || `jira-${link.inwardIssue.key}`, reason: link.reason || `Blocked by ${link.inwardIssue.key}`, since: at(link.since_minutes_ago) } : undefined,
    detail: { kind: 'ticket', type: f.issuetype.name, sprint: f.sprint || undefined, points: f.story_points || undefined, progress: f.progress_percent || undefined, description: f.description, comments: (f.comment.comments || []).map((c) => ({ by: pid(c.author), at: at(c.minutes_ago), text: c.body })) },
    activity: [],
  });
}

// GitHub
for (const g of github.items || []) {
  const wr = g.workradar || {};
  const isPr = g.type === 'pull_request';
  const reviewers = isPr ? (g.requested_reviewers || []).map((u) => ({ id: pid(u), state: 'requested' })).concat((g.reviews || []).map((r) => ({ id: pid(r.user), state: r.state === 'APPROVED' ? 'approved' : r.state === 'CHANGES_REQUESTED' ? 'changes' : 'commented' }))) : [];
  const reviewOnMe = reviewers.some((r) => r.id === MANAGER && r.state === 'requested');
  let status = g.state === 'closed' || g.merged || g.type === 'release' ? 'done' : isPr ? (g.draft ? 'in_progress' : 'in_review') : 'open';
  if (wr.blocked_by && status !== 'done') status = 'blocked';
  const body = [g.body].concat((g.comments || []).map((c) => c.body)).join('\n');
  const sig = textSignals(body);
  items.push({
    id: wr.item_id || `gh-${g.repository}-${g.number}`,
    source: 'github',
    ref: g.ref_label || (isPr ? `PR #${g.number}` : `Issue #${g.number}`),
    url: g.html_url,
    project: wr.project || 'platform',
    title: g.title,
    summary: String(g.body || '').split('. ')[0] + '.',
    status,
    assignee: pid(g.assignee),
    author: pid(g.user),
    createdAt: at(g.created_minutes_ago),
    updatedAt: at(g.updated_minutes_ago),
    dueAt: inMin(wr.due_minutes_from_now),
    dueLabel: wr.due_label || undefined,
    doneAt: status === 'done' ? at(g.closed_minutes_ago) : undefined,
    labels: (g.labels || []).map((l) => l.name),
    signals: { learners: wr.learners || undefined, waitingOnMe: reviewOnMe, negative: sig.negative },
    blockedBy: wr.blocked_by ? { kind: 'item', ref: wr.blocked_by.item_id, reason: wr.blocked_by.reason, since: at(wr.blocked_by.since_minutes_ago) } : undefined,
    detail: isPr
      ? { kind: 'pr', repo: g.repository, number: g.number, branch: g.head.ref, base: g.base.ref, additions: g.additions, deletions: g.deletions, files: g.changed_files, draft: g.draft, merged: g.merged, reviewers, checks: (g.check_runs || []).map((c) => ({ name: c.name, state: c.conclusion === 'success' ? 'passing' : c.conclusion === 'failure' ? 'failing' : 'pending' })), description: g.body, comments: (g.comments || []).map((c) => ({ by: pid(c.user), at: at(c.minutes_ago), text: c.body })) }
      : { kind: 'issue', repo: g.repository, number: g.number, description: g.body, comments: (g.comments || []).map((c) => ({ by: pid(c.user), at: at(c.minutes_ago), text: c.body })) },
    activity: [],
  });
}

// Gmail
for (const m of gmail.messages || []) {
  const h = Object.fromEntries((m.payload.headers || []).map((x) => [x.name.toLowerCase(), x.value]));
  const wr = m.workradar || {};
  const toManager = String(h.to || '').toLowerCase().includes((ROSTER.find((p) => p.id === MANAGER) || {}).email || '@@');
  const sig = textSignals(m.payload.body_text, { direct: toManager });
  sig.waitingOnMe = sig.waitingOnMe || (m.labelIds || []).includes('IMPORTANT');
  const done = wr.done_minutes_ago !== null && wr.done_minutes_ago !== undefined;
  const fromName = String(h.from || '').replace(/\s*<.*>/, '');
  items.push({
    id: wr.item_id || `gmail-${m.id}`,
    source: 'email',
    ref: fromName,
    url: 'https://mail.google.com/mail/u/0/#inbox/' + m.threadId,
    project: wr.project || 'platform',
    title: wr.title || h.subject,
    summary: m.snippet,
    status: done ? 'done' : 'open',
    assignee: wr.assignee || undefined,
    author: pid(h.from) || pid(fromName) || fromName,
    createdAt: at(m.internal_minutes_ago),
    updatedAt: at(m.internal_minutes_ago),
    dueAt: inMin(wr.due_minutes_from_now),
    dueLabel: wr.due_label || undefined,
    doneAt: done ? at(wr.done_minutes_ago) : undefined,
    labels: (m.labelIds || []).includes('CATEGORY_UPDATES') ? ['fyi'] : [],
    signals: (m.labelIds || []).includes('CATEGORY_UPDATES') ? {} : sig,
    detail: { kind: 'email', from: fromName, fromEmail: String(h.from || '').replace(/.*<|>.*/g, ''), to: String(h.to || '').split(/,\s*/), subject: h.subject, body: String(m.payload.body_text || '').split(/\n\n+/), attachments: m.payload.attachments || [] },
    activity: [],
  });
}

return items.map((json) => ({ json }));
