// Assembles the importable n8n workflow files from the Code-node sources in n8n/src.
// Run: node n8n/build.mjs   (no dependencies; Node 18+)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

// ───────── Shared prompt (single source of truth: api/_prompt.ts) ─────────
const promptTs = read('../api/_prompt.ts');
const SYSTEM_PROMPT = promptTs.match(/SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
const RESPONSE_SCHEMA = new Function(`return ${promptTs.match(/RESPONSE_SCHEMA = ([\s\S]*?) as const;/)[1]}`)();
const DEFAULT_MODEL = promptTs.match(/DEFAULT_MODEL = '([^']+)'/)[1];
const FALLBACK_MODEL = promptTs.match(/FALLBACK_MODEL = '([^']+)'/)[1];
const ROSTER = JSON.parse(read('mock-sources/roster.json'));
const SOURCE_BASE = 'https://raw.githubusercontent.com/adityasingh535402-del/WorkRadar/main/n8n/mock-sources';

const SAMPLE_SNAPSHOT = {
  manager: { name: 'Neha Kapoor', role: 'Engineering Manager', team: 'Learning Platform', company: 'Airtribe' },
  now: '2026-10-13T06:00:00.000Z',
  timezone: 'Asia/Kolkata',
  team: ROSTER.filter((p) => !p.external).map((p) => ({ id: p.id, name: p.name, role: p.role })),
  openItems: [
    { id: 'wr-101', source: 'slack', ref: '#incidents', title: 'Learners on iPhone can’t join live sessions', summary: 'Blank screen after Join on iOS since the video SDK upgrade; 23 tickets; class starts in about 5 hours.', status: 'in_progress', priority: 'P0', assignee: 'Karan Mehta', due: 'in 5h', score: 97, ring: 'now', why: 'Live P0 incident, pinned to the top. Live class starts in 5h', blockedBy: null, waitingOnManager: true, suggestedNextStep: 'Approve the canary rollback now.' },
    { id: 'wr-102', source: 'github', ref: 'PR #1284', title: 'Fix race condition in grade sync for re-submitted assignments', summary: 'Checks green; your review requested 26 hours ago; LP-498 waits on it.', status: 'in_review', priority: null, assignee: 'Ananya Iyer', due: 'Tomorrow', score: 93, ring: 'now', why: 'Mentor review window opens within a day. Ananya is waiting on you', blockedBy: null, waitingOnManager: true, suggestedNextStep: 'Review it now; 180 lines.' },
    { id: 'wr-103', source: 'jira', ref: 'LP-512', title: 'Payment webhook retries fail for GenAI Launchpad enrollments', summary: '14 learners paid but not enrolled; unassigned.', status: 'open', priority: 'P1', assignee: null, due: 'in 4h', score: 86, ring: 'now', why: 'Needed before go/no-go in 4h. P1, 14 learners affected', blockedBy: null, waitingOnManager: false, suggestedNextStep: 'Assign to Arjun.' },
  ],
  blockedPeople: [{ person: 'Ananya Iyer', personId: 'ananya', itemId: 'wr-106', ref: 'LP-498', blockedOn: 'Waiting on your review of PR #1284', blockedFor: '26h', blockedByManager: true }],
  happenedToday: [{ text: 'v3.14.0 deployed to production', itemId: 'wr-112', at: '2026-10-13T04:00:00.000Z' }],
};

const code = (file, inject = {}) => {
  let src = read(`src/${file}`);
  for (const [k, v] of Object.entries(inject)) {
    const re = new RegExp(`/\\*__${k}__\\*/ (\\[\\]|\\{\\}|'')`);
    if (!re.test(src)) throw new Error(`Placeholder ${k} not found in ${file}`);
    src = src.replace(re, () => JSON.stringify(v, null, k === 'ROSTER' ? 0 : 2));
  }
  return src;
};

// Stable ids so re-running the build doesn't churn the files.
const uuid = (seed) => {
  const h = createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

function workflow(name, nodes, links) {
  const connections = {};
  for (const [from, to, fromOutput = 0, toInput = 0] of links) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= fromOutput) connections[from].main.push([]);
    connections[from].main[fromOutput].push({ node: to, type: 'main', index: toInput });
  }
  return {
    name,
    nodes: nodes.map((n) => ({ id: uuid(`${name}/${n.name}`), ...n, ...(n.type === 'n8n-nodes-base.webhook' ? { webhookId: uuid(`${name}/${n.name}/hook`) } : {}) })),
    connections,
    pinData: {},
    settings: { executionOrder: 'v1', timezone: 'Asia/Kolkata', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' },
    active: false,
    meta: { templateCredsSetupCompleted: false },
  };
}

// ───────── Node helpers ─────────
const sticky = (name, content, position, width = 360, height = 240, color = 7) => ({ name, type: 'n8n-nodes-base.stickyNote', typeVersion: 1, position, parameters: { content, width, height, color } });
const webhook = (name, method, path, position) => ({ name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position, parameters: { httpMethod: method, path, responseMode: 'responseNode', options: { allowedOrigins: '*' } } });
const respond = (name, position) => ({ name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position, parameters: { respondWith: 'firstIncomingItem', options: {} } });
const codeNode = (name, jsCode, position, extra = {}) => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position, parameters: { mode: 'runOnceForAllItems', jsCode }, ...extra });
const setNode = (name, fields, position) => ({
  name,
  type: 'n8n-nodes-base.set',
  typeVersion: 3.4,
  position,
  parameters: {
    assignments: { assignments: Object.entries(fields).map(([k, v]) => ({ id: uuid(`${name}/${k}`), name: k, value: v, type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : typeof v === 'object' ? 'object' : 'string' })) },
    options: {},
  },
});
const manual = (name, position) => ({ name, type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position, parameters: {} });
const httpGet = (name, url, position, timeout = 20000) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, parameters: { url, options: { timeout, response: { response: { responseFormat: 'json' } } } } });
const httpPostJson = (name, url, jsonBody, position, timeout = 60000) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, parameters: { method: 'POST', url, sendBody: true, specifyBody: 'json', jsonBody, options: { timeout } } });
const gemini = (name, position) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  parameters: {
    method: 'POST',
    url: '=https://generativelanguage.googleapis.com/v1beta/models/{{ $json.model }}:generateContent',
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googlePalmApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.request) }}',
    options: { timeout: 45000 },
  },
  credentials: { googlePalmApi: { id: 'workradar-gemini', name: 'Gemini – WorkRadar' } },
  retryOnFail: true,
  maxTries: 2,
  waitBetweenTries: 3000,
  onError: 'continueErrorOutput',
  notesInFlow: true,
  notes: 'Select your “Gemini – WorkRadar” credential here',
});

// ───────── 1 · Daily digest API ─────────
const wf1 = workflow(
  'WorkRadar · 1 · Daily digest API',
  [
    sticky('About this workflow', `## WorkRadar · Daily digest\nThe WorkRadar app POSTs a ranked snapshot of the team's work here. Gemini writes the brief: **top work for today, what happened, what needs attention, who is blocked**.\n\n1. Open **Gemini: write the brief** and pick your Gemini credential.\n2. Publish / activate the workflow.\n3. Paste the **Production URL** of *Digest request* into WorkRadar → Settings.\n\nIf Gemini fails, a rule-based fallback answers so the app never breaks.`, [-60, -340], 420, 300, 4),
    sticky('Change the model', `### Model\nEdit **Config** to switch models. Default \`${DEFAULT_MODEL}\` (fast). \`${FALLBACK_MODEL}\` is used if it fails; it reasons more but is much slower.`, [400, -220], 300, 160, 7),
    webhook('Digest request', 'POST', 'workradar/digest', [0, 0]),
    setNode('Config', { model: DEFAULT_MODEL, fallbackModel: FALLBACK_MODEL }, [240, 0]),
    codeNode('Build Gemini request', code('digest-build-request.js', { SYSTEM_PROMPT, RESPONSE_SCHEMA, SAMPLE_SNAPSHOT }), [480, 0]),
    gemini('Gemini: write the brief', [720, 0]),
    codeNode('Validate brief', code('digest-validate.js'), [980, -100], { onError: 'continueErrorOutput' }),
    codeNode('Rule-based fallback', code('digest-fallback.js'), [980, 140]),
    respond('Send brief to WorkRadar', [1240, 0]),
  ],
  [
    ['Digest request', 'Config'],
    ['Config', 'Build Gemini request'],
    ['Build Gemini request', 'Gemini: write the brief'],
    ['Gemini: write the brief', 'Validate brief', 0],
    ['Gemini: write the brief', 'Rule-based fallback', 1],
    ['Validate brief', 'Send brief to WorkRadar', 0],
    ['Validate brief', 'Rule-based fallback', 1],
    ['Rule-based fallback', 'Send brief to WorkRadar'],
  ],
);

// ───────── 2 · Source ingestion ─────────
const wf2 = workflow(
  'WorkRadar · 2 · Source ingestion & ranking',
  [
    sticky('About this workflow', `## WorkRadar · Source ingestion\nPulls Slack threads, Jira issues, GitHub PRs and Gmail messages, **normalises** them into one WorkItem schema, asks **Gemini to triage** the unstructured ones (priority, waiting on you, blocked, next step) and **ranks** everything with the same transparent score as the app.\n\nDemo mode reads API-shaped mock files from the GitHub repo. To go live, replace each fetch node with the native Slack / Jira / GitHub / Gmail node.`, [-60, -420], 460, 300, 4),
    manual('Run now', [0, -120]),
    { name: 'Every hour', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 40], parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } } },
    webhook('Get items', 'GET', 'workradar/items', [0, 200]),
    setNode('Config', { sourceBaseUrl: SOURCE_BASE, model: DEFAULT_MODEL, managerId: 'neha', timezone: 'Asia/Kolkata' }, [260, 40]),
    httpGet('Slack: threads', '={{ $json.sourceBaseUrl }}/slack.json', [540, -200]),
    httpGet('Jira: issues', '={{ $json.sourceBaseUrl }}/jira.json', [540, -60]),
    httpGet('GitHub: pulls & issues', '={{ $json.sourceBaseUrl }}/github.json', [540, 80]),
    httpGet('Gmail: messages', '={{ $json.sourceBaseUrl }}/gmail.json', [540, 220]),
    { name: 'All sources', type: 'n8n-nodes-base.merge', typeVersion: 3, position: [800, 0], parameters: { numberInputs: 4 } },
    codeNode('Normalize to WorkItems', code('ingest-normalize.js', { ROSTER }), [1040, 0]),
    codeNode('Prepare AI triage', code('ingest-classify-request.js', { ROSTER }), [1280, 0]),
    gemini('Gemini: triage messages', [1520, 0]),
    codeNode('Apply AI signals & rank', code('ingest-score.js', { ROSTER }), [1780, 0]),
    {
      name: 'Called from a webhook?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [2020, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [{ id: uuid('wf2-if'), leftValue: "={{ $('Get items').isExecuted }}", rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
    },
    respond('Return ranked items', [2260, -80]),
    sticky('Go live', '### Go live\nSwap the four fetch nodes for native nodes:\n- **Slack**: conversations.history + replies for your channels and DMs\n- **Jira**: search with JQL `project = LP AND updated >= -7d`\n- **GitHub**: pull requests and issues for your repos\n- **Gmail**: messages in INBOX from the last 2 days\n\nKeep the field names the normaliser expects, or edit it.', [480, 360], 380, 240, 6),
  ],
  [
    ['Run now', 'Config'],
    ['Every hour', 'Config'],
    ['Get items', 'Config'],
    ['Config', 'Slack: threads'],
    ['Config', 'Jira: issues'],
    ['Config', 'GitHub: pulls & issues'],
    ['Config', 'Gmail: messages'],
    ['Slack: threads', 'All sources', 0, 0],
    ['Jira: issues', 'All sources', 0, 1],
    ['GitHub: pulls & issues', 'All sources', 0, 2],
    ['Gmail: messages', 'All sources', 0, 3],
    ['All sources', 'Normalize to WorkItems'],
    ['Normalize to WorkItems', 'Prepare AI triage'],
    ['Prepare AI triage', 'Gemini: triage messages'],
    ['Gemini: triage messages', 'Apply AI signals & rank', 0],
    ['Gemini: triage messages', 'Apply AI signals & rank', 1],
    ['Apply AI signals & rank', 'Called from a webhook?'],
    ['Called from a webhook?', 'Return ranked items', 0],
  ],
);

// ───────── 3 · Item actions ─────────
const tools = [
  ['Jira: apply', [1000, -240]],
  ['GitHub: apply', [1000, -80]],
  ['Slack: apply', [1000, 80]],
  ['Gmail: apply', [1000, 240]],
];
const wf3 = workflow(
  'WorkRadar · 3 · Item actions',
  [
    sticky('About this workflow', '## WorkRadar · Item actions\nReceives **Assign, Mark done and Snooze** from the app, plans the matching call for the source tool, and routes it.\n\nDemo mode (Config → liveMode = false) returns the planned call without touching real tools. Paste the Production URL of *Action from WorkRadar* into WorkRadar → Settings → n8n actions webhook.', [-60, -420], 440, 260, 4),
    webhook('Action from WorkRadar', 'POST', 'workradar/action', [0, 0]),
    setNode('Config', { liveMode: false }, [240, 0]),
    codeNode('Plan the update', code('actions-plan.js', { ROSTER }), [480, 0]),
    { name: 'Route by tool', type: 'n8n-nodes-base.switch', typeVersion: 3, position: [740, 0], parameters: { mode: 'expression', numberOutputs: 4, output: "={{ ['jira', 'github', 'slack', 'email'].indexOf($json.source) }}", options: {} } },
    ...tools.map(([name, pos]) => codeNode(name, code('actions-apply.js'), pos)),
    respond('Confirm to WorkRadar', [1260, 0]),
    sticky('Go live', '### Go live\nReplace each **…: apply** node with the native node (Jira → Update issue, GitHub → Edit issue, Slack → Send message, Gmail → Add label) using `{{ $json.call }}`, then set liveMode = true.', [940, 380], 360, 180, 6),
  ],
  [
    ['Action from WorkRadar', 'Config'],
    ['Config', 'Plan the update'],
    ['Plan the update', 'Route by tool'],
    ...tools.map(([name], i) => ['Route by tool', name, i]),
    ...tools.map(([name]) => [name, 'Confirm to WorkRadar']),
  ],
);

// ───────── 4 · Morning brief ─────────
const wf4 = workflow(
  'WorkRadar · 4 · Morning brief to Slack',
  [
    sticky('About this workflow', '## WorkRadar · Morning brief\nEvery weekday at 8:45 IST: runs ingestion, asks the digest workflow for the AI brief, formats it for Slack and posts it.\n\nNeeds workflows 1 and 2 active. Add a Slack incoming-webhook URL in **Config** to post; without it, the formatted message is shown in the run output.', [-60, -380], 440, 240, 4),
    manual('Run now', [0, -80]),
    { name: 'Weekdays at 8:45', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 80], parameters: { rule: { interval: [{ field: 'cronExpression', expression: '45 8 * * 1-5' }] } } },
    setNode('Config', { n8nBaseUrl: 'http://localhost:5678', slackWebhookUrl: '' }, [240, 0]),
    httpGet('Get ranked items', '={{ $json.n8nBaseUrl }}/webhook/workradar/items', [480, 0], 90000),
    httpPostJson('Generate brief', "={{ $('Config').first().json.n8nBaseUrl }}/webhook/workradar/digest", '={{ JSON.stringify($json.snapshot) }}', [720, 0]),
    codeNode('Format for Slack', code('brief-format.js'), [960, 0]),
    {
      name: 'Slack webhook set?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2,
      position: [1200, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
          conditions: [{ id: uuid('wf4-if'), leftValue: "={{ $('Config').first().json.slackWebhookUrl }}", rightValue: '', operator: { type: 'string', operation: 'notEmpty', singleValue: true } }],
          combinator: 'and',
        },
        options: {},
      },
    },
    httpPostJson('Post to Slack', "={{ $('Config').first().json.slackWebhookUrl }}", '={{ JSON.stringify({ text: $json.text }) }}', [1440, -80], 15000),
  ],
  [
    ['Run now', 'Config'],
    ['Weekdays at 8:45', 'Config'],
    ['Config', 'Get ranked items'],
    ['Get ranked items', 'Generate brief'],
    ['Generate brief', 'Format for Slack'],
    ['Format for Slack', 'Slack webhook set?'],
    ['Slack webhook set?', 'Post to Slack', 0],
  ],
);

mkdirSync(new URL('workflows/', root), { recursive: true });
const files = {
  '1-daily-digest-api.json': wf1,
  '2-source-ingestion.json': wf2,
  '3-item-actions.json': wf3,
  '4-morning-brief.json': wf4,
};
for (const [f, wf] of Object.entries(files)) {
  writeFileSync(new URL(`workflows/${f}`, root), JSON.stringify(wf, null, 2) + '\n');
  console.log(`${f}: ${wf.nodes.length} nodes`);
}
