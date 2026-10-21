# WorkRadar n8n workflows

Four workflows make n8n the automation and AI layer behind WorkRadar. They run on n8n Cloud or on the free, self-hosted Community Edition.

| File | Workflow | Trigger | What it does |
|---|---|---|---|
| `workflows/1-daily-digest-api.json` | Daily digest API | `POST /webhook/workradar/digest` | Takes the app's ranked snapshot, asks Gemini for the brief (top work, what happened, needs attention, who's blocked), validates the JSON, falls back to a rule-based brief if Gemini fails. |
| `workflows/2-source-ingestion.json` | Source ingestion & ranking | Every hour, manual, `GET /webhook/workradar/items` | Fetches Slack, Jira, GitHub and Gmail payloads, normalises them into one WorkItem schema, asks Gemini to triage unstructured threads, and ranks everything with the same score as the app. |
| `workflows/3-item-actions.json` | Item actions | `POST /webhook/workradar/action` | Receives Assign / Mark done / Snooze from the app, plans the matching Jira, GitHub, Slack or Gmail call, and confirms back. Demo mode by default. |
| `workflows/4-morning-brief.json` | Morning brief to Slack | Weekdays 8:45 IST, manual | Runs ingestion, gets the AI brief, formats it for Slack and posts it to an incoming webhook. |

## Cloud setup (n8n Cloud, recommended)

Nothing runs on your laptop. n8n Cloud gives every instance public HTTPS webhooks, so no tunnel is needed.

1. Start the free trial at [n8n.io](https://n8n.io): 14 days, 1,000 executions, no card. Your instance lives at `https://<name>.app.n8n.cloud`.
2. Create the credential **Google Gemini(PaLM) Api**, paste your Gemini key and name it `Gemini – WorkRadar`.
3. Import each workflow with **⋯ → Import from URL…**, using the raw GitHub URLs:
   `https://raw.githubusercontent.com/adityasingh535402-del/WorkRadar/main/n8n/workflows/1-daily-digest-api.json`, and likewise for `2-source-ingestion.json`, `3-item-actions.json` and `4-morning-brief.json`.
   Pick the credential in each **Gemini:** node (workflows 1 and 2), then **Publish**.
4. In workflow 4, set **Config → n8nBaseUrl** to your instance URL.
5. In the Vercel project, add `N8N_DIGEST_URL = https://<name>.app.n8n.cloud/webhook/workradar/digest` and `N8N_ACTION_URL = https://<name>.app.n8n.cloud/webhook/workradar/action`, then redeploy. The brief on the Today page now reads **Gemini via n8n**.

Execution budget: ingestion runs hourly (24 a day). Add the morning brief and normal app use, and you stay well inside the trial's 1,000 runs.

## Self-hosted alternative (Docker)

### 1. Start n8n

Docker Desktop must be running.

```bash
docker volume create n8n_data
docker run -it --rm --name n8n -p 5678:5678 -e GENERIC_TIMEZONE=Asia/Kolkata -e TZ=Asia/Kolkata -e N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true -e N8N_RUNNERS_ENABLED=true -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Or, from the repo root: `docker compose -f n8n/docker-compose.yml up -d`.

Open http://localhost:5678 and create the owner account.

### 2. Add the Gemini credential

1. Get a free API key at https://aistudio.google.com/apikey.
2. In n8n: **Overview → Create ▾ → Credential → "Google Gemini(PaLM) Api"**.
3. Leave Host as `https://generativelanguage.googleapis.com`, paste the key, name it `Gemini – WorkRadar`, save.

### 3. Import the workflows

For each file in `workflows/` (1 → 4):

1. **Overview → Create ▾ → Workflow**, then the **⋯** menu → **Import from File…** and pick the JSON.
2. Open each node named **Gemini: …** and select the `Gemini – WorkRadar` credential (workflows 1 and 2).
3. **Save**, then **Publish** (or toggle **Active**) so the Production webhook URLs work.

Test from the editor: open workflow 1 and click **Execute workflow**. With no request body it uses a built-in sample snapshot, so you can see a Gemini brief immediately.

### 4. Connect the WorkRadar app

The app runs in the browser, so it needs a public URL for your local n8n. A free Cloudflare quick tunnel works without an account:

```bash
cloudflared tunnel --url http://localhost:5678
```

Copy the `https://….trycloudflare.com` address, then in WorkRadar → **Settings → AI brief**:

- **n8n digest webhook**: `https://….trycloudflare.com/webhook/workradar/digest`, then click **Test**
- **n8n actions webhook**: `https://….trycloudflare.com/webhook/workradar/action`

Restart n8n with `-e WEBHOOK_URL=https://….trycloudflare.com/` if you want the editor to display the public Production URLs.

Alternatively, set `N8N_DIGEST_URL` and `N8N_ACTION_URL` in the Vercel project so the hosted app routes through n8n server-side.

## Optional: post the brief to Slack

Create a Slack incoming webhook (Slack → Apps → Incoming Webhooks), paste it into **Config → slackWebhookUrl** in workflow 4, and publish. Without it, the formatted message appears in the execution output.

## Going live with real tools

Demo mode reads API-shaped mock payloads from `mock-sources/` (generated from the app's dataset by `scripts/gen-mock-sources.ts`). To use your real workspace, replace the four fetch nodes in workflow 2 with native Slack, Jira, GitHub and Gmail nodes. Keep the field names the normaliser expects, or edit it. For actions, swap each **…: apply** node in workflow 3 for the native node and set `liveMode = true`.

## Development

- Code-node sources live in `src/`. The prompt is shared with the Vercel route in `api/_prompt.ts`.
- `node n8n/build.mjs` regenerates the workflow JSON.
- `node n8n/validate.mjs` checks node types and versions against n8n 2.x, then simulates every Code node end to end with the mock payloads. It runs in CI.
