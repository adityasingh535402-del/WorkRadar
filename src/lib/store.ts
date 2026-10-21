import { useSyncExternalStore } from 'react';
import type { ActivityEvent, Brief, Override, Scored, Settings, Source, WorkItem } from './types';
import { buildItems } from '../data/items';
import { DEFAULT_WEIGHTS, scoreAll } from './scoring';
import { ME, firstName, personName } from '../data/people';

const STORAGE_KEY = 'workradar:v1';

export interface Toast {
  id: number;
  text: string;
  detail?: string;
  undo?: () => void;
  tone?: 'default' | 'error';
}

export type BriefState =
  | { status: 'idle' }
  | { status: 'loading'; previous?: Brief }
  /** note: a quiet explanation; degraded: Gemini failed and this is the on-device fallback. */
  | { status: 'ready'; data: Brief; note?: string; degraded?: string };

export interface State {
  now: number;
  base: WorkItem[];
  overrides: Record<string, Override>;
  settings: Settings;
  demo: 'live' | 'empty';
  brief: BriefState;
  toasts: Toast[];
  recentSearches: string[];
  lastSync: Record<Source, number>;
  version: number;
}

export const DEFAULT_SETTINGS: Settings = {
  weights: { ...DEFAULT_WEIGHTS },
  aiMode: 'auto',
  theme: 'system',
  outage: null,
};

interface Persisted {
  overrides: Record<string, Override>;
  settings: Settings;
  recentSearches: string[];
  demo: 'live' | 'empty';
}

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(s: State) {
  try {
    const data: Persisted = { overrides: s.overrides, settings: s.settings, recentSearches: s.recentSearches, demo: s.demo };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage can be unavailable (private mode, sandboxed previews) — the app still works in memory */
  }
}

const boot = Date.now();
const persisted = load();

let state: State = {
  now: boot,
  base: buildItems(boot),
  overrides: persisted.overrides ?? {},
  settings: {
    weights: { ...DEFAULT_WEIGHTS, ...persisted.settings?.weights },
    aiMode: persisted.settings?.aiMode === 'local' ? 'local' : 'auto',
    theme: persisted.settings?.theme ?? DEFAULT_SETTINGS.theme,
    outage: persisted.settings?.outage ?? null,
  },
  demo: persisted.demo ?? 'live',
  brief: { status: 'idle' },
  toasts: [],
  recentSearches: persisted.recentSearches ?? [],
  lastSync: { slack: boot - 2 * 60_000, jira: boot - 4 * 60_000, github: boot - 3 * 60_000, email: boot - 6 * 60_000 },
  version: 0,
};

const listeners = new Set<() => void>();

function set(patch: Partial<State> | ((s: State) => Partial<State>), persist = false) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p, version: state.version + 1 };
  if (persist) save(state);
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

// ─────────────── Derived data (memoised on version) ───────────────

let itemsCache: { v: number; items: WorkItem[] } | null = null;

/** All items with the user's actions applied. Includes done and snoozed items. */
export function allItems(s: State = state): WorkItem[] {
  if (itemsCache && itemsCache.v === s.version) return itemsCache.items;
  if (s.demo === 'empty') {
    itemsCache = { v: s.version, items: [] };
    return [];
  }
  const items = s.base.map((it) => {
    const o = s.overrides[it.id];
    if (!o) return it;
    return {
      ...it,
      status: o.status ?? it.status,
      assignee: o.assignee === undefined ? it.assignee : o.assignee ?? undefined,
      snoozedUntil: o.snoozedUntil === undefined ? it.snoozedUntil : o.snoozedUntil ?? undefined,
      doneAt: o.doneAt === undefined ? it.doneAt : o.doneAt ?? undefined,
      activity: o.extraActivity ? [...it.activity, ...o.extraActivity] : it.activity,
    };
  });
  itemsCache = { v: s.version, items };
  return items;
}

export const isSnoozed = (it: WorkItem, now: number) => !!it.snoozedUntil && new Date(it.snoozedUntil).getTime() > now;

/** Items hidden by a simulated source outage are excluded from every view. */
export function visibleItems(s: State = state) {
  return allItems(s).filter((i) => i.source !== s.settings.outage);
}

let scoredCache: { v: number; list: Scored[] } | null = null;

/** Open, un-snoozed items ranked by priority score. */
export function rankedOpen(s: State = state): Scored[] {
  if (scoredCache && scoredCache.v === s.version) return scoredCache.list;
  const all = visibleItems(s);
  const scored = scoreAll(all, s.settings.weights, s.now).filter((x) => x.item.status !== 'done' && !isSnoozed(x.item, s.now));
  scoredCache = { v: s.version, list: scored };
  return scored;
}

export function scoredById(id: string, s: State = state): Scored | undefined {
  const all = allItems(s);
  return scoreAll(all, s.settings.weights, s.now).find((x) => x.item.id === id);
}

// ─────────────── Toasts ───────────────

let toastId = 1;
export function toast(t: Omit<Toast, 'id'>) {
  const id = toastId++;
  set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  window.setTimeout(() => dismissToast(id), t.undo ? 7000 : 4500);
  return id;
}
export function dismissToast(id: number) {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

// ─────────────── Actions ───────────────

type ActionKind = 'assign' | 'done' | 'reopen' | 'snooze' | 'unsnooze';
type ActionListener = (a: { kind: ActionKind; item: WorkItem; assignee?: string; until?: string }) => Promise<string | null>;
let actionListener: ActionListener | null = null;
/** A sync layer can register here to push actions to the source tools (not used in the demo). */
export function onAction(l: ActionListener) {
  actionListener = l;
}

function event(text: string): ActivityEvent {
  return { at: new Date().toISOString(), by: ME, text };
}

function mutate(id: string, patch: Override, text: string) {
  const prev = state.overrides[id];
  const merged: Override = { ...prev, ...patch, extraActivity: [...(prev?.extraActivity ?? []), event(text)] };
  set((s) => ({ overrides: { ...s.overrides, [id]: merged } }), true);
  return () => set((s) => {
    const next = { ...s.overrides };
    if (prev) next[id] = prev;
    else delete next[id];
    return { overrides: next };
  }, true);
}

function sync(kind: ActionKind, item: WorkItem, extra: { assignee?: string; until?: string }, toastText: string, undo: () => void) {
  const tid = toast({ text: toastText, undo: () => { undo(); toast({ text: 'Undone' }); } });
  if (!actionListener) return;
  actionListener({ kind, item, ...extra }).then((detail) => {
    if (!detail) return;
    set((s) => ({ toasts: s.toasts.map((t) => (t.id === tid ? { ...t, detail } : t)) }));
  }).catch(() => undefined);
}

const find = (id: string) => allItems().find((i) => i.id === id);

export function assign(id: string, personId: string) {
  const it = find(id);
  if (!it) return;
  const undo = mutate(id, { assignee: personId }, `assigned it to ${personName(personId)}`);
  sync('assign', it, { assignee: personId }, `Assigned ${it.ref} to ${firstName(personId)}`, undo);
}

export function markDone(id: string) {
  const it = find(id);
  if (!it) return;
  const undo = mutate(id, { status: 'done', doneAt: new Date().toISOString(), snoozedUntil: null }, 'marked it done');
  sync('done', it, {}, `Marked ${it.ref} done`, undo);
}

export function reopen(id: string) {
  const it = find(id);
  if (!it) return;
  const base = state.base.find((b) => b.id === id);
  const status = base && base.status !== 'done' ? base.status : 'open';
  const undo = mutate(id, { status, doneAt: null }, 'reopened it');
  sync('reopen', it, {}, `Reopened ${it.ref}`, undo);
}

export function snooze(id: string, until: Date, label: string) {
  const it = find(id);
  if (!it) return;
  const undo = mutate(id, { snoozedUntil: until.toISOString() }, `snoozed it until ${label}`);
  sync('snooze', it, { until: until.toISOString() }, `Snoozed ${it.ref} until ${label}`, undo);
}

export function unsnooze(id: string) {
  const it = find(id);
  if (!it) return;
  const undo = mutate(id, { snoozedUntil: null }, 'brought it back from snooze');
  sync('unsnooze', it, {}, `${it.ref} is back on your radar`, undo);
}

// ─────────────── Settings & misc ───────────────

export function updateSettings(patch: Partial<Settings>) {
  set((s) => ({ settings: { ...s.settings, ...patch } }), true);
}

export function setDemo(demo: 'live' | 'empty') {
  set({ demo, brief: { status: 'idle' } }, true);
}

export function resetDemo() {
  const now = Date.now();
  set({ overrides: {}, base: buildItems(now), now, demo: 'live', brief: { status: 'idle' }, settings: { ...state.settings, outage: null } }, true);
  toast({ text: 'Demo data reset' });
}

export function setBrief(brief: BriefState) {
  set({ brief });
}

export function addRecentSearch(q: string) {
  const v = q.trim();
  if (!v) return;
  set((s) => ({ recentSearches: [v, ...s.recentSearches.filter((x) => x !== v)].slice(0, 6) }), true);
}

export function markSynced(source: Source) {
  set((s) => ({ lastSync: { ...s.lastSync, [source]: Date.now() } }));
}

export function tick() {
  set({ now: Date.now() });
}
