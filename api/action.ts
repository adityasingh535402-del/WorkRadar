/**
 * POST /api/action
 * Receives Assign / Mark done / Snooze from the app and forwards them to the
 * n8n "Item actions" workflow when N8N_ACTION_URL is set. Without it, the
 * action stays local to the browser and this route simply acknowledges it.
 */
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const ACTIONS = new Set(['assign', 'done', 'reopen', 'snooze', 'unsnooze']);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: 'Cross-origin requests are not allowed.' }, 403);

  const body = (await req.json().catch(() => null)) as { action?: string; itemId?: string } | null;
  if (!body || !body.action || !ACTIONS.has(body.action) || !body.itemId) return json({ error: 'Expected { action, itemId }.' }, 400);

  const url = process.env.N8N_ACTION_URL;
  if (!url) return json({ ok: true, synced: false });
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const data = (await r.json().catch(() => ({}))) as { message?: string };
    return json({ ok: r.ok, synced: r.ok, message: r.ok ? data.message ?? 'Synced through n8n' : undefined });
  } catch {
    return json({ ok: true, synced: false });
  }
}
