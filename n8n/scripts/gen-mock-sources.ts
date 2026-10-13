/**
 * Generates raw, API-shaped payloads for Slack, Jira, GitHub and Gmail from the
 * app's mock dataset. The n8n "Source ingestion" workflow fetches these files and
 * normalises them back into WorkItems, exactly as it would with the real APIs.
 *
 * Run: npx esbuild n8n/scripts/gen-mock-sources.ts --bundle --platform=node --format=esm --outfile=/tmp/gen.mjs && node /tmp/gen.mjs
 * Times are stored as minutes relative to "now" so the demo never goes stale.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildItems } from '../../src/data/items';
import { PEOPLE } from '../../src/data/people';
import type { WorkItem } from '../../src/lib/types';

const NOW = Date.UTC(2026, 9, 13, 6, 0, 0);
const items = buildItems(NOW);
const rel = (iso?: string) => (iso ? Math.round((new Date(iso).getTime() - NOW) / 60_000) : null);
const ago = (iso?: string) => (iso ? -rel(iso)! : null);
const who = (id?: string) => {
  const p = PEOPLE.find((x) => x.id === id);
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    email: p.email ?? `${p.id}@airtribe.example`,
    slack_id: `U${p.id.toUpperCase()}`,
    github_login: p.id === 'dependabot' ? 'dependabot[bot]' : p.id === 'ci' ? 'airtribe-release-bot' : `${p.id}-airtribe`,
  };
};

const JIRA_STATUS: Record<string, string> = { open: 'To Do', in_progress: 'In Progress', in_review: 'In Review', blocked: 'Blocked', done: 'Done' };

// ───────── Slack: conversations.replies-style threads ─────────
const slack = {
  ok: true,
  team: 'airtribe',
  threads: items
    .filter((i) => i.source === 'slack' && i.detail.kind === 'thread')
    .map((i) => {
      const d = i.detail as Extract<WorkItem['detail'], { kind: 'thread' }>;
      const isDm = d.channel === 'Direct message';
      return {
        channel: { id: `C${i.id.replace(/\D/g, '')}`, name: isDm ? null : d.channel.replace('#', ''), is_im: isDm },
        thread_ts_minutes_ago: ago(d.messages[0]?.at),
        permalink: i.url,
        messages: d.messages.map((m) => ({ user: who(m.by), text: m.text, minutes_ago: ago(m.at), reactions: (m.reactions ?? []).map((r) => ({ name: r.split(' ')[0], count: Number(r.split(' ')[1] ?? 1) })) })),
        // Metadata a real workspace would hold in a tracker; used only to rebuild the demo faithfully.
        workradar: { item_id: i.id, project: i.project, assignee: i.assignee ?? null, title: i.title, done_minutes_ago: ago(i.doneAt), due_minutes_from_now: rel(i.dueAt), due_label: i.dueLabel ?? null },
      };
    }),
};

// ───────── Jira: /rest/api/3/search-style issues ─────────
const jira = {
  total: 0,
  issues: items
    .filter((i) => i.source === 'jira' && i.detail.kind === 'ticket')
    .map((i) => {
      const d = i.detail as Extract<WorkItem['detail'], { kind: 'ticket' }>;
      const blocker = i.blockedBy?.kind === 'item' ? items.find((x) => x.id === i.blockedBy!.ref) : undefined;
      return {
        key: i.ref,
        self: i.url,
        fields: {
          summary: i.title,
          description: d.description,
          issuetype: { name: d.type },
          priority: i.priority ? { name: i.priority } : null,
          status: { name: JIRA_STATUS[i.status] },
          assignee: who(i.assignee),
          reporter: who(i.author),
          labels: i.labels,
          created_minutes_ago: ago(i.createdAt),
          updated_minutes_ago: ago(i.updatedAt),
          resolved_minutes_ago: ago(i.doneAt),
          duedate_minutes_from_now: rel(i.dueAt),
          due_label: i.dueLabel ?? null,
          sprint: d.sprint ?? null,
          story_points: d.points ?? null,
          progress_percent: d.progress ?? null,
          issuelinks: blocker ? [{ type: { name: 'Blocks', inward: 'is blocked by' }, inwardIssue: { key: blocker.ref, workradar_item_id: blocker.id }, reason: i.blockedBy!.reason, since_minutes_ago: ago(i.blockedBy!.since) }] : [],
          comment: { comments: d.comments.map((c) => ({ author: who(c.by), body: c.text, minutes_ago: ago(c.at) })) },
          workradar: { item_id: i.id, project: i.project, learners: i.signals.learners ?? 0, revenue: !!i.signals.revenue, escalation: !!i.signals.escalation, snoozed_minutes_from_now: rel(i.snoozedUntil) },
        },
      };
    }),
};
jira.total = jira.issues.length;

// ───────── GitHub: pulls / issues ─────────
const github = {
  items: items
    .filter((i) => i.source === 'github')
    .map((i) => {
      const d = i.detail;
      const base = { title: i.title, html_url: i.url, user: who(i.author), assignee: who(i.assignee), created_minutes_ago: ago(i.createdAt), updated_minutes_ago: ago(i.updatedAt), closed_minutes_ago: ago(i.doneAt), labels: i.labels.map((name) => ({ name })), ref_label: i.ref, workradar: { item_id: i.id, project: i.project, learners: i.signals.learners ?? 0, due_minutes_from_now: rel(i.dueAt), due_label: i.dueLabel ?? null, blocked_by: i.blockedBy ? { item_id: i.blockedBy.ref, reason: i.blockedBy.reason, since_minutes_ago: ago(i.blockedBy.since) } : null } };
      if (d.kind === 'pr')
        return {
          ...base,
          type: 'pull_request',
          repository: d.repo,
          number: d.number,
          body: d.description,
          state: d.merged ? 'closed' : 'open',
          merged: !!d.merged,
          draft: !!d.draft,
          head: { ref: d.branch },
          base: { ref: d.base },
          additions: d.additions,
          deletions: d.deletions,
          changed_files: d.files,
          requested_reviewers: d.reviewers.filter((r) => r.state === 'requested').map((r) => who(r.id)),
          reviews: d.reviewers.filter((r) => r.state !== 'requested').map((r) => ({ user: who(r.id), state: r.state === 'approved' ? 'APPROVED' : r.state === 'changes' ? 'CHANGES_REQUESTED' : 'COMMENTED' })),
          check_runs: d.checks.map((c) => ({ name: c.name, conclusion: c.state === 'passing' ? 'success' : c.state === 'failing' ? 'failure' : null, status: c.state === 'pending' ? 'in_progress' : 'completed' })),
          comments: d.comments.map((c) => ({ user: who(c.by), body: c.text, minutes_ago: ago(c.at) })),
        };
      const issue = d as Extract<WorkItem['detail'], { kind: 'issue' }>;
      return { ...base, type: i.ref.startsWith('Release') ? 'release' : i.author === 'dependabot' ? 'security_alert' : 'issue', repository: issue.repo, number: issue.number, body: issue.description, state: i.status === 'done' ? 'closed' : 'open', comments: issue.comments.map((c) => ({ user: who(c.by), body: c.text, minutes_ago: ago(c.at) })) };
    }),
};

// ───────── Gmail: users.messages.get (format=full, decoded) ─────────
const gmail = {
  messages: items
    .filter((i) => i.source === 'email' && i.detail.kind === 'email')
    .map((i) => {
      const d = i.detail as Extract<WorkItem['detail'], { kind: 'email' }>;
      return {
        id: `msg-${i.id}`,
        threadId: `thr-${i.id}`,
        labelIds: ['INBOX', ...(i.signals.waitingOnMe ? ['IMPORTANT'] : []), ...(d.to.some((t) => t.startsWith('everyone')) ? ['CATEGORY_UPDATES'] : ['CATEGORY_PRIMARY'])],
        snippet: d.body.slice(1, 2).join(' ').slice(0, 140),
        internal_minutes_ago: ago(i.createdAt),
        payload: {
          headers: [
            { name: 'From', value: `${d.from} <${d.fromEmail}>` },
            { name: 'To', value: d.to.join(', ') },
            { name: 'Subject', value: d.subject },
          ],
          body_text: d.body.join('\n\n'),
          attachments: d.attachments ?? [],
        },
        workradar: { item_id: i.id, project: i.project, assignee: i.assignee ?? null, title: i.title, done_minutes_ago: ago(i.doneAt), due_minutes_from_now: rel(i.dueAt), due_label: i.dueLabel ?? null },
      };
    }),
};

const roster = PEOPLE.map((p) => ({ ...who(p.id), role: p.role, external: !!p.external, skills: p.skills ?? [] }));

const dir = new URL('../mock-sources/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, data] of Object.entries({ slack, jira, github, gmail, roster })) {
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(data, null, 2) + '\n');
  console.log(name, JSON.stringify(data).length, 'bytes');
}
