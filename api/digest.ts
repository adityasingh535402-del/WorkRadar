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

async function callGemini(payload: unknown, key: string, model: string, timeoutMs: number) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `Snapshot:\n${JSON.stringify(payload)}` }] }],
      generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
    }),
    signal: AbortSignal.timeout(timeoutMs),
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

type Result = { brief?: Record<string, unknown>; engine?: 'n8n' | 'gemini'; model?: string | null; error?: string; note?: string };

/** Tries n8n (when configured), then Gemini Flash, then Gemini Flash-Lite. Never throws. */
async function produce(raw: string, payload: unknown): Promise<Result> {
  const problems: string[] = [];

  // 1. Prefer the n8n workflow when one is configured.
  const n8n = process.env.N8N_DIGEST_URL;
  if (n8n) {
    try {
      const r = await fetch(n8n, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw, signal: AbortSignal.timeout(45_000) });
      console.log(`[digest] n8n answered ${r.status}`);
      if (r.ok) {
        const data = (await r.json()) as Record<string, unknown> | Record<string, unknown>[];
        const first = Array.isArray(data) ? data[0] : data;
        return { brief: (first.brief ?? first) as Record<string, unknown>, engine: 'n8n', model: (first.model as string | undefined) ?? null };
      }
      problems.push(`n8n answered ${r.status}`);
    } catch (e) {
      problems.push(`n8n: ${(e as Error).message}`);
    }
  }

  // 2. Call Gemini directly: the configured model first, then the lighter Flash-Lite.
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { error: 'No AI engine is configured. Set GEMINI_API_KEY (or N8N_DIGEST_URL) in the deployment.' };
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const models = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];
  for (const [i, model] of models.entries()) {
    const t0 = Date.now();
    try {
      const brief = await callGemini(payload, key, model, i === 0 ? 35_000 : 30_000);
      console.log(`[digest] ${model} ok in ${Date.now() - t0} ms`);
      return { brief, engine: 'gemini', model, note: problems.length ? problems.join('; ') : undefined };
    } catch (e) {
      console.log(`[digest] ${model} failed after ${Date.now() - t0} ms: ${(e as Error).message}`);
      problems.push(`${model}: ${(e as Error).message}`);
    }
  }
  return { error: problems.join('; ') };
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

  // Thinking models can take longer than the platform's time-to-first-byte limit, so the
  // response starts at once and sends whitespace until the JSON is ready (leading
  // whitespace is valid JSON). Errors arrive as { error } in the same body.
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(enc.encode(' '));
      const keepAlive = setInterval(() => controller.enqueue(enc.encode(' ')), 4000);
      const result = await produce(raw, payload);
      clearInterval(keepAlive);
      controller.enqueue(enc.encode(JSON.stringify(result)));
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-accel-buffering': 'no' } });
}
