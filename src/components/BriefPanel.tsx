import { useEffect } from 'react';
import type { Brief, WorkItem } from '../lib/types';
import { allItems, updateSettings, useStore } from '../lib/store';
import { engineName, generateBrief, plainReason } from '../lib/ai';
import { Link } from '../lib/router';
import { clock, partOfDay } from '../lib/time';
import { Icon } from './Icon';
import { SourceGlyph } from './bits';

function changesSince(brief: Brief, items: WorkItem[]) {
  const t = new Date(brief.generatedAt).getTime();
  return items.reduce((n, it) => n + it.activity.filter((a) => a.by === 'neha' && new Date(a.at).getTime() > t).length, 0);
}

export function BriefPanel() {
  const state = useStore((s) => s);
  const brief = state.brief;
  const items = allItems(state);
  const byId = new Map(items.map((i) => [i.id, i]));

  useEffect(() => {
    if (state.brief.status === 'idle') generateBrief();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.brief.status, state.demo]);

  const data: Brief | undefined = brief.status === 'ready' ? brief.data : brief.status === 'idle' ? undefined : brief.previous;
  const loading = brief.status === 'loading' || brief.status === 'idle';
  const changes = data && brief.status === 'ready' ? changesSince(data, items) : 0;

  return (
    <section className="brief" aria-labelledby="brief-title" aria-busy={loading}>
      <header className="brief-head">
        <h2 id="brief-title">{partOfDay(state.now)} brief</h2>
        <div className="brief-meta">
          {data && (
            <span className={`engine engine-${data.engine}`} title={data.model ? `Model: ${data.model}` : undefined}>
              <Icon name="sweep" size={14} />
              {engineName(data)}
            </span>
          )}
          {data && <span className="brief-time">{clock(new Date(data.generatedAt))}</span>}
          <button className="btn btn-quiet btn-sm" onClick={() => generateBrief({ force: true })} disabled={loading} aria-label="Regenerate brief">
            <Icon name="refresh" size={15} className={loading ? 'spin' : undefined} />
            <span>{loading ? (state.settings.aiMode === 'auto' ? 'Asking Gemini…' : 'Reading…') : 'Regenerate'}</span>
          </button>
        </div>
      </header>

      {brief.status === 'ready' && brief.degraded && (
        <div className="brief-error" role="alert">
          <Icon name="alert" size={18} />
          <div>
            <p className="brief-error-title">Gemini didn’t respond</p>
            <p title={brief.degraded}>{plainReason(brief.degraded)} Below is an on-device summary of the same data.</p>
            <div className="brief-error-actions">
              <button className="btn btn-sm" onClick={() => generateBrief({ force: true })}>
                Try again
              </button>
              <button
                className="btn btn-quiet btn-sm"
                onClick={() => {
                  updateSettings({ aiMode: 'local' });
                  generateBrief({ force: true });
                }}
              >
                Stay on device
              </button>
            </div>
          </div>
        </div>
      )}

      {!data && loading && (
        <div className="brief-loading">
          <p>Reading {items.filter((i) => i.status !== 'done').length} open items across Slack, Jira, GitHub and email…</p>
          <div className="skeleton" style={{ width: '92%' }} />
          <div className="skeleton" style={{ width: '78%' }} />
          <div className="skeleton" style={{ width: '64%' }} />
        </div>
      )}

      {data && (
        <div className={`brief-body${loading ? ' is-stale' : ''}`}>
          <p className="brief-headline">{data.headline}</p>
          {brief.status === 'ready' && brief.note && <p className="brief-note">{brief.note}</p>}
          {changes > 0 && (
            <p className="brief-note">
              You’ve made {changes} {changes === 1 ? 'change' : 'changes'} since this brief.{' '}
              <button className="linkish" onClick={() => generateBrief({ force: true })}>
                Regenerate
              </button>
            </p>
          )}
          <div className="brief-cols">
            <div>
              <h3 className="brief-sub">Top work for today</h3>
              <ol className="topwork">
                {data.topWork.map((t, i) => {
                  const it = byId.get(t.itemId);
                  if (!it) return null;
                  return (
                    <li key={t.itemId} className={it.status === 'done' ? 'is-done' : undefined}>
                      <span className="topwork-n">{i + 1}</span>
                      <div>
                        <Link to={`/item/${it.id}`} className="topwork-title">
                          {it.title}
                        </Link>
                        <p>{t.why}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
            <div>
              <h3 className="brief-sub">What happened today</h3>
              <ul className="happened">
                {data.happened.length === 0 && <li className="muted">Quiet so far.</li>}
                {data.happened.map((h, i) => {
                  const it = h.itemId ? byId.get(h.itemId) : undefined;
                  return (
                    <li key={i}>
                      <span className="happened-time">{h.at && !Number.isNaN(new Date(h.at).getTime()) ? clock(new Date(h.at)) : ''}</span>
                      {it && <SourceGlyph source={it.source} size={12} />}
                      {it ? (
                        <Link to={`/item/${it.id}`} className="happened-text">
                          {h.text}
                        </Link>
                      ) : (
                        <span className="happened-text">{h.text}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
