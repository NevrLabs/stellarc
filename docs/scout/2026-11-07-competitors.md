# Scout — Competitors, 2026-11-07

Beat: **competitors**. Delta window: 2026-11-06 18:30 UTC → 2026-11-07 19:10 UTC (~25h). Every claim
verified against a vendor changelog/release notes (fetched raw or browser-rendered), the GitHub API,
or repo metadata on 2026-11-07. Context: Stellarc = self-hostable, inert control plane (v2 charter)
+ BYO agent runtime over ACP, Bun/TS monorepo (`apps/stellarc-{api,node,ui,worker}`,
`packages/{agents,contracts,db,domain,sync,telemetry}`, plus `packages/kaneo-legacy`); the UI future
is `apps/web` greenfield on `effect/v4` (ADR 0014). `docs/steal-reject-matrix.md` and
`docs/v2-charter.md` are the standing filters.

## The one-line read

A release-quiet, interaction-loud day: only **Factory shipped** (v1.6.0, the daily train's 5th
November release), but four carried chapters each gained an independent reinforcement. **(1)
Process ownership has a Windows law now** — Multica MUL-8571/#9963: ACP itself spawns its Windows
gateway with `CREATE_BREAKAWAY_FROM_JOB`, which **escapes the non-breakaway job the runtime owner
keeps its descendants in** → startup dies before the first model request; the fix starts the
isolated home's gateway in the foreground *under the owner's existing process ownership* and lets
ACP attach. That is the record-at-birth doctrine's Windows line — and a concrete ACP pitfall for
any future Stellarc Windows runner: no agent-tree process may escape the owning job. **(2)
Steering × background work has its first explicit product line** — Factory v1.6.0: a background
Task **reports its final answer when you steer a message into it** (steering is not
fire-and-forget), while Paseo #9015 keeps the composer ready after Send. **(3) Voice became a
status-query surface** — Cursor's Nov 6 Voice Chat: ask an agent mid-run what it's working on,
hear short spoken progress notes and a brief spoken answer, search earlier messages *and calls*;
no adoption case for Stellarc, but the pattern — run status queryable conversationally, calls
joining the searchable archive — is pre-registered. **(4) Usage attribution keeps widening** —
Copilot's **third consecutive metrics day**: the impact dashboard now spans *nine* Copilot
experiences (chat + VS Code agent window added), plus code-review settings via API. Also today:
**Paseo's biggest trunk day of the cohort** (21 commits) carrying a model-identity honesty pair,
and **two tracking-source corrections** — `changelog.devin.ai` no longer resolves (NXDOMAIN;
canonical is now `docs.devin.ai/release-notes/2026`) and `hcengineering/huly` is gone (404; the
live monorepo is `hcengineering/platform`). No new brief today; three carried ADOPT chapters get
addendum material instead.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | v0.8.1 stands; **2 trunk commits, both 11-07** (55,231★, +79). **#9963 / MUL-8571 + ZIC-396 (05:45Z) — own Windows task gateways without breakaway**: ACP tried to create a *detached* gateway with `CREATE_BREAKAWAY_FROM_JOB` while Multica owns runtime descendants in a **non-breakaway job** → Windows task startup failed before the first model request. Fix: start the isolated home's gateway **in the foreground under Multica's existing process ownership**, then let ACP attach; the daemon already retires the previous gateway and isolates gateway state from the user's home. **#10066 / MUL-8713 (10:35Z) — cap agent status previews**: in large workspaces the Team sidebar rendered *every* active agent, pushing All-agents/Squads/Skills/Runtimes many screens down; "Working now" and "Needs attention now" now preview **five agents each**, keep their total counts, offer Show more/fewer; **both section headers collapse, remembered per workspace per device**; **hidden working-agent rows do not mount**. | trunk 2026-11-07 (#10066, #9963) | proprietary, 55,231★ | 5 | **WATCH (steal surfaces)** | The Windows job-ownership law extends the P2 record-at-birth addendum: ownership = a non-breakaway job, and *third-party spawn paths (ACP's own gateway!) must not break out of it* — fail closed on breakaway. MUL-8713 extends Section F at sidebar scale: bounded previews (5 + retained counts), persisted collapse per workspace+device, and unmounted hidden rows (render budget, not just CSS). |
| **Paseo** | v0.15.3 stands; **21 trunk commits** 11-06 18:30Z → 11-07 18:59Z (trunk head #9025) — the cohort's biggest day (23,402★). **#9025 — handshake retries stop when the channel closes** (retry lifetime bounded by the transport: never retry into a closed channel). **#9015 — the composer stays ready after clicking Send. #8358 — short collapsed chat histories fill** (completes the transcript-honesty pair at the short extreme). **#9009 — a folded turn's summary line becomes its own chat row.** **Model-identity honesty pair: #8957 — keep the provider's *actual* model after unavailable selections; #8948 — keep the native model when importing sessions** (what the label says = what ran, across selection-loss and import). **#8906 — plugins provide custom sidebar views across hosts. #9019 — idle Claude runtimes reopened without a turn are collected** (runtime-inventory honesty). #9022 fill controlled form fields through browser tools; #8973 browser evaluation on strict-policy pages without shadowing page globals; #9008 concurrent Codex discovery survives startup; #9004 mouse encoding preserved when replaying sessions; #8972 linked resources preserved when pasting prompts; #8956 `browser_logs` reports each request's HTTP status; #8946 uploaded terminal file paths kept separate; test batch #9033/#9010/#8983/#8975/#8942. | trunk 2026-11-07 (v0.15.3 of 11-06 stands) | Apache-2.0 + carve-out, 23,402★ | 4 | **TRIAL (stands)** | #9025 is the bounded-retry line for the startup-honesty addendum (reconnect/attempt caps already carried; now: the channel closing *ends* the retry question). #9015/#8358/#9009 feed the live-status/replay contract lines. The model-identity pair is a small new law worth pinning as an acceptance line when model selection/import surfaces exist: after an unavailable selection or an import, the displayed model must be the one that actually runs. #8906 joins the plugin-reference row (sidebar views = plugin UI surface). |
| **OpenHands** | v1.37.0 stands; **21 commits since seal** (92,886★). **#18533 — display conversation budgets with semantic meter fills** (the cost/token surface: budgets as meters, semantics in the fill). **#19453 + #19451 — automation help becomes editable**: executable plugin configuration can be edited *inside* the automation help surface; automation context preserved and help chats open immediately. **Token-discipline program extends** (the #19263/#19264 pair now covers the whole surface): #19484 lint-enforced named values for message + motion owners; #19448 inline-style owners guarded; #19439 layer owners guarded; #19447 named shared control/panel motion recipes; #19446 named message/toast wrapping; #19437 named Canvas type scale completed; #19438 named metadata/automation grid columns; #19262 integer utilities for z-index layers. #19445 Paper theme for Agent Canvas; #18520 managed-agent keyboard focus colors. Deps: vite 8.0.16→8.3.5, tanstack + react-router groups, lucide-react. | trunk 2026-11-07 (v1.37.0 of 11-06 stands) | MIT, 92,886★ | 4 | **WATCH (pattern)** | #18533 is the display shape for our carried usage contract (retired P1 cost/token UI per ADR 0014 — contract carried into the apps/web agent views): budgets shown with semantic meter fills, not raw numbers. The lint-enforced named-token program is the codebase half our design-token lane should copy when apps/web tokens land (cross-beat note to design). #19453 adds a fifth element to the pre-registered automation bar: the explainer is *editable* — config-in-help, not a dead diagram. |
| **Factory (Droids)** | **CLI v1.6.0 / Desktop v1.6.0 (Nov 7)** — 5th November release (Nov 6 was **v1.5.0**, correcting yesterday's v1.4.0 label read; canonical page: docs.factory.com/changelog/release-notes). **`/side` opens Side Chat** (matching `/btw`) — a parallel secondary conversation channel with the agent. **A steered background Task reports its final answer when you steer a message into it.** Telemetry honored when turned off (user or org settings). **A paused Droid Computer no longer shows as running after a delayed status update.** New-session startup **no longer flashes "Initializing Session"** before the session opens. Faster worktree-session archiving (no wait on checkout files, macOS/Linux). Skills browser focuses search on open; Create Skill modal leads with description; sign-in renamed "Factory Custom Deployment"; session view not reloaded while verifying a Computer's identity; sidebar-header window dragging fixed. Domain migration in progress: factory.ai → **factory.com** (docs at docs.factory.com). | v1.6.0 2026-11-07 | proprietary | 5 | **WATCH** | The steered-background-answer line is the missing interaction law for our briefed background-work chapter: a message steered into agent-owned continuing work must surface that work's eventual answer in the steering conversation — steering is a reply channel, not fire-and-forget. Paused≠running after a delayed update = the stale-snapshot law at the pause boundary; the no-flash startup is render-first. `/side` pre-registers the side-channel pattern (secondary conversation with the same agent context) — watch, no surface. |
| **Cursor** | **Nov 6 entry — Voice Chat with Agents** (16-day cadence broken yesterday by Live Apps; voice follows a day later). Realtime two-way voice with coding agents, in the Agents Window, IDE, web, and iOS; powered by **Grok Voice** (voices Ara/Eve/Leo/Rex/Sal; zero data retention under Privacy Mode). iOS: "Hey Siri, call Cursor", mute/hang up from the Lock Screen Live Activity. The voice agent listens, replies, and **hands coding work to the agent in your chat**; while that agent runs **you keep talking** — ask what changed in a diff, **check on a run**, search earlier messages **and calls**, switch between workers; the agent **speaks short progress notes while it works** and a brief spoken answer when done. Separate from dictation (speech→input). | changelog 2026-11-06 | proprietary | 5 | **WATCH (pattern)** | Voice as a *status-query surface*: "what are you working on" answered mid-run without reading a transcript, with progress notes as spoken status. And calls enter the searchable archive — the transcript lane's next member. No adoption case for Stellarc (Grok Voice stack + realtime infra); pre-register the pattern: run status becomes queryable through a conversational channel, and that channel's history is first-class searchable content. |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; second consecutive quiet day. | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; mobile review + the agent-diff/board fixes stand as carried. |
| **GitHub Copilot** | **Three items since the seal** (changelog RSS, verified): **11-07 00:27Z — Copilot code review: API management and review-overview updates** (review settings manageable via REST/GraphQL from enterprise policy down to individual repositories; review-overview comment more compact). **11-06 22:17Z — impact dashboard adds chat and VS Code agent usage**: the Agent-adoption chart now spans **nine Copilot experiences**. 11-06 21:00Z — weekly releases (Nov 2) recap; 20:31Z — **@GitHub in Slack and Teams GA** (investigate bugs, create issues, implement changes, open PRs from chat). Third consecutive metrics/attribution day counting the 11-06 00:xx usage-metrics pair already carried. | changelog 2026-11-07 | proprietary | 5 | **WATCH (pattern)** | Per-surface usage attribution is the enterprise reporting bar — nine experiences on one adoption chart, review settings as API-managed policy objects. Feeds the BYOK usage-attribution schema note: attribution dimensions keep multiplying (surface, activity kind, data-quality flags). @GitHub-in-Slack is the mirror of our notification lane: conversation → issues/PRs as first-class actions. |
| **Devin (Cognition)** | No new entry — newest still **November 2, 2026**. **Tracking correction: `changelog.devin.ai` no longer resolves** (DNS NXDOMAIN, verified via curl and browser on 11-07); the canonical release-notes surface is now **`docs.devin.ai/release-notes/2026`** (Mintlify SPA; browser-rendered to verify). Docs nav lists an existing "Voice mode" under Working with Devin. | release notes 2026-11-02 | proprietary | 5 | **WATCH** | Quiet day, but the source moved: the radar's Devin read now targets docs.devin.ai. Devin having a voice mode while Cursor ships voice chat = the audio lane is field-wide, not one vendor. |
| **Plane** | **Fourth consecutive quiet day** — `preview` (default branch) newest commit still 11-03 (#9922 base_host OAuth fix, carried); **v1.4.3 (10-28) stands**; the repo's 11-07 14:41Z `pushed_at` is an off-branch ref, not trunk; 62,125★ (+46). | v1.4.3 2026-10-28 | AGPL-3.0, 62,125★ | 4 | **TRIAL (stands)** | Longest quiet streak in the beat's history continues; the v1.4.3 auth/tenant-isolation checklist stays queued on our side. |
| **Huly** | **`hcengineering/huly` is gone** — 404 via GitHub API, absent from the org's repo list; the live monorepo is **`hcengineering/platform`** (28,070★, +9), whose newest commit is still 11-06 06:56Z (#11161 Octokit-in-secret fix, carried) — quiet 11-07. | platform trunk 2026-11-06 | EPL-2.0, 28,070★ | 3 | **REJECT (stands; repo corrected)** | Maintenance cadence without an agent story. Tracking correction recorded: the radar now reads hcengineering/platform, not the deleted huly repo. |

## Proposals

Today produces **no new ADOPT brief** — nothing cleared the ready-to-file bar. Three carried
chapters get addendum material to fold when their briefs are picked up, plus two tracking
corrections.

### Addendum 1 — Windows process ownership, for the P1 startup-honesty / P2 record-at-birth row

Multica MUL-8571/#9963 gives the record-at-birth doctrine its Windows line, and it is a *pair* of
rules:

- **Own the tree in a non-breakaway job.** On Windows, runtime descendants live in a job object
  that does not permit breakaway — cleanup capability is guaranteed by construction, not by
  cooperation.
- **Third-party spawn paths must join the owner's job — fail closed on breakaway.** ACP's own
  Windows gateway spawn requested `CREATE_BREAKAWAY_FROM_JOB` (detached) and escaped the owner's
  job; the failure mode was total (task startup dead before the first model request). The fix
  pattern: the owner starts the isolated home's gateway in the foreground under its existing
  process ownership, and the third party (ACP) attaches.

For Stellarc today this is pre-registration, not work: the runner path is Linux (orbit/hermes
children). The acceptance line when a Windows runner is ever chartered: *no agent-tree process can
escape the owning job; a breakaway request from any spawn path (including ACP internals) fails
closed and is reported.* Fold with the existing addendum (pidfd probe, capability-before-launch).

Also folded here: **Paseo #9025** — retry loops terminate when the underlying channel closes. The
bounded-retry rule set (attempt caps, exhaustion → terminal failure, one-cause-one-reconnect)
gains: *a closed channel ends the retry question; never retry into a transport that is gone.*

### Addendum 2 — interaction lines for the background-work chapter and the live-status contract

- **Steering is a reply channel** (Factory v1.6.0): a message steered into agent-owned continuing
  work must surface that work's eventual final answer in the steering conversation. Append to the
  background-work acceptance lines when that chapter is next edited (Builder's doc — recorded
  here, not edited by scout). *(Triage correction, NEVR-529: the chapter already landed 11-07
  01:44Z as Section G of `docs/design/agent-view-lifecycle-contracts.md` — NEVR-514 #206 — so
  these lines land there, not in `agent-view-contracts.md` as written above; the pinning brief is
  NEVR-530, which also pins the 11-06 transcript-honesty trio and the other 11-07 lines.)*
- **The composer stays ready after Send** (Paseo #9015): submission never locks the input.
- **Transcript honesty at the extremes, completed** (Paseo #8358 + Factory's 11-06 pair): short
  collapsed histories fill their older messages too; a dead Load-older button on a short
  transcript is a lie. Folded with #9009 (a folded turn's summary line is its own chat row).
- **Pause-boundary honesty** (Factory v1.6.0): a paused resource never renders as running once the
  delayed status lands — stale snapshots may not overwrite, including the paused state.
- **No pre-session flash** (Factory v1.6.0): "Initializing Session" never flashes before the
  session view opens — render-first at the startup boundary.
- **Bounded previews, persisted collapse** (Multica MUL-8713): status previews cap at five with
  retained totals and Show more/fewer; section collapse is remembered per workspace per device;
  hidden rows do not mount. Section F at sidebar scale — render budget and state persistence are
  acceptance lines for the apps/web board/agent lists.

### Addendum 3 — two new WATCH pre-registrations

- **Voice as a status-query surface** (Cursor Nov 6; Devin's existing voice mode corroborates the
  lane): run status queryable through a conversational audio channel mid-run; spoken progress
  notes; calls join the searchable archive. No Stellarc surface today (grep-verified lane: no
  voice anywhere); revisit if/when a conversational interface to the control plane is chartered.
- **Per-surface usage attribution** (Copilot, third metrics day): adoption reporting across every
  Copilot surface (nine) with per-activity-kind breakdowns and explicit data-quality flags.
  Extends the carried BYOK usage-attribution schema note — attribution dimensions: surface,
  activity kind, data-quality.

### Tracking corrections (radar hygiene)

- **Devin**: read `docs.devin.ai/release-notes/2026` (old `changelog.devin.ai` domain is
  NXDOMAIN-dead).
- **Huly**: track `hcengineering/platform` (`hcengineering/huly` deleted from the org).
- **Factory**: canonical changelog = `docs.factory.com/changelog/release-notes`; Nov 6 = v1.5.0
  (yesterday's v1.4.0 label was the entry header at read time); domain migrating to factory.com.

## Non-findings / notes

- **Stellarc releases still empty** (0 releases via GitHub API, re-verified 11-07 19:10Z; default
  branch `main`, pushed 14:13Z) — the landed NEVR-198 scoped-permission pipeline remains
  unverified-on-a-release; row stays open.
- **Plane metadata**: `pushed_at` moves on off-branch refs — quiet-day reads must query the
  `preview` branch commits, not repo-level pushed_at.
- **Methodology**: both `web_search` and `web_extract` providers were down this run (`9router`
  unregistered); vendor changelogs fetched via curl (Linear, Cursor, Factory news, github.blog
  RSS) and browser rendering (Devin docs SPA, Factory docs SPA). GitHub data via `gh api`.
- Windows sealed at: Multica #10066 10:35:16Z (trunk head = pushed_at), Paseo #9025 18:59:08Z
  (trunk head), OpenHands pushed_at 18:47:30Z (newest listed commit #19460 17:16:33Z).
- Verification sources (2026-11-07 ~19:00Z): api.github.com/repos/{multica-ai/multica
  (commits, PRs #10066/#9963), getpaseo/paseo (commits, releases), OpenHands/OpenHands (commits,
  releases), makeplane/plane (branches, commits, metadata), hcengineering/platform (+ org repo
  list, confirming `huly` absent), NevrLabs/stellarc (releases)}; linear.app/changelog (HTML);
  cursor.com/changelog (HTML); factory.com docs changelog (HTML + sitemap); docs.devin.ai
  release-notes 2026 (browser-rendered); github.blog/changelog/feed (RSS).
