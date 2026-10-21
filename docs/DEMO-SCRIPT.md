# WorkRadar demo script (about 5 minutes)

The video should cover five things: problem understanding, product decisions, the live app, the AI workflow, and future improvements. Each scene below lists what to show and what to say. The voiceover is written to be read aloud at a relaxed pace.

## Before recording

- Open the live app, https://work-radar-ten.vercel.app, at 1440 × 900, browser zoom 100%, light theme.
- Go to **Settings → Reset demo data → Reset** so every count matches this script.
- Check the brief on Today says **Gemini**. If you open the page more than 30 minutes before recording, click **Regenerate** once so the brief is fresh.
- Have these ready in tabs: the PRD PDF (page 1), the Figma file, `api/_prompt.ts` on GitHub, and the AI Workflow PDF (page 2).

---

## 1. The problem · 0:00–0:35

**Show:** the PRD, page 1. Scroll slowly past the problem statement and the persona card.

> Every morning, an engineering manager at Airtribe rebuilds the state of their team from four tools: Slack, Jira, GitHub and email. That's around 250 updates a day. Maybe a dozen of them actually need the manager. A P0 bug blocking tonight's live class, a designer blocked for two days, a launch go/no-go waiting on a reply. They're buried in FYIs and bot noise, and every tool marks priority differently.
>
> Meet Neha, an engineering manager on the Learning Platform team. She told us: "By the time I've read everything, the day has picked my priorities for me." WorkRadar gives her one trustworthy answer to "what needs me today?", in minutes instead of an hour.

## 2. Product decisions · 0:35–1:05

**Show:** the Today page. Hover over the radar, then over the brief's engine label.

> Three decisions shaped the product.
> First, the ranking is not a black box. Every item gets a 0 to 100 score from six signals you can see and adjust.
> Second, AI does what it's good at, which is language. Gemini turns the ranking into a brief a manager can act on. It doesn't decide the order.
> Third, it never comes up empty. If Gemini fails, you get an on-device summary of the same data and a plain note saying why. The label always tells you which one wrote the brief.

## 3. Live app · 1:05–2:55

**Today (1:05)**: point at the greeting, the radar, the brief and *Who's blocked*.

> This is Neha's Tuesday. The headline counts what needs her, what's waiting on her reply and who's blocked. The radar puts every open item on a scope: closer to the centre means more urgent, amber is waiting on her, red is blocked. The brief gives her the top three things to do and what happened since yesterday.

**Item detail (1:25)**: click **#incidents · Learners on iPhone can't join live sessions**. Scroll to *Why it's on your radar*.

> Opening the top item, I get the AI summary, the suggested next step, the Slack thread itself, and the reason it scores 97: the live class starts in five hours, 320 learners are affected, and it's a P0, so it's pinned to the top.

**Assign with AI suggestion (1:45)**: go back, open **LP-512 Payment webhook retries**, click **Assign**. The menu suggests Arjun. Pick him, then point at the **Undo** toast.

> LP-512 has no owner and gates today's launch decision. WorkRadar suggests Arjun, because he owns the payment gateway and has the lightest load. One click, and every action can be undone.

**Priority feed (2:05)**: open **Priority feed**. Press `j` twice, then `s` and pick **Tomorrow**, then `e` to mark the next item done.

> The priority feed has everything, grouped into "needs attention now", "worth a look today" and "can wait". It's built for the keyboard: j and k to move, e to finish, s to snooze.

**Search and ⌘K (2:20)**: open **Search** and type `blocked prs waiting on me`. Then press `⌘K` and type `launch`.

> Search understands plain language. "Blocked PRs waiting on me" turns into filters I can remove. Command-K jumps to anything from anywhere.

**Team and states (2:35)**: open **Team**. Then go to **Settings → Sources**, click **Simulate outage** on Jira, and return to Today to show the banner. Click **Restore** afterwards. Toggle dark mode, and optionally show a phone-width window.

> The Team view shows who's blocked and who needs me first. If a source goes down, WorkRadar says so and ranks with what's left. It works in dark mode and on a phone.

## 4. The AI workflow · 2:55–4:05

**Show:** the AI Workflow PDF, page 2: the diagram *Where AI runs inside the product*.

> Here's how the brief is made. The app ranks everything first, with plain code. Then it sends a small snapshot to one serverless route on Vercel: the top 24 items, who's blocked and the last 24 hours. The route calls Gemini, and the API key never leaves the server.

**Show:** `api/_prompt.ts` on GitHub, scrolling slowly through the rules and the schema.

> The prompt is strict. Use only facts from the snapshot, and cite the exact ID of every item. The answer has to match a JSON schema, and WorkRadar checks it: if Gemini mentions an item that doesn't exist, it's dropped. So a hallucination is caught automatically instead of reaching the screen.

**Show:** back on Today, click **Regenerate** and let the brief reload. It takes about 2 seconds.

> One decision came from measuring rather than guessing. The bigger Gemini Flash model took over 35 seconds on the live site. Flash-Lite does the same job in about 2, so it's the default and Flash is the backup.

**Show:** the Figma file, then the AI Workflow PDF, page 3: *What AI generated, and what changed after review*.

> I built the whole product with Claude as my AI partner, from the PRD to the code to the deployment. Even the Figma file was generated from the running app, so the design and the product never drift. The AI Workflow document lists the prompts, what AI generated, what I changed after review, and the trade-offs.

## 5. Success metrics and what's next · 4:05–4:45

**Show:** the PRD, page 2: the metrics table, then *Nice-to-have*.

> Success means time to clarity under five minutes, from opening WorkRadar to acting on a top-three item. Blockers should clear 30 percent faster. Guardrails are zero missed P0 escalations and fewer than 2 percent AI factual errors.
> Next, I'd add write-back into Jira, GitHub and Slack, AI-drafted replies for things waiting on the manager, weights that learn from what managers actually do, and an evaluation set that checks every brief for faithfulness.

## 6. Close · 4:45–5:00

**Show:** the Today page.

> WorkRadar: one AI-ranked view of your team's work, so managers spend the morning acting, not searching. Thanks for watching.

---

### Recording tips

- Record each scene separately and trim. A 5-minute video is easier with 6 short takes.
- Keep the cursor still while talking, and move it only to click.
- Loom works well: record the screen plus a small camera bubble, then share the link. To submit an MP4, Loom can download one, or use QuickTime (Mac: **File → New Screen Recording**) or the Xbox Game Bar (Windows: **Win + Alt + R**).
