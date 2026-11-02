# Scout — Competitors, 2026-11-02

Beat: **competitors**. Delta window: 2026-11-01 19:42 UTC → 2026-11-02 19:11 UTC.
Every claim verified against a primary source (vendor changelog/release notes,
GitHub API, or repo metadata) on 2026-11-02. Context: Stellarc = self-hostable,
inert control plane (v2 charter) + BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`).
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

**Yesterday's P1 proposal is already landed**: attempt continuity (NEVR-415)
merged as #162 (`0ad80e1`) — `resumed_from` transcript markers
(`apps/stellarc-node/src/runner.ts:119-125`), resume-chain replay at claim
(`packages/agents/src/store.ts:1117-1140`), `RESUMABLE_FAILURE_CODES = {
platform.lease_expired }` (`store.ts:491-493`). This run's headline is
**Paseo #8548's bug class verified as a real gap in our tree**: a task that
fails while a permission request is parked leaves a **forever-pending approval
item** in the audit trail — `finish()` settles no pending approvals (only
`cancelTask` and `reapExpired` do). Around it: **Multica's brewing release went
substantive** (30 commits on 11-02, still no tag: runtime-wide concurrency
limit, incremental ACP usage reporting, shutdown-interrupt retry, Pi RPC
steering) — and two of its three headline features turn out to be things we
already hold by construction (node-level concurrency cap; live usage on the
wire every 500 ms). **OpenHands extended its startup-honesty doctrine to
history replay** (29 commits). **Plane broke three days of silence** by
rebuilding all three of its UIs on the Propel design system. Linear, Cursor,
Devin, Factory: quiet, guard notes stand.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | No new release (v0.15.0-beta.1 of 11-01 stands); **21 trunk commits in-window** (11-01 19:58Z → 11-02 18:29Z). **Approval-lifecycle cluster, day 3**: #8548 — an ACP agent that abandons an approval request and ends its turn left the approval pending, blocking the next `paseo send` ("Agent is waiting for permission"); now cleared when the tool finishes or the turn ends, preserving failed/cancelled-turn behavior. #8477 — denial reasons preserved when a message supersedes an approval (OpenCode). #8525 — question choices stay open until explicit navigation. **Usage honesty on failed turns**: #8519 — Claude turns stopping at the max-turn limit now retain final token counts and cost (the adapter publishes its existing usage event *before* reporting failure); #8480 — Claude API-error turns were reported as `completed` with no `lastError`; now failed, error displayed once. Also: #8527 — **plugins stream live events and binary data to the app** (`defineSubscription`, server-initiated streams, binary frames instead of base64-in-JSON); #8568 reconnecting/status states stay visible in native chats; #8554 archived chat runtimes released after history replay; #8579 Git refreshes finish before daemon shutdown; #8509 moved-file paths and diffs intact in commit history; #8492 agent message provenance preserved in timeline transforms; #8483 the UI explains the mode required to create agents on another provider. | trunk 2026-11-02 (v0.15.0-beta.1 11-01) | Apache-2.0 + third-party carve-out (NOASSERTION), 22,821★ (+100) | 4 | **TRIAL (elevated, stands)** | Three consecutive days of approval-lifecycle fixes across three harnesses (Claude/OpenCode/ACP-generic) says this is the hardest state machine in the field — and #8548's exact class is verifiably ours too (P1 below). The usage-on-failure pair (#8519/#8480) is a law we substantially hold (see non-findings) — pin it with a test. #8527's subscription shape is the reference for our D11 plugin-transit lane when it opens. |
| **Multica** | **No new tag (v0.7.2 of 10-30 stands) — but the brewing release went substantive: 30 commits on 11-02 (02:37Z→16:26Z), all feature/fix work.** MUL-8328 #9795 — **runtime-wide concurrency limit**: per-agent `max_concurrent_tasks` cannot serialize several agents sharing one runtime (e.g. one local GPU); adds nullable `agent_runtime.max_concurrent_tasks` (migration 605, NULL = unchanged) enforced in `claimTask`. MUL-8466 #9791 — **per-run token usage reported incrementally from ACP `usage_update`**: cumulative usage + cost while a Hermes task is still running, snapshots at most every 30 s when totals change; requires Hermes-side cumulative `_meta.usage` (NousResearch/hermes-agent#147785). MUL-8453 #9778 — **retry tasks interrupted by shutdown**: daemon shutdown reported interrupted runs as non-retryable `cancelled` (empty error) so rollouts stopped unattended work with attempts remaining; parent-context cancellation is now classified as the retryable `runtime_recovery`, preserving usage, session/workdir metadata, attempt limits, deadlines. MUL-8402 #9716 — Pi 1.4 RPC steering (Supplement/SupplementReady; JSONL prompt/steer; ends with `agent_settled`, preserving post-`agent_end` auto-retry). MUL-8405 #9721 — drain Claude control replies before closing stdin. MUL-8474 #9806 — TypeScript 7 for workspace type checks. Plus: skills import limit errors + 512-file cap (MUL-8493), filesystem-allocated skill names (MUL-6991), Pi-runtime skill loading via `--skill` (MUL-8421), stale-checkout warning (MUL-8419), WeCom QR bot connect (MUL-8388), mobile builder panes (MUL-8415), agent-settings reachability (MUL-8489). | v0.7.2 2026-10-30 (30 commits 11-02, no tag) | proprietary, 54,634★ | 5 | **WATCH (steal P1 cost UI)** | Four days of pushes without a tag, but this is no longer cosmetic — v0.7.3 is visibly assembling around exactly our lane: concurrency, live cost, shutdown retry, steering. The two comparisons that matter: (a) their NEW runtime-wide limit is our EXISTING design (node `config.concurrency` gates the claim loop, `main.ts:204-207`; workdirs are per-task, `main.ts:124` — shared-GPU = set node concurrency to 1); (b) their 30 s usage snapshots are slower than our 500 ms `usage` items (`runner.ts:142-154`, `:512`) with live `agent_task_usage` upserts + events (`store.ts:1419-1433`). Confirmatory evidence for NEVR-243, not a gap. MUL-8453 feeds P2 below. |
| **OpenHands** | No release (v1.34.0 of 10-27 stands); **29 trunk commits in-window** (11-01 19:46Z → 11-02 18:12Z) — the startup-honesty doctrine **extended to history replay**. #19220 — terminal output restored from saved conversation history; #19225 — history replay no longer flashes "Thinking"; #19245 — older history not loaded before the initial chat scroll; #19195 — saved Cloud history displayed before runtime readiness; #19203 — compact Cloud history request; #19207 — initial history failures retried before socket fallback; #19209 — shared conversation titles revealed during startup; #19249 — clear session startup and resume details; #19211/#19219 — startup and agent activity in one stable conversation group; #19175 — a missing conversation reported exactly **once**; #19213/#19205 — sidebar row/metadata load perf; #19227 — compact timestamps on hover; #19250 — simpler single-tool group titles; #19216/#19166 — theme alias + font-size hygiene; #19125 — automation `keep_alive` editable on the detail page; #19239 — event-trigger destination preserved on edit; #19229 — VS Code URL opened with `noopener`, http(s) only; #19230 — launcher port fallback; #19078 — Azure DevOps SSH remotes link to `_git` pages. | trunk 2026-11-02 (v1.34.0 10-27) | MIT, 92,511★ | 4 | **WATCH** | Yesterday's pre-registered P3 pattern (render destination immediately, stream status in) now has a replay chapter: replay must restore persisted output as itself, with zero transient misstates. Cheap to pre-register against our transcript schema v2 + UI lane (P3 below). #19175 is the one-failure-one-surface law resurfacing — second sighting. |
| **Plane** | **Broke three days of silence: 2 commits to main 11-02.** #10038 — **web, Space and Admin UI synced onto the Propel design system**: screens rebuilt on published `@makeplane/propel` primitives + `@plane/blocks` composites with shared type/colour/spacing tokens; Propel 0.7.3→0.9.7, Base UI 1.6→1.8, Tailwind 4.2.4; `lucide-react` removed in favour of Propel icons. #10122/#10147 — profile settings save with empty last name. | v1.4.3 2026-10-28 (trunk moved 11-02) | AGPL-3.0, 61,880★ | 4 | **TRIAL (stands)** | A three-UI consolidation onto versioned design-system primitives + composites is the exact shape of our post-freeze design lane (T02 / `@shadcn/lint` / design contracts): published packages, not per-app CSS. Also a Base-UI data point (they moved 1.6→1.8; we're on 1.9). Cross-beat note for the design run; the v1.4.3 auth checklist stays queued. |
| **GitHub Copilot** | Changelog moved: two 2026-11-02 entries — "Security risk assessments include repository protection status" (risk scoring now considers whether repo protections are enabled) and "pull_request_target blocked by default December 2" (platform-wide security default). | changelog 2026-11-02 | proprietary | 5 | **WATCH (steal patterns)** | Both entries are the same pattern: security posture as a first-class input to agent gating. Our scoped-permission pipeline (NEVR-198, landed) plus the audit-read API brief (filed 10-31) is the same direction; "risk assessment reads repo protection status" is a nice concrete input worth remembering when we design task-risk signals. |
| **Factory (Droids)** | Feed unchanged — newest entry still **v1.1.0 (10-30)** (org audit API, doctor duplicate-install checks, session file drops). | v1.1.0 2026-10-30 | proprietary | 5 | **WATCH** | Third consecutive quiet day after the 1.0→1.1 burst. The daily-train discipline remains the cadence contrast case. |
| **Linear** | Changelog unchanged — top entry still **2026-10-22** ("More ways to run and share Loops"; date order grep-verified). | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Quiet (fourth consecutive check). Per-loop reasoning levels remain the automation-cost dial on the radar. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA; date grep-verified). | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Quiet. Agent SDK's channel-first deployment shape stays the standing reference. |
| **Devin (Cognition)** | Newest entry still **Oct 28** (entry-date grep: first visible dates October 28 → October 26 → …; the `dateModified` rebuild-stamp guard from 11-01 held again). | release notes 2026-10-28 | proprietary | 5 | **WATCH** | Quiet; guard note stands — `dateModified` ≠ entry date. |
| **Huly** | 18 fixes batch-pushed 11-02 05:26–05:50Z: tracker polish (default label category restored on upgrade #11102, milestones searchable #11115, done/cancelled not shown overdue #11098), GitHub `not_planned` → Canceled mapping (#11090), web-push TTL so offline devices don't get stale notifications (#11104), service check enforced in `getMailboxSecret` (#11095), meeting-room access reset (#11118). | main 2026-11-02 | EPL-2.0, 28,041★ | 3 | **REJECT (stands)** | A maintenance batch, zero agent story. The `getMailboxSecret` service check is the only security-flavored item — same class as Plane's v1.4.3 checklist, already queued. |

## Proposals

### P1 — Settle pending approvals on terminal failure paths (ADOPT — brief filed)

Paseo #8548 (11-02 13:22Z) fixed: an agent that abandons an approval request
and ends its turn left the approval pending forever, blocking the provider.
Verified in our tree, the same class exists — smaller blast radius (no
provider liveness at stake; our session dies with the attempt) but the same
audit lie:

1. The runner parks a permission request and flushes an `approval` transcript
   item with `status: "pending"` (`runner.ts:444-453`). The verdict arrives
   only via heartbeat (`settleParked`, `runner.ts:506-511`) or a
   cancel/deny path.
2. If the harness dies or ends its turn while the request is parked, `drive()`
   returns failed/cancelled; the heartbeat and flush intervals are cleared
   (`runner.ts:646-647`) and **nothing settles the parked waiter** — a verdict
   that races in before the finish wins, otherwise the item stays pending.
3. Store `finish()` (`store.ts:1438-1528`) settles no pending approval items.
   Only `cancelTask` (`store.ts:929-938`, with operator attribution) and
   `reapExpired` (`store.ts:1046-1052`, by `'plane'`) do. The reap comment
   states the invariant — "the audit trail never shows a request still
   awaiting an answer" (`store.ts:1042-1045`) — and the failure path breaks
   it.

Brief shape: in `finish()`, when the reported outcome is terminal
(`failed`/`cancelled`), settle any `pending` approval items for that
(task, attempt) as `cancelled` — same `jsonb_set` + `decidedBy` pattern as
`reapExpired`, attributed to the reporting node. Optional runner-side twin:
settle the parked waiter when `drive` settles. Regression test: fake harness
requests permission, then exits → finish(failed) → zero pending approval
items, transcript shows the settled verdict.

### P2 — Shutdown & retry-classification audit (TRIAL — verify-first, no brief)

Multica MUL-8453 (#9778) fixed: daemon shutdown reported interrupted runs as
non-retryable `cancelled`, so rollouts silently stopped unattended work with
attempts remaining. Verified holds on our side:

- **Graceful drain exists**: SIGINT/SIGTERM aborts the claim loop and awaits
  in-flight tasks (`main.ts:243-248`, `Promise.allSettled` at `:238`) —
  tasks finish normally on a clean shutdown, strictly better than Multica's
  pre-fix behaviour.
- **Crash path is retryable and now resumable**: lease expiry requeues with
  `platform.lease_expired` (`store.ts:1035-1041`), all `platform.*` codes
  retry (`isRetryable`, `protocol.ts:28`), and NEVR-415 (#162, landed)
  replays the resume chain's transcript into the new session.

Two candidates to verify before any brief: (a) **crash-detection latency** —
a killed node's tasks sit claimed until the lease expires; there is no
graceful lease-release call on shutdown today (none in `main.ts`) — after a
drain timeout, a clean shutdown could release its leases and cut requeue
latency from `leaseMs` to ~0; (b) the parked-approval case on graceful
shutdown is covered by P1's plane-side settle once it lands. Verify the
`leaseMs` default and write the chosen tradeoff down in one paragraph.

### P3 — History-replay honesty: pre-registered laws for the transcript lane (WATCH — no brief)

OpenHands' replay chapter, as laws for our transcript surface (schema v2 +
UI in flight; the `resumed_from` marker from NEVR-415 is already the replay
seam):

1. **Replay renders only persisted items** — no synthesized transient states
   (#19225: no "Thinking" flash during replay).
2. **Restored output renders as itself** — terminal output restored from
   history renders as terminal output (#19220), not as a generic meta item.
3. **Fetch discipline on open** — don't load older history before the initial
   scroll (#19245); show saved state before runtime readiness (#19195).
4. **One failure, one surface** — a missing conversation/task is reported
   exactly once (#19175; second sighting of the law after OpenHands #19152).

## Notable non-findings

- **Multica's tag**: fourth day of pushes without a tag, but the substance
  arrived (30 commits). v0.7.3 is assembling around concurrency/live-cost/
  shutdown-retry/steering. Next competitors run leads with the tag again.
- **We are ahead on live usage**: MUL-8466 reports usage every ≤30 s; our
  runner pushes a `usage` transcript item on every ACP `usage_update`
  (`runner.ts:142-154`), flushes every 500 ms (`runner.ts:512`), and the
  plane upserts `agent_task_usage` + emits usage events live on
  `appendItems` (`store.ts:1419-1433`), with `finish()` COALESCE-merging
  finals for any outcome (`store.ts:1486-1498`). Their PR is confirmatory
  evidence for the NEVR-243 surface (PR #118, still open/T02-gated), not a
  gap.
- **We hold the runtime-wide concurrency case by construction**: MUL-8328's
  shared-resource serialization is node `config.concurrency`
  (`main.ts:204-207`) + per-task workdirs (`main.ts:124`). The dial we lack
  is **per-agent** concurrency (the claim query `store.ts:1087-1089` has no
  per-agent bound) — policy nicety, not correctness (node-wide FIFO by
  `created_at` bounds starvation). No brief until an operator asks.
- **Paseo usage-on-failure (#8519/#8480) substantially held**: usage is
  carried even when the stop maps to `failed` (`runner.ts:600-618`), and
  mid-run usage items flush regardless of outcome (`runner.ts:646-650`).
  Action: pin with a regression test (failed outcome still merges usage).
- **Paseo #8527** (plugins stream live events + binary data): reference for
  the D11 transit lane; radar row added.
- **NEVR-415 landed** (#162, `0ad80e1`) — radar row flips to landed; the
  brief's open design choice resolved as digest + resume chain with an
  `omitted` marker, wire prompt ≠ stored prompt (`runner.ts:565-592`).
- **Plane's Propel sync** is a design-lane datapoint (versioned primitives +
  composites across three UIs, Base UI underneath) — cross-referenced for
  the next design run; no competitor action for us.
- Web search/extract provider still down (`9router` unregistered — twelfth
  consecutive run); GitHub API + direct curl carried the beat again.

## Sources

- Paseo trunk commits 11-01 19:58Z → 11-02 18:29Z (21) + PR bodies #8548/#8527/#8519/#8480 + releases (v0.15.0-beta.1 stands) + repo metadata (22,821★, pushed 2026-11-02T18:58:46Z, license NOASSERTION): api.github.com/repos/getpaseo/paseo (fetched 2026-11-02)
- OpenHands trunk commits 11-01 19:46Z → 11-02 18:12Z (29) + releases (v1.34.0 stands) + repo metadata (92,511★, MIT): api.github.com/repos/All-Hands-AI/OpenHands (fetched 2026-11-02)
- Multica commits 11-02 02:37Z→16:26Z (30) + releases (v0.7.2 stands) + PR bodies #9795/#9791/#9778/#9716 + repo metadata (54,634★, pushed 2026-11-02T16:26:14Z): api.github.com/repos/multica-ai/multica (fetched 2026-11-02)
- Plane commits since 10-30 19:00Z (#10038 11-02 18:47Z, #10122/#10147 11-02 18:39Z) + PR body #10038 + releases (v1.4.3 stands) + repo metadata (61,880★, AGPL-3.0): api.github.com/repos/makeplane/plane (fetched 2026-11-02)
- Huly commits 11-02 05:26–05:50Z (18) + repo metadata (28,041★, EPL-2.0): api.github.com/repos/hcengineering/platform (fetched 2026-11-02)
- Factory changelog feed (newest item 2026-10-30 v1.1.0, full JSON feed): docs.factory.com/docs/changelog/feed.json (fetched 2026-11-02)
- Linear changelog (top entry dates October 22 → October 8 → September 24, grep-verified): linear.app/changelog (fetched 2026-11-02)
- Cursor changelog (top date 2026-10-20, grep-verified): cursor.com/changelog (fetched 2026-11-02)
- Devin release notes (first visible entry dates October 28 → 26 → 23, grep-verified): devin.ai/changelog (fetched 2026-11-02)
- GitHub changelog (two 2026-11-02 entries, titles context-extracted): github.blog/changelog (fetched 2026-11-02)
- Stellarc grounding: `apps/stellarc-node/src/runner.ts:119-125` (resumedFrom), `:142-154` (usage item on usage_update), `:444-453` (pending approval item), `:506-511` (settleParked), `:512` (500 ms flush), `:600-618` (usage carried on failed stop), `:646-650` (interval clear + final flush); `apps/stellarc-node/src/main.ts:124` (per-task workdir), `:201-207` (node concurrency cap), `:238-248` (drain + SIGINT/SIGTERM); `packages/agents/src/store.ts:491-493` (RESUMABLE_FAILURE_CODES), `:929-938` (cancel settles approvals), `:1042-1052` (reap settles approvals + invariant comment), `:1087-1089` (claim query, no per-agent bound), `:1117-1140` (resume gate), `:1419-1433` (live usage upsert + events), `:1486-1498` (finish merges usage any outcome), `:1438-1528` (finish — no approval settle); `packages/agents/src/protocol.ts:28` (isRetryable = platform.*)
- NEVR-415 landed as PR #162, merge commit `0ad80e1` on dev (git log, verified 2026-11-02)
