import type { Scored, Source, Status, WorkItem } from './types';
import { PEOPLE, PROJECTS, ME } from '../data/people';
import { isSnoozed } from './store';
import { minutesUntil } from './time';

export interface Filter {
  kind: 'source' | 'status' | 'person' | 'project' | 'flag' | 'priority';
  value: string;
  label: string;
  /** The words in the query that produced this filter, so the chip can be removed. */
  tokens: string[];
}

const SOURCE_WORDS: Record<string, Source> = {
  slack: 'slack', thread: 'slack', threads: 'slack', message: 'slack', messages: 'slack', dm: 'slack', dms: 'slack',
  jira: 'jira', ticket: 'jira', tickets: 'jira', bug: 'jira', bugs: 'jira', story: 'jira',
  github: 'github', pr: 'github', prs: 'github', 'pull': 'github', review: 'github', reviews: 'github', code: 'github',
  email: 'email', emails: 'email', mail: 'email', inbox: 'email',
};
const SOURCE_LABEL: Record<Source, string> = { slack: 'Slack', jira: 'Jira', github: 'GitHub', email: 'Email' };

const STATUS_WORDS: Record<string, Status | 'snoozed' | 'open-any'> = {
  blocked: 'blocked', stuck: 'blocked', blocking: 'blocked',
  done: 'done', closed: 'done', shipped: 'done', merged: 'done',
  open: 'open-any', 'in-progress': 'in_progress', progress: 'in_progress',
  snoozed: 'snoozed',
};

const FLAG_WORDS: Record<string, { value: string; label: string }> = {
  overdue: { value: 'overdue', label: 'Overdue' },
  urgent: { value: 'urgent', label: 'Needs attention' },
  today: { value: 'today', label: 'Due today' },
  unassigned: { value: 'unassigned', label: 'Unassigned' },
  incident: { value: 'incident', label: 'Incidents' },
  incidents: { value: 'incident', label: 'Incidents' },
  learners: { value: 'learners', label: 'Learner-facing' },
};

const PRIORITY_WORDS = ['p0', 'p1', 'p2', 'p3'];

const STOP = new Set(['the', 'a', 'an', 'for', 'from', 'by', 'of', 'on', 'in', 'to', 'and', 'with', 'is', 'are', 'what', 'show', 'me', 'my', 'all', 'items', 'things', 'that', 'who', 'whats', "what's"]);

export interface ParsedQuery {
  filters: Filter[];
  terms: string[];
}

export function parseQuery(q: string): ParsedQuery {
  const lower = q.toLowerCase().replace(/[“”"]/g, ' ');
  const filters: Filter[] = [];
  const terms: string[] = [];

  // Multi-word phrases first.
  let rest = lower;
  const phrases: [RegExp, Filter][] = [
    [/waiting on (me|you)/, { kind: 'flag', value: 'waiting', label: 'Waiting on you', tokens: [] }],
    [/needs? (my )?attention/, { kind: 'flag', value: 'urgent', label: 'Needs attention', tokens: [] }],
    [/pull requests?/, { kind: 'source', value: 'github', label: 'GitHub', tokens: [] }],
    [/assigned to me|my work/, { kind: 'person', value: ME, label: 'You', tokens: [] }],
    [/in review/, { kind: 'status', value: 'in_review', label: 'In review', tokens: [] }],
  ];
  for (const [re, f] of phrases) {
    const m = rest.match(re);
    if (m) {
      filters.push({ ...f, tokens: m[0].split(' ') });
      rest = rest.replace(re, ' ');
    }
  }

  for (const raw of rest.split(/[\s,]+/)) {
    const w = raw.replace(/^#/, '').replace(/[?.!]$/, '');
    if (!w) continue;
    if (SOURCE_WORDS[w]) {
      const v = SOURCE_WORDS[w];
      if (!filters.some((f) => f.kind === 'source' && f.value === v)) filters.push({ kind: 'source', value: v, label: SOURCE_LABEL[v], tokens: [raw] });
      continue;
    }
    if (STATUS_WORDS[w]) {
      const v = STATUS_WORDS[w];
      const label = v === 'open-any' ? 'Open' : v === 'in_progress' ? 'In progress' : v[0].toUpperCase() + v.slice(1);
      filters.push({ kind: 'status', value: v, label, tokens: [raw] });
      continue;
    }
    if (FLAG_WORDS[w]) {
      filters.push({ kind: 'flag', ...FLAG_WORDS[w], tokens: [raw] });
      continue;
    }
    if (PRIORITY_WORDS.includes(w)) {
      filters.push({ kind: 'priority', value: w.toUpperCase(), label: w.toUpperCase(), tokens: [raw] });
      continue;
    }
    const p = PEOPLE.find((x) => x.name.split(' ')[0].toLowerCase() === w.replace(/'s$/, ''));
    if (p) {
      filters.push({ kind: 'person', value: p.id, label: p.id === ME ? 'You' : p.name.split(' ')[0], tokens: [raw] });
      continue;
    }
    const proj = PROJECTS.find((x) => x.name.toLowerCase().split(' ')[0] === w || x.id === w);
    if (proj && w.length > 3) {
      filters.push({ kind: 'project', value: proj.id, label: proj.name, tokens: [raw] });
      continue;
    }
    if (!STOP.has(w)) terms.push(w);
  }
  return { filters, terms };
}

function haystack(it: WorkItem) {
  const d = it.detail;
  const body: string[] = [];
  if (d.kind === 'thread') body.push(d.channel, ...d.messages.map((m) => m.text));
  if (d.kind === 'ticket') body.push(d.description, ...d.comments.map((c) => c.text));
  if (d.kind === 'pr') body.push(d.repo, d.branch, d.description, ...d.comments.map((c) => c.text));
  if (d.kind === 'issue') body.push(d.repo, d.description);
  if (d.kind === 'email') body.push(d.from, d.subject, ...d.body);
  return {
    ref: it.ref.toLowerCase(),
    title: it.title.toLowerCase(),
    summary: it.summary.toLowerCase(),
    labels: it.labels.join(' ').toLowerCase(),
    body: body.join(' ').toLowerCase(),
  };
}

function matchesFilter(s: Scored, f: Filter, now: number) {
  const it = s.item;
  switch (f.kind) {
    case 'source':
      return it.source === f.value;
    case 'priority':
      return it.priority === f.value;
    case 'project':
      return it.project === f.value;
    case 'person':
      return it.assignee === f.value || it.author === f.value || (f.value === ME && !!it.signals.waitingOnMe);
    case 'status':
      if (f.value === 'snoozed') return isSnoozed(it, now);
      if (f.value === 'open-any') return it.status !== 'done';
      if (f.value === 'blocked') return it.status === 'blocked' || !!it.blockedBy;
      return it.status === f.value;
    case 'flag':
      if (f.value === 'waiting') return !!it.signals.waitingOnMe && it.status !== 'done';
      if (f.value === 'urgent') return s.ring === 'now' && it.status !== 'done';
      if (f.value === 'overdue') return minutesUntil(it.dueAt, now) < 0 && it.status !== 'done';
      if (f.value === 'today') return minutesUntil(it.dueAt, now) < 24 * 60 && it.status !== 'done';
      if (f.value === 'unassigned') return !it.assignee && it.status !== 'done';
      if (f.value === 'incident') return it.labels.includes('incident');
      if (f.value === 'learners') return (it.signals.learners ?? 0) > 0 || it.labels.includes('learner-facing');
      return true;
  }
}

export interface SearchHit {
  scored: Scored;
  relevance: number;
  matchedIn: string[];
}

export function search(all: Scored[], parsed: ParsedQuery, now: number): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const s of all) {
    // Filters of the same kind are OR'ed, different kinds are AND'ed.
    const kinds = new Map<string, Filter[]>();
    parsed.filters.forEach((f) => kinds.set(f.kind, [...(kinds.get(f.kind) ?? []), f]));
    let ok = true;
    for (const fs of kinds.values()) if (!fs.some((f) => matchesFilter(s, f, now))) ok = false;
    if (!ok) continue;

    let relevance = parsed.filters.length ? 1 : 0;
    const matchedIn = new Set<string>();
    if (parsed.terms.length) {
      const h = haystack(s.item);
      let all = true;
      for (const t of parsed.terms) {
        let m = 0;
        if (h.ref.includes(t)) { m += 5; matchedIn.add('reference'); }
        if (h.title.includes(t)) { m += 3; matchedIn.add('title'); }
        if (h.summary.includes(t)) { m += 1.5; matchedIn.add('summary'); }
        if (h.labels.includes(t)) { m += 1; matchedIn.add('labels'); }
        if (h.body.includes(t)) { m += 1; matchedIn.add('conversation'); }
        if (m === 0) all = false;
        relevance += m;
      }
      if (!all) continue;
    }
    if (!parsed.terms.length && !parsed.filters.length) continue;
    // Break ties with the priority score so the important things float up.
    hits.push({ scored: s, relevance: relevance + s.score / 100, matchedIn: [...matchedIn] });
  }
  return hits.sort((a, b) => b.relevance - a.relevance);
}

export const SUGGESTED_QUERIES = [
  'waiting on me',
  'blocked',
  'prs in review',
  'launchpad',
  'ananya',
  'learners p1',
  'unassigned',
  'done',
];
