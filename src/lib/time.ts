const MIN = 60_000;
const HOUR = 60 * MIN;

const pad = (n: number) => String(n).padStart(2, '0');

export function clock(d: Date) {
  let h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return m === 0 ? `${h} ${suffix}` : `${h}:${pad(m)} ${suffix}`;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function longDate(now: number) {
  const d = new Date(now);
  return `${WEEKDAY[d.getDay()]}, ${d.getDate()} ${MONTH[d.getMonth()]}`;
}

export function shortDate(d: Date) {
  return `${WEEKDAY[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MONTH[d.getMonth()].slice(0, 3)}`;
}

export function greeting(now: number) {
  const h = new Date(now).getHours();
  if (h < 5) return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function partOfDay(now: number) {
  const h = new Date(now).getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

/** "just now", "6m ago", "3h ago", "yesterday", "4d ago" */
export function ago(iso: string | undefined, now: number) {
  if (!iso) return '';
  const diff = now - new Date(iso).getTime();
  if (diff < MIN) return 'just now';
  if (diff < HOUR) return `${Math.round(diff / MIN)}m ago`;
  if (diff < 24 * HOUR) return `${Math.round(diff / HOUR)}h ago`;
  const days = Math.round(diff / (24 * HOUR));
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

/** Duration since a moment, for "blocked for 26h". */
export function since(iso: string | undefined, now: number) {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))}m`;
  if (diff < 48 * HOUR) return `${Math.round(diff / HOUR)}h`;
  return `${Math.round(diff / (24 * HOUR))}d`;
}

export function minutesUntil(iso: string | undefined, now: number) {
  if (!iso) return Infinity;
  return (new Date(iso).getTime() - now) / MIN;
}

/** Due label used in strips: "Overdue 2h", "in 45m", "Today 6:40 pm", "Tomorrow 10 am", "Thu, 15 Oct". */
export function due(iso: string | undefined, now: number): { text: string; tone: 'overdue' | 'soon' | 'today' | 'later' | 'none' } {
  if (!iso) return { text: 'No due date', tone: 'none' };
  const d = new Date(iso);
  const mins = (d.getTime() - now) / MIN;
  if (mins < 0) return { text: `Overdue ${since(iso, now)}`, tone: 'overdue' };
  if (mins < 60) return { text: `in ${Math.max(1, Math.round(mins))}m`, tone: 'soon' };
  const today = new Date(now);
  if (sameDay(d, today)) return { text: mins < 360 ? `in ${Math.round(mins / 60)}h, ${clock(d)}` : `Today, ${clock(d)}`, tone: mins < 360 ? 'soon' : 'today' };
  const tomorrow = new Date(now + 24 * HOUR);
  if (sameDay(d, tomorrow)) return { text: `Tomorrow, ${clock(d)}`, tone: 'today' };
  if (mins < 6 * 24 * 60) return { text: `${WEEKDAY[d.getDay()].slice(0, 3)}, ${clock(d)}`, tone: 'later' };
  return { text: shortDate(d), tone: 'later' };
}

export function absolute(iso: string | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${shortDate(d)}, ${clock(d)}`;
}

/** Snooze presets resolved against the current time. */
export function snoozeOptions(now: number) {
  const d = new Date(now);
  const tomorrow9 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 0, 0);
  const daysToMonday = ((8 - d.getDay()) % 7) || 7;
  const monday9 = new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysToMonday, 9, 0, 0);
  return [
    { id: '1h', label: '1 hour', until: new Date(now + HOUR) },
    { id: '3h', label: '3 hours', until: new Date(now + 3 * HOUR) },
    { id: 'tomorrow', label: 'Tomorrow', until: tomorrow9 },
    { id: 'monday', label: 'Next Monday', until: monday9 },
  ].map((o) => ({ ...o, hint: o.id === '1h' || o.id === '3h' ? clock(o.until) : shortDate(o.until) + ', 9 am' }));
}
