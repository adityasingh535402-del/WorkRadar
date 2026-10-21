// WorkRadar checks: ranking, brief validation, search parsing and the /api/digest route.
// Run with `npm test`. Bundles the TypeScript sources with esbuild (already installed by Vite).
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'workradar-test-'));
const entry = join(dir, 'entry.ts');
writeFileSync(
  entry,
  `export * from ${JSON.stringify(join(root, 'src/lib/scoring.ts'))};
export { buildItems } from ${JSON.stringify(join(root, 'src/data/items.ts'))};
export { buildPayload, localBrief, sanitizeBrief } from ${JSON.stringify(join(root, 'src/lib/brief.ts'))};
export { parseQuery } from ${JSON.stringify(join(root, 'src/lib/search.ts'))};
export { default as digest } from ${JSON.stringify(join(root, 'api/digest.ts'))};`,
);
const out = join(dir, 'bundle.mjs');
await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', jsx: 'automatic' });
const m = await import(pathToFileURL(out).href);

let passed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
};

const now = Date.now();
const items = m.buildItems(now);
const open = m.scoreAll(items, m.DEFAULT_WEIGHTS, now).filter((s) => s.item.status !== 'done' && !s.item.snoozedUntil);

console.log('WorkRadar checks');

await test('ranking: P0 incident first, then the PR and the unowned launch blocker', () => {
  const top = open.slice(0, 3).map((s) => `${s.item.id}:${s.score}`);
  assert.deepEqual(top, ['wr-101:97', 'wr-102:93', 'wr-103:86']);
});

await test('ranking: every open item explains its score with six factors', () => {
  for (const s of open) {
    assert.equal(s.factors.length, 6, s.item.id);
    assert.ok(s.why.length > 0, s.item.id);
  }
});

await test('ranking: rings follow the thresholds', () => {
  for (const s of open) assert.equal(s.ring, s.score >= m.RING_NOW ? 'now' : s.score >= m.RING_TODAY ? 'today' : 'later', s.item.id);
});

await test('brief validation drops invented items and resolves people by name', () => {
  const b = m.sanitizeBrief(
    {
      headline: 'Two things need you.',
      topWork: [{ itemId: 'wr-101', why: 'Approve the rollback.' }, { itemId: 'wr-999', why: 'Invented.' }],
      happened: [],
      attention: [{ itemId: 'nope', why: 'x', action: 'y' }],
      blocked: [{ personId: 'Meera Joshi', blockedOn: 'Copy', suggestion: 'Approve placeholder copy.' }],
    },
    items,
    'gemini',
    'test-model',
  );
  assert.deepEqual(b.topWork.map((t) => t.itemId), ['wr-101']);
  assert.equal(b.attention.length, 0);
  assert.equal(b.blocked[0].personId, 'meera');
});

await test('brief validation rejects a brief without a headline', () => {
  assert.equal(m.sanitizeBrief({ topWork: [] }, items, 'gemini'), null);
});

await test('on-device brief always has a headline and three top items', () => {
  const b = m.localBrief(open, items, now);
  assert.ok(b.headline.length > 20);
  assert.equal(b.topWork.length, 3);
});

await test('search turns plain language into filters', () => {
  const q = m.parseQuery('blocked prs waiting on me');
  const kinds = q.filters.map((f) => `${f.kind}:${f.value}`).sort();
  assert.ok(kinds.includes('source:github'), kinds.join(', '));
  assert.ok(kinds.some((k) => k.endsWith(':blocked')), kinds.join(', '));
  assert.ok(kinds.some((k) => k.includes('waiting')), kinds.join(', '));
});

// /api/digest with a mocked Gemini
const payload = JSON.stringify(m.buildPayload(open, items, now));
const call = () => m.digest(new Request('https://workradar.test/api/digest', { method: 'POST', body: payload }));
const reply = (brief) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(brief) }] } }] }), { status: 200 });
const brief = { headline: 'h', topWork: [], happened: [], attention: [], blocked: [] };
const realFetch = globalThis.fetch;

await test('digest route: answers with the primary model', async () => {
  process.env.GEMINI_API_KEY = 'test';
  globalThis.fetch = async () => reply(brief);
  const r = JSON.parse(await (await call()).text());
  assert.equal(r.engine, 'gemini');
  assert.equal(r.model, 'gemini-3.5-flash-lite');
});

await test('digest route: falls back to the second model when the first fails', async () => {
  globalThis.fetch = async (url) => (String(url).includes('flash-lite') ? new Response('busy', { status: 503 }) : reply(brief));
  const r = JSON.parse(await (await call()).text());
  assert.equal(r.model, 'gemini-3.8-flash');
  assert.match(r.note, /503/);
});

await test('digest route: reports a missing key', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = JSON.parse(await (await call()).text());
  assert.match(r.error, /GEMINI_API_KEY/);
});

await test('digest route: rejects cross-origin and oversized requests', async () => {
  const cross = await m.digest(new Request('https://workradar.test/api/digest', { method: 'POST', headers: { origin: 'https://evil.test' }, body: payload }));
  assert.equal(cross.status, 403);
  const big = await m.digest(new Request('https://workradar.test/api/digest', { method: 'POST', body: 'x'.repeat(90_000) }));
  assert.equal(big.status, 413);
});

globalThis.fetch = realFetch;
rmSync(dir, { recursive: true, force: true });
console.log(process.exitCode ? 'Some checks failed.' : `All ${passed} checks passed.`);
