import type { Scored, ThreadMessage, WorkItem } from '../lib/types';
import { ME, firstName, person, personName, project } from '../data/people';
import { allItems, isSnoozed, scoredById, useStore } from '../lib/store';
import { Link, navigate } from '../lib/router';
import { absolute, ago, due, since } from '../lib/time';
import { ActionBar } from '../components/Menus';
import { Avatar, Empty, PriorityTag, ScoreBadge, SOURCE_META, SourceGlyph, StatusPill } from '../components/bits';
import { Icon } from '../components/Icon';

function Message({ m }: { m: ThreadMessage }) {
  const now = useStore((s) => s.now);
  return (
    <li className="msg">
      <Avatar id={m.by} size={30} />
      <div>
        <p className="msg-head">
          <strong>{personName(m.by)}</strong>
          <span className="muted" title={absolute(m.at)}>
            {ago(m.at, now)}
          </span>
        </p>
        <p className="msg-text">{m.text.split(/(@Neha|@Tanvi)/).map((part, i) => (part.startsWith('@') ? <mark key={i} className="mention">{part}</mark> : part))}</p>
        {m.reactions && (
          <p className="msg-reactions">
            {m.reactions.map((r) => (
              <span key={r}>{r}</span>
            ))}
          </p>
        )}
      </div>
    </li>
  );
}

function SourceDetail({ item }: { item: WorkItem }) {
  const d = item.detail;
  switch (d.kind) {
    case 'thread':
      return (
        <section className="panel" aria-label="Conversation">
          <div className="panel-head">
            <h2>Conversation in {d.channel}</h2>
            <span className="muted">{d.messages.length} messages</span>
          </div>
          <ul className="msgs">
            {d.messages.map((m, i) => (
              <Message key={i} m={m} />
            ))}
          </ul>
        </section>
      );
    case 'ticket':
      return (
        <section className="panel" aria-label="Ticket">
          <div className="panel-head">
            <h2>{d.type} details</h2>
            {d.sprint && <span className="muted">{d.sprint}</span>}
          </div>
          <dl className="fields">
            <div>
              <dt>Type</dt>
              <dd>{d.type}</dd>
            </div>
            <div>
              <dt>Priority</dt>
              <dd>{item.priority ?? 'Not set'}</dd>
            </div>
            {d.points !== undefined && (
              <div>
                <dt>Story points</dt>
                <dd>{d.points}</dd>
              </div>
            )}
            {d.progress !== undefined && (
              <div>
                <dt>Progress</dt>
                <dd>
                  <span className="progress" aria-label={`${d.progress}% complete`}>
                    <span style={{ width: `${d.progress}%` }} />
                  </span>
                  {d.progress}%
                </dd>
              </div>
            )}
          </dl>
          <p className="prose">{d.description}</p>
          {d.comments.length > 0 && (
            <>
              <h3 className="sub-h">Comments</h3>
              <ul className="msgs">
                {d.comments.map((m, i) => (
                  <Message key={i} m={m} />
                ))}
              </ul>
            </>
          )}
        </section>
      );
    case 'pr':
      return (
        <section className="panel" aria-label="Pull request">
          <div className="panel-head">
            <h2>
              {d.repo} #{d.number}
            </h2>
            <span className="muted">
              {d.draft ? 'Draft' : d.merged ? 'Merged' : 'Open'}, {d.files} files
            </span>
          </div>
          <p className="pr-branch">
            <code>{d.branch}</code> into <code>{d.base}</code>
            <span className="diff">
              <span className="diff-add">+{d.additions}</span> <span className="diff-del">−{d.deletions}</span>
            </span>
          </p>
          <p className="prose">{d.description}</p>
          <div className="pr-grid">
            <div>
              <h3 className="sub-h">Checks</h3>
              <ul className="checks">
                {d.checks.map((c) => (
                  <li key={c.name} className={`check check-${c.state}`}>
                    <Icon name={c.state === 'passing' ? 'check-circle' : c.state === 'failing' ? 'alert' : 'clock'} size={15} />
                    {c.name}
                    <span className="muted">{c.state}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="sub-h">Reviewers</h3>
              <ul className="checks">
                {d.reviewers.length === 0 && <li className="muted">No reviewers yet</li>}
                {d.reviewers.map((r) => (
                  <li key={r.id} className={`check review-${r.state}`}>
                    <Avatar id={r.id} size={20} />
                    {r.id === ME ? 'You' : firstName(r.id)}
                    <span className="muted">{r.state === 'requested' ? 'review requested' : r.state === 'changes' ? 'changes requested' : r.state}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {d.comments.length > 0 && (
            <>
              <h3 className="sub-h">Comments</h3>
              <ul className="msgs">
                {d.comments.map((m, i) => (
                  <Message key={i} m={m} />
                ))}
              </ul>
            </>
          )}
        </section>
      );
    case 'issue':
      return (
        <section className="panel" aria-label="Details">
          <div className="panel-head">
            <h2>
              {d.repo}
              {d.number ? ` #${d.number}` : ''}
            </h2>
          </div>
          <p className="prose">{d.description}</p>
          {d.comments.length > 0 && (
            <ul className="msgs">
              {d.comments.map((m, i) => (
                <Message key={i} m={m} />
              ))}
            </ul>
          )}
        </section>
      );
    case 'email':
      return (
        <section className="panel" aria-label="Email">
          <div className="panel-head">
            <h2>{d.subject}</h2>
          </div>
          <dl className="email-head">
            <div>
              <dt>From</dt>
              <dd>
                {d.from} <span className="muted">{d.fromEmail}</span>
              </dd>
            </div>
            <div>
              <dt>To</dt>
              <dd>{d.to.join(', ')}</dd>
            </div>
          </dl>
          <div className="email-body">
            {d.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          {d.attachments && (
            <ul className="attachments">
              {d.attachments.map((a) => (
                <li key={a}>
                  <Icon name="link" size={14} />
                  {a}
                </li>
              ))}
            </ul>
          )}
        </section>
      );
  }
}

function WhyPanel({ s }: { s: Scored }) {
  const ringText = s.ring === 'now' ? 'Needs attention now' : s.ring === 'today' ? 'Worth a look today' : 'Can wait';
  return (
    <section className="panel why" aria-labelledby="why-title">
      <div className="why-top">
        <ScoreBadge s={s} size="lg" />
        <div>
          <h2 id="why-title">Why it’s on your radar</h2>
          <p className={`why-ring ring-text-${s.ring}`}>{ringText}</p>
        </div>
      </div>
      <ul className="factors">
        {[...s.factors]
          .sort((a, b) => b.value * b.weight - a.value * a.weight)
          .map((f) => (
            <li key={f.key} className={f.value < 0.05 ? 'is-zero' : undefined}>
              <div className="factor-row">
                <span className="factor-label">{f.label}</span>
                <span className="factor-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round(f.value * 100)}%` }} />
                </span>
              </div>
              <p className="factor-detail">{f.detail}</p>
            </li>
          ))}
      </ul>
      <Link to="/settings?section=weights" className="panel-link">
        Adjust ranking weights
      </Link>
    </section>
  );
}

export function ItemDetail({ id }: { id: string }) {
  const state = useStore((s) => s);
  const s = scoredById(id, state);
  const items = allItems(state);
  const now = state.now;

  if (!s || s.item.source === state.settings.outage) {
    return (
      <div className="page">
        <Empty
          icon="search"
          title={s ? `${SOURCE_META[s.item.source].label} isn’t responding` : 'This item doesn’t exist'}
          action={
            <button className="btn btn-sm" onClick={() => navigate('/feed')}>
              Back to the feed
            </button>
          }
        >
          {s ? 'Try again once the source is back. Its items are hidden until then.' : 'It may have been removed from its source, or the link is wrong.'}
        </Empty>
      </div>
    );
  }

  const it = s.item;
  const d = due(it.dueAt, now);
  const snoozed = isSnoozed(it, now);
  const related = (it.related ?? []).map((rid) => items.find((x) => x.id === rid)).filter(Boolean) as WorkItem[];
  const blocker = it.blockedBy?.kind === 'item' ? items.find((x) => x.id === it.blockedBy!.ref) : undefined;
  const waitingOnThis = items.filter((x) => x.blockedBy?.kind === 'item' && x.blockedBy.ref === it.id && x.status !== 'done');
  const proj = project(it.project);
  const people = [...new Set([it.author, it.assignee, ...(it.detail.kind === 'thread' ? it.detail.messages.map((m) => m.by) : [])].filter(Boolean) as string[])];
  const activity = [...it.activity].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="page page-item">
      <nav className="crumbs" aria-label="Breadcrumb">
        <button className="linkish" onClick={() => (history.length > 1 ? history.back() : navigate('/feed'))}>
          <Icon name="chevron-left" size={15} />
          Back
        </button>
        <span className="muted">/</span>
        <span className="crumb-ref">
          <SourceGlyph source={it.source} size={12} />
          {it.ref}
        </span>
      </nav>

      <header className="item-head">
        <h1>{it.title}</h1>
        <div className="item-meta">
          <StatusPill status={it.status} snoozed={snoozed && it.status !== 'done'} />
          <PriorityTag p={it.priority} />
          {proj && <span className="meta-chip">{proj.name}</span>}
          <span className="meta-chip">
            <Avatar id={it.assignee} size={18} />
            {it.assignee ? personName(it.assignee) : 'Unassigned'}
          </span>
          {it.dueAt && it.status !== 'done' && <span className={`meta-chip due-${d.tone}`}>{it.dueLabel ? `${it.dueLabel}: ` : 'Due '}{d.text}</span>}
          {snoozed && it.snoozedUntil && <span className="meta-chip">Back {absolute(it.snoozedUntil)}</span>}
          <span className="meta-chip muted">Updated {ago(it.updatedAt, now)}</span>
        </div>
        <ActionBar item={it} showOpen />
      </header>

      <div className="item-layout">
        <div className="item-main">
          <section className="panel ai-summary" aria-labelledby="sum-title">
            <h2 id="sum-title">
              <Icon name="sweep" size={15} />
              In short
            </h2>
            <p>{it.summary}</p>
            {it.nextStep && it.status !== 'done' && (
              <div className="next-step">
                <span className="next-label">Suggested next step</span>
                <p>{it.nextStep}</p>
              </div>
            )}
          </section>

          {(it.blockedBy || waitingOnThis.length > 0) && (
            <section className="panel dependency" aria-label="Dependencies">
              {it.blockedBy && (
                <div className="dep dep-blocked">
                  <Icon name="lock" size={16} />
                  <p>
                    <strong>
                      Blocked for {since(it.blockedBy.since, now)}.
                    </strong>{' '}
                    {it.blockedBy.reason}
                    {blocker && (
                      <>
                        {' '}
                        <Link to={`/item/${blocker.id}`}>Open {blocker.ref}</Link>
                      </>
                    )}
                  </p>
                </div>
              )}
              {waitingOnThis.length > 0 && (
                <div className="dep dep-waiting">
                  <Icon name="team" size={16} />
                  <p>
                    <strong>
                      {waitingOnThis.map((w) => firstName(w.assignee)).join(' and ')} {waitingOnThis.length === 1 ? 'is' : 'are'} waiting on this.
                    </strong>{' '}
                    {waitingOnThis.map((w, i) => (
                      <span key={w.id}>
                        {i > 0 && ', '}
                        <Link to={`/item/${w.id}`}>{w.ref}</Link>
                      </span>
                    ))}
                  </p>
                </div>
              )}
            </section>
          )}

          <SourceDetail item={it} />

          <section className="panel" aria-labelledby="act-title">
            <div className="panel-head">
              <h2 id="act-title">Activity</h2>
            </div>
            {activity.length === 0 ? (
              <p className="muted">No recorded activity yet.</p>
            ) : (
              <ol className="timeline">
                {activity.map((a, i) => (
                  <li key={i}>
                    <span className="timeline-dot" />
                    <p>
                      <strong>{a.by === ME ? 'You' : firstName(a.by)}</strong> {a.text}
                    </p>
                    <span className="muted" title={absolute(a.at)}>
                      {ago(a.at, now)}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="item-side">
          <WhyPanel s={s} />

          {related.length > 0 && (
            <section className="panel" aria-labelledby="rel-title">
              <h2 id="rel-title" className="side-h">
                Related
              </h2>
              <ul className="related">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link to={`/item/${r.id}`}>
                      <SourceGlyph source={r.source} size={12} />
                      <span>
                        <span className="related-ref">{r.ref}</span>
                        <span className="related-title">{r.title}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel" aria-labelledby="ppl-title">
            <h2 id="ppl-title" className="side-h">
              People
            </h2>
            <ul className="people">
              {people.map((p) => (
                <li key={p}>
                  <Avatar id={p} size={26} />
                  <span>
                    <span className="people-name">{p === ME ? 'You' : personName(p)}</span>
                    <span className="people-role">
                      {person(p)?.role}
                      {p === it.assignee ? ', owner' : p === it.author ? ', raised it' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
