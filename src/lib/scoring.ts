import type { Factor, FactorKey, Scored, Weights, WorkItem } from './types';
import { ME, firstName } from '../data/people';
import { minutesUntil, since } from './time';

export const DEFAULT_WEIGHTS: Weights = {
  urgency: 30,
  impact: 25,
  blocking: 20,
  waiting: 15,
  staleness: 5,
  escalation: 5,
};

export const FACTOR_LABELS: Record<FactorKey, { label: string; help: string }> = {
  urgency: { label: 'Urgency', help: 'How close the due date or deadline is' },
  impact: { label: 'Impact', help: 'Priority, learners affected and revenue at stake' },
  blocking: { label: 'Unblocks others', help: 'How many people or tasks are waiting on this' },
  waiting: { label: 'Waiting on you', help: 'You were asked to decide, review or reply' },
  staleness: { label: 'Stuck', help: 'Time without progress or a response' },
  escalation: { label: 'Escalation', help: 'Incidents, escalations and frustrated stakeholders' },
};

/** Score thresholds that define the rings on the radar. */
export const RING_NOW = 75;
export const RING_TODAY = 50;

const PRIORITY_IMPACT = { P0: 1, P1: 0.8, P2: 0.5, P3: 0.25 } as const;

/** Map of item id → ids of open items that are blocked by it. */
export function blockingIndex(items: WorkItem[]) {
  const idx = new Map<string, string[]>();
  for (const it of items) {
    if (it.status === 'done' || it.blockedBy?.kind !== 'item') continue;
    const list = idx.get(it.blockedBy.ref) ?? [];
    list.push(it.id);
    idx.set(it.blockedBy.ref, list);
  }
  return idx;
}

export function scoreItem(item: WorkItem, weights: Weights, now: number, blocks: Map<string, string[]>, byId: Map<string, WorkItem>): Scored {
  const f: Record<FactorKey, { value: number; detail: string }> = {
    urgency: { value: 0.1, detail: 'No deadline' },
    impact: { value: 0.4, detail: 'Normal priority' },
    blocking: { value: 0, detail: 'Nobody is waiting on this' },
    waiting: { value: 0, detail: 'Not waiting on you' },
    staleness: { value: 0, detail: 'Moving' },
    escalation: { value: 0, detail: 'No escalation' },
  };

  // Urgency
  const mins = minutesUntil(item.dueAt, now);
  if (Number.isFinite(mins)) {
    const h = mins / 60;
    const what = item.dueLabel ?? 'Due';
    if (mins < 0) f.urgency = { value: 1, detail: `Overdue by ${since(item.dueAt, now)}` };
    else if (h <= 6) f.urgency = { value: 0.95, detail: `${what} in ${h < 1 ? Math.round(mins) + 'm' : Math.round(h) + 'h'}` };
    else if (h <= 24) f.urgency = { value: 0.75, detail: `${what} within a day` };
    else if (h <= 72) f.urgency = { value: 0.45, detail: `${what} in ${Math.round(h / 24) <= 1 ? 'about a day' : Math.round(h / 24) + ' days'}` };
    else if (h <= 168) f.urgency = { value: 0.25, detail: `${what} this week` };
    else f.urgency = { value: 0.1, detail: `${what} in ${Math.round(h / 24)} days` };
  }

  // Impact
  {
    let v = item.priority ? PRIORITY_IMPACT[item.priority] : 0.4;
    const parts: string[] = [];
    // Jira priorities are explicit; for Slack, GitHub and email the n8n ingestion step infers one.
    if (item.priority) parts.push(item.source === 'jira' ? item.priority : `Inferred ${item.priority}`);
    const learners = item.signals.learners ?? 0;
    if (learners > 0) {
      v += Math.min(0.4, Math.log10(1 + learners) / 6);
      parts.push(`${learners} learners affected`);
    }
    if (item.signals.revenue) {
      v += 0.15;
      parts.push('revenue at stake');
    }
    f.impact = { value: Math.min(1, v), detail: parts.length ? parts.join(', ') : 'Normal priority' };
  }

  // Unblocks others
  {
    const waiting = (blocks.get(item.id) ?? []).map((id) => byId.get(id)).filter(Boolean) as WorkItem[];
    if (waiting.length) {
      const names = [...new Set(waiting.map((w) => firstName(w.assignee)))];
      const v = waiting.length >= 3 ? 1 : waiting.length === 2 ? 0.85 : 0.65;
      f.blocking = { value: v, detail: `Unblocks ${names.join(' and ')} (${waiting.map((w) => w.ref).join(', ')})` };
    }
  }

  // Waiting on you
  if (item.signals.waitingOnMe) f.waiting = { value: 1, detail: `${firstName(item.author)} is waiting on you` };
  else if (item.signals.mentionsMe) f.waiting = { value: 0.6, detail: 'You were mentioned' };
  else if (!item.assignee && (item.priority === 'P0' || item.priority === 'P1')) f.waiting = { value: 0.7, detail: 'Unassigned and needs an owner' };
  else if (item.blockedBy?.kind === 'person' && item.blockedBy.ref === ME) f.waiting = { value: 1, detail: 'Blocked on you' };

  // Stuck
  if (item.status !== 'done') {
    const ref = item.status === 'blocked' && item.blockedBy ? item.blockedBy.since : item.updatedAt;
    const hours = (now - new Date(ref).getTime()) / 3_600_000;
    const what = item.status === 'blocked' ? 'Blocked' : item.signals.waitingOnMe ? 'Unanswered' : 'No update';
    if (hours >= 24) f.staleness = { value: 1, detail: `${what} for ${since(ref, now)}` };
    else if (hours >= 8) f.staleness = { value: 0.6, detail: `${what} for ${since(ref, now)}` };
    else if (hours >= 3 && (item.status === 'blocked' || item.signals.waitingOnMe)) f.staleness = { value: 0.3, detail: `${what} for ${since(ref, now)}` };
  }

  // Escalation
  if (item.signals.escalation) f.escalation = { value: 1, detail: item.priority === 'P0' ? 'Live incident' : 'Escalated' };
  else if (item.signals.negative) f.escalation = { value: 0.5, detail: 'Frustration in the thread' };

  const keys = Object.keys(weights) as FactorKey[];
  const totalW = keys.reduce((s, k) => s + weights[k], 0) || 1;
  const raw = keys.reduce((s, k) => s + weights[k] * f[k].value, 0) / totalW;
  // Calibrated so a live incident or a long-pending review lands in the 90s.
  let score = Math.round(Math.min(99, raw * 125));
  // Product rule: a live P0 incident always sits at the top of the radar.
  if (item.priority === 'P0' && item.status !== 'done') {
    score = Math.max(score, 97);
    f.escalation = { value: 1, detail: 'Live P0 incident, pinned to the top' };
  }
  if (item.status === 'done') score = 0;

  const factors: Factor[] = keys.map((k) => ({ key: k, label: FACTOR_LABELS[k].label, weight: weights[k], value: f[k].value, detail: f[k].detail }));
  const ranked = [...factors].filter((x) => x.value > 0.25 && x.weight > 0).sort((a, b) => b.value * b.weight - a.value * a.weight);
  const why = ranked
    .slice(0, 2)
    .map((x) => x.detail.charAt(0).toUpperCase() + x.detail.slice(1))
    .join('. ');

  return {
    item,
    score,
    ring: score >= RING_NOW ? 'now' : score >= RING_TODAY ? 'today' : 'later',
    factors,
    why: why || 'Low signal',
  };
}

export function scoreAll(items: WorkItem[], weights: Weights, now: number): Scored[] {
  const blocks = blockingIndex(items);
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((i) => scoreItem(i, weights, now, blocks, byId)).sort((a, b) => b.score - a.score);
}

export interface BlockedPerson {
  personId: string;
  item: WorkItem;
  blockedOn: string;
  blockerPersonId?: string;
  blockerItem?: WorkItem;
  since: string;
  onYou: boolean;
}

/** People on the team who are blocked right now, longest-blocked first. */
export function blockedPeople(items: WorkItem[]): BlockedPerson[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: BlockedPerson[] = [];
  for (const it of items) {
    if (it.status !== 'blocked' || !it.assignee || !it.blockedBy) continue;
    const b = it.blockedBy;
    let blockerPersonId: string | undefined;
    let blockerItem: WorkItem | undefined;
    if (b.kind === 'item') {
      blockerItem = byId.get(b.ref);
      if (blockerItem?.status === 'done') continue; // already unblocked
      blockerPersonId = blockerItem?.signals.waitingOnMe ? ME : blockerItem?.assignee;
    } else if (b.kind === 'person') blockerPersonId = b.ref;
    out.push({
      personId: it.assignee,
      item: it,
      blockedOn: b.reason,
      blockerPersonId,
      blockerItem,
      since: b.since,
      onYou: blockerPersonId === ME,
    });
  }
  return out.sort((a, b) => new Date(a.since).getTime() - new Date(b.since).getTime());
}
