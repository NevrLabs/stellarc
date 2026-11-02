# Scout — Competitors, 2026-10-23

Beat: **competitors**. Delta window: 2026-10-16 ~19:25 UTC → 2026-10-23 19:20 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, npm registry, or vendor feed JSON) on 2026-10-23. Context: Stellarc =
self-hostable, inert control plane (v2 charter D4) + BYO agent runtime over ACP
(ADR 0011), Tauri 2 shell, React UI. `docs/steal-reject-matrix.md` and
`docs/v2-charter.md` are the standing filters.

## The one-line read

**The window's center of gravity is mid-run interaction and usage honesty.**
Multica shipped **three releases in seven days** (v0.6.4 10-20, v0.6.5 10-21,
**v0.7.0 today**) and built live-run steering twice — Cursor via hooks
(MUL-8070/#9322) and Kiro via `_session/steer` (MUL-8126/#9396) — plus a
`--until-pr conflicts` wakeup (MUL-8135), runtime sharing with specific members
(MUL-8185), and a security cluster (cross-workspace task tokens rejected
MUL-8138; machine credentials can no longer mint long-lived tokens #9421).
**Paseo made 0.12.0 stable** (steering of running turns by agent→agent messages
included) and already cut **0.13.0-beta.2** whose headline is **connected
hosts**: an agent delegates work to other machines (`ssh://`, `relay://`,
`ip:port`) and remote agents appear in the Subagents track. **Devin shipped
three releases** — Oncall GA (alert-triage agents over Slack/Teams/PagerDuty
with self-updating incident reports) is a new product category for the tracker
crowd. **Linear's Loops got Slack + GitHub triggers, shareable templates, and
per-loop reasoning levels** (Oct 22). **Cursor shipped Cloud Agent Canvases +
an Environments API beta** (Oct 16). **OpenHands cut six releases in four
days** around an "Agent Canvas" macOS app and per-profile agent settings.
**Factory's v0.247** fixed usage totals to count every billed attempt
*including retried and refused ones* — the exact honesty law our pending
cost/token UI brief needs. Plane packaged last pass's security fixes into
v1.4.3-rc2 (today); Huly's commits resumed but the agent story is still
absent.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **Three releases: v0.6.4 (10-20), v0.6.5 (10-21), v0.7.0 (10-23 09:58Z).** Steering ×2: **live-run steering via Cursor hooks** (MUL-8070/#9322) and **steer running Kiro turns via `_session/steer`** (MUL-8126/#9396). Wakeups: **wake on linked-PR merge conflicts `--until-pr conflicts`** (MUL-8135/#9406); `--until-pr` works against self-hosted VCS (MUL-7857); a rule's `last_error` clears once a pass commits (MUL-7879). Runtime fleet: **share runtimes with specific members** (MUL-8185/#9455); Qoder Cloud Agent as a managed cloud runtime (MUL-8045); Meta Muse Code as an MSP runtime (v0.6.4 MUL-8057). Runtime health laws: **fail fast on Kiro panic and stop resuming undrivable sessions** (#9458); OpenCode 2.x process exit = terminal (#9463); resume after host clock rollback (#9460); Hermes dependency reinstall surfaced at launch (#9434); Hermes reasoning options for non-default models (#9452). Security: **reject task-token requests targeting another workspace** (MUL-8138/#9422); **machine credentials blocked from minting long-lived tokens** (#9421); runtime ownership enforced on daemon routes (#9423); self-host workspace creation restricted to listed emails (MUL-8136). Issues UX: **resolved threads folded by default in the comment outline** (MUL-8074/#9325); header agent chip jumps to the run's block (MUL-8180); conversation starters moved to the agent profile (MUL-8151); hidden columns moved into Display, boards stay workflow-shaped (MUL-8160); create fields retained within a batch (MUL-7648); CLI comparison operators on `issue list --property` (MUL-7035). Workflows: owner-based edit/delete permissions (MUL-8120); default workflow statuses for issues outside a project (MUL-8121); sweeper failure posts a terminal comment on the issue (MUL-7847). Usage: Google Gemini pricing completed (v0.6.4 MUL-7833); codex default-model usage attribution (v0.6.5). Platform: Node 22.23.4 + Electron 39→44 (#9416); structured claim-decision outcomes recorded (#9184). | v0.7.0 2026-10-23 | proprietary | 5 | **WATCH → steal P1 (steer seam) + P2 (usage honesty)** | Two direct reads. (1) Multica had to build steering **per runtime** (Cursor hooks ≠ Kiro `_session/steer`); we get one chance to define the plane-level follow-up contract before we have N runtimes (proposal P1). (2) Their v0.7.0 security cluster (cross-workspace task tokens, machine-credential minting) extends Plane's checklist from last pass — both belong in our auth pass. The `--until-pr conflicts` wakeup is platform capability we inherit by running on Multica; nothing to build. Resolved-thread folding (MUL-8074) is cheap transcript hygiene worth stealing when the comment outline lands. |
| **Paseo** | **0.12.0 stable (10-19 07:07Z)** — everything from last pass's beta.1 plus: **agent→agent messages via CLI/MCP steer the running turn instead of interrupting it** (#5164, now stable); plugin ACP agents accept follow-ups without `Provider does not support prompt.steer` errors (#7270). **0.13.0-beta.1 (10-22) / beta.2 (10-23 13:27Z)**: **connected hosts** — `paseo host add ssh://… / relay://… / ip:port`, agents create, prompt and monitor agents on other machines, remote agents visible in the Subagents track (#7370/#7593); foldable-phone layouts (#7424); plugin file panels (a plugin owns a file type, e.g. PDF viewer) (#7411); plugin runtime translations (#7478); All-changes diff pane (committed + uncommitted since branch base in one diff, #7576); paste images into terminals incl. remote hosts (#3795). Fixed: agents showing as running after a daemon restart (#7573); parent agents never hearing from `notifyOnFinish` children after a daemon restart (#7683); large Claude sessions crashing the daemon on open/import (#7431/#7626). | 0.13.0-beta.2 2026-10-23 | Apache-2.0 + third-party carve-out (GitHub NOASSERTION; 21.8k★) | 4 | **TRIAL** | Three laws. (1) **Daemon-restart hygiene** (#7573/#7683): after our node restarts, no task may render "running" unless a live process backs it, and parent tasks must re-learn child outcomes — same class as Multica's "stop resuming undrivable sessions". (2) **Steer is stable product behavior for them** (#5164) — reinforces P1. (3) **Connected hosts = agent fleets spanning machines** — the first competitor shipping multi-machine delegation as a first-class UI concept. Not our v2 scope, but the remote-agent-in-the-subagents-track visualization is the shape our node fleet story eventually needs. |
| **Devin (Cognition)** | **Three releases (Oct 16 / 19 / 21).** Oct 19: **Devin Oncall GA** — responders watch Slack/Teams channels and PagerDuty incidents, triage alerts and bug reports, investigate using telemetry/code/runbooks, post likely root cause + next actions, join incident channels with a **self-updating incident report**, and ship recurring Oncall summaries; **work-log honesty**: the current step shows its real summary as soon as ready instead of "Deciding action", and status lines no longer narrate internal housekeeping; rules editor for Devin Review. Oct 21: received-feedback rows deep-link to the PR comment; "Quote in chat" on review findings (Cmd+I); Devin Review on Bitbucket Cloud; merge past bypassable repo rules after confirming; 👀/👍 reactions on `/devin` commands; resolved analytics count only findings fixed in code; Lite mode for Oncall; request-access link for unconnected repos; Gerrit webhooks auto-installed. Oct 16: multiple side chats per message; Cmd+K finds archived sessions; **queued messages stay editable while Devin is idle**; images open as tabs; numbers follow display language; browser previews wake sleeping sessions; `/devin` on GitLab MRs; word-level highlights in edited diff lines; PR list/search across GitHub/GitLab/Azure DevOps/Gerrit/Perforce. | release notes 2026-10-21 | proprietary | 5 | **WATCH** | Oncall GA proves alert-triage agents are a sellable category *adjacent to* trackers — a Stellarc integration surface later, not a build. **Work-log honesty is the steal**: our run feed should render the harness's own current-step summary when it exists and never narrate internal bookkeeping as if it were work. **Queued messages stay editable while idle** extends last pass's interrupt-preserves-reply law into the queue: a queued follow-up is a draft until the turn consumes it — design our P1 queue so edits are possible before delivery. |
| **Factory (Droids)** | **Four releases: v0.244 (10-16), v0.245 (10-20), v0.245.1 + v0.246 (10-21), v0.247 (10-22).** v0.247: **usage totals now count every billed model attempt, including ones that were retried or refused**; PDF preview renders first pages immediately; Files panel stays responsive in long sessions; sessions started on an Environment group under that Environment; malformed API key → invalid-format error. v0.246: image gallery per message; long transcripts stay responsive; **usage notices describe spend in credits, not tokens**; one consolidated planning-status line instead of a row per guessed tool call; FetchUrl reads any public URL, not just user-supplied ones. v0.245: Chrome cookie import (macOS); folder links open the Files panel at that folder; voice-dictated answers to questions; **MCP tools with top-level union input schemas work**; refused requests show a readable message; reserved MCP server names error instead of silently not saving. | CLI v0.247.0 / Desktop v0.204.0, 2026-10-22 | proprietary | 4 | **WATCH** | **The usage-honesty law is proposal P2's backbone**: Factory discovered that silently dropping retried/refused attempts from totals understates real spend — our per-attempt usage rows (NEVR-243 slice 1, landed on dev) must sum *every* attempt, including failed and refused ones, and the roll-up must equal that sum. Credits-not-tokens is their pricing-model choice, not ours (charter: harness-reported only). Union-input MCP schemas and reserved-name errors are two cheap validation rules for our MCP surface when it exists. |
| **Cursor** | **Oct 16: Cloud Agent Canvases and Environment Improvements.** **Cloud agents build interactive canvases** as part of their work; a finished canvas is shareable by link. **Environments API (beta)**: programmatically create and manage the cloud environments agents run in. Environments scale to **300 repositories**, large ones load **5× faster**. | changelog 2026-10-16 | proprietary | 5 | **WATCH** | Two patterns. (1) **Agent-produced interactive artifacts shared by link** — canvases are the agent-output counterpart of our D10 event log: work products that outlive the run and circulate. When Stellarc runs produce reviewable artifacts (diffs, reports), link-shareable beats screenshot-paste. (2) **An API for the environments agents run in** — the lifecycle our stellarc-node already owns (spawn/supervise/teardown) is becoming a productized API surface everywhere; keep our node's control surface clean enough to expose later. |
| **Linear** | **Oct 22: More ways to run and share Loops.** **Slack and GitHub triggers**: events in connected tools start loops automatically (answer product questions in a Slack channel; draft a QA plan when a PR gets a "ready for testing" label). **Custom loop templates**: save a loop as a template; workspace members adapt it instead of starting from scratch; templates sit beside Linear's built-ins. **Reasoning levels per loop**: balance speed, cost, and task complexity — routine loops fast and cheap, deeper reasoning reserved for demanding tasks. | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Loops (launched Sep 14) are Linear's automation-agents surface, and this release is its proliferation kit: **external triggers + shareable templates + per-automation reasoning budget**. That triple is the shape Stellarc's wakeup/automation story should grow into after MVP — Multica wakeups already give us triggers; templates and a per-task reasoning budget (a task field the runner applies when the harness advertises effort/reasoning options — Multica ships the same for Claude effort, #9392) are the additions worth remembering. |
| **OpenHands** | **Six releases in four days: v1.29.0 (10-20) → v1.33.0 (10-23 13:46Z).** **"OpenHands Agent Canvas" macOS app** (unsigned — Gatekeeper note in every release; kiosk-style canvases lockable to a Cloud host, OHE-3670/3683); **agent-profiles own their settings**: skills chosen per profile from the server catalog (#18683/#18686), Model Router per profile (#18685), condenser + verification configured per profile (#18679), `default` launchable by id (#18720); DigitalOcean deploy: web build stays signed in across restarts (#18705), new agents default to the smallest VM (#18702); `verify-openhands` launcher gains `--mars-web`/`--lock-to-cloud`; secret values masked in request and Settings forms (#18870); automations render the shipped `current_phase` on live runs (#17122). | v1.33.0 2026-10-23 | MIT (91.7k★) | 4 | **WATCH** | **Agent profiles as the unit of configuration** — skills, router, condenser, verification all hang off a named profile that owns its settings. Stellarc's agent records (model, instructions) are the seed of the same concept; when we add capability knobs, attach them to the agent profile, not to global settings. Secret masking in forms is table stakes for our runtime-config UI. |
| **GitHub Copilot / platform** | Window items (github.blog changelog): **usage metrics API now covers custom skills, agents, and MCP servers** (10-22) — per-entity agent metering in the API; Enterprise installations for GitHub Apps GA (10-23); global default for Copilot features GA (10-22); GH CLI opt-in expiring, auto-refreshing OAuth tokens (10-21); Copilot model policy API for enterprise/orgs/teams (10-19); Dependabot supports npm 12, pnpm 11/12, Bun 1.4 (10-20). | changelog 2026-10-17→23 | proprietary | 5 | **WATCH (pattern)** | GitHub now meters usage **per skill / per agent / per MCP server** — one more proof that agent-cost attribution is becoming a platform API norm, not a nice-to-have. Our per-attempt rows already attribute to (task, attempt, agent); that's the right grain. Universe is Oct 28–29 — the agent wave lands after it; next competitors pass catches it. |
| **Plane** | **v1.4.3-rc2 cut today (10-23 15:40Z)** — packages **SECUR-247: require project membership to publish** (#10034, last pass's main-branch watch) plus a MinIO image switch (#9963). rc1 was 10-06; stable v1.4.3 pending. No other release (stable remains v1.4.2, Aug 23). | v1.4.3-rc2 2026-10-23 | AGPL-3.0 (61.3k★) | 4 | **TRIAL** | The security cluster from last pass is being shipped, not just merged — evidence the membership-check audit class was real. Our auth pass checklist (every URL-named project/issue id gets a membership check at the handler; publish-style writes require membership, not session) keeps its priority. |
| **Huly** | Commits resumed after last pass's silence: 7 commits 10-19 → 10-23, all small fixes (Google Meet links in synced calendar events #11150; channel phone/nickname links #11130; per-status colors in the status filter #11154; `social_id` PK migration in one ALTER #11153; null handling in `$in`/`$nin` queries #11152; activity section kept out of printed documents #11156). No release; still no agent story. | main 2026-10-23 | EPL-2.0 (28.0k★) | 3 | **REJECT** | Alive but maintenance-cadence. The `$in`/`$nin` null-handling fix is a familiar query-layer footgun worth remembering when our store grows dynamic filters; otherwise the row keeps sleeping. |

## Proposals

### P1 — Follow-up message contract: steer, don't drop (ADOPT-grade)

The window's clearest consensus: **a message that arrives while a turn is
running must reach the agent mid-turn or be explicitly queued — never silently
dropped, never forced to wait an entire long turn.** Multica built it twice in
one week (Cursor via hooks MUL-8070; Kiro via `_session/steer` MUL-8126); Paseo
made agent→agent steering stable (#5164) and fixed their plugin ACP path so
follow-ups stop erroring (#7270); Devin lets queued messages be edited until
the turn consumes them.

Stellarc today: `apps/stellarc-node/src/runner.ts:478` sends exactly **one**
prompt per task run; `conn.cancel` is the only mid-run verb. A follow-up
comment on a running task has no defined path.

Proposal: define the contract at the plane level, independent of runtime
capabilities — (1) a follow-up on a running task is persisted as a queued
plane event and **delivered as the next prompt when the turn ends** (works
over ACP 1.7.0 as pinned, no extensions); (2) a `steer` adapter seam on the
runtime interface for harnesses that support mid-turn injection (probe at
handshake; none exists today — verified: no `steer` symbol in
`@agentclientprotocol/sdk` 1.9.0 or 2.0.1 stable types); (3) queued messages
remain editable until delivery (Devin's law); (4) the transcript records
queue-time and delivery-time as separate events. When the ACP bump (NEVR-129)
lands, re-check whether upstream standardizes steering before building any
per-runtime adapter.

### P2 — Usage-honesty law for the pending cost/token UI (ADOPT-grade, amends the 10-16 brief)

The backend landed this window: **NEVR-243 slice 1 (c51ee3a, on dev)** —
`getTask` now serves per-attempt usage rows from `agent_task_usage`. The UI
still renders none of it (`costAmount`/`tokensTotal`: zero references in
`stellarc-ui`). Two honesty laws must ride the UI brief, both
competitor-proven this window:

1. **Totals count every billed attempt, including retried and refused ones**
   (Factory v0.247). A failed or refused attempt that consumed tokens appears
   as a row; the task roll-up equals the sum of attempt rows — never a
   filtered subset that understates spend.
2. **Absent cost renders absent** (charter law, re-proven by Multica's
   pricing-table churn across v0.6.3→v0.7.0: Gemini completion, Cursor
   variant normalization, codex attribution — three releases of pricing-table
   fixes). Harness-reported numbers only; no local pricing table.

GitHub's usage-metrics-API expansion (per skill/agent/MCP-server, 10-22)
confirms the attribution grain: **per attempt, per agent** — which is exactly
what NEVR-243 slice 1 serves. The remaining work is presentation plus the
roll-up rule above.

### P3 — Automation surface convergence (WATCH — the post-MVP shape)

The tracker market is converging on automation agents with: **external
triggers** (Linear Loops: Slack/GitHub events start loops; Multica wakeups:
comment/PR/status conditions), **shareable templates** (Linear loop templates
in a workspace library), and **per-automation reasoning budgets** (Linear
reasoning levels; Multica preserving Claude effort per request #9392).
Adjacent: Devin Oncall GA proves alert-triage agents are a category; Cursor's
Environments API beta productizes environment lifecycle; OpenHands hangs
skills/router/condenser off agent profiles. None of this is v2-scope for
Stellarc now; record the shape so the wakeup surface we inherit from Multica
plus our agent profiles can grow into it without re-architecture: triggers →
template-able task definitions → per-task effort/reasoning field the runner
applies when the harness advertises it.

## Notable non-findings

- **GitHub Universe is Oct 28–29** — the expected Copilot/agent wave lands
  after it; the next competitors pass catches it.
- **Stellarc shipped no release/tag** in the window (latest tags are July
  archives), so the NEVR-198 radar row ("verified on a release") stays open —
  though its code is on dev.
- Multica's `--until-pr conflicts` wakeup and self-hosted-VCS `--until-pr`
  (MUL-8135/MUL-7857) are platform capabilities we inherit by running on
  Multica — nothing for Stellarc to build; noted so we don't re-propose them.
- Huly's commit trickle doesn't change the REJECT verdict; row keeps sleeping.
- Web search/extract provider still down (`9router` unregistered — **ninth**
  consecutive run); GitHub API, npm registry, and direct curl carried the beat.
- `@agentclientprotocol/sdk` npm `latest` is now **2.0.1** (2.0.0 + 2.0.1
  stable shipped since the 10-17 libraries pass recorded 2.0.0-alpha.9);
  Stellarc pins 1.7.0; the bump already rides NEVR-129 — recorded here because
  the steer probe in P1 must be written against whatever the bump lands on.

## Sources

- Multica v0.6.4/v0.6.5/v0.7.0 release bodies: github.com/multica-ai/multica (GitHub API 2026-10-23; published 10-20T10:22Z / 10-21T09:39Z / 10-23T09:58Z); repo 53,667★, pushed 10-23T11:18Z
- Paseo v0.12.0 / v0.13.0-beta.1 / v0.13.0-beta.2 release bodies: github.com/getpaseo/paseo (API 2026-10-23; published 10-19T07:07Z / 10-22T02:25Z / 10-23T13:27Z); 21,807★, license NOASSERTION (Apache-2.0 + carve-out per 10-16 pass)
- OpenHands v1.29.0–v1.33.0 release bodies: github.com/OpenHands/OpenHands (API 2026-10-23; 91,660★, MIT)
- Linear changelog Oct 22 entry (Loops): linear.app/changelog/2026-10-22-slack-and-github-loops (fetched 2026-10-23); entry list from linear.app/changelog
- Cursor changelog Oct 16 entry (Canvases, Environments API): cursor.com/changelog (fetched 2026-10-23)
- Devin release notes Oct 16/19/21: docs.devin.ai/release-notes/2026 (fetched 2026-10-23)
- Factory feed (249 items; 10-16→10-22 = v0.244.0→v0.247.0): docs.factory.com/docs/changelog/feed.json (fetched 2026-10-23)
- Plane v1.4.3-rc2 (+ releases list): github.com/makeplane/plane (API 2026-10-23; published 10-23T15:40Z; 61,340★, AGPL-3.0)
- Huly commits since 10-16: github.com/hcengineering/platform (API 2026-10-23; 27,974★, EPL-2.0)
- GitHub changelog 10-17→10-23 titles: github.blog/changelog/month/10-2026/ (fetched 2026-10-23)
- ACP: registry.npmjs.org/@agentclientprotocol/sdk (dist-tags latest=2.0.1; 2026-10-23); `steer` absent from 2.0.1 and 1.9.0 stable `.d.ts` (unpkg, 2026-10-23); Stellarc pin 1.7.0 (package.json/bun.lock)
- Stellarc grounding: `git log origin/dev` (c51ee3a NEVR-243 slice 1); single-prompt path at `apps/stellarc-node/src/runner.ts:478`; zero `costAmount`/`tokensTotal` references in `apps/stellarc-ui/src`; no releases/tags since July archives
