# Scout — Competitors, 2026-11-04

Beat: **competitors**. Delta window: 2026-11-03 19:30 UTC → 2026-11-05 00:47 UTC
(~29h; the scheduled 11-04 run never started — runtime unavailable while queued
— so this catch-up run widens the window to touch both days). Every claim
verified against a vendor changelog/release notes, the GitHub API, or repo
metadata on 2026-11-05. Context: Stellarc = self-hostable, inert control plane
(v2 charter) + BYO agent runtime over ACP, Bun/TS monorepo
(`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`,
plus `packages/kaneo-legacy`); the UI future is `apps/web` greenfield (ADR
0014). `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing
filters.

## The one-line read

A consolidation window after 11-03's eruption: **no new stable releases** from
the tracked repos (Paseo v0.15.0, OpenHands v1.35.0, Multica v0.8.0, Plane
v1.4.3 all stand), but **Factory shipped v1.3.0 on 11-04** — fourth release in
eight days, still the fastest train on the board. The two deepest signals:
**(1) Factory's "task permission inheritance"** (tasks a Droid starts inherit
the run's permission skipping instead of stalling for approval) plus **Paseo
#8683 background agents for hidden helpers** — the field is converging on
agent-spawned work as a permission-continuity problem, and Stellarc's
permission model (per-agent policy, per-run parks) has no delegation story
pre-registered. **(2) Paseo's 11-04 trunk burst is a streaming-UI stability
chapter** (#8717 tapped line stays put when disclosures expand, #8742 context
details stay open while chat streams, #8791 wheel the thinking group into view
before opening it) — layout must not shift under the user during streaming,
which extends the 11-03 live-status/replay brief with a concrete acceptance
chapter (this run's P1). Multica's post-tag trunk (~45 commits on 11-04) ships
the strongest single confirmation of our filed audit-read brief: **MUL-7782,
`GET /v1/tasks/{task_id}/messages` — a read-only transcript endpoint in the
plugin API**. And Huly **renamed its repo** `huly` → `platform` (old name
404s).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | No new release — **v0.8.0 (11-03 10:30Z) stands**; trunk extremely hot post-tag: **~45 commits on 11-04** (pushed 19:54Z), 54,901★ (+133). Headlines in our lanes: **MUL-7782 — plugin-API task transcript endpoint `GET /v1/tasks/{task_id}/messages`** (#8914, read-only transcript surface for third parties — the exact law our filed audit-read brief carries); **MUL-9960 — pending tasks move along when an agent switches runtime** (#9960, task continuity across runtime change, not stall); MUL-8620 — isolate runtime probes + reject wrapper logs (#9957); MUL-8525 — **recover checkouts orphaned by a cancelled worktree add** (#9838); MUL-4066 — **skill version history and restore** (#9632); MUL-8316 — issue deletion restricted to creators + workspace admins (#9789); MUL-7563 — **virtualize session history lists** (#8637); MUL-8509 — **preserve IME input in filters/title-rename/find** (#9829); MUL-8609 — stream 100 MiB uploads without truncation (#9905); thinking levels exposed in agent properties + Kiro (MUL-8594/#9923, MUL-8595/#9925); inbox read-state discipline cluster (MUL-8596/8618/8588/8590 — opening an issue reads its notifications, unread row kept); MUL-8550 "Subscribed by me" relation filter; MUL-8599 Unread view opt-in via star; MUL-8617 issue panels default to updated-date ordering; MUL-8578/8566 — squad-leader turns and chat attachments on **Qoder Cloud Agents** (their cloud-runtime surface); MUL-8577 — reject unsupported CLI callbacks without web-login fallback; MUL-8586 — no default owner escalation for CLI gaps; i18n (es locale MUL-8611, zh-Hant docs MUL-8461, ja README). | v0.8.0 2026-11-03 (trunk through 11-04 19:54Z) | proprietary, 54,901★ | 5 | **WATCH (steal attention surfaces; audit-read confirmed)** | MUL-7782 is the third independent confirmation of the filed audit-read brief (Factory org audit API, Plane governance lane, now Multica's transcript endpoint) — the shape is table stakes, and their path choice (`/tasks/{id}/messages`, per-task read) is a specification datum for our event-log projection surface. MUL-9960 feeds the runtime-fault honesty cluster (P2 below). The inbox read-state discipline and IME-preservation fixes are quality bars for our apps/web board/comment lane. |
| **Paseo** | No new release — **v0.15.0 (11-03 05:59Z) stands**; trunk hot: **28 commits 11-03 19:54Z → 11-04 15:35Z**, 23,085★ (+151). Three clusters. **Streaming-UI stability**: #8717 — the tapped line stays in place when chat disclosures expand/collapse (native timeline on LegendList); #8742 — context details stay open while chat streams; #8791 — wheel the thinking group into view before opening it; #8735 — workspace updates independent of archived history. **Agent/session model**: **#8683 — background agents for hidden helpers** (feat); **#8714 — recognize persisted parents when creating child sessions**; #8737 — read agent history after its working directory is removed; #8698 (opencode) — reopened running conversations stay interruptible; #8699 — effort controls for Claude settings models; #8746 — fork from earlier replies when a plugin card was updated later. **Mobile/touch (15+ commits — the biggest single-day mobile investment we've logged)**: iPhone Duo vertical bars + fold divisions #8741, iPad touch-sized controls #8748, finger scrolling in web terminal #8776, touch-overlay navigation #8739, narrow-column workspace layouts #8740, navigation-overflow workspaces #8727. Plus server: recover workspace Git watchers after setup timeouts; #8718 (pi) require Reload after the native process exits; plugin settings cog with per-screen tabs #8675. | v0.15.0 2026-11-03 (trunk pushed 11-04 15:35Z) | Apache-2.0 + third-party carve-out (NOASSERTION), 23,085★ | 4 | **TRIAL (stands)** | The streaming-stability trio is a ready-made acceptance chapter for our filed live-status/replay brief → **P1 below**. #8683 + #8714 are the delegation lane maturing (agent-spawned helpers, parented child sessions) — pre-registered in P3. The mobile burst is a datapoint for the parked mobile lane (ADR 0009), not an action. |
| **Factory (Droids)** | **v1.3.0 (11-04) — CLI + Desktop; 257 releases all-time; 4th release in 8 days** (1.0→1.1→1.2→1.3, 10-30→11-03→11-04). New: editable email draft cards. Improvements: **task permission inheritance — tasks Droid starts inherit the run's permission skipping instead of stalling for approval**; onboarding finish on mobile; instant sidebar view switching (no slide); **faster replies with many tools (2nd sighting)**; model switching faster in long sessions. Fixes: **MCP OAuth sign-in from remote sessions via browser**; local notices survive remote reload; port-forward uploads no longer lose bytes; GitHub plugin sources install from the named repo with named errors; **macOS startup no longer stalls with many skill files** (skills reload behind symlinks); **reconnect attempt limits — stops after the configured attempts instead of retrying a failing connection forever**. Security: public-API identifier validation (malformed IDs → validation error, not unexpected results). | v1.3.0 2026-11-04 | proprietary | 5 | **WATCH** | Two laws for us: **(a) permission continuity across spawned tasks** — the field's answer to "the child re-asks what the parent already granted" (P3); **(b) bounded reconnect** — the complement of v1.2.0's redial: redial, but never forever; exhaustion is a terminal, observable state (P2). Skills-startup-cost is now a twice-shipped fix at their scale — a guard for our node catalog path. |
| **OpenHands** | No new release — **v1.35.0 (11-03 18:47Z) stands**; 11 commits in-window (pushed 11-05 00:11Z), 92,663★ (+78). Automations cluster: **#19300 — suggest default templates + promote ones using what the user set up**; #19323 — repository-provider logos on template cards; #19319 — script automation's files listed collapsed; #19297 — open templates without the missing-integration notice. Platform: Node 24.22.1 across CI/desktop/Docker (#19321); axios 1.21.0, httpxy 0.5.6. Docs: feature-map entries for ACP agent sessions (F29, #19314) and template-suggestion order (#19331). | v1.35.0 2026-11-03 | MIT, 92,663★ | 4 | **WATCH (pattern briefed)** | Post-burst consolidation on automations. The template-suggestion pattern (promote what the user already uses) is a tidy onboarding heuristic if/when Stellarc ships task templates; nothing new for the filed live-status brief. F29 (ACP agent sessions) now documented in their verify map — their ACP surface is first-class. |
| **Plane** | Quiet window: last push **11-03 16:53Z** (before window start), zero commits in-window; **v1.4.3 (10-28) stands**; 61,984★ (+71). | v1.4.3 2026-10-28 | AGPL-3.0, 61,984★ | 4 | **TRIAL (stands)** | Healthy pause after the Propel/design-QA sweep. The v1.4.3 auth/tenant-isolation checklist for our auth surface remains queued on our side. |
| **GitHub Copilot** | Changelog: **Nov 4 — Copilot available in Xcode's coding assistant** (second IDE-surface expansion in two days, after JetBrains Air Nov 3); **Nov 3 — BYOK and enterprise custom models in the Copilot usage API** (usage attribution extended to customer-owned keys and custom models). Non-Copilot Nov 3–4: CodeQL 2.27.4, Dependabot Python 3.15 + Agent Package Manager support, cost-center REST lookup. | changelog 2026-11-04 (feed) | proprietary | 5 | **WATCH (steal patterns)** | Xcode = surface expansion continuing. The BYOK usage-API item is the pattern to keep: when Stellarc's BYO-agent/BYO-key surface grows, usage telemetry must attribute spend per key/model provider — our 500 ms usage stream already carries the raw items; per-key attribution is a schema question to remember. |
| **Devin (Cognition)** | Changelog unchanged — newest entry still **November 2, 2026** (date grep-verified from the rendered page; client-rendered, titles absent from static HTML — extraction still deferred to a browser-rendered run). | release notes 2026-11-02 | proprietary | 5 | **WATCH** | Guard stands: `dateModified` ≠ entry date. |
| **Linear** | Changelog unchanged — top entry still **2026-10-22** ("More ways to run and share Loops"). **14 days quiet.** | changelog 2026-10-22 | proprietary | 5 | **WATCH** | Per-loop reasoning levels remain the automation-cost dial on the radar. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA; date grep-verified from embedded JSON). **15 days quiet — now the longest streak on the board.** | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Agent SDK's channel-first deployment shape stays the standing reference. |
| **Huly** | **Repo renamed: `hcengineering/huly` → `hcengineering/platform`** (old name 404s; `platform` carries the same 28,048★ and the "All-in-One Project Management Platform" description; self-host repo is `huly-selfhost`, 3,587★). Zero commits in-window (last activity 11-02). | main 2026-11-02 (rename observed 11-05) | EPL-2.0, 28,048★ | 3 | **REJECT (stands)** | Maintenance cadence without an agent story; the rename to `platform` is a branding/positioning move (they are the platform, Huly the product) — no change to the verdict. |

## Proposals

### P1 — Streaming layout-stability chapter for the agent views brief (ADOPT — addendum to the 11-03 live-status/replay brief)

Paseo's 11-04 trunk solved, in one day, the exact failure class our filed
brief's rendering laws only gesture at: **content moving under the user while
a stream is open**. Three laws, all verifiable as acceptance lines:

1. **#8717 — the line the user is reading stays put when a disclosure above
   it expands or collapses.** Expansion inserts space below the anchor, never
   reflows the viewport around it (they rebuilt on LegendList's native
   timeline to get this).
2. **#8742 — context-detail panels stay open while chat streams.** Streaming
   must not reset UI state the user has set (open groups, scrolled position,
   open panels).
3. **#8791 — scroll a group into view *before* expanding it.** When an
   interaction reveals content (e.g. a thinking group), first make room and
   scroll, then render — never expand-then-jump.

Our `apps/web` agent views (ADR 0014) will stream assistant items at 500 ms
flush cadence into a scrolling conversation — every one of these three failure
modes is a default behavior of naive streaming lists. The filed brief
(11-03, "live-status & replay contract") owns lifecycle/rendering laws;
**append this chapter to it rather than filing a new brief**. Ready-to-file
addendum text is in the run comment.

### P2 — Bounded connection failure: retry loops must terminate observably (TRIAL — reinforcement of the filed startup-honesty brief, one new acceptance line)

The runtime-fault honesty cluster gained two members this window:

- **Factory v1.3.0 — "Droid now stops after the configured reconnect attempts
  instead of retrying a failing connection forever."** The complement of
  v1.2.0's redial-instead-of-fail: redial, but with a cap, and exhaustion is a
  terminal state.
- **Multica MUL-9960 — "move pending tasks along when an agent switches
  runtime"** + MUL-8620 (runtime probes isolated, wrapper logs rejected):
  runtime disappearance transitions work forward, never parks it silently.

Standing precedents: Paseo #8384 (startup exits reported, not
timeout-elapsed), #8406 (prompt to disconnected agent fails, not hangs). Our
filed brief (runner startup honesty) covers the deadline on
`conn.prompt` (`apps/stellarc-node/src/runner.ts:595`, anchor re-verified on
dev this run); the new line to add when it's picked up: **any reconnect or
retry loop in the node runner carries a configured attempt cap, and
exhaustion transitions the attempt to a terminal failure with its own failure
code** — which also keeps the attempt inside the resumable-codes decision
(filed 11-03) instead of an unbounded limbo. Verify-first, no new brief.

### P3 — Permission continuity across delegated runs (WATCH — pre-registered law; no surface to build on yet)

Factory v1.3.0's "task permission inheritance" states the field's rule
plainly: **work an agent starts inherits the run's permission skipping — it
does not stall to re-ask.** Paseo is building toward the same seam from the
other side (#8683 background agents for hidden helpers; #8714 persisted
parents for child sessions).

Stellarc today, grep-verified on dev: permission policy is **per-agent**
(`packages/agents/src/store.ts:61`, written at agent upsert
`store.ts:729-731`), permission decisions are **per-run parks**
(`store.ts:81-83`); task hierarchy exists only as kaneo-legacy board
relations (`packages/kaneo-legacy/src/task-relation/`, depth-limited); there
is **no agent-spawned child-run path** — so there is nothing to fix yet, and
correctly no brief. Pre-register the law for whenever delegation lands: *a
run spawned by another run inherits the parent's granted decisions (or an
explicit operator-scoped subset); it must never block on a permission the
parent already granted.* When the delegation ADR is written, this is an
acceptance line in it.

## Non-findings / notes

- **Stellarc releases still empty** (re-verified 11-05) — the landed NEVR-198
  scoped-permission pipeline remains unverified-on-a-release; row stays open
  in the INDEX.
- **Multica's MUL-7782 endpoint path** (`GET /v1/tasks/{task_id}/messages`)
  is per-task, plugin-API-scoped — narrower than our filed audit-read
  projection (org-scoped event-log cursor). Their choice optimizes for
  "third-party tool reads one task's transcript"; ours for audit/governance.
  Both can be right; the confirmation is the demand, not the path.
- No new stable releases from Paseo/OpenHands/Multica/Plane in-window —
  11-03's eruption is digesting; expect tags within days (Paseo trunk is
  already 28 commits past v0.15.0, Multica ~45 past v0.8.0).
