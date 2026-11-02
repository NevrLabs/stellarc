# Scout — Competitors, 2026-10-30

Beat: **competitors**. Delta window: 2026-10-16 19:25 UTC → 2026-10-30 19:10 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, or repo metadata) on 2026-10-30. Context: Stellarc = self-hostable,
inert control plane (v2 charter) + BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`).
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

Two weeks, and the field converged on Stellarc's exact thesis from three sides.
**GitHub Universe '26 (Oct 28)** shipped the Copilot app with **Projects** — a
goal, attached context (repos, Figma, Slack threads, notes), N agents run in
the background, results come back as PRs — i.e. GitHub built an agent work
tracker; plus **Agent Merge** (watch-and-fix on PRs), **self-improving Copilot
Automations**, and **Agentic Workflows GA** (Markdown → Actions YAML, "Copilot
or bring your own coding agent"). **Cursor shipped an Agent SDK (GA, Oct 20)**:
agents as a folder of code (instructions/tools/skills/channels), event-driven
channels incl. PR/CI/Slack/cron, evals with tool-call assertions, and
`agent-sdk github replay` that replays a real PR as signed webhook payloads.
**Paseo v0.13 shipped connected hosts** — agents create, prompt and monitor
agents on *other machines*, visible in the Subagents track — a direct move onto
fleet-control-plane ground. Meanwhile **Multica shipped five releases**
(v0.6.4 → **v0.7.2 today**): workflow GA, a three-step rollout of **mid-turn
steering** (Cursor hooks → Kiro `_session/steer` → agents steering turns they're
allowed to start, MUL-8285), a runtime-honesty cluster (process exit = terminal,
fail fast on panic, stop resuming undrivable sessions), and one pricing-fix per
release. **Factory hit 1.0** (CLI + Desktop, Oct 29). Devin rebuilt its
transcript around an Activity stream where rows fold under the user message
they answer. Plane v1.4.3 is a tenant-isolation security release — the audit
checklist grew. OpenHands is on a six-release tear (→ v1.34.0). Huly woke from
its sleep (21 commits) with still no agent story.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **GitHub Copilot / Universe '26** | **Oct 28 wave.** **Copilot app → Projects (public preview)**: describe a goal, attach context (repos, design mocks, Slack threads, meeting notes), pick models/tools; Copilot runs as many agents as the work needs and returns results (PRs) for review; project automations for repeatable tasks; agent can work with desktop apps. **Agent Merge**: "Watch and fix" in the PR merge box — Copilot fixes failing Actions workflows and merge conflicts in a cloud dev env, combinable with auto-merge, enableable by default. **Copilot Automations**: shared team workflows, new tools/triggers/cost controls, and **self-improvement** — automations learn from outcome signals (labels humans changed, comments accepted, PRs merged) and propose prompt edits, each pending human review; a self-improving automation is a *group* (review automation + weekly improvement automation). **Agentic Workflows GA**: natural-language Markdown compiled to standard Actions YAML, reusing existing runner groups + policy constraints; "Copilot or bring your own coding agent". **Copilot Fusion**: route/orchestrate models (enterprise); local-model selection. Also: Enterprise now includes Copilot, Copilot SDK → Microsoft Copilot SDK, Issue artifacts (preview), Moderate role for Issues GA, Copilot server-to-server auth (Oct 27), assisted permissions GA (Oct 26), Replica (open-source AI prototyping tool). | changelog 2026-10-28 | proprietary | 5 | **WATCH (steal patterns)** | The tracker is now a GitHub feature. Copilot Projects is the same shape as our task→agent-runs surface (goal + context + multi-agent + reviewable artifacts) — the charter's "inert control plane, BYO agent" needs a positioning answer, and the answer is not to out-GitHub GitHub: it's multi-vendor (Hermes/Codex/Cursor/Claude/…), self-hostable, and honest about harnesses GitHub doesn't own. Steal: **Agent Merge's watch-and-fix = a wakeup condition** ("wake when linked PR goes red / conflicts"), and **self-improvement's outcome signals** = our runs already record the raw material (did the human edit what the agent produced?). |
| **Cursor** | **Agent SDK GA (Oct 20)**: an agent is a folder — `instructions.md`, `tools/` (one typed action per file), `skills/`, `mcp-connections/`, `channels/`. Channels wake on PR/comment/CI events (GitHub, GitLab, Bitbucket), Slack mentions/DMs, webhooks, cron; **GitHub events pull through the user's Cursor account, so no public webhook URL is exposed**. Evals assert on which tools ran with what input; `agent-sdk github replay <pr-url>` replays a real PR as signed webhook payloads (`--dry-run --fixtures-dir` saves fixtures). `agent-sdk deploy` hosts on Cursor infra with a dashboard for secrets/integrations. Templates: security reviewer, owners-policy approver, PR autofixer, Linear/Jira triager. Oct 16: **cloud agents build interactive canvases**; **Environments API (beta)** to programmatically manage cloud envs; 300 repos/env, large envs load 5× faster. | changelog 2026-10-20 | proprietary | 5 | **WATCH** | The SDK formalizes agents-as-code — same direction as our ADR 0011 adapter seam, but event-first: the unit of deployment is a *channel listener*, not a session. The no-public-webhook GitHub ingest (poll via account) is the exact pattern for our node's repo triggers without exposing endpoints. Replay-as-fixtures is the eval idea our ACP fakes (`fake-acp-agent`) half-address — a recorded-PR→replay harness would make runner changes testable against real event shapes. |
| **Paseo** | **v0.13.0 (10-24), v0.13.1/.2 (10-26), v0.14.0 (10-29).** v0.13 headline: **connected hosts** — `paseo host add <addr\|ssh://\|relay://>`, then agents create, prompt and monitor agents on other machines, shown in the Subagents track; relay connections now require the daemon password. Also: "All changes" pane (committed + uncommitted since branch base in one diff), paste images/files into terminals so agent TUIs read them (incl. remote hosts), Claude plan approvals carry Auto mode. Laws: **agents showing running after daemon restart** (#7573), **`notifyOnFinish` children silent after daemon restart** (#7683), agent report + finish notification reach the parent **as one message** (#7561), archived agents reappearing in MCP `list_agents` (#7532), detached `notifyOnFinish` agents never notifying (#7528). v0.14: **plugins add tools to specific agents** (#7938) and **attach MCP servers when a session opens** (#7983); **completed turns collapse into summaries, expandable** (#7785 et al.); **idle runtimes released after one hour, saved session resumed on next prompt** (#7782); large ACP terminal output no longer blocks daemon requests (#7953); late tool updates no longer duplicate rows during overlapping turns (#8010); local speech models; voice opt-in. | v0.14.0 2026-10-29 (0.12.0-beta.1 → 0.14.0 in 13 days) | Apache-2.0 + third-party carve-out (GitHub NOASSERTION), 22,527★ | 4 | **TRIAL (elevated)** | The closest shipping competitor to the fleet thesis: daemon + remote hosts + agent-driven delegation across machines, with ACP underneath (same protocol as us). Two laws to steal: (1) **idle runtime reclamation** — release harness processes after an idle window, resume from the saved session on the next prompt; our orbit holder should do exactly this. (2) **restart honesty** — on daemon boot, running-marked sessions whose process is gone must resolve terminal, and detached children must still deliver their finish notification. Also: turn-collapse is the transcript compression pattern (see P2). |
| **Multica** | **Five releases: v0.6.4 (10-20), v0.6.5 (10-21), v0.7.0 (10-23), v0.7.1 (10-27), v0.7.2 (10-30 09:48Z).** **Workflow GA** (0.7.0 title; enabled for all users MUL-8249). **Steering in three steps**: live-run steering via Cursor hooks (MUL-8070), steer running Kiro turns via `_session/steer` (MUL-8126), **let agents steer running turns they could start** (MUL-8285 — permission-scoped agent→agent steering). **Runtime honesty**: process exit = terminal signal on OpenCode 2.x (MUL-8186), fail fast on Kiro panic + stop resuming undrivable sessions (MUL-8188), drive OpenCode over ACP so long tools/subagents aren't force-stopped (MUL-8307), recover stalled HTTP/2 connections (MUL-8256), handle Claude Code session/weekly limits (MUL-8346), Hermes compat with gateway-backed and older ACP (MUL-8347), **fix OpenCode resume after host clock rollback** (MUL-8174). **Security**: task-tokens rejected cross-workspace (MUL-8138), machine credentials can't mint long-lived tokens (MUL-8154), private chat content pinned to session owner on realtime + REST (MUL-8374), owner-based workflow edit/delete (MUL-8120), share runtimes with specific members (MUL-8185). **Wakeups**: `--until-pr conflicts` (MUL-8135), `blocked` accepted in `--until-issue-state` (MUL-8094). **Run-log UI**: compact sidebar execution log (MUL-8350), full log from the run row (MUL-8335), Jump-to-latest that hides once you scroll (MUL-8324), context-aware command bar with agent handoff (MUL-8340), historical run transcripts on mobile (MUL-8308), sweeper comments a terminal failure on the issue (MUL-7847). New runtimes: **Qoder Cloud Agent** (managed cloud), **Meta Muse Code** (MSP), **host-local Devin CLI over ACP** (MUL-6623). Pricing: Gemini completion (MUL-7833), Bedrock Anthropic ids + DeepSeek-V4.1-Flash (MUL-8269), GPT-6.1 Terra (v0.7.2), codex default-model attribution. | v0.7.2 2026-10-30 | proprietary | 5 | **WATCH (steal P1 pattern)** | The run-log cluster (compact log, open-from-row, jump-to-latest) is the transcript-density playbook for our UI, and `--until-pr conflicts` previews the wakeup our PR-linkage proposal (P1) enables. Their honesty cluster matches laws we already hold (`runner.ts` treats harness exit as terminal at `apps/stellarc-node/src/runner.ts:273-286`) — but two are ahead of us: **clock-rollback resume** (an event-sourced plane with timestamps must tolerate the host clock going backwards) and **permission-scoped steering** (who may inject a mid-turn message — a doctrine question for ADR 0011). Note **Devin CLI speaks ACP now**: a first-class agent we can adopt with zero adapter work. |
| **Factory (Droids)** | **CLI v1.0.0 + Desktop v1.0.0 (10-29)** — 1.0. Doctor self-launch check (verifies Droid can start itself, warns on slow startup); multi-line answers; turn prep fast with many custom models. Across v0.245→v0.250: **PR state on sessions** (draft/open/merged/closed badge, v0.250), long sent messages collapse behind Show more (v0.250), **usage totals count every billed attempt including retried or refused ones** (v0.247), orgs that disable session-content sync can allow **title-only storage** (v0.248), one planning-status row with an action count instead of a row per guessed call (v0.246), credits not tokens in usage notices (v0.246), marketplace plugin picker for admins (v0.251), background sessions no longer redraw the open session (v0.251), personal GitLab self-hosted accounts (v0.245.1). | CLI/Desktop v1.0.0 2026-10-29 | proprietary | 5 | **WATCH** | 1.0 with cadence intact — the most disciplined release train in the field. Three transferable laws: **count refused/retried attempts in usage** (our `agent_task_usage` COALESCE-merge should check it doesn't silently drop failed attempts); **title-only mode when content sync is off** (a privacy tier our self-host story will eventually need); **planning status as an aggregate**, not per-guessed-call rows (our transcript view will hit the same noise problem). PR-state-on-sessions is P1's direct validation. |
| **Linear** | **Oct 22: Loops grow up.** Slack and GitHub events can trigger loops (answer product questions in Slack; draft a QA plan when a PR gets "ready for testing"); **loop templates** shareable in-workspace; **reasoning levels per loop** (Auto/Low/Medium/High — speed/cost vs depth). **Figma MCP server** — Linear Agent reads and updates Figma designs. **Cursor Origin sync** — "Fixes PROD-120" in a Cursor Origin PR moves the Linear issue. Diffs: Resolve-conflicts button opens a draft in agent chat from the PR header. Fixes: OAuth client-credentials no longer grant public teams outside selected teams; sub-issues created via MCP/Agent inherit parent project correctly. | changelog top 2026-10-22 | proprietary | 5 | **WATCH** | Loops + reasoning levels is the automation-cost-controls pattern (same wave as Copilot Automations' cost controls): when we get scheduled/triggered runs, per-trigger reasoning tiers are the dial that keeps them cheap. Their MCP-sub-issue inheritance bug is our caution: agent-written records must inherit the same defaults human writes get. |
| **Devin (Cognition)** | **Oct 23 / 26 / 28.** Oct 26 is the structural one: **Progress + Shell tabs merge into one Activity stream** — everything Devin did in one searchable, type-filterable view with a pinnable details drawer; **rows fold under the user message they respond to**; shell cards list the files they edited. **HTML artifacts (reports, dashboards, charts) render on a component kit matching the app's design system and embed inline in messages**. Blocked prompts show a card explaining why. PR hovercards work even with no owning session; session header carries a PR chip colored by state. Oct 28: Progress tab = live task-list drawer; clicking a task filters the Activity stream to that task's work. Oct 23: default agent mode; GitHub issue assignment triggers + `@Devin`-prefix filters; auto-review from a PR card ("Review PR" → all my PRs → (admin) every PR in the repo). | release notes 2026-10-28 | proprietary | 5 | **WATCH** | The Activity-stream redesign is the best transcript-IA reference in the field right now: one stream, fold-to-prompt, task-scoped filtering, shell cards that name touched files. That's the shape our transcript schema v2 should be indexed for (message → owning prompt → task). Their inline artifacts on a design-system kit validate rendering agent-built HTML inside the app without escaping the visual language. |
| **OpenHands** | **Six releases in the window (v1.28.0 → v1.34.0, 10-27)** after v1.27.1 (10-12). v1.34: **per-conversation Docker runtime + Settings → Runtime page**, DigitalOcean verify stand-in for Managed Agents, new conversation in the row's sandbox. Security/hygiene: untrusted markdown can't set `rel="opener"`/arbitrary targets; session API key passed via env, not argv; automation KV secret pinned across key rotation; ACP tool calls without titles no longer leak raw i18n templates; skills keyed by source so same-name entries stay distinct. agent-server minimum 1.57.0. A refactor crew moved all magic numbers into named CSS recipes. | v1.34.0 2026-10-27 | MIT, 92,273★ | 4 | **WATCH** | Per-conversation Docker runtime is the isolation answer we get from orbit's process model — their move is a signal the market expects runtime-per-session isolation knobs. `rel="opener"` markdown hardening and env-not-argv key passing belong on our UI/API audit list; both are one-line classes of bug that leak trust. |
| **Plane** | **v1.4.3 (10-28) — tenant-isolation security release**, self-host upgrade advised. Membership required to publish a project; comments/reactions/votes/intake bound to the board's own project+workspace; sub-work-items endpoint scoped to the project in the URL; draft→work-item conversion owner-only; invitation acceptance can't reactivate an old membership elsewhere; **rate-limited email/password sign-in**; **webhook signing secret returned only at create/regenerate, never on list/retrieve/update**; `order_by` allowlist; bundled MinIO replaced by `pgsty/silo` pinned; airgapped restore hardened with rollback. | v1.4.3 2026-10-28 | AGPL-3.0, 61,743★ | 4 | **TRIAL** | The audit checklist grew past last pass's pair into a full tenant-isolation suite. The two newest laws for our API surface when auth lands: **secrets surface only at creation/regeneration** (never on read paths) and **rate-limit the credential endpoint**. Every URL-named org/project id still needs a membership check at the handler (their whole release is that class). |
| **Huly** | Woke from its quarterly slumber: 21 commits since 10-16 (pushed 10-29) — text-editor table rows / emoji shortcodes / RTL `dir="auto"`, screen-share presence, Elasticsearch TLS options, issue-status selector grouped by category, API-token sign-in for import. Still zero agent-native story. | main 2026-10-29 | EPL-2.0, 28,022★ | 3 | **REJECT (cadence corrected)** | Row correction: last pass parked it until Jan 2027 on "no commits"; the repo is active again but the content is classic tracker polish — no agent surface, no runtime story. Verdict unchanged for our purposes. |

## Proposals

### P1 — Link sessions to pull requests, surface state on the run row (ADOPT)

Four independent vendors shipped the same thing this window: Factory put PR
state (draft/open/merged/closed) on sessions (v0.250), Devin colored session
PR-chips by state and listed referenced PRs in the session header (Oct 26),
Linear synced issue state from Cursor Origin PR titles ("Fixes PROD-120"),
and GitHub's Agent Merge built a whole watch-and-fix loop on PR-state
transitions. Session↔PR linkage is now table stakes for an agent control plane.

Stellarc has none: `grep pullRequest packages/contracts/src apps/stellarc-api/src`
returns zero hits. The plane already records everything needed to carry the
link in the event log — this is a contracts + view + one UI chip change, not
new machinery.

Brief shape: an `agent_task_pull_request` link (repo, number, head sha, state,
url), recorded as an event when the node observes the PR (push notifications
via existing `pushes.ts` ingest), projected into the task/session view, and
rendered as a state-colored chip on the run row + session header. No polling
in v1 — observe what arrives, render what's known. This is also the substrate
an Agent-Merge-style "wake when the linked PR goes red" wakeup would stand on
later (Multica shipped exactly that condition this window, MUL-8135).

### P2 — Transcript turn compression (TRIAL)

Three vendors converged on the same transcript-density moves: Paseo collapses
completed turns into expandable summaries (#7785/#7990/#8026), Factory clips
long sent messages behind Show more (v0.250), and Devin folds every row under
the user message it responds to, with task-scoped filtering of the Activity
stream (Oct 26/28). Our transcript surface will drown at exactly the point
they all hit. Pure UI work on the existing message view — no schema change
needed for fold-to-prompt; turn summaries can start client-side.

### P3 — Two runtime-honesty laws we don't yet hold (TRIAL)

1. **Idle runtime reclamation** (Paseo #7782): release eligible harness
   processes after an idle window; resume the saved session on the next
   prompt. Orbit holds ACP children indefinitely today; an idle-release
   policy with resume-on-demand is the resource law for a long-lived fleet.
2. **Clock-rollback tolerance** (Multica MUL-8174): their OpenCode resume
   broke when the host clock rolled back. We are an event-sourced plane that
   orders and timestamps with the host clock — resume/replay paths must be
   monotonic-clock-safe or a rollback corrupts session continuation.

## Notable non-findings

- Stellarc itself: PR #118 (NEVR-243 cost/token UI) still OPEN and MERGEABLE
  on dev — re-verified this run; the row stays as-is on the radar.
- No public movement on ACP spec steering (the spec surface Multica's Kiro
  `_session/steer` implies is vendor-side); our pinned 1.7.0 line unchanged.
- Web search/extract provider still down (`9router` unregistered — **ninth**
  consecutive run); GitHub API + direct curl carried the beat again.
- OpenHands release-train detail (v1.28–1.33) sampled at feature-headline
  level; nothing agent-protocol-shaped beyond v1.34's runtime work surfaced.

## Sources

- GitHub Universe '26 wave (Oct 28): github.blog/changelog — Copilot app Projects, Agent Merge, Automations self-improve, Agentic Workflows GA, Fusion; detail posts fetched 2026-10-30 (slugs `2026-10-28-github-copilot-app-universe-releases`, `2026-10-28-agent-merge-watches-and-fixes-pull-requests-in-the-cloud`, `2026-10-28-copilot-automations-now-learn-from-outcomes-and-self-improve`, `2026-10-28-github-agentic-workflows-generally-available`)
- Multica v0.6.4→v0.7.2 release bodies: api.github.com/repos/multica-ai/multica/releases (tags fetched 2026-10-30; v0.7.2 published 09:48Z)
- Paseo v0.13.0/v0.13.2/v0.14.0 release bodies + repo metadata: api.github.com/repos/getpaseo/paseo (fetched 2026-10-30; 22,527★, pushed 18:28Z)
- Factory feed (CLI/Desktop v1.0.0 10-29 top): docs.factory.com/docs/changelog/feed.json (fetched 2026-10-30)
- Linear changelog (top entry Oct 22): linear.app/changelog (fetched 2026-10-30)
- Cursor changelog (top Oct 20 Agent SDK, Oct 16 canvases): cursor.com/changelog (fetched 2026-10-30)
- Devin release notes (Oct 23/26/28): devin.ai/changelog (fetched 2026-10-30)
- OpenHands v1.28–v1.34 release bodies: api.github.com/repos/OpenHands/OpenHands/releases (fetched 2026-10-30; 92,273★)
- Plane v1.4.3 body: api.github.com/repos/makeplane/plane/releases/tags/v1.4.3 (published 10-28 19:36Z)
- Huly commits since 10-16 (21): api.github.com/repos/hcengineering/platform/commits (fetched 2026-10-30)
- Stellarc grounding: `apps/stellarc-node/src/runner.ts:273-286` (harness-exit terminal), `:519-523` (exit-vs-stdout-close attribution race), `packages/agents/src/store.ts:955` (lease reclaim); absence of PR linkage verified by grep (`pullRequest` → 0 hits in contracts/api); absence of steer/fold verified by grep
