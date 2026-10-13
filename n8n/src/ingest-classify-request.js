// n8n Code node · "Prepare AI triage" (Run once for all items)
// Slack threads and emails have no priority or owner fields, so Gemini reads them
// and returns structured signals. Jira and GitHub already carry structure.

const config = $('Config').first().json;
const ROSTER = /*__ROSTER__*/ [];
const team = ROSTER.filter((p) => !p.external).map((p) => ({ id: p.id, name: p.name, role: p.role, skills: p.skills }));
const manager = ROSTER.find((p) => p.id === config.managerId);

const unstructured = $input
  .all()
  .map((i) => i.json)
  .filter((it) => (it.source === 'slack' || it.source === 'email') && it.status !== 'done' && !(it.labels || []).includes('fyi'))
  .map((it) => ({
    id: it.id,
    source: it.source,
    where: it.ref,
    text:
      it.detail.kind === 'thread'
        ? it.detail.messages.map((m) => `${m.by}: ${m.text}`).join('\n')
        : `${it.detail.subject}\n${it.detail.body.join('\n')}`,
  }));

const SYSTEM = `You triage workplace messages for ${manager.name}, ${manager.role} of the Learning Platform team at Airtribe (an online learning company running live cohort programs).
For every thread, return one object in "results" with:
- id: the thread id, unchanged
- priority: P0 (live incident hurting learners now), P1 (urgent, learners or revenue affected), P2 (normal), P3 (low), or NONE for FYI
- waitingOnManager: true only if someone is explicitly waiting for ${manager.name.split(' ')[0]} to decide, review or reply
- blocked: true if a teammate says they cannot proceed
- escalation: true for incidents or escalations from leadership or customers
- negative: true if the tone shows frustration or complaints
- summary: one plain sentence under 30 words with the key facts (numbers, deadlines)
- nextStep: one sentence under 25 words telling the manager what to do
- suggestedOwner: the team member id best placed to own it, or "" if it is the manager's own decision
Use only the facts in the text. Team: ${JSON.stringify(team)}`;

const schema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          priority: { type: 'STRING', enum: ['P0', 'P1', 'P2', 'P3', 'NONE'] },
          waitingOnManager: { type: 'BOOLEAN' },
          blocked: { type: 'BOOLEAN' },
          escalation: { type: 'BOOLEAN' },
          negative: { type: 'BOOLEAN' },
          summary: { type: 'STRING' },
          nextStep: { type: 'STRING' },
          suggestedOwner: { type: 'STRING' },
        },
        required: ['id', 'priority', 'waitingOnManager', 'blocked', 'escalation', 'negative', 'summary', 'nextStep', 'suggestedOwner'],
      },
    },
  },
  required: ['results'],
};

return [
  {
    json: {
      model: config.model,
      count: unstructured.length,
      request: {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify(unstructured) }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: schema },
      },
    },
  },
];
