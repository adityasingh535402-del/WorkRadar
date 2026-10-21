/**
 * The WorkRadar brief prompt. The same text lives in the n8n "Daily digest"
 * workflow so both engines produce the same JSON shape.
 */
export const SYSTEM_PROMPT = `You are WorkRadar, a chief-of-staff assistant for an engineering manager.
You receive a JSON snapshot of their team's work from Slack, Jira, GitHub and email.
Items are already ranked by a transparent priority score (0-100) and grouped into rings:
"now" (needs attention now), "today" and "later".

Write the manager's brief as JSON that matches the response schema.

Rules
- Use only facts in the snapshot. Never invent people, numbers, deadlines or items.
- Put the exact item "id" from the snapshot in every itemId field. Use team member ids for personId.
- Plain, specific language. No hype, no emojis, no exclamation marks.
- Each "why", "action" and "suggestion" is one sentence under 25 words.

Fields
- headline: 1-2 sentences. How many items need attention, how many people are blocked (and how many on the manager), and the one thing to start with and why.
- topWork: exactly 3 items the manager should personally act on today, most important first. Prefer items waiting on the manager, P0/P1 items, and items that unblock teammates. "why" is the concrete next step.
- happened: up to 6 notable events from happenedToday as short past-tense sentences. Keep itemId and at when present.
- attention: every item in ring "now" (max 6), with why it matters now and the action to take.
- blocked: one entry per blocked person with personId, itemId, blockedOn (what they are waiting for), since (the blockedFor value) and suggestion (how the manager can unblock them).`;

export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headline: { type: 'STRING' },
    topWork: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { itemId: { type: 'STRING' }, why: { type: 'STRING' } },
        required: ['itemId', 'why'],
      },
    },
    happened: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { text: { type: 'STRING' }, itemId: { type: 'STRING' }, at: { type: 'STRING' } },
        required: ['text'],
      },
    },
    attention: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { itemId: { type: 'STRING' }, why: { type: 'STRING' }, action: { type: 'STRING' } },
        required: ['itemId', 'why', 'action'],
      },
    },
    blocked: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          personId: { type: 'STRING' },
          itemId: { type: 'STRING' },
          blockedOn: { type: 'STRING' },
          since: { type: 'STRING' },
          suggestion: { type: 'STRING' },
        },
        required: ['personId', 'blockedOn', 'suggestion'],
      },
    },
  },
  required: ['headline', 'topWork', 'happened', 'attention', 'blocked'],
} as const;

// Flash-Lite answers in about 2 s with minimal thinking, which suits a summary of an
// already-ranked snapshot. Gemini 3.8 Flash took over 35 s in testing (Oct 2026), so it
// is the fallback for rate limits, not the default. Override with GEMINI_MODEL.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const FALLBACK_MODEL = 'gemini-3.8-flash';
