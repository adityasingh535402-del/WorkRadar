import { ME, firstName } from '../data/people';
import { blockedPeople } from '../lib/scoring';
import { rankedOpen, setDemo, toast, useStore, visibleItems } from '../lib/store';
import { Link } from '../lib/router';
import { greeting, longDate, since } from '../lib/time';
import { RadarScope } from '../components/RadarScope';
import { BriefPanel } from '../components/BriefPanel';
import { Strip } from '../components/Strip';
import { Avatar, Empty, SourceGlyph } from '../components/bits';
import { Icon } from '../components/Icon';
import { OutageBanner } from '../components/Layout';
import type { Source } from '../lib/types';

const DAY = 24 * 60 * 60_000;

export function Dashboard() {
  const state = useStore((s) => s);
  if (state.demo === 'empty') return <EmptyWorkspace />;

  const now = state.now;
  const ranked = rankedOpen(state);
  const items = visibleItems(state);
  const attention = ranked.filter((s) => s.ring === 'now');
  const blocked = blockedPeople(items);
  const waiting = ranked.filter((s) => s.item.signals.waitingOnMe).length;
  const shipped = items.filter((i) => i.doneAt && now - new Date(i.doneAt).getTime() < DAY).length;
  const brief = state.brief.status === 'ready' ? state.brief.data : undefined;
  const aiAction = new Map(brief?.attention.map((a) => [a.itemId, a.action]) ?? []);
  const aiBlocked = new Map(brief?.blocked.map((b) => [b.personId, b.suggestion]) ?? []);

  return (
    <div className="page page-today">
      <OutageBanner />
      <header className="today-head">
        <p className="today-date">{longDate(now)}</p>
        <h1 className="today-title">
          {greeting(now)}, {firstName(ME)}.
        </h1>
        <p className="today-status">
          <Link to="/feed?view=attention" className="status-link status-now">
            {attention.length} {attention.length === 1 ? 'item needs' : 'items need'} you
          </Link>
          ,{' '}
          <Link to="/feed?view=waiting" className="status-link">
            {waiting} {waiting === 1 ? 'is' : 'are'} waiting on your reply
          </Link>
          ,{' '}
          <Link to="/team" className="status-link status-halt">
            {blocked.length} {blocked.length === 1 ? 'person is' : 'people are'} blocked
          </Link>
          , and{' '}
          <Link to="/feed?view=done" className="status-link status-clear">
            {shipped} {shipped === 1 ? 'thing' : 'things'} shipped
          </Link>{' '}
          since yesterday.
        </p>
      </header>

      <div className="today-hero">
        <section className="panel panel-scope" aria-labelledby="scope-title">
          <div className="panel-head">
            <h2 id="scope-title">Radar</h2>
            <Link to="/feed" className="panel-link">
              {ranked.length} open
            </Link>
          </div>
          <RadarScope ranked={ranked} />
        </section>
        <BriefPanel />
      </div>

      <div className="today-grid">
        <section className="panel" aria-labelledby="attn-title">
          <div className="panel-head">
            <h2 id="attn-title">Needs your attention</h2>
            <Link to="/feed?view=attention" className="panel-link">
              Open feed
            </Link>
          </div>
          {attention.length === 0 ? (
            <Empty icon="check-circle" title="Nothing needs you right now">
              The inner ring is clear. Items appear here when something is urgent, waiting on you, or blocking someone.
            </Empty>
          ) : (
            <div className="strip-list">
              {attention.slice(0, 6).map((s) => (
                <Strip key={s.item.id} s={s} variant="compact" note={aiAction.get(s.item.id) ?? s.item.nextStep ?? s.why} />
              ))}
              {attention.length > 6 && (
                <Link to="/feed?view=attention" className="more-link">
                  {attention.length - 6} more need attention
                </Link>
              )}
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="blocked-title">
          <div className="panel-head">
            <h2 id="blocked-title">Who’s blocked</h2>
            <Link to="/team" className="panel-link">
              Team
            </Link>
          </div>
          {blocked.length === 0 ? (
            <Empty icon="check-circle" title="Nobody is blocked">
              Everyone on the team can move. Blockers show up here the moment someone is waiting on a person or a task.
            </Empty>
          ) : (
            <ul className="blocked-list">
              {blocked.map((b) => {
                const target = b.blockerItem ?? b.item;
                return (
                  <li key={b.item.id} className={`blocked-card${b.onYou ? ' is-on-you' : ''}`}>
                    <Avatar id={b.personId} size={34} />
                    <div className="blocked-main">
                      <p className="blocked-who">
                        <strong>{firstName(b.personId)}</strong>
                        <span className="blocked-since">blocked {since(b.since, now)}</span>
                        {b.onYou && <span className="tag tag-you">On you</span>}
                      </p>
                      <p className="blocked-on">
                        <Link to={`/item/${b.item.id}`}>{b.item.ref}</Link>: {b.blockedOn}
                      </p>
                      <p className="suggest">
                        <Icon name="sweep" size={13} />
                        {aiBlocked.get(b.personId) ?? (b.onYou && b.blockerItem ? `Review ${b.blockerItem.ref} to unblock ${firstName(b.personId)}.` : b.item.nextStep)}
                      </p>
                    </div>
                    <Link to={`/item/${target.id}`} className={`btn btn-sm${b.onYou ? ' btn-primary' : ''}`}>
                      {b.onYou ? `Review ${target.ref}` : target.ref.length <= 10 ? `Open ${target.ref}` : 'Open'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyWorkspace() {
  const sources: { id: Source; text: string }[] = [
    { id: 'slack', text: 'Channels, DMs and mentions' },
    { id: 'jira', text: 'Tickets, priorities and sprints' },
    { id: 'github', text: 'Pull requests, reviews and checks' },
    { id: 'email', text: 'Escalations and stakeholder asks' },
  ];
  return (
    <div className="page page-empty-ws">
      <div className="empty-ws">
        <div className="empty-ws-scope" aria-hidden="true">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="92" />
            <circle cx="100" cy="100" r="60" />
            <circle cx="100" cy="100" r="30" />
            <line x1="8" y1="100" x2="192" y2="100" />
            <line x1="100" y1="8" x2="100" y2="192" />
          </svg>
        </div>
        <h1>Your radar is empty</h1>
        <p>WorkRadar ranks your team’s work from the tools you already use. Connect at least one source to see what needs you today.</p>
        <ul className="connect-list">
          {sources.map((s) => (
            <li key={s.id}>
              <SourceGlyph source={s.id} size={16} />
              <span className="connect-text">
                <strong>{s.id === 'email' ? 'Gmail' : s.id === 'github' ? 'GitHub' : s.id[0].toUpperCase() + s.id.slice(1)}</strong>
                <span>{s.text}</span>
              </span>
              <button
                className="btn btn-sm"
                onClick={() => {
                  setDemo('live');
                  toast({ text: 'Connected all four sources with Airtribe demo data' });
                }}
              >
                Connect
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">This is the first-run state. Connecting any source loads the Airtribe demo workspace.</p>
      </div>
    </div>
  );
}
