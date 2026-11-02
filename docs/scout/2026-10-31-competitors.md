# Scout — Competitors, 2026-10-31

Beat: **competitors**. Delta window: 2026-10-30 19:10 UTC → 2026-11-01 01:31 UTC
(~30h; recovery run — the first attempt on this beat idled out after fetching, so
every source below was re-fetched fresh and re-verified this run). Every claim
verified against a primary source (vendor changelog/release notes, GitHub API,
or repo metadata) on 2026-11-01. Context: Stellarc = self-hostable, inert
control plane (v2 charter) + BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`).
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

Post-Universe exhale: Linear (top entry still Oct 22), Cursor (Oct 20), Devin
(Oct 28), GitHub Copilot changelog (Oct 29), Plane (v1.4.3, zero commits since
10-30 19:00Z) and Multica (v0.7.2; repo pushed 10-31 but no tag) all shipped
nothing in the window. Two exceptions. **Factory shipped v1.1.0 one day after
1.0**, headlined by an **Organization audit API** — enterprise owners poll org
audit events through a documented public endpoint — plus doctor
duplicate-install checks and clearer session file drops. **Paseo's trunk ran
hot** (15 commits in ~30h, no release yet) with three ACP lifecycle laws
squarely in our lane: a pending `initialize` must reject when the provider
process dies instead of burning a 120s deadline (#8384), late-discovered skills
must make it into the first command listing (#8387), and a stale pre-prompt
snapshot must not overwrite a running update (#8396). OpenHands' trunk shipped
a canvas-perf wave (startup polling 3000→500ms for the first 10s, deferring
inactive panels, one error toast per failed compaction). The audit-API cluster
(Factory, plus Plane's v1.4.3 governance release last window) against our own
tree — grep finds **zero audit surface** — yields this run's second proposal.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Factory (Droids)** | **CLI v1.1.0 + Desktop v1.1.0 (10-30)**, one day after 1.0. **Organization audit API** — enterprise owners poll org audit events through a documented public endpoint. Doctor now lists **every Droid install on your PATH with its version** (duplicate-install check). Clearer session file drops (drag-over dims the pane, files animate into the composer). Starter ideas that need no GitHub appear before you connect one. Continue-in-browser on Linux/ChromeOS. Slack: tags people only when asked. Fixes: members-table email folds under name when narrow; markdown checklists flow inline instead of splitting into columns; failed onboarding payment keeps billing details and shows the error. | v1.1.0 2026-10-30 | proprietary | 5 | **WATCH** | The audit API is the signal: within ~72h, Factory (public pollable audit endpoint) and Plane (v1.4.3 tenant-isolation suite, secrets-only-at-create) both shipped enterprise-governance surfaces — "who did what, when, machine-readably" is becoming table stakes for agent platforms. We are event-sourced and expose nothing audit-shaped (verified by grep: no `audit` in `apps/stellarc-api/src` or `packages/contracts/src`). Proposal P2. The doctor duplicate-install check is also the right instinct for our node's BYO-harness story: version-reported installs beat silent PATH shadowing. |
| **Paseo** | **No release in-window (v0.14.0 of 10-29 stands); trunk ran hot — 15 commits 10-31 00:00Z → 11-01 01:05Z.** ACP lifecycle laws: **#8384** — when a provider exits before answering `initialize`, refresh now reports exit status + stderr promptly; previously it waited the full 120s deadline because *the SDK leaves the pending initialize request unresolved after stdout closes* (reject on child close, after stderr drains); **#8387** — a new MiniMax Code session publishes built-in commands before discovered skills; initial command listing now waits 600ms-without-another-batch inside the existing 1500ms deadline so late skills make the first list; **#8396** — creating an agent with an initial prompt published `running`, then overwrote it with the older idle snapshot taken before the prompt started (subscribers showed the agent as done while its turn was running) — now forwards current state after creation; **#8408** — a resumed Claude subagent keeps its original row, model and resumed output after the parent session reopens (replay supplies native child identity; both tool-call identities route to one row); **#8393** — promptless Codex agents stay usable after reopening; #8372 — Claude conversation rewind reaches messages sent mid-turn; #8371 — suggested commands insert into the composer; #8389/#8397 — terminal-cleanup-by-process-identity and cold-git-filter test isolation. | trunk 2026-11-01 (v0.14.0 10-29) | Apache-2.0 + third-party carve-out (NOASSERTION), 22,624★ (+97 vs 10-30) | 4 | **TRIAL (elevated, unchanged)** | Three of their five fixes this window are laws our runner either already partially holds or must adopt. We hold exit-attribution (runner.ts:519-527) but have **no deadline on `initialize`/`newSession` and no reject-on-stdout-close** (runner.ts:437) — and `npx -y` harness wrappers (main.ts:32-34) are exactly the hang-alive class Paseo just hardened against. #8396's stale-snapshot-overwrite is an ordering hazard our heartbeat/flush path must be audited for (P3a). #8387's settle-window is the pattern for any future command/skill listing we render. |
| **OpenHands** | **No release in-window (v1.34.0 of 10-27 stands); trunk active through 10-31 20:03Z.** Canvas-perf wave: **#19144** — startup readiness polling 3000→500ms for the first 10s, then back to 3000ms; transient conversation failures recovered without repeated errors (live test: stuck-on-startup after 15s → reply in 7.21s); **#19153** — conversation route's eager JS graph drops 169→157 chunks; closed Files/Tools panels defer until opened; **#19152** — failed context compaction shows one error toast, not two (global mutation handler + action handler both fired before); **#19145** — received replies display without an artificial reading-speed delay; #19042 — Run suppressed on first message after a home-page model pick; #19163 — lint now rejects raw colors in three more migrated owners (the named-CSS-recipes refactor continues). | trunk 2026-10-31 | MIT, 92,371★ | 4 | **WATCH** | The perf wave is transcript-density kin to last window's P2: defer what's closed, dedupe what failed, don't animate honesty away. **#19152's law generalizes**: one failure event must surface once — when our UI grows global + local error handlers, the compaction double-toast bug is the exact shape to design out (P3b). Their raw-colors lint enforcement is the same design-contract direction as our `@shadcn/lint`/onsystem trial lane. |
| **Multica** | **v0.7.2 (10-30 09:48Z) stands; repo pushed 10-31 20:01Z with no new tag.** Nothing in-window. | v0.7.2 2026-10-30 | proprietary | 5 | **WATCH (steal P1 pattern)** | Nothing new to steal this window; the run-log cluster and steering rollout from v0.6.4–v0.7.2 (last report) remain the live reference set. |
| **Linear** | Changelog unchanged — top entry still **2026-10-22** (Slack/GitHub loop triggers, loop templates, per-loop reasoning levels, Figma MCP, Cursor Origin sync). | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Quiet. Per-loop reasoning levels remain the automation-cost dial to keep on the radar for our scheduled runs. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA); page diff vs 10-30 fetch is build-metadata only. | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Quiet. The Agent SDK's channel-first deployment shape and account-polling GitHub ingest remain the standing reference. |
| **Devin (Cognition)** | Release notes content byte-identical to the 10-30 fetch (verified: the only diffs are Mintlify deployment/asset hashes; newest entry remains Oct 28). | release notes 2026-10-28 | proprietary | 5 | **WATCH** | Quiet. The Activity-stream redesign stays the transcript-IA reference. |
| **GitHub Copilot** | Changelog newest entry **Oct 29** (webhook IP ranges added to the Meta API — infra, not agent-shaped); nothing dated in-window. The Oct 28 Universe wave (Copilot Projects, Agent Merge, self-improving Automations, Agentic Workflows GA) remains the last word. | changelog 2026-10-29 | proprietary | 5 | **WATCH (steal patterns)** | Post-Universe digestion. Universe's "watch-and-fix as wakeup condition" pattern remains filed for our wakeup-condition surface. |
| **Plane** | **v1.4.3 (10-28) stands; zero commits to main since 10-30 19:00Z.** | v1.4.3 2026-10-28 | AGPL-3.0, 61,743★ | 4 | **TRIAL** | Quiet. The v1.4.3 audit checklist (membership checks at handlers, secrets only at create/regenerate, rate-limited credential endpoint) remains queued for our auth lane. |
| **Huly** | Only one commit since the 10-29 batch (already reported): CI build-cache fix #11160, 10-31 02:42Z. No agent story. | main 2026-10-31 | EPL-2.0, 28,022★ | 3 | **REJECT (stands)** | The 10-29 wake-up was tracker polish; nothing since changes the verdict. |

## Proposals

### P1 — Runner startup honesty: initialize deadline + reject-on-close + teardown-on-requeue (ADOPT)

Paseo's #8384 names the exact law we half-hold. Our runner resolves a harness
process `'exit'` promptly and races it against the drive promise
(`apps/stellarc-node/src/runner.ts:273-286`, `:519-527`), but:

1. **No deadline anywhere on `conn.initialize` (runner.ts:437) or
   `conn.newSession`** — a harness that hangs *alive* (the `npx -y` wrappers at
   `main.ts:32-34` hang exactly this way on network/registry trouble) leaves
   `drive()` pending forever; only the plane's lease requeue heals the row.
2. **No reject-on-stdout-close** — Paseo found the ACP SDK leaves a pending
   `initialize` unresolved after stdout closes; our `exited` promise fires on
   `'exit'` only, and a zombie whose stdio closed but process lives matches
   neither path.
3. **Zombie accumulation** — when `reapExpired()`
   (`packages/agents/src/store.ts:951-993`) requeues a lease-expired task,
   nothing tells the original node to kill its spawned child: the wedged
   attempt's harness process stays alive indefinitely (the `child.kill` at
   runner.ts:534 runs only after the race settles, which is the thing that
   never happens). Each wedged attempt can strand one harness process.

Brief shape: (a) configurable startup deadline (default ~120s) wrapping
initialize+newSession, failing terminal with `platform.harness_exited`-style
attribution and stderr tail; (b) reject pending ACP calls when the child's
stdio closes (after stderr drains), mirroring Paseo #8384; (c) on lease loss /
requeue, the node tears down the child of the abandoned attempt (SIGTERM →
SIGKILL after 3s, same ladder as runner.ts:534-537).

### P2 — Audit-read API on the event log (ADOPT)

Factory v1.1.0's headline feature is a documented public endpoint where
enterprise owners **poll organization audit events**. Plane's v1.4.3 (last
window) was a governance/tenant-isolation release. GitHub has shipped
enterprise audit surfaces for years. Three vendors in three weeks: "machine-
readable who-did-what" is table stakes for a control plane.

Stellarc already persists exactly this — every task/attempt/permission/plane
action flows through `appendEvents` as event-log records — yet exposes nothing
audit-shaped: `grep -ri audit apps/stellarc-api/src packages/contracts/src`
returns zero hits. The proposal: a read-only, org-scoped, cursor-paginated
`GET /audit` (or equivalent) that projects the existing event log with actor
(member/agent/plane), action type, target, timestamp, and request id, plus a
documented "what we log" table. No new machinery — a projection and a contract
— but it converts our event-sourcing from an implementation detail into the
governance story self-hosted enterprises ask for, and it lands the seam before
auth hardening (Plane checklist) makes retrofitting expensive.

### P3 — Two ordering laws to audit in our own plane (TRIAL)

1. **Stale-snapshot-overwrite** (Paseo #8396): their agent-creation path
   published `running`, then overwrote it with an older idle snapshot captured
   before the prompt started — subscribers showed a live agent as done. Our
   heartbeat/flush ordering (`runner.ts` beat interval → `hooks.heartbeat()`;
   `store.ts` status writes) needs a monotonicity audit: no path may move a
   row `running` → idle/done on data older than the newest write.
2. **One failure, one surface** (OpenHands #19152): their failed context
   compaction fired two error toasts — the global mutation handler and the
   action handler both rendered it. When our UI grows both layers, the design
   rule is: a failure event owns exactly one surfacer.

Both are verify-first tasks, cheap to check, filed as a follow-up not a brief.

## Notable non-findings

- Stellarc itself: PR #118 (NEVR-243 cost/token UI) still OPEN and MERGEABLE
  on dev — re-verified this run; row unchanged on the radar.
- **Scout delivery ops resolved**: the seven superseded scout PRs flagged on
  the radar (#123, #130, #140, #148, #149, #150, #151) are all **CLOSED**
  now — verified via `gh pr view` this run. The "phantom scout work" row can
  retire.
- Web search/extract provider still down (`9router` unregistered — **tenth**
  consecutive run); GitHub API + direct curl carried the beat again.
- Multica's repo pushed 10-31 20:01Z with no new tag — next release is
  brewing; the next competitors run should lead with it.
- Devin's changelog diff-vs-10-30 is a Mintlify deployment rebuild only
  (asset hashes + deployment id); noted so a future run doesn't mistake a
  redeploy for a release.

## Sources

- Factory feed (CLI/Desktop v1.1.0, published 2026-10-30, full body): docs.factory.com/docs/changelog/feed.json (fetched 2026-11-01 01:32Z)
- Paseo trunk commits 10-31→11-01 + PR bodies #8384/#8387/#8396/#8408 + repo metadata (22,624★, pushed 2026-11-01T01:05Z, license NOASSERTION): api.github.com/repos/getpaseo/paseo (fetched 2026-11-01)
- OpenHands trunk commits 10-30→10-31 + PR bodies #19144/#19152/#19153 + repo metadata (92,371★, pushed 2026-10-31T20:03Z): api.github.com/repos/OpenHands/OpenHands (fetched 2026-11-01)
- Multica releases (v0.7.2 10-30 09:48Z newest) + repo pushed_at (10-31 20:01Z): api.github.com/repos/multica-ai/multica (fetched 2026-11-01)
- Linear changelog (top 2026-10-22, entry slugs grep-verified): linear.app/changelog (fetched 2026-11-01 01:32Z, byte-identical content to 10-30 fetch)
- Cursor changelog (top 2026-10-20): cursor.com/changelog (fetched 2026-11-01; entry dates grep-verified unchanged)
- Devin release notes (newest 2026-10-28; page diff vs 10-30 fetch = Mintlify deployment hashes only, block-compared): devin.ai/changelog (fetched 2026-11-01)
- GitHub changelog (newest entry Oct 29, webhook IP ranges in the Meta API): github.blog/changelog (fetched 2026-11-01)
- Plane: releases (v1.4.3 stands) + commits since 10-30 19:00Z (zero): api.github.com/repos/makeplane/plane (fetched 2026-11-01)
- Huly commits since 10-29 (only CI #11160 new): api.github.com/repos/hcengineering/platform/commits (fetched 2026-11-01)
- Stellarc PR states #118/#123/#130/#140/#148/#149/#150/#151: `gh pr view` (2026-11-01)
- Stellarc grounding: `apps/stellarc-node/src/runner.ts:273-286` (exit promise), `:437` (initialize, no deadline), `:519-527` (attribution race), `:534-537` (kill ladder), `main.ts:32-34` (npx -y wrappers), `packages/agents/src/store.ts:951-993` (reapExpired, no child teardown); audit-surface absence verified by grep (`audit` → 0 hits in api/contracts)
