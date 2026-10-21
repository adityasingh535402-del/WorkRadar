import type { Brief } from './types';
import { buildPayload, localBrief, sanitizeBrief } from './brief';
import { getState, onAction, rankedOpen, setBrief, visibleItems } from './store';
import { personName } from '../data/people';

const CACHE_KEY = 'workradar:brief';
const CACHE_MINUTES = 30;

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
    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`.trim();
      if (type.includes('json')) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        if (j?.error) msg = j.error;
      }
      throw new Error(msg);
    }
    if (!type.includes('json')) throw new Error('The service answered, but not with JSON.');
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.error === 'string' && !data.brief) throw new Error(data.error);
    return data;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`No answer after ${Math.round(timeoutMs / 1000)} seconds.`);
    throw e;
  } finally {
    window.clearTimeout(t);
  }
}

function unwrap(data: Record<string, unknown>) {
  // n8n can return an array of items; the serverless route returns { brief, engine, model }.
  const d = Array.isArray(data) ? (data[0] as Record<string, unknown>) : data;
  const brief = (d.brief ?? d.json ?? d) as Record<string, unknown>;
  return { brief, engine: d.engine as string | undefined, model: (d.model as string | undefined) ?? undefined };
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

export const engineName = (b: Pick<Brief, 'engine' | 'model'>) => {
  if (b.engine === 'n8n') return b.model && /gemini/i.test(b.model) ? 'Gemini via n8n' : 'n8n (rule-based)';
  return b.engine === 'gemini' ? 'Gemini' : 'On-device summary';
};

/**
 * Generates the AI brief. Order of preference in Auto mode:
 * 1. the n8n "Daily digest" webhook (if configured),
 * 2. the serverless /api/digest route (Gemini, or n8n when N8N_DIGEST_URL is set there),
 * 3. the on-device summariser, so the dashboard never comes up empty.
 */
export async function generateBrief(opts: { force?: boolean } = {}) {
  const s = getState();
  const previous = s.brief.status === 'ready' ? s.brief.data : s.brief.status === 'loading' || s.brief.status === 'error' ? s.brief.previous : undefined;

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
  const { aiMode, n8nDigestUrl } = s.settings;

  if (aiMode === 'local') {
    // A short pause so the regenerate action is visible.
    await new Promise((r) => setTimeout(r, 450));
    setBrief({ status: 'ready', data: localBrief(ranked, all, Date.now()) });
    return;
  }

  const attempts: { engine: Brief['engine']; url: string; timeout: number }[] = [];
  if (n8nDigestUrl) attempts.push({ engine: 'n8n', url: n8nDigestUrl, timeout: 45_000 });
  if (aiMode === 'auto') attempts.push({ engine: 'gemini', url: './api/digest', timeout: 120_000 });

  if (aiMode === 'n8n' && !n8nDigestUrl) {
    setBrief({ status: 'error', message: 'Add your n8n webhook URL in Settings to use n8n for the brief.', previous });
    return;
  }

  const errors: string[] = [];
  for (const a of attempts) {
    try {
      const data = await postJson(a.url, payload, a.timeout);
      const { brief, engine, model } = unwrap(data);
      const resolvedEngine = (engine === 'n8n' || engine === 'gemini' ? engine : a.engine) as Brief['engine'];
      const clean = sanitizeBrief(brief, all, resolvedEngine, model);
      if (!clean) throw new Error('The response was missing the brief fields WorkRadar expects.');
      writeCache(clean);
      setBrief({ status: 'ready', data: clean });
      return;
    } catch (e) {
      errors.push(`${a.engine === 'n8n' ? 'n8n' : 'AI service'}: ${(e as Error).message}`);
    }
  }

  if (aiMode === 'n8n') {
    setBrief({ status: 'error', message: `Couldn’t reach your n8n workflow. ${errors.join(' ')}`, previous });
    return;
  }

  // Auto mode: fall back to the on-device summary and say why.
  const note = n8nDigestUrl
    ? 'n8n and the AI service didn’t respond, so this is an on-device summary.'
    : 'Showing an on-device summary. Connect n8n or deploy with a Gemini key for AI summaries.';
  setBrief({ status: 'ready', data: localBrief(ranked, all, Date.now()), note });
}

/** Sends Assign / Mark done / Snooze to the n8n "Item actions" workflow when one is configured. */
onAction(async ({ kind, item, assignee, until }) => {
  const { aiMode, n8nActionUrl } = getState().settings;
  if (aiMode === 'local') return null;
  const url = n8nActionUrl || (aiMode === 'auto' ? './api/action' : '');
  if (!url) return null;
  const body = {
    action: kind,
    itemId: item.id,
    source: item.source,
    ref: item.ref,
    title: item.title,
    assignee: assignee ? personName(assignee) : undefined,
    snoozedUntil: until,
    at: new Date().toISOString(),
  };
  try {
    const res = await postJson(url, body, 8000);
    const msg = typeof res.message === 'string' ? res.message : null;
    return msg;
  } catch {
    return null;
  }
});

/** Used by Settings to check a webhook before saving it. */
export async function testWebhook(url: string) {
  const s = getState();
  const ranked = rankedOpen(s);
  const all = visibleItems(s);
  const started = performance.now();
  const data = await postJson(url, buildPayload(ranked, all, s.now), 45_000);
  const { brief, model } = unwrap(data);
  const ok = !!sanitizeBrief(brief, all, 'n8n', model);
  return { ok, ms: Math.round(performance.now() - started), model };
}
