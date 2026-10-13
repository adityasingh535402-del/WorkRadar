// Validates the n8n workflow files and simulates every Code node end to end with the
// mock source payloads, using a tiny stand-in for the n8n runtime ($, $input).
// Run: node n8n/validate.mjs   (also runs in CI)
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('./', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// Node types and versions available in n8n 2.x (checked against n8n-io/n8n nodes-base 2.44).
const KNOWN = {
  'n8n-nodes-base.webhook': [1, 1.1, 2, 2.1, 2.2],
  'n8n-nodes-base.respondToWebhook': [1, 1.1, 1.2, 1.3, 1.4, 1.5],
  'n8n-nodes-base.code': [1, 2],
  'n8n-nodes-base.httpRequest': [3, 4, 4.1, 4.2, 4.3, 4.4, 4.5],
  'n8n-nodes-base.scheduleTrigger': [1, 1.1, 1.2, 1.3, 1.4],
  'n8n-nodes-base.set': [3, 3.1, 3.2, 3.3, 3.4, 3.5],
  'n8n-nodes-base.switch': [3, 3.1, 3.2, 3.3, 3.4, 3.5],
  'n8n-nodes-base.merge': [3, 3.1, 3.2],
  'n8n-nodes-base.manualTrigger': [1],
  'n8n-nodes-base.stickyNote': [1],
  'n8n-nodes-base.if': [2, 2.1, 2.2, 2.3, 2.4],
};

const workflows = Object.fromEntries(
  readdirSync(new URL('workflows/', root))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [f, JSON.parse(read(`workflows/${f}`))]),
);

let checks = 0;
for (const [file, wf] of Object.entries(workflows)) {
  const names = new Set();
  for (const n of wf.nodes) {
    assert.ok(!names.has(n.name), `${file}: duplicate node name ${n.name}`);
    names.add(n.name);
    assert.ok(KNOWN[n.type], `${file}: unknown node type ${n.type}`);
    assert.ok(KNOWN[n.type].includes(n.typeVersion), `${file}: ${n.type} has no version ${n.typeVersion}`);
    assert.ok(Array.isArray(n.position) && n.position.length === 2, `${file}: ${n.name} needs a position`);
    if (n.type === 'n8n-nodes-base.code') new Function('$', '$input', '$getWorkflowStaticData', `return (async () => {${n.parameters.jsCode}\n})()`);
    for (const v of JSON.stringify(n.parameters).match(/=\{\{[^"]*/g) ?? []) assert.ok(v.includes('}}'), `${file}: unbalanced expression in ${n.name}`);
    checks++;
  }
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), `${file}: connection from missing node ${from}`);
    for (const outs of c.main) for (const t of outs) assert.ok(names.has(t.node), `${file}: connection to missing node ${t.node}`);
  }
  const triggers = wf.nodes.filter((n) => /trigger|webhook$/i.test(n.type));
  assert.ok(triggers.length > 0, `${file}: no trigger`);
}
console.log(`Structure OK: ${Object.keys(workflows).length} workflows, ${checks} nodes`);

// ───────── Simulation ─────────
const node = (file, name) => {
  const n = workflows[file].nodes.find((x) => x.name === name);
  assert.ok(n, `${file}: missing node ${name}`);
  return n;
};
async function run(file, name, { outputs, input }) {
  const code = node(file, name).parameters.jsCode;
  const $ = (n) => {
    const out = outputs[n];
    if (!out) throw new Error(`Simulation: no output recorded for "${n}"`);
    return { first: () => out[0], all: () => out, isExecuted: true };
  };
  const $input = { first: () => input[0], all: () => input };
  const fn = new Function('$', '$input', '$getWorkflowStaticData', `return (async () => {${code}\n})()`);
  return fn($, $input, () => ({}));
}
const items = (arr) => arr.map((json) => ({ json }));

// Workflow 2: ingestion → normalise → triage request → (Gemini stub) → rank
const W2 = '2-source-ingestion.json';
const cfg2 = node(W2, 'Config').parameters.assignments.assignments.reduce((o, a) => ({ ...o, [a.name]: a.value }), {});
const outputs2 = {
  Config: items([cfg2]),
  'Slack: threads': items([JSON.parse(read('mock-sources/slack.json'))]),
  'Jira: issues': items([JSON.parse(read('mock-sources/jira.json'))]),
  'GitHub: pulls & issues': items([JSON.parse(read('mock-sources/github.json'))]),
  'Gmail: messages': items([JSON.parse(read('mock-sources/gmail.json'))]),
};
const normalized = await run(W2, 'Normalize to WorkItems', { outputs: outputs2, input: [] });
outputs2['Normalize to WorkItems'] = normalized;
assert.ok(normalized.length >= 40, 'normaliser should produce all items');
const sources = new Set(normalized.map((i) => i.json.source));
assert.deepEqual([...sources].sort(), ['email', 'github', 'jira', 'slack']);
for (const { json: it } of normalized) {
  for (const k of ['id', 'source', 'ref', 'title', 'status', 'createdAt', 'detail']) assert.ok(it[k] !== undefined && it[k] !== null, `normalised item ${it.id} missing ${k}`);
}
const triage = await run(W2, 'Prepare AI triage', { outputs: outputs2, input: normalized });
outputs2['Prepare AI triage'] = triage;
const tReq = triage[0].json.request;
assert.ok(tReq.contents[0].parts[0].text.length > 100 && tReq.generationConfig.responseSchema, 'triage request built');
console.log(`Ingestion OK: ${normalized.length} items normalised, ${triage[0].json.count} sent to Gemini for triage`);

// Stubbed Gemini triage response
const geminiTriage = { candidates: [{ content: { parts: [{ text: JSON.stringify({ results: [{ id: 'wr-105', priority: 'P1', waitingOnManager: true, blocked: false, escalation: false, negative: true, summary: 'Reminder job stopped; 40 sessions missed.', nextStep: 'Assign to Rahul.', suggestedOwner: 'rahul' }] }) }] } }] };
const ranked = await run(W2, 'Apply AI signals & rank', { outputs: outputs2, input: items([geminiTriage]) });
const r = ranked[0].json;
assert.equal(r.aiTriaged, 1);
assert.ok(r.snapshot.openItems.length > 10, 'snapshot has open items');
assert.equal(r.snapshot.openItems[0].id, 'wr-101', 'the P0 incident ranks first');
assert.ok(r.snapshot.blockedPeople.length >= 3, 'blocked people detected');
const rankedNoAi = await run(W2, 'Apply AI signals & rank', { outputs: outputs2, input: items([{ error: { message: 'quota' } }]) });
assert.equal(rankedNoAi[0].json.aiError, 'quota');
console.log(`Ranking OK: top = ${r.snapshot.openItems.slice(0, 3).map((i) => `${i.ref} (${i.score})`).join(', ')}; ${r.counts.now} need attention; ${r.snapshot.blockedPeople.length} blocked`);

// Workflow 1: digest
const W1 = '1-daily-digest-api.json';
const cfg1 = node(W1, 'Config').parameters.assignments.assignments.reduce((o, a) => ({ ...o, [a.name]: a.value }), {});
const outputs1 = { 'Digest request': items([{ body: r.snapshot }]), Config: items([cfg1]) };
const built = await run(W1, 'Build Gemini request', { outputs: outputs1, input: [] });
outputs1['Build Gemini request'] = built;
assert.equal(built[0].json.usedSample, false);
assert.ok(built[0].json.request.systemInstruction.parts[0].text.includes('WorkRadar'));
const sample = await run(W1, 'Build Gemini request', { outputs: { ...outputs1, 'Digest request': items([{ body: {} }]) }, input: [] });
assert.equal(sample[0].json.usedSample, true);
const fakeBrief = { headline: '5 items need attention.', topWork: [{ itemId: 'wr-101', why: 'Approve the rollback.' }, { itemId: 'made-up', why: 'x' }], happened: [{ text: 'Shipped v3.14.0' }], attention: [{ itemId: 'wr-102', why: 'Waiting 26h', action: 'Review' }], blocked: [{ personId: 'ananya', itemId: 'wr-106', blockedOn: 'Your review', since: '26h', suggestion: 'Review PR #1284' }] };
const validated = await run(W1, 'Validate brief', { outputs: outputs1, input: items([{ candidates: [{ content: { parts: [{ text: JSON.stringify(fakeBrief) }] } }] }]) });
assert.equal(validated[0].json.brief.topWork.length, 1, 'made-up item ids are dropped');
assert.equal(validated[0].json.engine, 'n8n');
const fallback = await run(W1, 'Rule-based fallback', { outputs: outputs1, input: items([{ error: { message: 'Gemini 429' } }]) });
assert.ok(fallback[0].json.brief.headline.length > 10 && fallback[0].json.brief.topWork.length === 3);
console.log(`Digest OK: Gemini path validated, fallback headline: “${fallback[0].json.brief.headline}”`);

// Workflow 3: actions
const W3 = '3-item-actions.json';
for (const [source, action] of [['jira', 'assign'], ['github', 'done'], ['slack', 'snooze'], ['email', 'reopen']]) {
  const out3 = { 'Action from WorkRadar': items([{ body: { action, itemId: 'wr-103', source, ref: 'LP-512', title: 'Payment webhook retries', assignee: 'Arjun Nair', snoozedUntil: '2026-10-14T03:30:00Z' } }]), Config: items([{ liveMode: false }]) };
  const plan = await run(W3, 'Plan the update', { outputs: out3, input: [] });
  assert.ok(plan[0].json.call && plan[0].json.call.method, `planned call for ${source}/${action}`);
  const toolNode = { jira: 'Jira: apply', github: 'GitHub: apply', slack: 'Slack: apply', email: 'Gmail: apply' }[source];
  const applied = await run(W3, toolNode, { outputs: out3, input: plan });
  assert.ok(applied[0].json.message.includes('demo mode'));
}
console.log('Actions OK: assign, done, snooze and reopen planned for all four tools');

// Workflow 4: morning brief formatting
const W4 = '4-morning-brief.json';
const formatted = await run(W4, 'Format for Slack', { outputs: { 'Get ranked items': ranked }, input: validated });
assert.ok(formatted[0].json.text.includes('Top work for today'));
console.log('Morning brief OK:\n' + formatted[0].json.text.split('\n').slice(0, 6).map((l) => '  | ' + l).join('\n'));
console.log('\nAll n8n checks passed.');
