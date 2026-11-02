# Scout — Competitors, 2026-11-01

Beat: **competitors**. Delta window: 2026-11-01 01:31 UTC → 19:42 UTC
(~18h; recovery run — the first attempt on this issue died at session start
with a gateway error before any work, so every source below was fetched fresh
this run; no prior-run fetches were reused). Every claim verified against a
primary source (vendor changelog/release notes, GitHub API, or repo metadata)
on 2026-11-01. Context: Stellarc = self-hostable, inert control plane
(v2 charter) + BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`).
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

The quiet vendors stayed quiet — Linear (top entry still Oct 22), Cursor
(Oct 20), Devin (newest entry still Oct 28; the fresh `2026-10-29` marks on
the page are Mintlify `dateModified` rebuild stamps, not an entry), GitHub
Copilot (Oct 29), Factory (v1.1.0), Multica (**no new release**; one commit,
a filter-panel text trim, MUL-8459 #9779 — the brewing release keeps brewing),
Plane (v1.4.3, zero commits for the third consecutive check) and Huly
(nothing). Two movers. **Paseo cut v0.15.0-beta.1 (11-01 06:57Z)**, headlined
by durability: daemon restarts now keep terminal programs running and
**automatically resume interrupted agents in their existing conversations**
(#8127, #7644) — and its trunk kept moving after the tag (21 commits in-window)
with a fix squarely in our lane: **#8453 — a peer message was cancelling the
recipient's pending human question**, with the harness told *the human
dismissed it*. **OpenHands' trunk shipped a startup-status honesty wave**
(7 commits): open conversations immediately with inline startup progress
(#19155), live agent status in chat (#19130), startup activity in sidebar rows
(#19190). The Paseo 0.15 resume story against our own requeue path yields this
run's proposal: our platform-fault retry is a **fresh session with amnesia**
(`reapExpired` requeues; `runner.ts` opens a brand-new `newSession` every
attempt) — but the event log already holds the transcript, so replay-based
attempt continuity is native to our architecture.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | **v0.15.0-beta.1 (11-01 06:57Z) + 21 trunk commits through 19:32Z.** Release headline: **daemon restarts keep terminal programs running** (#7644, #8155) and **automatically resume interrupted agents in their existing conversations** after a host restart (#8127). Mobile terminals get native rendering with draggable selection handles (#8348) and **10,000-line scrollback restore on reconnect** (#8282). Worktree setup copies ignored files via `.worktreeinclude` **before agents start** (#8100) + plugin-defined worktree locations (#8117, `worktree.create.before/after` hooks #8081). Wire hygiene: **truncate oversized chat entries before sending to the app** (#8274), split large daemon responses across relay frames instead of disconnecting (#8302). **Steering no longer replaces a turn that was still starting and loses its original prompt** (#6192). Subagent activity in its own panel instead of duplicated inside the parent's tool card (#8276). Usage fetch only while displayed + a setting to disable checks (#8181). Daemon-wide `HTTP(S)_PROXY/NO_PROXY` (#8177). Trunk after the tag: **#8453 — a peer message cancelled the recipient's pending human question; OpenCode was told the human dismissed it** — pending questions/approvals now survive peer messages; **#8465** — an idle Claude session rebuild lost its *configured* model until another turn ran; provider now reports configured model before first turn and after rebuild; **#8421** — abandoned workspace service connections (dead client sockets leaving upstream event-streams open) now closed; #8419 — XTVERSION/DECRQSS terminal query suppression; #8462 — stop Git polling while workspace folders are missing; #8423 — retry a connected host that failed its capability check; #8427 — start configured plugins concurrently. | v0.15.0-beta.1 2026-11-01 (trunk pushed 19:32Z) | Apache-2.0 + third-party carve-out (NOASSERTION), 22,721★ (+97) | 4 | **TRIAL (elevated, stands)** | The 0.15 headline names our biggest lifecycle gap: what happens to a running attempt when its node dies. Their answer (children survive the daemon; reattach and resume in-conversation) needs process survival; ours can't have that — but our event log already persists every transcript item, so **replay-based attempt continuity** (Proposal P1) is the architecture-native twin. #8453's law — *nothing may cancel a pending human question except its answerer* — we already hold by construction (verified this run, see non-findings); it becomes a regression-test pin. #6192's law — *steering must queue behind a starting turn, never replace it* — we have no steering path yet (grep: zero hits), so it gets pre-registered for the day one lands. #8274/#8302's truncate-and-frame discipline is the pattern for any relay/stream seam our UI grows. |
| **OpenHands** | **No release in-window (v1.34.0 of 10-27 stands); trunk startup/live-status wave — 7 commits 11-01 10:00Z→19:08Z.** **#19155** — open conversations immediately with inline startup progress (no loading gate before the conversation renders); **#19130** — live agent status in chat; **#19190** — startup activity shown in sidebar conversation rows; #19159 — startup attachment delivery survives navigation; **#19186** — sending another message resumes a paused sandbox; **#19084** — hooks and reasoning grouped with their tool calls, each group saying what it did; #19189 — docs pinning live-activity status semantics. | trunk 2026-11-01 (v1.34.0 10-27) | MIT, 92,427★ | 4 | **WATCH** | A coherent "perceived-startup-latency" doctrine: render the destination immediately, stream status into it, and never gate the open on readiness. Our transcript surface is in flight (PRs #108/#115) — pre-registering the pattern now (P3) costs one paragraph and saves a redesign later. #19084's grouped-with-say-what-it-did transcript shape is the same density argument as our tool/subagent/test-results part shapes. |
| **Multica** | **v0.7.2 (10-30) stands; no new tag.** Repo pushed 11-01 15:38Z with exactly one commit: MUL-8459 — drop redundant text from the advanced filter panel (#9779). | v0.7.2 2026-10-30 | proprietary | 5 | **WATCH (steal P1 cost UI)** | The 10-31 "repo pushing without a tag = release brewing" read is now two days old with one cosmetic commit behind it. Still nothing new to steal; the run-log/steering cluster from v0.6.4–v0.7.2 remains the live reference set. Next run keeps leading with the tag. |
| **Factory (Droids)** | Feed unchanged — newest entry still **v1.1.0 (10-30)**: org audit API, doctor duplicate-install checks, session file drops. | v1.1.0 2026-10-30 | proprietary | 5 | **WATCH** | Quiet. Two consecutive quiet days after the 1.0→1.1 burst; the discipline itself (daily trains) remains the contrast case for our release cadence. |
| **Linear** | Changelog unchanged — top entry still **2026-10-22** ("More ways to run and share Loops"; titles grep-verified in page order). | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Quiet. Per-loop reasoning levels remain the automation-cost dial on the radar. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA); newest date on page grep-verified. | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Quiet. Agent SDK's channel-first deployment shape stays the standing reference. |
| **Devin (Cognition)** | Newest entry still **Oct 28**. The page carries fresh `2026-10-29T13:40Z` marks, but all five occurrences are `dateModified` JSON-LD/mintlify metadata (docs rebuild), not entry dates — verified by context extraction. | release notes 2026-10-28 | proprietary | 5 | **WATCH** | Quiet, with a guard note: **`dateModified` ≠ entry date**. A future run diffing dates alone would call this a release; it is a redeploy. |
| **GitHub Copilot** | Changelog newest entry still **Oct 29** (webhook IP ranges; grep-verified top-of-page). | changelog 2026-10-29 | proprietary | 5 | **WATCH (steal patterns)** | Quiet. Universe's watch-and-fix-as-wakeup-condition pattern remains filed for our wakeup surface. |
| **Plane** | **v1.4.3 (10-28) stands; zero commits to main since 10-30 19:00Z — third consecutive quiet check.** | v1.4.3 2026-10-28 | AGPL-3.0, 61,816★ | 4 | **TRIAL** | The v1.4.3 audit checklist (membership checks at handlers, secrets only at create/regenerate, rate-limited credential endpoint) stays queued for our auth lane; a stalled upstream doesn't retire the checklist. |
| **Huly** | Zero commits since the CI build-cache fix #11160 (10-31 02:42Z, reported last run). | main 2026-10-31 | EPL-2.0, 28,022★ | 3 | **REJECT (stands)** | Nothing new; no agent story. |

## Proposals

### P1 — Attempt continuity: replay the transcript on platform-fault retry (ADOPT)

Paseo 0.15's headline capability is **resume interrupted agents in their
existing conversations** after a host restart (#8127). Their mechanism —
terminal programs and harness children survive the daemon, so reattachment can
continue the session — is unavailable to us by design (our node's child
harnesses die with it). But the *outcome* doesn't require process survival in
an event-sourced system:

Today's retry path is amnesiac, verified in-tree:

1. `reapExpired()` (`packages/agents/src/store.ts:947-975`) requeues a
   lease-expired task as `queued` with `failure_code='platform.lease_expired'`
   — "expiry requeues (fresh attempt) like any platform fault" — and settles
   any pending approval as cancelled.
2. The next claim runs `drive()` from scratch: `conn.initialize` →
   **`conn.newSession`** (`apps/stellarc-node/src/runner.ts:437-452`) creates a
   brand-new session every attempt; the only context the retry gets is
   `task.prompt` (store.ts:66, :831).
3. Cost: every retry re-burns tokens for work the dead attempt already did
   (`agent_task_usage` is keyed `(task_id, attempt)` — migrations/0004 — so
   the retry's spend *stacks* on the wasted attempt's), re-runs side-effectful
   tool calls that may already have landed, and may re-park permissions the
   operator already granted (the verdict mailbox is one-slot per attempt;
   `permission_decision` resets to NULL on requeue, store.ts:957).

Brief shape: on claim of an attempt with `attempt > 1` whose prior failure
code is a platform fault (`platform.lease_expired` first; `platform.*` family),
seed the new session with the prior attempt's transcript — the prompt plus the
prior attempt's `agent_task_item` rows (full or compacted; the compaction
choice is the brief's open design question, with a token-budget cap and a
`resumed_from(attempt)` marker item on the transcript). Record
`resumed_from_attempt` on the task row and in the event log. Out of scope:
harness-failure retries (different semantics — the transcript may be the
poison), and any process-survival mechanism.

### P2 — Ordering-law audit, addendum: one new law, two verified holds (TRIAL)

Extends last run's P3 audit list (stale-snapshot-overwrite, one-failure-one-surface):

1. **New law — steering must queue behind a starting turn, never replace it**
   (Paseo #6192: a steering message arriving while a turn was still starting
   *replaced* it and lost the original prompt). We have **no steering path
   today** (grep `steer` across `apps/` + `packages/`: zero hits), so this is
   a pre-registered law for the feature's design review, not a bug hunt.
2. **Verified hold — nothing cancels a pending approval except its answerer**
   (Paseo #8453: a peer message cancelled a pending human question and blamed
   the human). Our plane already holds this by construction:
   `cancelTask` settles pending approvals as `cancelled` with the acting
   operator's id (`store.ts:929-938`), and a lease-expiry requeue settles them
   as `cancelled` by `'plane'` (`store.ts:955-970`). No path in the tree drops
   a pending approval silently. Action: pin both with regression tests so the
   law survives future steering/peer-input work.
3. **Verified hold — configured model is reported without needing a turn**
   (Paseo #8465: idle session rebuild lost the configured model). Our agent
   surfaces read the configured `agent.model` (runner.ts:456-464 requests it
   when the harness advertises a selector); we have no observed-model
   overrides to lose. Holds trivially; revisit when we start recording
   observed model per session.

### P3 — Startup-status honesty: pre-registered pattern for the transcript lane (WATCH, no brief)

OpenHands' wave (#19155/#19130/#19190/#19159/#19186) is one doctrine: **open
the destination immediately, stream status into it, never gate the open on
readiness** — inline startup progress in the conversation, live status in
chat, startup activity in sidebar rows, paused sandbox resumed by the next
message rather than by a reload. Our agent-transcript surface is in flight
(PR #108, PR #115). One paragraph in those lanes' design notes now — "task
route renders instantly; startup/queue/claim/first-token states stream into
the transcript as items; sidebar rows surface startup activity" — is the whole
cost of adopting it before the surface hardens.

## Notable non-findings

- **Multica's "brewing" release**: two days of pushes without a tag now; the
  11-01 commit is a filter-panel text trim (MUL-8459, #9779). Next competitors
  run leads with the tag again.
- **Devin's `dateModified` trap**: page metadata says 2026-10-29; newest
  *entry* is Oct 28. Guard noted above so no future run mistakes a docs
  rebuild for a release.
- **Paseo #8453 / #8465 already held by construction in our tree** (evidence
  in P2) — the win this run is knowing which of their fire-drills we're
  structurally immune to.
- **Stellarc PR #118 (NEVR-243 cost/token UI)**: still OPEN and MERGEABLE,
  untouched since 10-16 — re-verified this run; radar row unchanged.
- Sibling scout runs today: PR #159 (cross-platform-ui) and PR #160 (design)
  open against dev; the libraries run's report is already on dev
  (`docs/scout/2026-11-01-libraries.md`). No collisions with this file.
- Web search/extract provider still down (`9router` unregistered — eleventh
  consecutive run); GitHub API + direct curl carried the beat again.

## Sources

- Paseo v0.15.0-beta.1 release body (full, fetched this run): api.github.com/repos/getpaseo/paseo/releases/tags/v0.15.0-beta.1 (published 2026-11-01T06:57:22Z)
- Paseo trunk commits 11-01 01:05Z→19:32Z (21) + PR bodies #8453/#8465/#8421/#8419 + repo metadata (22,721★, pushed 2026-11-01T19:32:59Z, license NOASSERTION): api.github.com/repos/getpaseo/paseo (fetched 2026-11-01)
- OpenHands trunk commits 10-31 20:03Z→11-01 19:08Z (7: #19155/#19130/#19190/#19159/#19186/#19084/#19189) + releases (v1.34.0 stands) + repo metadata (92,427★, MIT): api.github.com/repos/All-Hands-AI/OpenHands (fetched 2026-11-01)
- Multica releases (v0.7.2 10-30 newest) + repo pushed_at (11-01T15:38:15Z) + commit c321e49 (MUL-8459, #9779): api.github.com/repos/multica-ai/multica (fetched 2026-11-01)
- Factory changelog feed (newest v1.1.0, 2026-10-30; full body): docs.factory.com/docs/changelog/feed.json (fetched 2026-11-01)
- Linear changelog (top entry "More ways to run and share Loops", October 22, 2026; title order grep-verified): linear.app/changelog (fetched 2026-11-01)
- Cursor changelog (top date 2026-10-20, grep-verified): cursor.com/changelog (fetched 2026-11-01)
- Devin release notes (newest entry October 28, 2026; all `2026-10-29` page marks are `dateModified` metadata, context-extracted): devin.ai/changelog (fetched 2026-11-01)
- GitHub changelog (top date 2026-10-29, grep-verified): github.blog/changelog (fetched 2026-11-01)
- Plane releases (v1.4.3 stands) + commits since 10-30 19:00Z (zero) + repo metadata (61,816★, AGPL-3.0): api.github.com/repos/makeplane/plane (fetched 2026-11-01)
- Huly commits since 10-31 02:42Z (zero new): api.github.com/repos/hcengineering/platform/commits (fetched 2026-11-01)
- Stellarc PR #118 state + open-PR list: `gh pr view` / `gh pr list` (2026-11-01)
- Stellarc grounding: `apps/stellarc-node/src/runner.ts:300-345` (requestPermission park, parkGate), `:390-430` (per-attempt sessionId, parkGate/verdict mailbox), `:437-452` (initialize → newSession every attempt), `:456-464` (configured-model request); `packages/agents/src/store.ts:66,174,831-832` (task.prompt), `:929-938` (cancel settles pending approval with operator attribution), `:947-975` (reapExpired: requeue as fresh attempt, settle pending approval as 'plane', permission_decision=NULL); `packages/db/migrations/0004_budgets.sql:23-42` (agent_task_usage keyed task_id+attempt); steering absence verified by grep (`steer` → 0 hits in apps/ + packages/)
