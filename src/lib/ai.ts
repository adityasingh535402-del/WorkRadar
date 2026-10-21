import type { Brief } from './types';
import { buildPayload, localBrief, sanitizeBrief } from './brief';
import { getState, rankedOpen, setBrief, visibleItems } from './store';

const CACHE_KEY = 'workradar:brief';
const CACHE_MINUTES = 30;
const DIGEST_URL = './api/digest';

/** The AI route isn't deployed here (a static preview or a dev server without the API). */
class NotConfigured extends Error {}

async function postJson(url: string, body: unknown, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const type = res.headers.get('content-type') ?? '';
    if ([404, 405, 501].includes(res.status) || !type.includes('json')) throw new NotConfigured('The AI route is not deployed here.');
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.error === 'string' && !data.brief) {
      if (/GEMINI_API_KEY/.test(data.error)) throw new NotConfigured(data.error);
      throw new Error(data.error);
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`.trim());
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`No answer after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

function readCache(): Brief | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as Brief;
    if (Date.now() - new Date(b.generatedAt).getTime() > CACHE_MINUTES * 60_000) return null;
    return b;
  } catch {
    return null;
  }
}

function writeCache(b: Brief) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}

/** Turns a technical failure into one plain sentence for the brief panel. */
export function plainReason(message: string) {
  if (/\b429\b|quota|rate.?limit/i.test(message)) return 'Gemini’s free-tier limit was reached.';
  if (/\b50[03]\b|overloaded|unavailable/i.test(message)) return 'Gemini is overloaded right now.';
  if (/timeout|timed out|No answer/i.test(message)) return 'Gemini took too long to answer.';
  if (/Failed to fetch|NetworkError|network/i.test(message)) return 'WorkRadar couldn’t reach the AI service. Check your connection.';
  return 'Gemini returned something WorkRadar couldn’t use.';
}

export const engineName = (b: Pick<Brief, 'engine'>) => (b.engine === 'gemini' ? 'Gemini' : 'On-device summary');

/**
 * Generates the AI brief. In Automatic mode it asks Gemini through the /api/digest route.
 * If that fails, it falls back to the on-device summariser, so the dashboard never comes
 * up empty, and it says why.
 */
export async function generateBrief(opts: { force?: boolean } = {}) {
  const s = getState();
  const previous = s.brief.status === 'ready' ? s.brief.data : s.brief.status === 'loading' ? s.brief.previous : undefined;

  if (!opts.force) {
    const cached = readCache();
    if (cached && s.settings.aiMode !== 'local') {
      setBrief({ status: 'ready', data: cached });
      return;
    }
  }

  setBrief({ status: 'loading', previous });
  const ranked = rankedOpen(s);
  const all = visibleItems(s);
  const payload = buildPayload(ranked, all, s.now);

  if (s.settings.aiMode === 'local') {
    // A short pause so the regenerate action is visible.
    await new Promise((r) => setTimeout(r, 450));
    setBrief({ status: 'ready', data: localBrief(ranked, all, Date.now()) });
    return;
  }

  try {
    const data = await postJson(DIGEST_URL, payload, 120_000);
    const brief = (data.brief ?? data) as Record<string, unknown>;
    const clean = sanitizeBrief(brief, all, 'gemini', typeof data.model === 'string' ? data.model : undefined);
    if (!clean) throw new Error('The response was missing the brief fields WorkRadar expects.');
    writeCache(clean);
    setBrief({ status: 'ready', data: clean });
  } catch (e) {
    const fallback = localBrief(ranked, all, Date.now());
    if (e instanceof NotConfigured) {
      setBrief({ status: 'ready', data: fallback, note: 'Showing an on-device summary. Deploy WorkRadar with a Gemini API key for AI summaries.' });
    } else {
      setBrief({ status: 'ready', data: fallback, degraded: (e as Error).message });
      console.warn('[WorkRadar] AI brief failed:', (e as Error).message);
    }
  }
}
