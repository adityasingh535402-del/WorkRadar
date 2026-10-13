// n8n Code node · "Rule-based fallback" (Run once for all items)
// Runs when the Gemini call fails (no credential, quota, network). Builds the same
// brief shape from the ranked snapshot so the app always gets an answer.

const req = $('Build Gemini request').first().json;
const s = req.snapshot;
const open = s.openItems || [];
const now = open.filter((i) => i.ring === 'now');
const blocked = s.blockedPeople || [];
const onYou = blocked.filter((b) => b.blockedByManager).length;
const first = (name) => String(name || '').split(' ')[0];

let headline = now.length
  ? `${now.length} ${now.length === 1 ? 'item needs' : 'items need'} your attention`
  : 'Nothing needs you urgently right now';
headline += blocked.length ? `, and ${blocked.length} ${blocked.length === 1 ? 'person is' : 'people are'} blocked${onYou ? ` (${onYou} on you)` : ''}.` : '.';
if (open[0] && open[0].ring === 'now') headline += ` Start with ${open[0].ref}: ${String(open[0].why).split('. ')[0]}.`;

const brief = {
  headline,
  topWork: open.slice(0, 3).map((i) => ({ itemId: i.id, why: i.suggestedNextStep || i.why })),
  happened: (s.happenedToday || []).slice(0, 6),
  attention: now.slice(0, 6).map((i) => ({ itemId: i.id, why: i.why, action: i.suggestedNextStep || 'Open it and decide the next step.' })),
  blocked: blocked.map((b) => ({
    personId: b.personId,
    itemId: b.itemId,
    blockedOn: b.blockedOn,
    since: b.blockedFor,
    suggestion: b.blockedByManager ? `Unblock ${first(b.person)} by acting on ${b.ref} yourself.` : `Check what ${first(b.person)} needs to move ${b.ref}.`,
  })),
};

const err = $input.first().json.error;
return [{ json: { brief, engine: 'n8n', model: 'rule-based fallback', fallbackReason: err ? String(err.message || err) : 'Gemini unavailable', generatedAt: new Date().toISOString() } }];
