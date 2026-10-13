import type { Scored } from '../lib/types';
import { firstName } from '../data/people';
import { Link } from '../lib/router';
import { useStore, isSnoozed } from '../lib/store';
import { ago, due } from '../lib/time';
import { Avatar, ScoreBadge, SourceGlyph, StatusPill } from './bits';
import { ActionBar } from './Menus';

/**
 * One work item as a "flight strip": reference, what it is and why it ranks,
 * owner, deadline and score, with actions on the right.
 */
export function Strip({ s, focused = false, note, variant = 'full' }: { s: Scored; focused?: boolean; note?: string; variant?: 'full' | 'compact' }) {
  const now = useStore((st) => st.now);
  const it = s.item;
  const d = due(it.dueAt, now);
  const snoozed = isSnoozed(it, now);
  let when = d.text;
  let tone: string = d.tone;
  if (it.status === 'done') {
    when = `Done ${ago(it.doneAt, now)}`;
    tone = 'done';
  } else if (snoozed) {
    when = `Back ${due(it.snoozedUntil, now).text.replace(/^in /, 'in ')}`;
    tone = 'snoozed';
  }

  return (
    <article className={`strip strip-${it.source} ring-${s.ring}${focused ? ' is-focused' : ''}${it.status === 'done' ? ' is-done' : ''} strip-${variant}`} data-id={it.id} aria-current={focused || undefined}>
      <div className="strip-id">
        <SourceGlyph source={it.source} size={14} />
        <span className="strip-ref">{it.ref}</span>
      </div>
      <div className="strip-main">
        <Link to={`/item/${it.id}`} className="strip-title">
          {it.title}
        </Link>
        <p className="strip-why">
          {(it.status === 'blocked' || it.status === 'done' || snoozed) && <StatusPill status={it.status} snoozed={snoozed && it.status !== 'done'} />}
          <span>{note ?? s.why}</span>
        </p>
      </div>
      {variant === 'full' && (
        <div className="strip-owner">
          <Avatar id={it.assignee} size={22} />
          <span>{it.assignee ? firstName(it.assignee) : 'Unassigned'}</span>
        </div>
      )}
      <div className={`strip-due due-${tone}`}>{when}</div>
      <div className="strip-score">{it.status === 'done' ? <span className="score score-done score-md">–</span> : <ScoreBadge s={s} />}</div>
      <ActionBar item={it} compact />
    </article>
  );
}
