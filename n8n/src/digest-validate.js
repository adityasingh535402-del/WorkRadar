// n8n Code node · "Validate brief" (Run once for all items)
// Parses Gemini's JSON, drops anything that doesn't point at a real item or person,
// and shapes the response the WorkRadar app expects: { brief, engine, model }.

const req = $('Build Gemini request').first().json;
const res = $input.first().json;
const parts = (res.candidates && res.candidates[0] && res.candidates[0].content && res.candidates[0].content.parts) || [];
const text = parts.filter((p) => !p.thought && p.text).map((p) => p.text).join('');

let brief;
try {
  brief = JSON.parse(text);
} catch (e) {
  throw new Error('Gemini did not return valid JSON: ' + text.slice(0, 200));
}

const ids = new Set(req.snapshot.openItems.map((i) => i.id).concat((req.snapshot.happenedToday || []).map((h) => h.itemId).filter(Boolean)));
const people = new Set((req.snapshot.team || []).map((p) => p.id));
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const list = (v) => (Array.isArray(v) ? v : []);

const clean = {
  headline: str(brief.headline),
  topWork: list(brief.topWork).filter((x) => ids.has(x.itemId) && str(x.why)).slice(0, 3),
  happened: list(brief.happened).filter((x) => str(x.text)).slice(0, 6),
  attention: list(brief.attention).filter((x) => ids.has(x.itemId) && str(x.why)).slice(0, 6),
  blocked: list(brief.blocked).filter((x) => (people.size === 0 || people.has(x.personId)) && str(x.blockedOn)),
};
if (!clean.headline) throw new Error('Gemini response had no headline');

return [{ json: { brief: clean, engine: 'n8n', model: req.model, usedSample: req.usedSample, generatedAt: new Date().toISOString() } }];
