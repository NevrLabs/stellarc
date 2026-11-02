# Scout — Competitors, 2026-10-08

Beat: **competitors**. Window: roughly Mar–Oct 2026. Every claim below was
verified against the primary source (vendor changelog, GitHub release, or
repo metadata) on 2026-10-08. Context for verdicts: Stellarc = self-hostable,
Effect-v4 tracker (Kaneo parity waves, embedded sync engine ADR 0007) + BYO
agent runtime over ACP (ADR 0011), Tauri 2 shell, React UI frozen from the
Kaneo fork.

## The one-line read

Every tracker competitor converged on the same shape this quarter: **a named,
persistent workspace agent with trigger-based runs, a live run panel on the
work item, and a "needs input" pause state** (Linear Loops, Plane Agents,
Multica wakeups). Every coding-agent competitor converged on **agents-as-code
profiles + cross-device control of local agents** (Copilot `.github/agents/`,
Paseo profiles/heartbeat, Cursor iOS remote control). Stellarc's event log is
uniquely well-suited to the first pattern — triggers are just event-log
pattern matches — and ADR 0011 already gives the run surface for the second.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | Loops for PM (2026-09-14): recurring agent workflows triggered by project/cycle/issue changes, edit docs, post Slack, every run is a continuable Agent conversation. Coding sessions (2026-06-11 → 08-20): configurable envs, browser self-testing with before/after screenshots, transparent pricing (tokens at cost + $0.25/20min sandbox). Linear Agent launched 2026-03-24. MCP integrations live (Datadog fix in same notes). | changelog 2026-03→09 | proprietary | 5 | **WATCH** | Loops = the reference design for event-triggered agent runs on a tracker. Their "every loop run starts a conversation you can continue" maps 1:1 to Stellarc sessions. Their run-cost pricing split is the model for our run ledger. |
| **Plane** | Plane Agents GA (2026-09-30): plain-language agent definition (instructions, skills, triggers, memory, MCP tools), triggers = assigned/@mentioned/work-item created/updated/schedule, live run panel (thinking, tool calls, plan), "Needs input" pause, summary post on the work item, per-project scoping. AI Memory across conversations (2026-09-15). UI rebuilt on Propel design system (2026-09-30). v3.1.0: audit logs + AI Skills. | cloud releases Sep 2026; self-host v3.1.x | AGPL-3.0 (60.5k★, pushed 2026-10-08) | 4 | **TRIAL** | Plane Agents is the closest shipped analog to "Multica-grade agent UX on a self-hostable tracker" — and it's AGPL, so no code reuse, only pattern study. Their agent-definition schema (instructions/skills/triggers/memory/tools) is worth copying field-for-field into our design docs. |
| **Multica** | v0.6.0 (2026-09-28): conditional wakeups (status change, sub-issue done, PR moves), wakeup expiry + check history, reply-to-running-agent (add/queue/restart), deliverables sidebar with in-place previews (HTML/MD/CSV/JSON/YAML/Mermaid), run timeline on issue, auto-move issue when PRs merge. v0.6.1 (2026-10-01): cumulative run-cost curve per issue. Ship cadence ~2 releases/week since Mar 2026. | v0.6.1, 2026-10-01 | proprietary | 5 | **WATCH** | The direct UX benchmark for agent-native trackers (and our own runtime host). The per-issue cumulative cost curve and the "reply → add/queue/restart" triad are the two concrete things to copy once runs exist. |
| **Paseo** | Orchestration surfaces: subagents track (full sessions you can redirect, vs read-only provider timelines), agent profiles (per-provider settings + notes), agent-to-agent messaging by ID (`send_agent_prompt`, `paseo send`), cross-host remote daemon (`--host`), heartbeats (periodic re-prompt preserving conversation, with expiry), schedules. 20.1k★, pushed today. Docs are prompt-first: workflows shipped as copy-paste prompts. | repo 2026-10-08 (20.1k★) | Apache-2.0 (custom notice) | 4 | **TRIAL** | The closest open competitor to Stellarc's BYO-agent control plane. Their agent-to-agent by stable ID + heartbeat-with-expiry are features our event log gives cheaply. Their prompt-first docs are a distribution trick worth stealing. |
| **Cursor** | Remote control for local agents (2026-10-06): iOS app sees/replies to agents running on your own computer, pairing approval in desktop, agents never move. Projects (2026-09-10): coordinator agent plans + delegates to parallel subagents, persistent shared context files across cloud/local, Slack-watch/schedule/PR-follow triggers. Rollouts (2026-09-23): regression detection → suspects the change, can open revert PR. Self-hosted cloud-agent workers incl. computer use (2026-09-02). | changelog Aug–Oct 2026 | proprietary | 5 | **WATCH** | "Local agents, remote glass" is the exact right architecture for Stellarc nodes, and it validates BYO-agent over managed-cloud. Stellarc's web UI already is the remote glass; the missing piece is only pairing/relay. |
| **GitHub Copilot coding agent** | Custom agents as code under `.github/agents/` (org-shareable, e.g. "benchmark first, change, re-measure"), model picker per task, self-review + security scan before PR, cloud↔CLI handoff (press `&` in CLI to delegate to cloud; "Continue in CLI" pulls branch+logs+context). Weekly release train. | github.blog, Sep–Oct 2026 | proprietary | 5 | **ADOPT (pattern)** | Agents-as-code in the repo is now table stakes (Copilot + Paseo + Devin skills all landed it within months). Stellarc should make agent definitions a versioned file in the repo, not a DB-only settings form. |
| **OpenHands** | v1.25.0 (2026-10-06): agent profiles with persona/extra instructions + full tool-catalog picking, Model Router with "run at conversation start", automations dashboard (filter by creator, templates, native git integrations), Agent Canvas apps (update action, manifest icons), voice dictation. MIT, 90.3k★, releases every ~1-2 weeks. | v1.25.0, 2026-10-06 | MIT (90.3k★) | 4 | **WATCH** | The busiest open agent platform; their profile/router unbundling (which model, which persona, which tools = orthogonal axes) is the schema to beat for our agent definitions. MIT means patterns AND reference code are safely studyable. |
| **Devin (Cognition)** | Native agent inside Jira (2026-09-30): assign a work item to Devin → session runs, progress in Jira's agent panel. Notification inbox with per-type routing (2026-10-07). Session preview cards on sidebar hover (title, live last response, PRs). Preflight scripts for automations (validate/skip before agent starts). Devin fixes its own PRs' review findings before comments post. PWA install on desktop/mobile (2026-03-07). | release notes Sep–Oct 2026, Devin 2.2 Feb 2026 | proprietary | 5 | **WATCH** | "Tracker as the agent's host surface" (Devin-in-Jira) is the inverse of Stellarc's design — proof the demand exists. Their preflight-script gate on automations is a cheap, high-value guardrail for our trigger loops. Notification inbox + preview cards are the UX bar for a multi-agent sidebar. |
| **Factory (Droids)** | Cadence: 235 releases, CLI v0.234.0 + Desktop v0.191.0 on 2026-10-06; 2–3 ships/week. Recent: resume-with-message, Script waits with elapsed time, hooks that can block a message, MCP tools on first message, Droid Computers (sandboxed machines) provisioning fixes. | CLI v0.234.0, 2026-10-06 | proprietary | 4 | **REJECT** | Nothing structurally new for us — their edge is execution cadence and enterprise sandbox ops, not architecture. Rejected as a source, kept on radar only for Script-wait UX (visible pending/elapsed waits) which our run panel should copy trivially. |
| **Huly** | Blog/product-updates effectively dormant (last real product post Dec 2024, "Global Huly" blockchain pivot). Platform repo still active: v0.7.432, pushed 2026-10-07, 27.9k★, EPL-2.0. No agent-native story shipped. | v0.7.432, 2026-10-07 | EPL-2.0 (27.9k★) | 3 | **REJECT** | Not competing on the axis we care about. The blockchain detour and quiet blog say the team's focus is elsewhere. Check back quarterly at most. |

## Proposals

### P1 — Agent Loops on the event log (ADOPT-grade)

Steal Linear Loops + Plane Agents + Multica wakeups at once, and win on
substrate: every competitor builds triggers on top of mutable webhooks;
Stellarc has an append-only event log (ADR 0007) where a trigger is just a
durable pattern match, replayable and auditable by construction.

- **Trigger rules** as a first-class entity: match event types/payloads
  (ticket.status_changed, comment.created with @mention, schedule tick from
  the worker) → enqueue an agent run against that issue, under a named agent
  profile.
- **Run panel** on the ticket: live plan/tool-call/thinking feed (ACP already
  streams it), a "Needs input" pause state that posts a question comment and
  parks the run (Plane's exact state machine), and a summary comment on
  completion.
- **Preflight gate** per rule (Devin's pattern): a small script/condition that
  can veto the run before an agent spins up.
- Scope rules per project/board; every loop run is a continuable session
  (Linear's pattern), not a fire-and-forget job.

### P2 — Agents-as-code profiles (ADOPT-grade)

Copilot (`.github/agents/`), Paseo (agent profiles + notes), OpenHands
(persona × tools × model), Devin (skills-only repos install as plugins) all
landed the same thing: agent definitions as versioned files, shareable and
reviewable, with a UI picker on top. For Stellarc: a `.stellarc/agents/`
directory in each repo — instructions, tool allowlist, model/provider hint,
trigger rules (feeds P1) — discovered by stellarc-node, surfaced in the
assignee picker as agent principals (the principal model already exists in
the identity slice). Schema axes should follow OpenHands: persona, tools,
model are orthogonal.

### P3 — Run economics ledger (TRIAL)

Multica ships a cumulative cost curve per issue (v0.6.1); Linear moved coding
sessions to transparent at-cost pricing with spend limits (2026-08-20).
Stellarc's BYO stance means we don't bill, but operators still burn money.
Capture per-run token/cost at the stellarc-node ACP seam, store as events,
and render a cumulative curve in the issue sidebar + workspace rollup with
per-agent-principal breakdown. Cheap to add to the event schema now, expensive
to retrofit.

## Sources

- linear.app/changelog (2026-03-24 agent, 2026-06-11 coding sessions,
  2026-08-20 environments/browser/pricing, 2026-09-14 loops)
- plane.so/changelog (2026-09-15 AI memory, 2026-09-30 agents/Propel; v3.1.0)
- multica.ai/changelog (v0.6.0 2026-09-28, v0.6.1 2026-10-01)
- cursor.com/changelog (2026-09-02 self-hosted workers, 2026-09-10 Projects,
  2026-09-23 Rollouts, 2026-10-06 iOS remote control)
- github.blog — Copilot coding agent roundup (custom agents, CLI handoff) +
  weekly releases Sep–Oct 2026
- github.com/All-Hands-AI/OpenHands — v1.25.0 release notes 2026-10-06
- docs.devin.ai/release-notes (2026-09-30 Jira agent, 2026-10-05/07 UX),
  Devin 2.2 2026-02-24
- docs.factory.ai/changelog — CLI v0.234.0 / Desktop v0.191.0, 2026-10-06
- github.com/getpaseo/paseo — repo metadata 2026-10-08; public-docs/
  orchestration-workflows.md; LICENSE (Apache-2.0)
- github.com/hcengineering/platform — tags v0.7.432, pushed 2026-10-07;
  huly.io/blog/category/product-updates (dormant since Dec 2024)
