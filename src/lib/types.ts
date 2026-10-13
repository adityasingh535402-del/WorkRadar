export type Source = 'slack' | 'jira' | 'github' | 'email';

export type Status = 'open' | 'in_progress' | 'in_review' | 'blocked' | 'done';

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface Person {
  id: string;
  name: string;
  role: string;
  /** Team members report to the manager; external people show up as authors only. */
  external?: boolean;
  /** Hue (0–360) for the avatar. */
  hue: number;
  skills?: string[];
  email?: string;
}

export interface Project {
  id: string;
  name: string;
  /** Short description shown in tooltips and the PRD. */
  about: string;
}

/** Times are stored as minutes relative to "now" in the mock data and resolved at load. */
export interface ThreadMessage {
  by: string;
  at: string;
  text: string;
  reactions?: string[];
}

export interface Check {
  name: string;
  state: 'passing' | 'failing' | 'pending';
}

export interface Reviewer {
  id: string;
  state: 'requested' | 'approved' | 'changes' | 'commented';
}

export type Detail =
  | { kind: 'thread'; channel: string; messages: ThreadMessage[] }
  | {
      kind: 'ticket';
      type: 'Bug' | 'Story' | 'Task' | 'Epic';
      sprint?: string;
      points?: number;
      description: string;
      comments: ThreadMessage[];
      progress?: number;
    }
  | {
      kind: 'pr';
      repo: string;
      number: number;
      branch: string;
      base: string;
      additions: number;
      deletions: number;
      files: number;
      checks: Check[];
      reviewers: Reviewer[];
      description: string;
      comments: ThreadMessage[];
      merged?: boolean;
      draft?: boolean;
    }
  | { kind: 'issue'; repo: string; number: number; description: string; comments: ThreadMessage[] }
  | {
      kind: 'email';
      from: string;
      fromEmail: string;
      to: string[];
      subject: string;
      body: string[];
      attachments?: string[];
    };

export interface BlockedBy {
  /** 'item' → another WorkItem id, 'person' → a Person id, 'external' → free text. */
  kind: 'item' | 'person' | 'external';
  ref: string;
  reason: string;
  since: string;
}

export interface Signals {
  learners?: number;
  waitingOnMe?: boolean;
  mentionsMe?: boolean;
  escalation?: boolean;
  negative?: boolean;
  revenue?: boolean;
}

export interface ActivityEvent {
  at: string;
  by: string;
  text: string;
}

export interface WorkItem {
  id: string;
  source: Source;
  /** Human-facing reference: LP-512, PR #1284, #incidents, an email sender. */
  ref: string;
  url: string;
  project: string;
  title: string;
  summary: string;
  status: Status;
  priority?: Priority;
  assignee?: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  dueAt?: string;
  dueLabel?: string;
  labels: string[];
  signals: Signals;
  blockedBy?: BlockedBy;
  related?: string[];
  nextStep?: string;
  detail: Detail;
  activity: ActivityEvent[];
  snoozedUntil?: string;
  doneAt?: string;
}

export interface Weights {
  urgency: number;
  impact: number;
  blocking: number;
  waiting: number;
  staleness: number;
  escalation: number;
}

export type FactorKey = keyof Weights;

export interface Factor {
  key: FactorKey;
  label: string;
  value: number; // 0..1
  weight: number;
  detail: string;
}

export interface Scored {
  item: WorkItem;
  score: number;
  ring: 'now' | 'today' | 'later';
  factors: Factor[];
  /** One-line explanation built from the strongest factors. */
  why: string;
}

export type Engine = 'n8n' | 'gemini' | 'local';

export interface Brief {
  generatedAt: string;
  engine: Engine;
  model?: string;
  headline: string;
  topWork: { itemId: string; why: string }[];
  happened: { text: string; itemId?: string; at?: string }[];
  attention: { itemId: string; why: string; action: string }[];
  blocked: { personId: string; itemId?: string; blockedOn: string; since?: string; suggestion: string }[];
}

export type AiMode = 'auto' | 'n8n' | 'local';

export interface Settings {
  weights: Weights;
  aiMode: AiMode;
  n8nDigestUrl: string;
  n8nActionUrl: string;
  theme: 'system' | 'light' | 'dark';
  outage: Source | null;
}

export interface Override {
  status?: Status;
  assignee?: string | null;
  snoozedUntil?: string | null;
  doneAt?: string | null;
  extraActivity?: ActivityEvent[];
}
