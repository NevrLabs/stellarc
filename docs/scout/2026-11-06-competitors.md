# Scout — Competitors, 2026-11-06

Beat: **competitors**. Delta window: 2026-11-05 19:07 UTC → 2026-11-06 19:05 UTC (~24h). Every claim
verified against a vendor changelog/release notes, the GitHub API, or repo metadata on 2026-11-06.
Context: Stellarc = self-hostable, inert control plane (v2 charter) + BYO agent runtime over ACP,
Bun/TS monorepo (`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`,
plus `packages/kaneo-legacy`); the UI future is `apps/web` greenfield on `effect/v4` (ADR 0014).
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

Three releases and one streak-breaker today: **Multica v0.8.1** (10:15Z, 35 trunk commits in-window),
**Paseo v0.15.3** (16:02Z, 27 commits), **OpenHands twice** (v1.36.0 11-05 21:38Z + v1.37.0 11-06
12:54Z), and **Cursor broke its 16-day silence** with "Build Live Apps in Cursor" (Nov 5 entry,
posted after yesterday's seal). Three laws landed with the weight of multiple independent ships:
**(1) The background-work lane went from pattern to product** — Paseo #6220 shipped the full surface
(a turn ends, provider-owned work continues: run stays Running, count above the composer, live
inventory with individual Stop, composer editable, Interrupt scoped to the active turn), while
Factory's automation menu and OpenHands' unified automation workflows + Mermaid explainers converged
on the same "agent-owned continuing work is a first-class, visible, individually-stoppable object"
doctrine — Stellarc's most fileable proposal (P1, ADOPT). **(2) Record-at-birth, never
interrogate-at-runtime** — Paseo #8818 removed process-identity queries from terminal startup
entirely (the #8810 daemon-outage class killed at the root) and #8890 records workspace-creation
parentage, while Multica MUL-8655/#9996 probe pidfd/cleanup capability *before* launching: identity
and capability facts are written down at creation, never re-derived by querying the OS mid-flight
(P2). **(3) Transcript honesty at the seams** — Paseo #8944 (a turn's finished state must never
render without its final reply — the finished-but-empty flash), #8916 (whole-snapshot updates must
not invalidate unchanged nested objects — every message row was re-rendering on each agent update),
and Factory's compacted/short-transcript load-older fixes (P3): three seams where the transcript
lies by omission, all fixable as contract lines. Also: **Multica now lets agents read the issues in
a saved view** (MUL-8532) — the first agent-consumable-views ship on the board, a contract note for
our views lane.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | **v0.15.3 stable** (16:02Z) — single fix: conversation text no longer blurs when the iOS 26+ keyboard opens/dismisses (#8918). The story is trunk: 27 commits, 03:03Z→18:57Z. **#6220 — show and stop agent background work** (shipped, 12:49Z): when a foreground turn ends while provider-owned work continues, the agent+workspace stay Running, a background-task count shows above the composer, the track lists live shells/monitors with friendly description, elapsed time and an **individual Stop action where supported**; the composer stays editable; foreground Interrupt scopes to the active turn; Claude, Codex and OpenCode v2 provide live inventories. **#8916 — stop re-rendering every chat message on each agent update**: the daemon sends whole-agent snapshots; every nested object (`capabilities`, `availableModes`, `labels`…) was a fresh reference, so the history renderer's memoization broke and *every* row re-rendered. **#8944 — keep the chat still when a turn ends**: finished-turn-with-no-reply flash, then reply+footer arrive ~750 ms later and everything above jumps twice. **#8939 — agents get their own `PASEO_WORKSPACE_ID`**, retained across create *and* resume in the launch env, agent snapshot and stored record. **#8818 — terminal workers run without process identity queries**: workers never query their own birth time or command line; Windows lifecycle ops never launch PowerShell (the #8810 outage class removed, not patched). **#8890 — record workspace creation parentage.** #8904 sidebar archive with undo; #8903 parent-archive detaches an unloaded child while clients stay current; #8811 plugin-rendered (projected) replies recognized as turn boundaries when collapsing; #8935 workspace tabs predictable + attention cleared on deliberate focus; #8905 slash-menu loading/error states, no /exit default; #8912 ACP mode selections kept valid after config updates; #7806 visible usage summaries refresh periodically; #8932 Mermaid source toggles with bounded inline previews; Android/iOS cluster #8911/#8898/#8909/#8891/#8885. | v0.15.3 2026-11-06 (stable) | Apache-2.0 + third-party carve-out (NOASSERTION), 23,301★ (+113) | 4 | **TRIAL (stands)** | #6220 is the field's first complete background-work surface → P1 brief. #8916 is the perf statement of our filed live-status law: streaming updates must be scoped to changed rows — structural identity at the store seam is an acceptance line, not an optimization. #8944 extends Section F to the turn boundary. #8818/#8890 → P2 record-at-birth. #8939 is agent-as-persisted-principal — the attribution half of the delegation pre-registration. |
| **Multica** | **v0.8.1 released 10:15Z** (rollup since v0.8.0; 35 trunk commits in-window 04:11→18:17Z, 11 post-release; sealed 18:17Z #10068; 55,152★ +123). Headlines: **MUL-8532 — let agents read the issues in a saved view** (#9855): saved views as agent-consumable read resources — the first ship of "the agent sees the same shaped data the user filtered for". MUL-8182 — lazy-load inline images **with reserved dimensions** (#9453): the CLS law applied to attachments (reserve the box before the bytes). MUL-8679 — restore background issue tabs after restart (#10037): UI session state survives restarts. MUL-8636 — pin workspaces to the top of the switcher; MUL-8649 — selective parent-field copying for sub-issues (#9988); MUL-8594 — thinking level in the properties sidebar (the cost dial surfaces where the run is configured); CLI: per-issue PR auto-complete control (#10057, post-release) + updated-time-range filters (carried). MUL-8686 — reclaim build caches from idle chats (#10038, post-release): idle agent sessions don't hoard resources. **MUL-8655 + #9996 — check Linux pidfd support / Pi cleanup capability before launching** → P2. MUL-8658 + #10044 — safe load errors with *scoped* retry on failed list pages (retry the failed surface, not the page). MUL-8667 — preserve modifier shortcuts in time inputs; MUL-8651 — reveal clipped sidebar titles on hover/focus; MUL-8700 — HTML viewer Fit scales wider documents down; MUL-8683 — aligned Markdown image-preview sequences across clients; squads as a single nav entry (#10048); MUL-8711 — brand refactor drops the launch-icon mode. Process signals: PR templates now require UI screenshots (#10059/#10078) and DB-backed tests assert on fixture rows, not global query totals (#10061/#10070). | v0.8.1 2026-11-06 10:15Z | proprietary, 55,152★ | 5 | **WATCH (steal surfaces)** | Agent-readable saved views is the contract shape for our board lane: when views land in apps/web, they are API resources agents can read — pin that before the first view ships. Reserved-dimension lazy images = Section F at the attachment surface. Scoped retry (failed page ≠ failed app) joins the retry law family. Screenshot-required PRs + fixture-row test assertions are process law worth copying when apps/web PRs start. |
| **OpenHands** | **Two releases in-window**: v1.36.0 (11-05 21:38Z) and **v1.37.0 (11-06 12:54Z)**; 26 commits through 18:17Z; 92,820★ (+89). v1.36 carried the automations cluster (service-account execution #19033, template suggestions from observed setup #19300, unified create/view/edit #19311, Connect Git tour #19350). v1.37: **automations explained with a Mermaid diagram** (#19318 — the automation is a first-class object with a visual explainer); fixes: resumed sessions placed after UTC conversation history (#19400), generated titles stay visible during startup handoff (#19404), **wait for session replay before showing empty chat suggestions** (#19377 — replay-before-empty-state ordering), home page at base path without trailing slash (#19406); perf #19266 — avoid repeated history scans during live updates. Discipline pair: **#19263 name existing control corner radii** (token discipline in the codebase) + #19264 lint rejects arbitrary values. Trunk post-1.37: #19384 — an ACP pick saves to its own profile, not `default`; #19307 — org admins/owners can edit other users' automations; **#19275 — docker exits non-zero when the agent-server stops responding** (startup-honesty family, exit codes again); **#19330 — the script bundle survives automation export/import** (portable automations). | v1.37.0 2026-11-06 12:54Z | MIT, 92,820★ | 4 | **WATCH (pattern briefed)** | #19377 is the empty-state ordering line for our filed replay brief: never suggest "start new" before replay has rendered. #19266 is Paseo #8916's sibling from the query side (don't rescan history per live update). The automation-object cluster (Mermaid explainer + portable bundles + admin-edit rules + service account) sets the UX bar for our future trigger lane — pre-registered, no surface in Stellarc yet. |
| **Factory (Droids)** | **Nov 6 changelog entry** (labeled CLI v1.4.0 / Desktop v1.4.0 — a same-day follow-up to yesterday's v1.4.0; the daily train continues): **new automation menu — Create from template, Create with Droid, or Create manually** (three origins, one entry point); simpler custom-model form ("Behaves like" moved under Advanced); light-mode tool-row spacing. Fixes: saved PRs show their own title in the environment panel (not a placeholder); **New Session offers only Environments the org's computer policy allows, and explains a failed launch**; connector logos/descriptions/categories for Splunk, Elasticsearch, BigQuery; **reopening a compacted session now loads ALL older messages**; **short transcripts load their older messages instead of leaving a button that never loads**; shared automations name their Environment (was "Unknown environment"); PR Babysitter template removed from the gallery. | changelog 2026-11-06 (entry) | proprietary | 5 | **WATCH** | The policy-filtered launch picker + explained failure is picker honesty: options the org forbids never appear, and a failed launch tells you why — the line for our runtime/model pickers when org policy lands. The load-older pair is transcript-pagination honesty at both extremes (compacted and short) → P3c. |
| **Cursor** | **Streak broken — "Build Live Apps in Cursor" (Nov 5)**, 16 days after Agent SDK GA (Oct 20), posted after yesterday's 19:07Z seal. Cloud agents now build *live, shareable apps*: describe what you want, the agent scaffolds the web app, spins up a Postgres database if needed, sets up authentication behind Cursor SSO, and publishes to a unique domain you pick; share with people, groups or the org; deploy from Cursor Origin and GitHub repos. **Guardrails: deterministic + agentic security checks run at publish** (secrets, common issues); **team admins see every app and secret on the team, add their own rules to the security review, and approve**; a Cursor API key can be provisioned for scripts/bots to use the app. All paid plans with cloud agents enabled. | changelog 2026-11-05 (entry live 11-06) | proprietary | 5 | **WATCH** | Not an app-hosting play for a tracker — steal the *gate*: when Stellarc ever lets agents publish shareable artifacts (views, dashboards, reports), the bar is checks-before-share (deterministic + agentic), a complete admin inventory of what agents published and what secrets it holds, and org policy as the outer boundary. Pre-registered as a watch-line; no surface exists. |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; one quiet day after the streak-break. | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; yesterday's mobile-review-is-table-stakes datapoint stands. |
| **GitHub Copilot** | **Two Nov 5 items, both in the usage-metrics API**: "Usage metrics API adds code review details and addressed rate" + "Usage metrics API flags telemetry and version gaps." The spend-attribution surface keeps deepening — review work becomes a metrics dimension, and the API now *flags its own gaps* (telemetry/version) instead of silently under-reporting. | changelog 2026-11-05 | proprietary | 5 | **WATCH (steal patterns)** | Second dimension added to the BYOK usage-attribution schema note: per-activity-kind breakdowns, and explicit data-quality flags in telemetry (a gap flag beats a quiet zero). |
| **Devin (Cognition)** | Changelog unchanged — newest entry still **November 2, 2026** (statically extracted since 11-05). | release notes 2026-11-02 | proprietary | 5 | **WATCH** | Quiet day; fork-continuity gating and live-policy laws carried. |
| **Plane** | **Third consecutive quiet day** — zero default-branch commits since 11-05 00:00 (metadata note: the repo's default branch is `preview`); **v1.4.3 (10-28) stands**; 62,079★ (+51). | v1.4.3 2026-10-28 | AGPL-3.0, 62,079★ | 4 | **TRIAL (stands)** | Longest Plane quiet streak in the beat's history; the v1.4.3 auth/tenant-isolation checklist stays queued on our side. |
| **Huly** | One commit: **#11161 (11-06 06:56Z) — do not persist the Octokit client in the user integration secret** (a live client object was being serialized into the secret store — capability-as-data); 28,061★ (+7). | main 2026-11-06 | EPL-2.0, 28,061★ | 3 | **REJECT (stands)** | Maintenance cadence without an agent story; the fix is a decent reminder never to serialize live handles into stored secrets, but not a lane for us. |

## Proposals

### P1 — Background-work chapter for the agent-view contracts (ADOPT — ready-to-file brief below)

The field converged on the same doctrine this week and Paseo shipped it whole today (#6220): **an
agent session's lifecycle is not one turn**. When a turn ends while agent-owned work continues
(shells, monitors, scheduled loops, delegated tasks), the product must say so — not silently flip
to "done". The surface Paseo shipped: run stays Running, a count above the composer, an expandable
track (kind, friendly description, elapsed time, individual Stop where the provider supports it),
composer stays editable, foreground Interrupt scopes to the active turn only. Multica models the
same objects (MUL-9960 moves pending tasks along on runtime switch), Factory keeps Loops scheduled
across idle pauses, Devin runs background sessions.

Stellarc has no surface for this (grep-verified on dev: no background/shell/monitor concept in
`packages/agents/src`; ACP 1.7 — our pinned protocol — carries no background-work inventory; Paseo
reads provider-specific inventories from Claude/Codex/OpenCode v2). The honest shape is therefore
the same one that produced Section F: **pin the UI contract now, as acceptance lines in the
agent-view contracts doc, with an explicit data-source note** — the runtime half waits on an ACP
background-work inventory or a provider extension. Ready-to-file brief posted as a comment this
run; Talos decides whether to file.

### P2 — Record-at-birth, never interrogate-at-runtime (addendum to the filed startup-honesty brief; TRIAL — no new brief)

Three same-window ships of one law:

- **Paseo #8818**: terminal workers no longer query their own birth time or command line — the
  Windows PowerShell identity query that took Desktop's daemon down (v0.15.1 #8810) is *removed*,
  not patched around; the worker record supplies pid, secret and socket, recorded at birth.
- **Paseo #8890**: workspace creation parentage is *recorded* at creation, not reconstructed later.
- **Multica MUL-8655 + #9996**: pidfd support and cleanup capability are checked *before* launching
  the agent — refuse or degrade early, never die mid-flight on a platform query.

Law: **identity, parentage and capability facts are written into the stored record when the thing
is created; runtime lifecycle never re-derives them by interrogating the OS; platform capability
checks happen before launch and degrade gracefully.** Stellarc anchor, verified this run:
`apps/stellarc-node/src/runner.ts:347-356` spawns the harness and `:651` escalates SIGTERM→SIGKILL —
no identity queries exist today (clean). The line joins the filed startup-honesty brief as an
addendum for when supervision grows: fold when picked up, verify-first.

### P3 — Transcript-honesty trio (addendum to the filed live-status & replay brief; TRIAL — no new brief)

Three seams where today's fixes show transcripts lying by omission — all three are acceptance
lines for the filed brief (the same vehicle Section F rode):

- **Turn-boundary atomicity** (Paseo #8944): a turn's finished state and its final reply render
  *together*. The observed bug: finished-turn-with-no-reply flash, then ~750 ms later the reply and
  footer arrive and the chat jumps twice. Never render a terminal state whose final content hasn't
  landed.
- **Snapshot structural identity** (Paseo #8916): a whole-snapshot agent update must not create
  fresh references for unchanged nested objects (`capabilities`, modes, labels) — every message row
  was re-rendering on each update because memoization inputs changed identity, not value. The UI's
  re-render scope is the changed agent/row, never the list. (OpenHands #19266 is the query-side
  sibling: don't rescan history per live update.)
- **Load-older works at the extremes** (Factory, Nov 6): a compacted transcript loads *all* its
  older messages on reopen, and a short transcript never shows a Load-older button that can't load
  anything. A dead affordance is a P1-class lie.

Plus one ordering rule already adjacent to the filed replay lines: **OpenHands #19377 — replay
renders before empty-state suggestions appear** ("start a new chat" suggestions must wait for the
replay verdict).

## Non-findings / notes

- **Stellarc releases still empty** (re-verified 11-06 via GitHub API) — the landed NEVR-198
  scoped-permission pipeline remains unverified-on-a-release.
- **Cursor timing**: yesterday's "16 days quiet" was correct at seal time (19:07Z); the Nov 5
  entry appeared in the window. Streak readings are seal-time facts.
- **Plane metadata**: default branch is `preview`, not `master` — quiet-day reads query the right
  branch.
- **Methodology**: Hermes `web_extract` provider was down this run (`9router` unregistered); vendor
  changelogs fetched via curl (all five served static HTML — Linear, Cursor, Devin, Factory,
  github.blog). GitHub data via `gh api` as before.
- Windows sealed at: Multica 18:17:49Z (#10068), Paseo 18:57:29Z (#8946), OpenHands 18:17:48Z
  (#19384).
- Verification sources: api.github.com/repos/{multica-ai/multica, getpaseo/paseo,
  OpenHands/OpenHands, makeplane/plane, hcengineering/platform, NevrLabs/stellarc} (commits,
  releases, metadata, 2026-11-06 ~19:00Z); release bodies for multica v0.8.1, paseo v0.15.3,
  openhands v1.36.0/v1.37.0; PR bodies getpaseo/paseo#{6220, 8939, 8944, 8811, 8916, 8818, 8904};
  changelog HTML fetched 2026-11-06 ~18:5xZ.
