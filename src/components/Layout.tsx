import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ME, WORKSPACE, person } from '../data/people';
import { blockedPeople } from '../lib/scoring';
import { dismissToast, rankedOpen, useStore, visibleItems, updateSettings, allItems } from '../lib/store';
import { Link, navigate, type Route } from '../lib/router';
import { ago } from '../lib/time';
import type { Source } from '../lib/types';
import { Avatar, Kbd, SOURCE_META, SourceGlyph } from './bits';
import { Icon, type IconName } from './Icon';
import { generateBrief } from '../lib/ai';

const NAV: { to: string; label: string; icon: IconName; match: (r: Route) => boolean }[] = [
  { to: '/', label: 'Today', icon: 'today', match: (r) => r.path === '/' },
  { to: '/feed', label: 'Priority feed', icon: 'feed', match: (r) => r.path.startsWith('/feed') || r.path.startsWith('/item') },
  { to: '/search', label: 'Search', icon: 'search', match: (r) => r.path.startsWith('/search') },
  { to: '/team', label: 'Team', icon: 'team', match: (r) => r.path.startsWith('/team') },
  { to: '/settings', label: 'Settings', icon: 'settings', match: (r) => r.path.startsWith('/settings') },
];

export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <circle cx="16" cy="16" r="14" className="logo-ring" />
      <circle cx="16" cy="16" r="8.5" className="logo-ring" />
      <path d="M16 16 L16 2 A14 14 0 0 1 29.3 11.7 Z" className="logo-sweep" />
      <circle cx="21.5" cy="9.5" r="2.4" className="logo-blip" />
      <circle cx="16" cy="16" r="1.8" className="logo-core" />
    </svg>
  );
}

function SourceStatus() {
  const state = useStore((s) => s);
  const sources: Source[] = ['slack', 'jira', 'github', 'email'];
  return (
    <div className="sources" aria-label="Connected sources">
      <p className="side-label">Sources</p>
      {sources.map((src) => {
        const down = state.settings.outage === src;
        return (
          <div key={src} className={`source-row${down ? ' is-down' : ''}`}>
            <SourceGlyph source={src} size={12} />
            <span className="source-name">{SOURCE_META[src].label}</span>
            <span className="source-sync">{down ? 'Not responding' : ago(new Date(state.lastSync[src]).toISOString(), state.now)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function Sidebar({ route }: { route: Route }) {
  const state = useStore((s) => s);
  const ranked = rankedOpen(state);
  const attention = ranked.filter((s) => s.ring === 'now').length;
  const blocked = blockedPeople(visibleItems(state)).length;
  const me = person(ME)!;
  const counts: Record<string, number | undefined> = { '/feed': attention || undefined, '/team': blocked || undefined };

  return (
    <aside className="sidebar">
      <Link to="/" className="brand" aria-label="WorkRadar home">
        <Logo />
        <span className="brand-name">WorkRadar</span>
      </Link>
      <div className="workspace">
        <span className="workspace-mark" aria-hidden="true">A</span>
        <span>
          <span className="workspace-co">{WORKSPACE.company}</span>
          <span className="workspace-team">{WORKSPACE.team}</span>
        </span>
      </div>
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`nav-item${n.match(route) ? ' is-active' : ''}`} aria-current={n.match(route) ? 'page' : undefined}>
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
            {counts[n.to] !== undefined && <span className={`nav-count${n.to === '/team' ? ' nav-count-halt' : ''}`}>{counts[n.to]}</span>}
          </Link>
        ))}
      </nav>
      <button className="cmdk-trigger" onClick={() => window.dispatchEvent(new CustomEvent('workradar:palette'))}>
        <Icon name="search" size={15} />
        <span>Jump to…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <div className="side-spacer" />
      <SourceStatus />
      <div className="me">
        <Avatar id={ME} size={30} />
        <span>
          <span className="me-name">{me.name}</span>
          <span className="me-role">{me.role}</span>
        </span>
      </div>
    </aside>
  );
}

export function MobileBar({ route }: { route: Route }) {
  return (
    <>
      <header className="mobile-top">
        <Link to="/" className="brand" aria-label="WorkRadar home">
          <Logo size={22} />
          <span className="brand-name">WorkRadar</span>
        </Link>
        <span className="mobile-ws">{WORKSPACE.company}</span>
      </header>
      <nav className="mobile-nav" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} className={`mobile-nav-item${n.match(route) ? ' is-active' : ''}`} aria-current={n.match(route) ? 'page' : undefined}>
            <Icon name={n.icon} size={20} />
            <span>{n.label === 'Priority feed' ? 'Feed' : n.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === 'error' ? ' toast-error' : ''}`}>
          <div className="toast-body">
            <span>{t.text}</span>
            {t.detail && <span className="toast-detail">{t.detail}</span>}
          </div>
          {t.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                t.undo?.();
                dismissToast(t.id);
              }}
            >
              Undo
            </button>
          )}
          <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: IconName | 'source';
  source?: Source;
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const state = useStore((s) => s);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('workradar:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('workradar:palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setI(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const cmds = useMemo<Cmd[]>(() => {
    const base: Cmd[] = [
      { id: 'go-today', label: 'Go to Today', icon: 'today', run: () => navigate('/') },
      { id: 'go-feed', label: 'Go to Priority feed', icon: 'feed', run: () => navigate('/feed') },
      { id: 'go-attention', label: 'Show items that need attention', icon: 'flag', run: () => navigate('/feed?view=attention') },
      { id: 'go-blocked', label: 'Show who is blocked', icon: 'lock', run: () => navigate('/feed?view=blocked') },
      { id: 'go-search', label: 'Search everything', icon: 'search', run: () => navigate(`/search${q ? `?q=${encodeURIComponent(q)}` : ''}`) },
      { id: 'go-team', label: 'Go to Team', icon: 'team', run: () => navigate('/team') },
      { id: 'regen', label: 'Regenerate the AI brief', icon: 'refresh', run: () => { navigate('/'); generateBrief({ force: true }); } },
      {
        id: 'theme',
        label: 'Switch light or dark theme',
        icon: 'moon',
        run: () => {
          const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
          updateSettings({ theme: dark ? 'light' : 'dark' });
        },
      },
      { id: 'settings', label: 'Open Settings', icon: 'settings', run: () => navigate('/settings') },
    ];
    const items: Cmd[] = allItems(state)
      .filter((it) => it.source !== state.settings.outage)
      .map((it) => ({ id: it.id, label: it.title, hint: it.ref, icon: 'source' as const, source: it.source, run: () => navigate(`/item/${it.id}`) }));
    const needle = q.trim().toLowerCase();
    if (!needle) return [...base.slice(0, 7), ...rankedOpen(state).slice(0, 5).map((s) => items.find((c) => c.id === s.item.id)!)];
    const match = (c: Cmd) => c.label.toLowerCase().includes(needle) || (c.hint ?? '').toLowerCase().includes(needle);
    return [...base.filter(match), ...items.filter(match).slice(0, 8)];
  }, [q, state]);

  if (!open) return null;
  const run = (c?: Cmd) => {
    if (!c) return;
    setOpen(false);
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Jump to an item, page or action"
            aria-label="Search commands and items"
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setI((x) => Math.min(cmds.length - 1, x + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setI((x) => Math.max(0, x - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (cmds[i]) run(cmds[i]);
                else {
                  setOpen(false);
                  navigate(`/search?q=${encodeURIComponent(q)}`);
                }
              } else if (e.key === 'Escape') setOpen(false);
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul className="palette-list" role="listbox">
          {cmds.map((c, idx) => (
            <li key={c.id} role="option" aria-selected={idx === i}>
              <button className={`palette-item${idx === i ? ' is-active' : ''}`} onMouseEnter={() => setI(idx)} onClick={() => run(c)}>
                {c.icon === 'source' && c.source ? <SourceGlyph source={c.source} size={12} /> : <Icon name={c.icon as IconName} size={16} />}
                <span className="palette-label">{c.label}</span>
                {c.hint && <span className="palette-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
          {cmds.length === 0 && (
            <li className="palette-empty">
              Nothing matches “{q}”. Press Enter to search everything.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {children && <div className="page-head-actions">{children}</div>}
    </header>
  );
}

export function OutageBanner() {
  const outage = useStore((s) => s.settings.outage);
  const now = useStore((s) => s.now);
  if (!outage) return null;
  return (
    <div className="banner banner-error" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <strong>{SOURCE_META[outage].label} isn’t responding.</strong> {SOURCE_META[outage].label} items are hidden and rankings use the other three sources. Last good sync {ago(new Date(now - 34 * 60_000).toISOString(), now)}.
      </div>
      <button className="btn btn-sm" onClick={() => updateSettings({ outage: null })}>
        Retry now
      </button>
    </div>
  );
}
