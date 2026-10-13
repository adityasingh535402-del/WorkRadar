// n8n Code node · "<Tool>: apply" (Run once for all items)
// Demo mode: records the call it would make. To go live, replace this node with the
// native Jira / GitHub / Slack / Gmail node (or an HTTP Request node) using the
// "call" field prepared by "Plan the update".

const a = $input.first().json;
const live = $('Config').first().json.liveMode === true;
return [
  {
    json: {
      ok: true,
      message: live ? `${a.summary}. Synced to ${a.tool} via n8n.` : `${a.summary}. n8n prepared the ${a.tool} update (demo mode).`,
      tool: a.tool,
      call: a.call,
      notify: a.notify,
      at: new Date().toISOString(),
    },
  },
];
