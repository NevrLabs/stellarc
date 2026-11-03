# Scout — Competitors, 2026-11-03

Beat: **competitors**. Delta window: 2026-11-01 19:42 UTC → 2026-11-03 19:30 UTC
(~48h). The 11-02 competitors run's PR #173 never merged, so this run
re-verified the whole window fresh from primary sources and carries its open
items (nothing reused from that report's fetches). Every claim verified against
a vendor changelog/release notes, the GitHub API, or repo metadata on
2026-11-03. Context: Stellarc = self-hostable, inert control plane (v2 charter)
+ BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`);
the UI future is `apps/web` greenfield (ADR 0014). `docs/steal-reject-matrix.md`
and `docs/v2-charter.md` are the standing filters.

## The one-line read

The field erupted after two quiet days — **five movers**: **Paseo v0.15.0
stable** (11-03 05:59Z, agent recovery shipped opt-in), **Multica v0.8.0**
(11-03 10:30Z — the four-day brewing tag landed, with `multica 1.0 part 1`
inside it), **OpenHands v1.35.0** (11-03 18:47Z — the startup-honesty doctrine
GA'd, plus a perf cluster), **Factory v1.2.0** (11-03) and a **GitHub Copilot
changelog burst** (five Nov-3 entries). Devin moved to a Nov-2 entry. And the
deepest signal is convergence on a lane we already occupy: **interrupted-run
recovery** — Paseo made it stable (opt-in) and keeps hardening it (#8686:
recovery preserved through graceful shutdown), Multica shipped MUL-8453
(shutdown interrupts now retryable, preserving session/workdir/usage). Our
NEVR-415 landed 11-02 (#162, ported to v4 in #164) but admits **one of five
platform failure codes** — the other four still retry with amnesia, through an
extension point `protocol.ts` explicitly names ("platform.* codes not yet
admitted per-code"). That's this run's P1. P2 files the OpenHands
live-status/replay contract as a sibling brief to the design run's
proposal-2 interaction contracts for the apps/web agent views.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | **v0.15.0 STABLE (11-03 05:59Z)** + trunk hot (46 commits in-window, pushed 19:25Z). Stable headline: daemon restarts/crashes/supported updates **keep terminal programs running** (#7644/#8155); **interrupted agents resume in their existing conversations — opt-in** (#8127 + #8619: host setting "Resume agents after restart", sends `Resume working.` or a custom prompt; off by default); mobile native terminal rendering + 10,000-line scrollback restore on reconnect (#8282); `.worktreeinclude` copied before agents start (#8100); daemon-wide `HTTP(S)_PROXY` (#8177). In-stable fixes in our lanes: **#8384 — ACP startup exits waited for a timeout instead of reporting the process error** (the exact class our filed startup-honesty brief targets); **#8396 — newly running agents appeared finished immediately** (stale-snapshot law); steering-never-replaces-a-starting-turn (#6192); skills missing when commands arrive in multiple batches (#8387). Trunk after the tag (14 commits): **#8406 — fail a prompt to a disconnected ACP agent instead of hanging**; #8686 — preserve restart recovery during graceful shutdown; #8613 — Codex multi-file patch diffs stay in the timeline; #8585 — show the file and diff before patch approval; #8575 — report completion after waking remote closed agents; #8579 — Git refreshes finish before daemon shutdown; #8611/#8607 — cron guards (restricted-day matching; reject steps that would silently run hourly); #8363 first-run setup; #8636 link `#123` refs in chat; #8625 hardware keyboard shortcuts. | v0.15.0 2026-11-03 (trunk pushed 19:25Z) | Apache-2.0 + third-party carve-out (NOASSERTION), 22,934★ (+213 vs 11-01) | 4 | **TRIAL (elevated, stands)** | The recovery race is now three-way (Paseo stable / Multica v0.8.0 / our NEVR-415) — and ours is the most conservative scope (platform faults only, automatic) where Paseo is opt-in-broad. Their opt-in default is a design datum worth remembering: resume changes spend and side-effect behavior, so Paseo made the operator turn it on. Our P1 below closes the code-coverage gap inside our narrower, automatic scope. |
| **OpenHands** | **v1.35.0 (11-03 18:47Z)** — the startup/live-status doctrine shipped to release: open conversations immediately with inline startup progress (#19155), live agent status in chat (#19130), startup activity in sidebar rows (#19190), startup + agent activity in one stable group (#19111/#19219), clear session startup and resume details (#19249), sentence-style activity summaries + simplified single-tool group disclosure + blocked hooks folded into groups (#19254/#19250/#19252), compact timestamps on hover (#19227). **History-replay chapter**: terminal output restored as itself (#19220), no "Thinking" flash during replay (#19225), saved state displayed before runtime readiness (#19195), older history not loaded before first scroll (#19245), compact Cloud history (#19203), missing conversation reported once (#19175). Perf: defer inactive panels on open (#19153), metadata load on sidebar selection (#19205), no rebuilding unchanged sidebar rows (#19213), replay prepared during navigation (#19248). Also: workspace/repo metadata + sidebar pin/archive as **server-side conversation tags** (#16666, #18697); model-switch initiator + agent rationale shown (#18428); paused sandbox resumed by next message (#19186); automations expansion (editable `keep_alive` #19125, Events webhook sources view #19034, per-source event types #19025, integration-matched template suggestions #19101); ACP catalog skills sent on launch (#18834); ingress/static-server restart on exit (#19256). | v1.35.0 2026-11-03 (51 trunk commits in-window) | MIT, 92,585★ | 4 | **WATCH (pattern → briefed, P2 below)** | The doctrine is now release-hardened with a replay chapter — the exact two surfaces our apps/web agent views will need (live task route + reopen/replay). Our backend already streams (500 ms flush, live usage items); the laws are a UI-contract concern. Filed as a sibling to design 11-03 proposal 2: they own interaction contracts (scroll/approvals/diff/cost), this owns lifecycle/rendering laws. Server-side conversation tags are a tidy pattern for our sidebar-state sync when views gain per-user layout. |
| **Multica** | **v0.8.0 (11-03 10:30Z) — the four-day brewing tag landed; 54 commits in-window; trunk still pushing post-tag (15:06Z).** Inside: **`feat(core): multica 1.0 part 1` (MUL-8317 #9635)** — the 1.0 march begins; **MUL-8453 — retry tasks interrupted by shutdown** (#9778: parent-context cancellation reclassified as retryable `runtime_recovery`, preserving usage/session/workdir/attempt-limits); MUL-8466 — **per-run token usage incremental from ACP `usage_update`** (#9791, snapshots ≤30 s; we already do 500 ms — see non-findings); MUL-8328 runtime-wide concurrency limit; MUL-8402 Pi 1.4 RPC steering; **MUL-8441 — default to one issue, one PR; point sub-issue runs at their parent** (#9844); MUL-8413 resume Claude sessions across continued local worktrees; attention surfaces: **agent status filter savable into views** (MUL-8436), **unread dot for finished agent runs** (MUL-8438), status change from the sidebar icon (MUL-8437), right-click quick actions (MUL-8425), Projects settings synced across devices (MUL-8429); per-workspace windows (MUL-8432); TS 7 for workspace type checks (MUL-8474); brand v3.1; pricing-table fixes (MUL-8418 Cursor variant/GPT-5.6, MiniMax-M3). **In-release churn**: the two-section Inbox shipped and was reverted (#9815→#9875); the PR-review wakeup trigger shipped and was reverted (#9839→#9862) — both the feature and its revert are in the tag body. Post-tag: agents read the issues in a saved view (MUL-8532), worktree-turn leftovers kept off the branch once the agent commits (MUL-8463). | v0.8.0 2026-11-03 10:30Z | proprietary, 54,768★ | 5 | **WATCH (steal attention surfaces)** | The steal list moves: the cost-UI steal is now confirmatory only (we stream faster; the apps/web cost contract rides design proposal 2c). What's new to steal is the **attention surface set** — unread dots on finished agent runs, agent-status filters savable into views, status flips from the board without opening the issue: exactly the operator-facing layer our apps/web board lane will need, cheap to adopt as acceptance lines there. MUL-8453 feeds P1 (same convergence). Their two feature-reverts inside one tag are a release-hygiene counterexample: our one-issue-one-PR default exists to avoid exactly this shape. |
| **Factory (Droids)** | **v1.2.0 (11-03) — CLI + Desktop.** Exec startup no longer slows with hundreds of tools available; **remote machine reconnects — redials a machine whose connection died during sleep instead of failing the message**; stopping during turn wrap-up ends the turn instead of starting another; blank-window self-recovery on view crash; API-key reveal stays until deliberately closed + revoke confirmation; screen-reader names on tab lists and wiki search; org-policy timeout no longer reported at its deadline; editor selection kept as shared context when focusing the Droid terminal. | v1.2.0 2026-11-03 | proprietary | 5 | **WATCH** | Third release in five days (1.0→1.1 10-30→1.2 11-03) — the fastest train on the board. The redial item is the same law as Paseo #8406: transient connection death must not fail in-flight work — reinforcement for our filed startup/connection-honesty brief. Startup-with-many-tools is a guard for our own node catalog path if tool counts grow. |
| **Plane** | v1.4.3 stands; **3 more commits 11-03** after the 11-02 Propel sync: design-system QA sweep across the web app (#10178), OAuth provider form shared + csrf warning fix (#10173), **`base_host` no longer shadowed in space OAuth callbacks** (#9922). | v1.4.3 2026-10-28 (trunk active) | AGPL-3.0, 61,913★ | 4 | **TRIAL (stands)** | Awake and healthy. The OAuth shadowing fix lands in the same lane as the v1.4.3 tenant-isolation checklist already queued for our auth surface. Propel remains a design-lane datapoint (cross-referenced 11-02/11-03 design runs). |
| **GitHub Copilot** | **Changelog burst: five 2026-11-03 entries + two 11-02.** Nov 3: Copilot available in **JetBrains Air**; cost-center lookup via REST API; CodeQL 2.27.3; Dependabot Python 3.15; GitHub Desktop short-lived auth tokens. Nov 2 (carried from the unmerged 11-02 report): security risk assessments include repository protection status; `pull_request_target` blocked by default from Dec 2. | changelog 2026-11-03 (feed) | proprietary | 5 | **WATCH (steal patterns)** | JetBrains Air is another surface expansion for agent reach; the security-posture pair (protection status feeding risk scoring; dangerous workflow defaults flipped) remains the pattern to keep in mind when our task-risk signals get designed (pairs with our scoped-permission pipeline and the filed audit-read API brief). |
| **Devin (Cognition)** | Newest entry moved: **November 2, 2026** (first visible date; entry dates Oct 30 → Oct 28 follow). The page is client-rendered — entry titles are not present in static HTML, so the title is unverified this run; the date list is grep-verified from the rendered page. | release notes 2026-11-02 | proprietary | 5 | **WATCH** | Moving again after the Oct-28 plateau. Guard notes stand: `dateModified` ≠ entry date; next run should extract the entry title (browser render or the docs app's data endpoint) before crediting a specific capability. |
| **Linear** | Changelog unchanged — top entry still **2026-10-22** ("More ways to run and share Loops"; title re-extracted this run). Twelve days quiet — the longest streak on the board. | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Per-loop reasoning levels remain the automation-cost dial on the radar. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA; date grep-verified). Fourteen days quiet. | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Agent SDK's channel-first deployment shape stays the standing reference. |
| **Huly** | Nothing new since the 11-02 batch (18 fixes, 05:26–05:50Z); last push 11-02 05:49Z, zero commits 11-03. | main 2026-11-02 | EPL-2.0, 28,043★ | 3 | **REJECT (stands)** | Maintenance cadence without an agent story. |

## Proposals

### P1 — Attempt continuity, code coverage: admit transcript-safe `platform.*` codes to resume (ADOPT — brief filed)

The field converged on interrupted-run recovery this week and our
implementation is live but narrow. Verified in-tree:

1. **NEVR-415 landed 11-02** (#162 `0ad80e1`, ported to effect/v4 in #164):
   a retry of `platform.lease_expired` replays the resume chain's transcript
   into the new session — chain query and `omitted`-marker digest at
   `store.ts:1117-1140` + `runner.ts:310-327`, gate at `store.ts:1122-1128`
   (reads the queued row's `failure_code` before the claim UPDATE clears it).
2. **But the resumable set is one code**: `RESUMABLE_FAILURE_CODES =
   { platform.lease_expired }` (`store.ts:491-493`), while `isRetryable` is
   every `platform.*` code (`protocol.ts:28`). So `platform.harness_exited`
   (child death — OOM, crash, wrapper failure), `platform.harness_unavailable`
   (never started), `platform.protocol_error`, and `platform.node_error` all
   retry **with amnesia** today: fresh session, `task.prompt` only, re-burned
   tokens, re-run side effects.
3. **The extension point is pre-built and self-documented**: `protocol.ts`
   states resume is excluded on "agent_error.* retries (the transcript may be
   the poison), and on platform.* codes **not yet admitted per-code**";
   `renderResumeDigest` already parameterizes `resume.failureCode` ("was
   interrupted by a platform fault … the runtime died under you").

Convergence evidence: Paseo v0.15.0 stable recovery (#8127/#8619) + #8686
(recovery preserved through graceful shutdown, trunk 11-03); Multica v0.8.0
MUL-8453 (shutdown interrupt → retryable, preserving session/workdir/usage/
attempt-limits). All three treat the transcript as the recovery asset; we are
the only ones gating it by failure code — keep the gate, widen it by rule.

**Rule for the brief**: admit a code when its failure mechanism cannot have
corrupted the *recorded* transcript — `platform.harness_exited` (process death
under the agent), `platform.harness_unavailable` (nothing ran; chain still
carries earlier attempts), `platform.node_error` (node-side fault; items were
seam-validated before persisting). Hold `platform.protocol_error` for a real
case (a harness violating the protocol mid-stream may have produced a partial
final item; the seam validates item shapes, but the boundary deserves evidence
before admission). `agent_error.*` stays excluded — the transcript may be the
poison. Implementation is the set change plus tests; the claim-time gate,
chain query, and digest renderer are code-agnostic already. Regression tests:
(a) attempt fails `platform.harness_exited` after items → reclaim seeds the
resume chain and the digest names the code; (b) `agent_error.*` retry still
cold-starts; (c) consecutive resumable failures keep the chain (existing
NEVR-415 behavior, re-run for the new codes).

### P2 — apps/web agent views: live-status & replay contract (ADOPT — brief filed, sibling to design 11-03 proposal 2)

OpenHands v1.35.0 hardened a full doctrine into release law; the design run's
proposal 2 owns the *interaction* contracts (anchored-stream scroll, HITL
approvals, diff review, cost telemetry). This brief owns the *lifecycle and
rendering* laws for the same surfaces — file it as a sibling against the
apps/web lane, blocking nothing until the agent views start:

- **Render first**: the task/transcript route renders immediately; startup,
  queue, claim and first-token states stream into it as transcript items
  (OpenHands #19155). Never gate the open on readiness.
- **Live status**: the agent's current status renders in the conversation
  (#19130) and startup/activity state surfaces in sidebar task rows (#19190),
  in one stable activity group (#19211/#19219) with sentence-style summaries
  (#19254).
- **Replay honesty**: replay renders only persisted items — no synthesized
  transient states (#19225); restored output renders as itself (#19220);
  saved state shows before runtime readiness (#19195); older history is not
  fetched before the initial scroll (#19245); the `resumed_from` marker (NEVR-415)
  is the replay seam and must render as context, not instruction.
- **One failure, one surface** (#19175 — third sighting of the law).
- **Perf shape**: defer inactive panels on open (#19153); start metadata load
  on sidebar selection (#19205); don't rebuild unchanged sidebar rows
  (#19213).

Our backend already satisfies the streaming half — items flush every 500 ms
(`runner.ts:512`), usage items arrive on every ACP `usage_update`
(`runner.ts:142-154`), the event log is the source of truth and
`docs/transcript-schema-v2.md`'s kind union is the item vocabulary. The brief
is UI acceptance criteria only; no backend change.

### P3 — Carried open items: pins and reinforcements (TRIAL — verify-first, no new brief)

The 11-02 run's PR never merged; its open items survive here re-verified:

1. **Settle pending approvals on terminal failure** (11-02 P1 brief, filed,
   still not landed — no matching commit on dev through 11-03): `finish()`
   settles no pending approval items; a harness death while a permission
   request is parked leaves a forever-pending approval in the audit trail.
   Paseo's approval-lifecycle cluster is at day 5 (#8548 → #8477 → #8525 →
   now #8585 "show the file and diff before patch approval") — the hardest
   state machine in the field, and the one law we haven't pinned. The brief
   stands as filed.
2. **Startup/connection honesty brief reinforcement** (filed 10-31, still not
   landed): Paseo **#8406** (a prompt to a disconnected ACP agent hung; now
   fails) adds the *prompt-send-time* case to the hang-alive class — our
   `conn.prompt` call (`runner.ts:595`) races the `exited` promise but has no
   deadline; **#8384** (in stable) is the initialize/newSession twin; Factory
   v1.2.0's redial is the connection-death twin. Fold all three as named
   precedents into the filed brief when picked up.
3. **Graceful lease release on shutdown** (11-02 P2 candidate, still open):
   SIGINT/SIGTERM aborts the claim loop and drains (`main.ts:244-245`), but no
   lease-release call exists — after drain, a clean shutdown could release its
   leases and cut requeue latency from `leaseMs` to ~0. Verify the `leaseMs`
   default, write the tradeoff in one paragraph.
4. **Usage-on-failure pin** (Paseo #8519): we hold — usage is carried on
   failed stops (`runner.ts:600-618`), the final flush runs regardless of
   outcome (`:646-650`), `finish()` COALESCE-merges for any outcome
   (`store.ts:1486-1498`). Pin with a regression test so the law survives.

## Notable non-findings

- **Multica's tag landed** — v0.8.0, 11-03 10:30Z, four days after the
  brewing started. The release body contains two feature-reverts (Inbox
  two-section, PR-review wakeup trigger) — churn inside a tag our
  one-issue-one-PR default exists to prevent.
- **We keep the live-usage lead**: MUL-8466 snapshots at most every 30 s; our
  runner pushes a `usage` item per `usage_update` with 500 ms flushes and the
  plane upserts `agent_task_usage` + emits events live. Confirmatory for the
  apps/web cost contract (design proposal 2c), not a gap.
- **NEVR-415 landed and ported** (dev #162, effect/v4 #164) — the 11-01
  ADOPT brief executed; radar row flips to landed, and P1 extends it rather
  than re-filing it.
- **Stellarc still has zero releases/tags** (verified 11-03) — the NEVR-198
  row stays open until a release carries the scoped-permission pipeline.
- **PR #173 (11-02 competitors) superseded** by this report: every source in
  its window was re-fetched fresh here, its open items carried into P3, and
  its INDEX rows folded into this run's update. Closed with a pointer.
- **Devin's Nov-2 entry title** could not be extracted from static HTML (the
  changelog is client-rendered; only the sidebar date list is server-side).
  Date verified; title deferred to a run with a rendered browser.
- **Multica's MUL-8441** (one issue, one PR default; sub-issue runs point at
  their parent) mirrors the convention this workspace already runs on —
  nothing to steal, but it validates the default for any Stellarc
  agent-created-issue future.
- Linear (12 days) and Cursor (14 days) are the longest quiet streaks on the
  board; GitHub Copilot went from 5-day quiet to a 7-entry burst in one day —
  feed latency varies, which is why every row re-verifies from the feed.

## Sources

- Paseo v0.15.0 release body (full, fetched this run): api.github.com/repos/getpaseo/paseo/releases/tags/v0.15.0 (published 2026-11-03T05:59:04Z; recovery opt-in note #8619, stable-only #8384/#8396)
- Paseo trunk commits 11-01 19:58Z → 11-03 19:25Z (46) + repo metadata (22,934★, pushed 2026-11-03T19:25:44Z, license NOASSERTION): api.github.com/repos/getpaseo/paseo (fetched 2026-11-03)
- OpenHands v1.35.0 release body (full, release-please-generated; all PR numbers above from it): api.github.com/repos/All-Hands-AI/OpenHands/releases/tags/v1.35.0 (published 2026-11-03T18:47:18Z) + trunk commits 11-01 19:08Z → 11-03 18:22Z (51) + metadata (92,585★, MIT)
- Multica v0.8.0 release body (full changelog commit list incl. multica 1.0 part 1, both reverts): api.github.com/repos/multica-ai/multica/releases/tags/v0.8.0 (published 2026-11-03T10:30:52Z) + commits 11-01 15:38Z → 11-03 15:06Z (54) + metadata (54,768★, pushed 2026-11-03T15:06:48Z)
- Factory changelog feed (newest v1.2.0, 2026-11-03, full body): docs.factory.com/docs/changelog/feed.json (fetched 2026-11-03)
- Plane commits since 10-30 19:00Z (5: #10038/#10122/#10147 11-02, #9922/#10178/#10173 11-03) + releases (v1.4.3 stands) + metadata (61,913★, AGPL-3.0): api.github.com/repos/makeplane/plane (fetched 2026-11-03)
- Huly commits since 10-31 (18 on 11-02, zero 11-03) + metadata (28,043★, EPL-2.0, pushed 2026-11-02T05:49:58Z): api.github.com/repos/hcengineering/platform (fetched 2026-11-03)
- GitHub changelog feed (newest 2026-11-03 ×5, 2026-11-02 ×2; titles from feed): github.blog/changelog/feed/ (fetched 2026-11-03)
- Linear changelog (top entry "More ways to run and share Loops", October 22, 2026; title context-extracted this run): linear.app/changelog (fetched 2026-11-03)
- Cursor changelog (top date 2026-10-20, grep-verified): cursor.com/changelog (fetched 2026-11-03)
- Devin release notes (first visible entry date November 2, 2026; static HTML carries the date list only): devin.ai/changelog (fetched 2026-11-03)
- Stellarc releases (empty — no tags): api.github.com/repos/NevrLabs/stellarc/releases (fetched 2026-11-03)
- Stellarc grounding: `packages/agents/src/store.ts:491-493` (RESUMABLE set of one), `:1117-1140` (resume gate + chain query, failure_code read before clear), `:1419-1433` (live usage upsert), `:1486-1498` (finish merges usage any outcome); `packages/agents/src/protocol.ts:15-24` (failure-code taxonomy), `:28` (isRetryable = platform.*), `:269-270` ("not yet admitted per-code" comment), `:300` (TaskResume); `apps/stellarc-node/src/runner.ts:142-154` (usage item per usage_update), `:310-327` (renderResumeDigest, failureCode parameterized), `:512` (500 ms flush), `:595` (conn.prompt, no deadline), `:600-618` (usage carried on failed stop), `:636-653` (exited race + attribution window); `apps/stellarc-node/src/main.ts:244-245` (SIGINT/SIGTERM abort/drain, no lease release); `docs/transcript-schema-v2.md` (kind union); NEVR-415 merge `0ad80e1` (#162) + v4 port `f6ce9a4` (#164) via git log; approval-settlement and audit-read briefs verified NOT landed (git log --grep approval/audit since 10-25, zero non-scout hits)
- PR #173 state (open, scout/2026-11-02-competitors) + open-PR list: `gh pr list` (2026-11-03); its report read via `git show scout/2026-11-02-competitors:docs/scout/2026-11-02-competitors.md`
