// n8n Code node · "Build Gemini request" (Run once for all items)
// Turns the WorkRadar snapshot posted by the app into a Gemini generateContent request.
// If the workflow is run from the editor without a body, a small sample snapshot is used.

const SYSTEM_PROMPT = /*__SYSTEM_PROMPT__*/ '';
const RESPONSE_SCHEMA = /*__RESPONSE_SCHEMA__*/ {};
const SAMPLE_SNAPSHOT = /*__SAMPLE_SNAPSHOT__*/ {};

const body = $('Digest request').first().json.body || {};
const snapshot = Array.isArray(body.openItems) && body.openItems.length ? body : SAMPLE_SNAPSHOT;
const config = $('Config').first().json;

return [
  {
    json: {
      model: config.model,
      fallbackModel: config.fallbackModel,
      usedSample: snapshot === SAMPLE_SNAPSHOT,
      snapshot,
      request: {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: 'Snapshot:\n' + JSON.stringify(snapshot) }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      },
    },
  },
];
