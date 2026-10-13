import { TEAM, firstName } from '../data/people';
import { blockedPeople } from '../lib/scoring';
import { rankedOpen, useStore, visibleItems } from '../lib/store';
import { Link } from '../lib/router';
import { since } from '../lib/time';
import { Avatar, ScoreBadge } from '../components/bits';
import { Icon } from '../components/Icon';
import { OutageBanner, PageHeader } from '../components/Layout';

const DAY = 24 * 60 * 60_000;

export function Team() {
  const state = useStore((s) => s);
  const items = visibleItems(state);
  const ranked = rankedOpen(state);
  const blocked = blockedPeople(items);
  const now = state.now;

  const rows = TEAM.map((p) => {
    const mine = ranked.filter((s) => s.item.assignee === p.id);
    const b = blocked.filter((x) => x.personId === p.id);
    const doneToday = items.filter((i) => i.assignee === p.id && i.doneAt && now - new Date(i.doneAt).getTime() < DAY).length;
    const hot = mine.filter((s) => s.ring === 'now').length;
    const state: 'blocked' | 'stretched' | 'ok' = b.length ? 'blocked' : hot >= 2 || mine.length >= 6 ? 'stretched' : 'ok';
    return { p, mine, b, doneToday, hot, state };
  }).sort((a, b) => {
    const rank = { blocked: 0, stretched: 1, ok: 2 } as const;
    if (a.state !== b.state) return rank[a.state] - rank[b.state];
    if (a.state === 'blocked') {
      const onYou = Number(b.b.some((x) => x.onYou)) - Number(a.b.some((x) => x.onYou));
      return onYou || new Date(a.b[0].since).getTime() - new Date(b.b[0].since).getTime();
    }
    return b.mine.length - a.mine.length;
  });

  return (
    <div className="page page-team">
      <OutageBanner />
      <PageHeader title="Team" sub={`${TEAM.length} people on Learning Platform. ${blocked.length} blocked, sorted by who needs you first.`} />
      <div className="team-grid">
        {rows.map(({ p, mine, b, doneToday, hot, state: st }) => (
          <article key={p.id} className={`person-card person-${st}`}>
            <header>
              <Avatar id={p.id} size={40} />
              <div>
                <h2>{p.name}</h2>
                <p className="muted">{p.role}</p>
              </div>
              <span className={`person-state state-${st}`}>{st === 'blocked' ? 'Blocked' : st === 'stretched' ? 'Stretched' : 'On track'}</span>
            </header>

            {b.map((x) => (
              <p key={x.item.id} className="person-blocker">
                <Icon name="lock" size={14} />
                <span>
                  {since(x.since, now)} on <Link to={`/item/${x.item.id}`}>{x.item.ref}</Link>: {x.blockedOn}
                  {x.onYou && <span className="tag tag-you">On you</span>}
                </span>
              </p>
            ))}

            <dl className="person-stats">
              <div>
                <dt>Open</dt>
                <dd>{mine.length}</dd>
              </div>
              <div>
                <dt>Urgent</dt>
                <dd>{hot}</dd>
              </div>
              <div>
                <dt>Done today</dt>
                <dd>{doneToday}</dd>
              </div>
            </dl>

            {mine.length > 0 ? (
              <ul className="person-items">
                {mine.slice(0, 3).map((s) => (
                  <li key={s.item.id}>
                    <ScoreBadge s={s} size="sm" />
                    <Link to={`/item/${s.item.id}`}>{s.item.title}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Nothing open right now.</p>
            )}
            {mine.length > 3 && (
              <Link to={`/search?q=${encodeURIComponent(firstName(p.id).toLowerCase() + ' open')}`} className="panel-link">
                All {mine.length} of {firstName(p.id)}’s items
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
