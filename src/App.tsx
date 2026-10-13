import { useEffect } from 'react';
import { navigate, useRoute } from './lib/router';
import { tick, useStore } from './lib/store';
import { CommandPalette, MobileBar, Sidebar, Toasts } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Feed } from './pages/Feed';
import { ItemDetail } from './pages/ItemDetail';
import { Search } from './pages/Search';
import { Team } from './pages/Team';
import { Settings } from './pages/Settings';
import { Empty } from './components/bits';
import './lib/ai';

const TITLES: Record<string, string> = {
  '': 'Today',
  feed: 'Priority feed',
  item: 'Item',
  search: 'Search',
  team: 'Team',
  settings: 'Settings',
};

export function App() {
  const route = useRoute();
  const theme = useStore((s) => s.settings.theme);

  // Theme: "system" follows the OS (or a theme the host page set); explicit choices set data-theme.
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') {
      if (el.dataset.wrTheme) {
        delete el.dataset.theme;
        delete el.dataset.wrTheme;
      }
    } else {
      el.dataset.theme = theme;
      el.dataset.wrTheme = '1';
    }
  }, [theme]);

  // Keep relative times and snooze expiry fresh.
  useEffect(() => {
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    const key = route.segments[0] ?? '';
    document.title = `${TITLES[key] ?? 'WorkRadar'} · WorkRadar`;
  }, [route.path]);

  // Global shortcuts: "/" search, g+t / g+f / g+s / g+m for navigation.
  useEffect(() => {
    let g = false;
    let timer = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        if (route.path.startsWith('/search')) document.querySelector<HTMLInputElement>('.search-box input')?.focus();
        else navigate('/search');
        return;
      }
      if (g) {
        g = false;
        const map: Record<string, string> = { t: '/', f: '/feed', s: '/search', m: '/team', ',': '/settings' };
        if (map[e.key]) navigate(map[e.key]);
        return;
      }
      if (e.key === 'g') {
        g = true;
        window.clearTimeout(timer);
        timer = window.setTimeout(() => (g = false), 900);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route.path]);

  const [first, second] = route.segments;
  let page;
  if (!first) page = <Dashboard />;
  else if (first === 'feed') page = <Feed route={route} />;
  else if (first === 'item' && second) page = <ItemDetail id={second} key={second} />;
  else if (first === 'search') page = <Search route={route} />;
  else if (first === 'team') page = <Team />;
  else if (first === 'settings') page = <Settings route={route} />;
  else
    page = (
      <div className="page">
        <Empty icon="search" title="This page doesn’t exist" action={<button className="btn btn-sm" onClick={() => navigate('/')}>Go to Today</button>}>
          The link may be old or mistyped.
        </Empty>
      </div>
    );

  return (
    <div className="app">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <Sidebar route={route} />
      <MobileBar route={route} />
      <main id="main" tabIndex={-1} className="main">
        {page}
      </main>
      <CommandPalette />
      <Toasts />
    </div>
  );
}
