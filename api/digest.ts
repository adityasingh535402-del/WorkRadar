import { DEFAULT_MODEL, FALLBACK_MODEL, RESPONSE_SCHEMA, SYSTEM_PROMPT } from './_prompt';

/**
 * POST /api/digest
 * Generates the AI brief. Uses the n8n "Daily digest" workflow when N8N_DIGEST_URL
 * is set, otherwise calls Gemini directly with GEMINI_API_KEY. The browser never
 * sees either secret.
 */
export const config = { runtime: 'edge' };

declare const process: { env: Record<string, string | undefined> };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const MAX_BYTES = 80_000;

async function callGemini(payload: unknown, key: string, model: string) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `Snapshot:\n${JSON.stringify(payload)}` }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
    signal: AbortSignal.timeout(22_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw Object.assign(new Error(`Gemini ${res.status}: ${detail.slice(0, 200)}`), { status: res.status });
  }
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join('');
  if (!text) throw new Error('Gemini returned an empty response');
  return JSON.parse(text) as Record<string, unknown>;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Use POST with a WorkRadar snapshot.' }, 405);

  // Only the WorkRadar page itself may use this route.
  const origin = req.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(req.url).host) return json({ error: 'Cross-origin requests are not allowed.' }, 403);

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json({ error: 'Snapshot too large.' }, 413);
  let payload: { openItems?: unknown[] };
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }
  if (!Array.isArray(payload.openItems) || payload.openItems.length > 40) return json({ error: 'Expected a WorkRadar snapshot with up to 40 open items.' }, 400);

  // 1. Prefer the n8n workflow when one is configured.
  const n8n = process.env.N8N_DIGEST_URL;
  if (n8n) {
    try {
      const r = await fetch(n8n, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw, signal: AbortSignal.timeout(20_000) });
      if (r.ok) {
        const data = (await r.json()) as Record<string, unknown> | Record<string, unknown>[];
        const first = Array.isArray(data) ? data[0] : data;
        return json({ brief: first.brief ?? first, engine: 'n8n', model: first.model ?? null });
      }
    } catch {
      /* fall through to Gemini */
    }
  }

  // 2. Call Gemini directly.
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({ error: 'No AI engine is configured. Set GEMINI_API_KEY (or N8N_DIGEST_URL) in the deployment.' }, 503);
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  try {
    const brief = await callGemini(payload, key, model);
    return json({ brief, engine: 'gemini', model });
  } catch (e) {
    const status = (e as { status?: number }).status;
    // Rate limited or model unavailable: retry once on the lighter free-tier model.
    if ((status === 429 || status === 404 || status === 503) && model !== FALLBACK_MODEL) {
      try {
        const brief = await callGemini(payload, key, FALLBACK_MODEL);
        return json({ brief, engine: 'gemini', model: FALLBACK_MODEL });
      } catch (e2) {
        return json({ error: (e2 as Error).message }, 502);
      }
    }
    return json({ error: (e as Error).message }, 502);
  }
}
