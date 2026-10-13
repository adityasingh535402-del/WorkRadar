// n8n Code node · "Plan the update" (Run once for all items)
// Turns an action from the app (assign, done, snooze…) into the call each source
// tool needs. The four branches after the Switch execute it (demo mode by default).

const ROSTER = /*__ROSTER__*/ [];
const body = $('Action from WorkRadar').first().json.body || {};
const ok = ['assign', 'done', 'reopen', 'snooze', 'unsnooze'];
if (!ok.includes(body.action) || !body.itemId) throw new Error('Expected { action, itemId, source, ref }');

const person = ROSTER.find((p) => p.name === body.assignee || p.id === body.assignee);
const ref = body.ref || body.itemId;
const source = ['jira', 'github', 'slack', 'email'].includes(body.source) ? body.source : 'jira';
const when = body.snoozedUntil ? new Date(body.snoozedUntil).toUTCString().slice(0, 22) : '';

const plans = {
  jira: {
    assign: { method: 'PUT', path: `/rest/api/3/issue/${ref}/assignee`, body: { accountId: person ? `jira-${person.id}` : null } },
    done: { method: 'POST', path: `/rest/api/3/issue/${ref}/transitions`, body: { transition: { name: 'Done' } } },
    reopen: { method: 'POST', path: `/rest/api/3/issue/${ref}/transitions`, body: { transition: { name: 'To Do' } } },
    snooze: { method: 'PUT', path: `/rest/api/3/issue/${ref}/properties/workradar.snooze`, body: { until: body.snoozedUntil } },
    unsnooze: { method: 'DELETE', path: `/rest/api/3/issue/${ref}/properties/workradar.snooze` },
  },
  github: {
    assign: { method: 'POST', path: `/repos/{owner}/{repo}/issues/{number}/assignees`, body: { assignees: person ? [person.github_login] : [] } },
    done: { method: 'POST', path: `/repos/{owner}/{repo}/issues/{number}/labels`, body: { labels: ['workradar:done'] } },
    reopen: { method: 'DELETE', path: `/repos/{owner}/{repo}/issues/{number}/labels/workradar:done` },
    snooze: { method: 'POST', path: `/repos/{owner}/{repo}/issues/{number}/labels`, body: { labels: ['workradar:snoozed'] } },
    unsnooze: { method: 'DELETE', path: `/repos/{owner}/{repo}/issues/{number}/labels/workradar:snoozed` },
  },
  slack: {
    assign: { method: 'POST', path: '/api/chat.postMessage', body: { thread_ts: '{thread}', text: `${person ? `<@${person.slack_id}>` : 'Someone'} is now the owner (assigned in WorkRadar).` } },
    done: { method: 'POST', path: '/api/reactions.add', body: { name: 'white_check_mark' } },
    reopen: { method: 'POST', path: '/api/reactions.remove', body: { name: 'white_check_mark' } },
    snooze: { method: 'POST', path: '/api/reminders.add', body: { text: `Follow up on ${ref}`, time: body.snoozedUntil } },
    unsnooze: { method: 'POST', path: '/api/reminders.delete', body: {} },
  },
  email: {
    assign: { method: 'POST', path: '/gmail/v1/users/me/messages/{id}/forward', body: { to: person ? person.email : null } },
    done: { method: 'POST', path: '/gmail/v1/users/me/messages/{id}/modify', body: { removeLabelIds: ['INBOX'], addLabelIds: ['WorkRadar/Done'] } },
    reopen: { method: 'POST', path: '/gmail/v1/users/me/messages/{id}/modify', body: { addLabelIds: ['INBOX'], removeLabelIds: ['WorkRadar/Done'] } },
    snooze: { method: 'POST', path: '/gmail/v1/users/me/messages/{id}/modify', body: { addLabelIds: ['WorkRadar/Snoozed'], removeLabelIds: ['INBOX'] } },
    unsnooze: { method: 'POST', path: '/gmail/v1/users/me/messages/{id}/modify', body: { addLabelIds: ['INBOX'], removeLabelIds: ['WorkRadar/Snoozed'] } },
  },
};

const verb = { assign: `Assigned ${ref} to ${person ? person.name.split(' ')[0] : 'a teammate'}`, done: `Marked ${ref} done`, reopen: `Reopened ${ref}`, snooze: `Snoozed ${ref} until ${when}`, unsnooze: `Brought ${ref} back` }[body.action];
const toolName = { jira: 'Jira', github: 'GitHub', slack: 'Slack', email: 'Gmail' }[source];

return [
  {
    json: {
      ...body,
      source,
      tool: toolName,
      call: plans[source][body.action],
      notify: body.action === 'assign' && person ? { slackUser: person.slack_id, text: `Neha assigned you ${ref}: ${body.title || ''}` } : null,
      summary: verb,
    },
  },
];
