import type { ReactNode } from 'react';
import type { Priority, Scored, Source, Status, WorkItem } from '../lib/types';
import { person } from '../data/people';
import { Icon, type IconName } from './Icon';

export function Avatar({ id, size = 24, ring = false }: { id?: string | null; size?: number; ring?: boolean }) {
  const p = person(id);
  if (!p) {
    return (
      <span className="avatar avatar-empty" style={{ width: size, height: size }} title="Unassigned" aria-label="Unassigned">
        <Icon name="user-plus" size={Math.round(size * 0.6)} />
      </span>
    );
  }
  const initials = p.name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      className={`avatar${ring ? ' avatar-ring' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.4, ['--h' as string]: p.hue }}
      title={`${p.name}, ${p.role}`}
      aria-label={p.name}
    >
      {initials}
    </span>
  );
}

export const SOURCE_META: Record<Source, { label: string; icon: IconName; app: string }> = {
  slack: { label: 'Slack', icon: 'hash', app: 'Slack' },
  jira: { label: 'Jira', icon: 'ticket', app: 'Jira' },
  github: { label: 'GitHub', icon: 'pr', app: 'GitHub' },
  email: { label: 'Email', icon: 'mail', app: 'Gmail' },
};

export function SourceGlyph({ source, size = 16 }: { source: Source; size?: number }) {
  return (
    <span className={`src src-${source}`} title={SOURCE_META[source].label} style={{ width: size + 8, height: size + 8 }}>
      <Icon name={SOURCE_META[source].icon} size={size} />
    </span>
  );
}

const STATUS_LABEL: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In progress',
  in_review: 'In review',
  blocked: 'Blocked',
  done: 'Done',
};

export function StatusPill({ status, snoozed }: { status: Status; snoozed?: boolean }) {
  if (snoozed) return <span className="pill pill-snoozed"><Icon name="clock" size={13} />Snoozed</span>;
  return (
    <span className={`pill pill-${status}`}>
      {status === 'blocked' && <Icon name="lock" size={13} />}
      {status === 'done' && <Icon name="check" size={13} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityTag({ p }: { p?: Priority }) {
  if (!p) return null;
  return <span className={`prio prio-${p}`}>{p}</span>;
}

export function ScoreBadge({ s, size = 'md' }: { s: Scored; size?: 'sm' | 'md' | 'lg' }) {
  const label = s.ring === 'now' ? 'Needs attention now' : s.ring === 'today' ? 'Worth a look today' : 'Can wait';
  return (
    <span className={`score score-${s.ring} score-${size}`} title={`Priority score ${s.score} of 100. ${label}.`} aria-label={`Priority score ${s.score}, ${label}`}>
      {s.score}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function Empty({ icon, title, children, action }: { icon: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export function ItemRef({ item }: { item: WorkItem }) {
  return (
    <span className="ref">
      <SourceGlyph source={item.source} size={13} />
      <span className="ref-text">{item.ref}</span>
    </span>
  );
}
