import { useEffect, useMemo, useState } from 'react';
import type { Scored, Source } from '../lib/types';
import { ME, TEAM, firstName } from '../data/people';
import { scoreAll } from '../lib/scoring';
import { isSnoozed, markDone, rankedOpen, useStore, visibleItems } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { minutesUntil } from '../lib/time';
import { Strip } from '../components/Strip';
import { Empty, Kbd, SOURCE_META, SourceGlyph } from '../components/bits';
import { OutageBanner, PageHeader } from '../components/Layout';
import type { IconName } from '../components/Icon';

type View = 'attention' | 'waiting' | 'blocked' | 'today' | 'open' | 'snoozed' | 'done';

const VIEWS: { id: View; label: string; empty: { icon: IconName; title: string; text: string } }[] = [
  { id: 'open', label: 'All open', empty: { icon: 'inbox', title: 'No open work', text: 'Every item is done or snoozed.' } },
  { id: 'attention', label: 'Needs attention', empty: { icon: 'check-circle', title: 'Nothing needs you right now', text: 'The inner ring is clear. Items land here when they’re urgent, waiting on you, or blocking someone.' } },
  { id: 'waiting', label: 'Waiting on you', empty: { icon: 'check-circle', title: 'No one is waiting on you', text: 'Reviews, decisions and replies people asked you for will show up here.' } },
  { id: 'blocked', label: 'Blocked', empty: { icon: 'check-circle', title: 'Nobody is blocked', text: 'When a teammate is stuck on a person or task, it shows up here with how long they’ve waited.' } },
  { id: 'today', label: 'Due today', empty: { icon: 'clock', title: 'Nothing due in the next 24 hours', text: 'Deadlines from Jira, PR review windows and stakeholder asks appear here as they get close.' } },
  { id: 'snoozed', label: 'Snoozed', empty: { icon: 'clock', title: 'Nothing snoozed', text: 'Snooze items you can’t act on yet. They return to the feed at the time you pick.' } },
  { id: 'done', label: 'Done', empty: { icon: 'inbox', title: 'Nothing done yet', text: 'Items you or the team finish appear here for 24 hours.' } },
];

type Sort = 'score' | 'due' | 'updated';

const RING_HEADERS = { now: 'Needs attention now', today: 'Worth a look today', later: 'Can wait' } as const;

export function Feed({ route }: { route: Route }) {
  const state = useStore((s) => s);
  const view = (VIEWS.find((v) => v.id === route.query.get('view'))?.id ?? 'open') as View;
  const [sources, setSources] = useState<Source[]>([]);
  const [owner, setOwner] = useState<string>('anyone');
  const [sort, setSort] = useState<Sort>('score');
  const [focus, setFocus] = useState(0);
  const now = state.now;

  const open = rankedOpen(state);
  const everything = useMemo(() => scoreAll(visibleItems(state), state.settings.weights, now), [state, now]);

  const byView: Record<View, Scored[]> = {
    attention: open.filter((s) => s.ring === 'now'),
    waiting: open.filter((s) => s.item.signals.waitingOnMe || (s.item.blockedBy?.kind === 'person' && s.item.blockedBy.ref === ME)),
    blocked: open.filter((s) => s.item.status === 'blocked'),
    today: open.filter((s) => minutesUntil(s.item.dueAt, now) < 24 * 60),
    open,
    snoozed: everything.filter((s) => s.item.status !== 'done' && isSnoozed(s.item, now)),
    done: everything.filter((s) => s.item.status === 'done' && s.item.doneAt && now - new Date(s.item.doneAt).getTime() < 24 * 60 * 60_000),
  };

  let list = byView[view];
  if (sources.length) list = list.filter((s) => sources.includes(s.item.source));
  if (owner === 'unassigned') list = list.filter((s) => !s.item.assignee);
  else if (owner !== 'anyone') list = list.filter((s) => s.item.assignee === owner);
  if (sort === 'due') list = [...list].sort((a, b) => minutesUntil(a.item.dueAt, now) - minutesUntil(b.item.dueAt, now));
  if (sort === 'updated') list = [...list].sort((a, b) => new Date(b.item.updatedAt).getTime() - new Date(a.item.updatedAt).getTime());
  if (view === 'done') list = [...list].sort((a, b) => new Date(b.item.doneAt!).getTime() - new Date(a.item.doneAt!).getTime());

  const filtered = sources.length > 0 || owner !== 'anyone';
  const ids = list.map((s) => s.item.id).join(',');

  useEffect(() => setFocus(0), [view, ids.length]);

  // Keyboard triage: j/k to move, Enter to open, e done, s snooze, a assign.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [role="dialog"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const current = list[focus];
      const click = (action: string) => document.querySelector<HTMLButtonElement>(`.strip[data-id="${current?.item.id}"] [data-action="${action}"]`)?.click();
      if (e.key === 'j' || e.key === 'ArrowDown') {
        setFocus((f) => Math.min(list.length - 1, f + 1));
        e.preventDefault();
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        setFocus((f) => Math.max(0, f - 1));
        e.preventDefault();
      } else if (e.key === 'Enter' && current) navigate(`/item/${current.item.id}`);
      else if (e.key === 'e' && current && current.item.status !== 'done') markDone(current.item.id);
      else if (e.key === 's' && current) click('snooze');
      else if (e.key === 'a' && current) click('assign');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list, focus]);

  useEffect(() => {
    const id = list[focus]?.item.id;
    if (id) document.querySelector(`.strip[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focus, list]);

  const meta = VIEWS.find((v) => v.id === view)!;
  const allSources: Source[] = ['slack', 'jira', 'github', 'email'];

  return (
    <div className="page page-feed">
      <OutageBanner />
      <PageHeader
        title="Priority feed"
        sub={
          <>
            Every item from Slack, Jira, GitHub and email, ranked by how much it needs you. <span className="hide-sm">Use <Kbd>j</Kbd> <Kbd>k</Kbd> to move, <Kbd>e</Kbd> done, <Kbd>s</Kbd> snooze, <Kbd>a</Kbd> assign.</span>
          </>
        }
      />
      <div className="feed-layout">
        <nav className="views" aria-label="Feed views">
          {VIEWS.map((v) => (
            <button key={v.id} className={`view-item${v.id === view ? ' is-active' : ''}`} aria-current={v.id === view ? 'true' : undefined} onClick={() => navigate(`/feed?view=${v.id}`, { replace: true })}>
              <span>{v.label}</span>
              <span className="view-count">{byView[v.id].length}</span>
            </button>
          ))}
        </nav>

        <section className="feed-main" aria-label={meta.label}>
          <div className="filters">
            <div className="chips" role="group" aria-label="Filter by source">
              {allSources.map((src) => {
                const on = sources.includes(src);
                return (
                  <button key={src} className={`chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => setSources(on ? sources.filter((x) => x !== src) : [...sources, src])} disabled={state.settings.outage === src}>
                    <SourceGlyph source={src} size={11} />
                    {SOURCE_META[src].label}
                  </button>
                );
              })}
            </div>
            <div className="selects">
              <label className="select">
                <span>Owner</span>
                <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                  <option value="anyone">Anyone</option>
                  <option value="unassigned">Unassigned</option>
                  {TEAM.map((p) => (
                    <option key={p.id} value={p.id}>
                      {firstName(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select">
                <span>Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                  <option value="score">Priority</option>
                  <option value="due">Due date</option>
                  <option value="updated">Recently updated</option>
                </select>
              </label>
            </div>
          </div>

          <div className="strip-head" aria-hidden="true">
            <span>Item</span>
            <span />
            <span>Owner</span>
            <span>{view === 'done' ? 'Finished' : view === 'snoozed' ? 'Returns' : 'Due'}</span>
            <span>Score</span>
            <span />
          </div>

          {list.length === 0 ? (
            filtered ? (
              <Empty
                icon="search"
                title="No items match these filters"
                action={
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setSources([]);
                      setOwner('anyone');
                    }}
                  >
                    Clear filters
                  </button>
                }
              >
                Try another source or owner.
              </Empty>
            ) : (
              <Empty
                icon={meta.empty.icon}
                title={meta.empty.title}
                action={
                  view !== 'open' ? (
                    <button className="btn btn-sm" onClick={() => navigate('/feed?view=open')}>
                      See all open work
                    </button>
                  ) : undefined
                }
              >
                {meta.empty.text}
              </Empty>
            )
          ) : (
            <div className="strip-list" role="list">
              {list.map((s, i) => {
                const grouped = sort === 'score' && (view === 'open' || view === 'today' || view === 'waiting');
                const header = grouped && (i === 0 || list[i - 1].ring !== s.ring) ? RING_HEADERS[s.ring] : null;
                return (
                  <div role="listitem" key={s.item.id} onMouseDown={() => setFocus(i)}>
                    {header && (
                      <p className={`ring-header ring-header-${s.ring}`}>
                        {header} <span className="view-count">{list.filter((x) => x.ring === s.ring).length}</span>
                      </p>
                    )}
                    <Strip s={s} focused={i === focus} />
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
