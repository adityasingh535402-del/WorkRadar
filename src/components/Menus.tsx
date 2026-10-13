import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { WorkItem } from '../lib/types';
import { TEAM, firstName, person } from '../data/people';
import { allItems, assign, markDone, reopen, snooze, unsnooze, isSnoozed, useStore, toast } from '../lib/store';
import { snoozeOptions } from '../lib/time';
import { Avatar, SOURCE_META } from './bits';
import { Icon } from './Icon';

/** Floating panel anchored to a trigger. Flips above when there isn't room below. */
export function Popover({ anchor, open, onClose, children, width = 280, label }: { anchor: HTMLElement | null; open: boolean; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = ref.current?.offsetHeight ?? 300;
      const below = window.innerHeight - r.bottom;
      const top = below < h + 12 && r.top > h + 12 ? r.top - h - 6 : r.bottom + 6;
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8);
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor, width]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || anchor?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        anchor?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div ref={ref} className="popover" role="dialog" aria-label={label} style={{ width, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {children}
    </div>,
    document.body,
  );
}

/** Arrow-key navigation between buttons inside a menu. */
function onMenuKeys(e: ReactKeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button.menu-item'));
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.key === 'ArrowDown' ? buttons[(i + 1) % buttons.length] : buttons[(i - 1 + buttons.length) % buttons.length];
  next?.focus();
  e.preventDefault();
}

const PROJECT_SKILLS: Record<string, string[]> = {
  live: ['live-sessions', 'video', 'qa'],
  review: ['grading', 'backend', 'data', 'frontend'],
  launchpad: ['payments', 'backend', 'infra'],
  mentor: ['mentor-connect', 'notifications', 'mentors'],
  career: ['career', 'frontend', 'design'],
  platform: ['infra', 'devops', 'security', 'qa'],
};

/** Suggests an owner: the AI next-step if it names someone, else best skill match with the lightest load. */
export function suggestAssignee(item: WorkItem, loads: Map<string, number>) {
  const named = item.nextStep?.match(/Assign to (\w+)/)?.[1]?.toLowerCase();
  const byName = named ? TEAM.find((p) => p.name.split(' ')[0].toLowerCase() === named) : undefined;
  if (byName) return { id: byName.id, reason: item.nextStep! };
  const wanted = PROJECT_SKILLS[item.project] ?? [];
  const ranked = TEAM.map((p) => {
    const match = (p.skills ?? []).filter((s) => wanted.includes(s)).length;
    return { p, value: match * 2 - (loads.get(p.id) ?? 0) * 0.5 };
  }).sort((a, b) => b.value - a.value);
  const best = ranked[0]?.p;
  return best ? { id: best.id, reason: `${firstName(best.id)} has the closest skills and ${loads.get(best.id) ?? 0} open items.` } : null;
}

export function AssignMenu({ item, onDone }: { item: WorkItem; onDone: () => void }) {
  const version = useStore((s) => s.version);
  const [q, setQ] = useState('');
  const loads = useMemo(() => {
    const m = new Map<string, number>();
    allItems().forEach((i) => i.assignee && i.status !== 'done' && m.set(i.assignee, (m.get(i.assignee) ?? 0) + 1));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const blocked = useMemo(() => new Set(allItems().filter((i) => i.status === 'blocked').map((i) => i.assignee)), [version]);
  const suggestion = suggestAssignee(item, loads);
  const list = TEAM.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.role.toLowerCase().includes(q.toLowerCase())).sort((a, b) =>
    a.id === suggestion?.id ? -1 : b.id === suggestion?.id ? 1 : 0,
  );

  return (
    <div className="menu" onKeyDown={onMenuKeys}>
      <div className="menu-search">
        <Icon name="search" size={15} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Assign to…" aria-label="Find a teammate" />
      </div>
      {suggestion && !q && (
        <p className="menu-hint">
          <Icon name="sweep" size={13} />
          {suggestion.reason}
        </p>
      )}
      <div className="menu-list" role="menu">
        {list.map((p) => (
          <button
            key={p.id}
            role="menuitem"
            className={`menu-item${item.assignee === p.id ? ' is-current' : ''}`}
            onClick={() => {
              if (item.assignee !== p.id) assign(item.id, p.id);
              onDone();
            }}
          >
            <Avatar id={p.id} size={26} />
            <span className="menu-item-main">
              <span className="menu-item-title">
                {p.name}
                {suggestion?.id === p.id && <span className="tag tag-ai">Suggested</span>}
              </span>
              <span className="menu-item-sub">
                {p.role}, {loads.get(p.id) ?? 0} open{blocked.has(p.id) ? ', blocked' : ''}
              </span>
            </span>
            {item.assignee === p.id && <Icon name="check" size={16} />}
          </button>
        ))}
        {list.length === 0 && <p className="menu-empty">No one on the team matches “{q}”.</p>}
      </div>
    </div>
  );
}

export function SnoozeMenu({ item, onDone }: { item: WorkItem; onDone: () => void }) {
  const now = useStore((s) => s.now);
  const snoozed = isSnoozed(item, now);
  return (
    <div className="menu" onKeyDown={onMenuKeys} role="menu">
      <p className="menu-label">Snooze until</p>
      {snoozeOptions(now).map((o, i) => (
        <button
          key={o.id}
          role="menuitem"
          autoFocus={i === 0}
          className="menu-item menu-item-row"
          onClick={() => {
            snooze(item.id, o.until, o.id === '1h' || o.id === '3h' ? o.hint : o.label.toLowerCase() === 'tomorrow' ? 'tomorrow, 9 am' : 'Monday, 9 am');
            onDone();
          }}
        >
          <span>{o.label}</span>
          <span className="menu-item-sub">{o.hint}</span>
        </button>
      ))}
      {snoozed && (
        <button
          className="menu-item menu-item-row"
          role="menuitem"
          onClick={() => {
            unsnooze(item.id);
            onDone();
          }}
        >
          <span>Bring back now</span>
        </button>
      )}
    </div>
  );
}

/** Assign, Snooze and Mark done for one item. `compact` renders icon buttons for list rows. */
export function ActionBar({ item, compact = false, showOpen = false }: { item: WorkItem; compact?: boolean; showOpen?: boolean }) {
  const [open, setOpen] = useState<null | 'assign' | 'snooze'>(null);
  const assignRef = useRef<HTMLButtonElement>(null);
  const snoozeRef = useRef<HTMLButtonElement>(null);
  const now = useStore((s) => s.now);
  const done = item.status === 'done';
  const snoozed = isSnoozed(item, now);
  const owner = person(item.assignee);
  const stop = (e: { stopPropagation: () => void; preventDefault: () => void }) => {
    e.stopPropagation();
    e.preventDefault();
  };

  return (
    <div className={`actions${compact ? ' actions-compact' : ''}`} onClick={stop}>
      <button
        ref={assignRef}
        className="btn btn-quiet"
        data-action="assign"
        aria-haspopup="dialog"
        aria-expanded={open === 'assign'}
        onClick={() => setOpen(open === 'assign' ? null : 'assign')}
        title={owner ? `Assigned to ${owner.name}. Reassign` : 'Assign'}
        disabled={done}
      >
        <Icon name="user-plus" size={16} />
        {!compact && <span>{owner ? 'Reassign' : 'Assign'}</span>}
      </button>
      <button
        ref={snoozeRef}
        className="btn btn-quiet"
        data-action="snooze"
        aria-haspopup="dialog"
        aria-expanded={open === 'snooze'}
        onClick={() => setOpen(open === 'snooze' ? null : 'snooze')}
        title={snoozed ? 'Snoozed. Change or bring back' : 'Snooze'}
        disabled={done}
      >
        <Icon name="clock" size={16} />
        {!compact && <span>{snoozed ? 'Snoozed' : 'Snooze'}</span>}
      </button>
      {done ? (
        <button className="btn btn-quiet" data-action="done" onClick={() => reopen(item.id)} title="Reopen">
          <Icon name="undo" size={16} />
          {!compact && <span>Reopen</span>}
        </button>
      ) : (
        <button className={`btn ${compact ? 'btn-quiet' : 'btn-primary'}`} data-action="done" onClick={() => markDone(item.id)} title="Mark done">
          <Icon name="check" size={16} />
          {!compact && <span>Mark done</span>}
        </button>
      )}
      {showOpen && (
        <a className="btn btn-quiet" href={item.url} target="_blank" rel="noreferrer" onClick={(e) => {
          e.preventDefault();
          toast({ text: `Mock data: in production this opens ${item.ref} in ${SOURCE_META[item.source].app}.` });
        }}>
          <Icon name="external" size={16} />
          <span>Open in {SOURCE_META[item.source].app}</span>
        </a>
      )}
      <Popover anchor={assignRef.current} open={open === 'assign'} onClose={() => setOpen(null)} width={320} label={`Assign ${item.ref}`}>
        <AssignMenu item={item} onDone={() => setOpen(null)} />
      </Popover>
      <Popover anchor={snoozeRef.current} open={open === 'snooze'} onClose={() => setOpen(null)} width={250} label={`Snooze ${item.ref}`}>
        <SnoozeMenu item={item} onDone={() => setOpen(null)} />
      </Popover>
    </div>
  );
}
