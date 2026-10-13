import type { Brief, Scored, WorkItem } from './types';
import { blockedPeople, type BlockedPerson } from './scoring';
import { ME, PEOPLE, WORKSPACE, firstName, person, personName } from '../data/people';
import { due, partOfDay, since } from './time';

const DAY = 24 * 60 * 60_000;

/** Short, AI-ready description of the workload. Same shape is sent to n8n and the serverless route. */
export function buildPayload(ranked: Scored[], all: WorkItem[], now: number) {
  const me = person(ME)!;
  const blocked = blockedPeople(all);
  const recent = recentEvents(all, now);
  return {
    manager: { name: me.name, role: me.role, team: WORKSPACE.team, company: WORKSPACE.company },
    now: new Date(now).toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    team: PEOPLE.filter((p) => !p.external).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    openItems: ranked.slice(0, 24).map((s) => ({
      id: s.item.id,
      source: s.item.source,
      ref: s.item.ref,
      title: s.item.title,
      summary: s.item.summary,
      status: s.item.status,
      priority: s.item.priority ?? null,
      assignee: s.item.assignee ? personName(s.item.assignee) : null,
      due: s.item.dueAt ? due(s.item.dueAt, now).text : null,
      score: s.score,
      ring: s.ring,
      why: s.why,
      blockedBy: s.item.blockedBy?.reason ?? null,
      waitingOnManager: !!s.item.signals.waitingOnMe,
      suggestedNextStep: s.item.nextStep ?? null,
    })),
    blockedPeople: blocked.map((b) => ({
      person: personName(b.personId),
      personId: b.personId,
      itemId: b.item.id,
      ref: b.item.ref,
      blockedOn: b.blockedOn,
      blockedFor: since(b.since, now),
      blockedByManager: b.onYou,
    })),
    happenedToday: recent.map((e) => ({ text: e.text, itemId: e.itemId, at: e.at })),
  };
}

export type BriefPayload = ReturnType<typeof buildPayload>;

interface Event {
  text: string;
  itemId?: string;
  at: string;
}

/** Notable things from the last 24 hours: shipped work, new incidents, the manager's own actions. */
export function recentEvents(all: WorkItem[], now: number): Event[] {
  const out: Event[] = [];
  for (const it of all) {
    if (it.doneAt && now - new Date(it.doneAt).getTime() < DAY) {
      const who = firstName(it.assignee ?? it.author);
      let text: string;
      if (it.source === 'jira') text = `${who} closed ${it.ref}: ${it.title}`;
      else if (it.detail.kind === 'pr') text = `${who} merged ${it.ref}: ${it.title}`;
      else text = it.title;
      out.push({ text, itemId: it.id, at: it.doneAt });
    }
    const created = new Date(it.createdAt).getTime();
    if (now - created < DAY && (it.priority === 'P0' || it.priority === 'P1') && it.status !== 'done') {
      const text = it.source === 'jira' ? `${firstName(it.author)} raised ${it.ref} (${it.priority}): ${it.title}` : `${firstName(it.author)} flagged: ${it.title}`;
      out.push({ text, itemId: it.id, at: it.createdAt });
    }
    for (const a of it.activity) {
      if (a.by === ME && now - new Date(a.at).getTime() < DAY) out.push({ text: `You ${a.text} (${it.ref})`, itemId: it.id, at: a.at });
    }
  }
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);
}

function suggestion(b: BlockedPerson) {
  const who = firstName(b.personId);
  if (b.onYou && b.blockerItem) return `Review ${b.blockerItem.ref} to unblock ${who}.`;
  if (b.blockerPersonId && b.blockerItem) return `Ask ${firstName(b.blockerPersonId)} to prioritise ${b.blockerItem.ref} so ${who} can move.`;
  return b.item.nextStep ?? `Check in with ${who} about ${b.item.ref}.`;
}

/** Deterministic summary used when no AI engine is reachable. Mirrors the AI response schema. */
export function localBrief(ranked: Scored[], all: WorkItem[], now: number): Brief {
  const attention = ranked.filter((s) => s.ring === 'now');
  const blocked = blockedPeople(all);
  const onYou = blocked.filter((b) => b.onYou).length;
  const top = ranked[0];

  const parts: string[] = [];
  if (attention.length === 0) parts.push('Nothing needs you urgently right now.');
  else parts.push(`${attention.length} ${attention.length === 1 ? 'item needs' : 'items need'} your attention this ${partOfDay(now).toLowerCase()}`);
  if (blocked.length) parts[parts.length - 1] += `, and ${blocked.length} ${blocked.length === 1 ? 'person is' : 'people are'} blocked${onYou ? ` (${onYou} on you)` : ''}.`;
  else parts[parts.length - 1] += '.';
  if (top && top.ring === 'now') parts.push(`Start with “${top.item.title}” (${top.item.ref}): ${top.why.split('. ')[0].replace(/^./, (c) => c.toLowerCase())}.`);

  return {
    generatedAt: new Date(now).toISOString(),
    engine: 'local',
    headline: parts.join(' '),
    topWork: ranked.slice(0, 3).map((s) => ({ itemId: s.item.id, why: s.item.nextStep ?? s.why })),
    happened: recentEvents(all, now).slice(0, 6),
    attention: attention.slice(0, 6).map((s) => ({ itemId: s.item.id, why: s.why, action: s.item.nextStep ?? 'Open and decide the next step.' })),
    blocked: blocked.map((b) => ({ personId: b.personId, itemId: b.item.id, blockedOn: b.blockedOn, since: b.since, suggestion: suggestion(b) })),
  };
}

/** Accepts an AI response and keeps only well-formed entries that point at real items and people. */
export function sanitizeBrief(raw: unknown, all: WorkItem[], engine: Brief['engine'], model?: string): Brief | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const ids = new Set(all.map((i) => i.id));
  const people = new Set(PEOPLE.map((p) => p.id));
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);

  const headline = str(r.headline);
  if (!headline) return null;
  const nameToId = new Map(PEOPLE.map((p) => [p.name.toLowerCase(), p.id] as const));
  const resolvePerson = (v: unknown) => {
    const s = str(v);
    if (people.has(s)) return s;
    return nameToId.get(s.toLowerCase()) ?? PEOPLE.find((p) => p.name.split(' ')[0].toLowerCase() === s.toLowerCase())?.id ?? '';
  };

  return {
    generatedAt: new Date().toISOString(),
    engine,
    model,
    headline,
    topWork: arr(r.topWork)
      .map((x) => ({ itemId: str(x.itemId), why: str(x.why) }))
      .filter((x) => ids.has(x.itemId) && x.why)
      .slice(0, 3),
    happened: arr(r.happened)
      .map((x) => ({ text: str(x.text), itemId: ids.has(str(x.itemId)) ? str(x.itemId) : undefined, at: str(x.at) || undefined }))
      .filter((x) => x.text)
      .slice(0, 6),
    attention: arr(r.attention)
      .map((x) => ({ itemId: str(x.itemId), why: str(x.why), action: str(x.action) }))
      .filter((x) => ids.has(x.itemId) && x.why)
      .slice(0, 6),
    blocked: arr(r.blocked)
      .map((x) => ({ personId: resolvePerson(x.personId ?? x.person), itemId: ids.has(str(x.itemId)) ? str(x.itemId) : undefined, blockedOn: str(x.blockedOn), since: str(x.since) || undefined, suggestion: str(x.suggestion) }))
      .filter((x) => x.personId && x.blockedOn)
      .slice(0, 8),
  };
}
