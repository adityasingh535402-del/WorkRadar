import { useEffect, useMemo, useRef, useState } from 'react';
import type { Source } from '../lib/types';
import { scoreAll } from '../lib/scoring';
import { addRecentSearch, useStore, visibleItems } from '../lib/store';
import { navigate, type Route } from '../lib/router';
import { parseQuery, search, SUGGESTED_QUERIES, type Filter } from '../lib/search';
import { Strip } from '../components/Strip';
import { Empty, Kbd, SOURCE_META } from '../components/bits';
import { Icon } from '../components/Icon';
import { OutageBanner, PageHeader } from '../components/Layout';

function removeFilter(q: string, f: Filter) {
  let out = ` ${q} `;
  const phrase = f.tokens.join(' ');
  out = out.replace(new RegExp(`\\s${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s)`, 'i'), ' ');
  return out.replace(/\s+/g, ' ').trim();
}

export function Search({ route }: { route: Route }) {
  const state = useStore((s) => s);
  const initial = route.query.get('q') ?? '';
  const [q, setQ] = useState(initial);
  const [tab, setTab] = useState<Source | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQ(route.query.get('q') ?? ''), [route.query]);
  useEffect(() => inputRef.current?.focus(), []);

  // Keep the URL in sync so searches can be shared and the back button works.
  useEffect(() => {
    const t = setTimeout(() => {
      const current = route.query.get('q') ?? '';
      if (current !== q) navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search', { replace: true });
    }, 250);
    return () => clearTimeout(t);
  }, [q, route.query]);

  useEffect(() => {
    if (!q.trim()) return;
    const t = setTimeout(() => addRecentSearch(q), 1200);
    return () => clearTimeout(t);
  }, [q]);

  const scored = useMemo(() => scoreAll(visibleItems(state), state.settings.weights, state.now), [state]);
  const parsed = useMemo(() => parseQuery(q), [q]);
  const hits = useMemo(() => search(scored, parsed, state.now), [scored, parsed, state.now]);
  const shown = tab === 'all' ? hits : hits.filter((h) => h.scored.item.source === tab);
  const sources: Source[] = ['slack', 'jira', 'github', 'email'];

  return (
    <div className="page page-search">
      <OutageBanner />
      <PageHeader title="Search" sub="Search across every source in plain language. Try a person, a source, a status or a project." />
      <form
        className="search-box"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          addRecentSearch(q);
        }}
      >
        <Icon name="search" size={20} />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. blocked prs waiting on me" aria-label="Search work items" />
        {q && (
          <button type="button" className="icon-btn" aria-label="Clear search" onClick={() => setQ('')}>
            <Icon name="x" size={16} />
          </button>
        )}
        <Kbd>/</Kbd>
      </form>

      {parsed.filters.length > 0 && (
        <div className="understood" aria-label="Filters understood from your search">
          <span className="muted">Showing</span>
          {parsed.filters.map((f, i) => (
            <button key={i} className="chip is-on" onClick={() => setQ(removeFilter(q, f))} title="Remove this filter">
              {f.label}
              <Icon name="x" size={12} />
            </button>
          ))}
          {parsed.terms.length > 0 && (
            <span className="muted">
              matching “{parsed.terms.join(' ')}”
            </span>
          )}
        </div>
      )}

      {!q.trim() ? (
        <div className="search-start">
          <section>
            <h2 className="sub-h">Try</h2>
            <div className="suggestions">
              {SUGGESTED_QUERIES.map((s) => (
                <button key={s} className="chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>
          {state.recentSearches.length > 0 && (
            <section>
              <h2 className="sub-h">Recent</h2>
              <ul className="recent">
                {state.recentSearches.map((r) => (
                  <li key={r}>
                    <button className="linkish" onClick={() => setQ(r)}>
                      <Icon name="clock" size={14} />
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Results by source">
            <button role="tab" aria-selected={tab === 'all'} className={`tab${tab === 'all' ? ' is-active' : ''}`} onClick={() => setTab('all')}>
              All <span className="view-count">{hits.length}</span>
            </button>
            {sources.map((s) => {
              const n = hits.filter((h) => h.scored.item.source === s).length;
              return (
                <button key={s} role="tab" aria-selected={tab === s} className={`tab${tab === s ? ' is-active' : ''}`} onClick={() => setTab(s)} disabled={n === 0}>
                  {SOURCE_META[s].label} <span className="view-count">{n}</span>
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <Empty
              icon="search"
              title={`No results for “${q}”`}
              action={
                <button className="btn btn-sm" onClick={() => setQ('')}>
                  Clear search
                </button>
              }
            >
              Check the spelling, remove a filter, or search by a reference like LP-512 or PR #1284.
            </Empty>
          ) : (
            <div className="strip-list">
              {shown.map((h) => (
                <Strip key={h.scored.item.id} s={h.scored} note={h.matchedIn.length ? `Matched in ${h.matchedIn.join(', ')}. ${h.scored.why}` : h.scored.why} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
