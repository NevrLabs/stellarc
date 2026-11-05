# Scout — Competitors, 2026-11-05

Beat: **competitors**. Delta window: 2026-11-05 00:47 UTC → 19:07 UTC (~18h). Every claim
verified against a vendor changelog/release notes, the GitHub API, or repo metadata on
2026-11-05. Context: Stellarc = self-hostable, inert control plane (v2 charter) + BYO agent
runtime over ACP, Bun/TS monorepo (`apps/stellarc-{api,node,ui,worker}`,
`packages/{agents,contracts,db,domain,sync,telemetry}`, plus `packages/kaneo-legacy`); the UI
future is `apps/web` greenfield on `effect/v4` (ADR 0014 — `HomeViews.tsx` landed there 11-03,
NEVR-455). `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

The predicted tag wave arrived: **Paseo shipped twice today** (v0.15.1 03:03Z, v0.15.2
09:34Z, both stable) and **Factory shipped v1.4.0** — fifth release in eight days, now a
*daily* train. Three convergence signals: **(1) Onboarding derived from observed agent
usage** — Paseo's setup suggests projects from folders where you ran Claude Code/Codex/
OpenCode/Pi, and OpenHands promotes the templates your setup already uses; two independent
ships of "derive first-run suggestions from recorded activity" in one week, and Stellarc's
append-only event log + landed `apps/web` HomeViews make this our most fileable proposal
(P2, ADOPT). **(2) Delegated-run lifecycle got its second half**: yesterday established
children inherit permissions (Factory v1.3.0); today's Factory v1.4.0 fixes the parent side
— *a delegated-task wait must stop when the child dies with an approval unanswered* (P1
addendum). **(3) Duplicate side effects on state transitions**: Paseo #8855 (double
reconnect on foreground return) and Factory v1.4.0 (queued message to an offline machine
"waits instead of resending and repeating notices") — one cause, one reconnect, one notice.
Linear **broke its 14-day quiet streak** with Mobile Diffs (agent review from a phone), and
the **Devin extraction gap closed for free**: their release-notes page now renders
statically — newest entry still Nov 2, contents finally read.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | No new release — **v0.8.0 (11-03) stands**; trunk 11 commits in-window, sealed 17:13Z (#10010), 55,029★ (+128). Headlines: **MUL-8647 — virtualize recent agent work history** (#9985; second virtualization commit after MUL-7563's session lists — a pattern, not a one-off); **#9981 — preserve delegation during IME Shift+Enter** (IME discipline, another instance); #9994 — CLI updated-time-range filters on issue list; MUL-8630 — creators can delete their own projects (#9965); MUL-8664 — ellipsize overlong labels in runtime/model pickers (#10008); #9941 — archived filter menu stays open while a filter loads; #9949 — platform hints retained after skill name collisions; #10010 — CLI attachment download network-error classification; MUL-8628 — WeCom room fallback when a private reply is refused. | v0.8.0 2026-11-03 (trunk through 11-05 17:13Z) | proprietary, 55,029★ | 5 | **WATCH (steal surfaces)** | The virtualization pair says agent-history surfaces at their scale need windowing by default — a number for our session-history lists before apps/web grows them. The IME third entry keeps our filed IME laws warm. Filter menus that hold open during async loads = micro-scale layout-stability law (Section F family). |
| **Paseo** | **Two stable releases today**. **v0.15.1** — Windows daemon startup fix: terminal worker can't read its process identity (PS 5.1 lacks `Get-CimInstance`) left Desktop with no daemon; #8810 starts the daemon when the terminal worker cannot. **v0.15.2** — **first-run setup wizard** (theme, providers, projects, agent orchestration, mobile app; reopenable from Settings); **project suggestions derived from folders where you ran Claude Code, Codex, OpenCode or Pi**; theme-tile picker grid, skeleton loading rows, 32px/44px two-size controls, first launch goes straight into setup, ~160ms dialog fades. Trunk: **#8855 — double reconnect on foreground return** (probe cycle marked the connection unavailable while the client was still reconnecting); #8651 — active transfers stay connected across foreground return; **#8831 — failed agent's red dot dismissed by reading it**; #8823 iPhone composer bottom clearance; #8756 registry plugin installs through npm mirrors. | v0.15.2 2026-11-05 (stable; v0.15.1 + v0.15.2 in ~6.5h) | Apache-2.0 + third-party carve-out (NOASSERTION), 23,188★ | 4 | **TRIAL (stands)** | #8810 is a startup-honesty precedent with a twist: *degrade to the daemon when a worker fails*, don't take the app down. The v0.15.2 suggestions feature is P2's strongest precedent — it reads real usage folders, not a hardcoded demo list. #8855's root cause (probe invalidates state a concurrent reconnect depends on) is P3's law stated as a bug. |
| **Factory (Droids)** | **v1.4.0 (11-05) — CLI + Desktop; 258 releases all-time; 5th release in 8 days** (1.1→1.2→1.3→1.4 at 10-30/11-03/11-04/11-05). New: **Loops on Droid Computers — scheduled Loops now run on their hosted computers and keep their schedule across idle pauses**. Fixes: **resumed-session saving — resuming an older session now saves messages/settings instead of silently dropping each turn**; **resuming right after a delegated task finishes no longer fails with an exit error**; **Ctrl+C while a session is still loading stops its work before exit**; **a queued message for an offline machine waits instead of resending and repeating notices**; **Droid stops waiting on a delegated task shut down with its approval unanswered**; follow-up to an unreachable computer reboots and reconnects instead of failing; org-added models picked mid-session no longer fail as unknown; far cheaper refresh of sessions with thousands of messages; Droid Shield no longer demands an extra approval on large renames. | v1.4.0 2026-11-05 | proprietary | 5 | **WATCH** | The resume cluster is a triple hit on our filed briefs: silent turn-drop on resume is the exact class resumable-codes/attempt-continuity police; the delegated-task wait fix is P1's supervision half; Ctrl+C-during-load is the shutdown-interrupt law (their MUL-8453 analog). "Schedule persists across idle pauses" is the durable-schedule law for any future Stellarc scheduler. Loops naming now converges with Linear's. |
| **OpenHands** | No new release — **v1.35.0 (11-03) stands**; 27 commits in-window (pushed 18:55Z), 92,731★ (+68). Automations cluster: **#19033 — automations run as a service account in Canvas** (merged 15:32Z); #19340 Bitbucket Data Center + Azure DevOps repos in template setup; #19347 a template's repo sent only to services that clone its provider; #19355 repo picker in Data Center templates; #19352 guide self-hosted GitHub templates to MCP or token setup; #19335 setup assistant told the instance's event sources; #19370 setup drafts saved on cloud backends. Windows local-backend pair: #18070 Planner workspace paths, #17784 workspace file listing. ACP: #19284 no agent-settings writes for ACP picks on local backends; **#19316 — show Stop while an ACP turn runs after a fresh connect**. Onboarding: #19350 Connect Git step with tour. | v1.35.0 2026-11-03 | MIT, 92,731★ | 4 | **WATCH (pattern briefed)** | #19033 is the identity/attribution law for agent-triggered runs: automated work carries a distinct principal, not the human's — feed for the audit lane when Stellarc adds triggers. #19316 is a live-status law: after reconnect, running-state controls (Stop) must render immediately. Second OpenHands onboarding-derived-from-setup ship this week. |
| **Plane** | Quiet window: zero default-branch commits in-window (a 06:49Z push touched non-default branches); **v1.4.3 (10-28) stands**; 62,028★ (+44). | v1.4.3 2026-10-28 | AGPL-3.0, 62,028★ | 4 | **TRIAL (stands)** | Second quiet day after the Propel/design sweep. The v1.4.3 auth/tenant-isolation checklist for our auth surface stays queued on our side. |
| **GitHub Copilot** | No new Copilot items in-window — label page top remains **Nov 4: Copilot in Xcode's coding assistant**; Nov 3 pair re-confirmed (JetBrains Air release; BYOK + enterprise custom models in the usage API). | changelog 2026-11-04 (feed) | proprietary | 5 | **WATCH (steal patterns)** | Static window; the BYOK usage-attribution pattern remains the schema note for our BYO-key telemetry. |
| **Devin (Cognition)** | Changelog unchanged — newest entry still **November 2, 2026** — **but the extraction gap closed**: `docs.devin.ai/release-notes/overview` now serves entry content statically (TOC + MDX extracts in the HTML; no browser needed). Nov 2 entry contents read for the first time: read-only composer access ("Continue in a new session" offered *only when the new session can read this one*); "Fix with Devin" links straight to the session; multi-repo scans raised to 1,000 repos; auto-scan controls and schedules; **network-policy edits apply to already-running automation sessions**; Slack "not in" channel conditions; **OAuth discovery from the server's 401 (`resource_metadata`)**; rendered previews for markdown/patch files; multi-line secret values. | release notes 2026-11-02 | proprietary | 5 | **WATCH** | Two laws worth keeping: fork-continuity gating ("continue" only when the fork can read the source — our fork-not-edit law's cousin) and policy edits propagating to running sessions (live policy, not frozen-at-start). The 401→`resource_metadata` discovery is RFC 9728-flavored — the OAuth shape when Stellarc's MCP surface grows. Browser-deferral guard retired from the INDEX. |
| **Linear** | **Quiet streak broken — Mobile Diffs (Nov 5)**: Diffs review on iOS/Android — guided reviews, start on mobile and continue on desktop, work with review and cloud coding agents, merge approved changes from the phone. Fix list: agent suggested-next-steps render one-row-or-stacked instead of partial wrap; agent code diffs no longer cut off in narrow panels; agent chats started in split view no longer vanish from the sidebar; no spelling underlines on file paths in agent input; API expired-token replacement keeps prior scopes; **board sub-grouping restores horizontal scroll position on return**; workspace-credential coding sessions post comments again. | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Agent review from mobile is now table stakes across trackers (datapoint for the parked mobile lane, ADR 0009). The board scroll-restore fix is Section F's law at board scale: returning to a surface restores position, never resets. |
| **Cursor** | Changelog unchanged — top entry still **2026-10-20** (Agent SDK GA). **16 days quiet — longest streak on the board.** | changelog 2026-10-20 | proprietary | 5 | **WATCH** | Agent SDK's channel-first deployment shape stays the standing reference. |
| **Huly** | One commit in-window — #11162 gantt milestones open in the side panel instead of a transparent popup; 28,054★ (+6); the renamed `hcengineering/platform` carries. | main 2026-11-05 | EPL-2.0, 28,054★ | 3 | **REJECT (stands)** | Maintenance cadence without an agent story; verdict unchanged. |

## Proposals

### P1 — Supervision half of the delegation law (WATCH — addendum to the 11-04 pre-registration; no new brief)

Yesterday established the child half: work an agent spawns inherits the run's granted
permissions and never stalls to re-ask (Factory v1.3.0; Paseo #8683/#8714 building the
parent/child session seam). Today Factory v1.4.0 fixes the parent half, twice:

- **"Stopped delegated task waits — Droid stops waiting on a delegated task that was shut
  down while its approval went unanswered."** A supervisor's wait on a child that died
  mid-approval must terminate — the exact approval-settlement law we filed 11-02,
  discovered at the delegation layer.
- **"Resuming right after a delegated task finishes no longer fails with an exit error."**
  The resume path must accept a child that just reached terminal state.

No delegation surface exists in Stellarc (grep re-verified this run: no
delegate/child-run/spawn in `packages/agents/src`). Correctly no brief yet — carry this as
the second acceptance line of the 11-04 pre-registration: *a run spawned by another run
inherits the parent's granted decisions, AND the parent's wait on that run terminates
observably when the run reaches any terminal state (including death mid-approval).* When
the delegation ADR is written, both lines go in it.

### P2 — Onboarding derives its suggestions from recorded agent activity (ADOPT — ready-to-file brief below)

Two independent ships in one week: **Paseo v0.15.2** suggests projects from folders where
you actually ran Claude Code/Codex/OpenCode/Pi, and **OpenHands** promotes the templates
your setup already uses (#19300) with a guided Connect Git step (#19350). The pattern: the
first-run/home surface never presents an empty slate — it *derives* suggestions from
recorded activity, explains each ("tasks ran here"), and acts in one tap.

Stellarc's position is stronger than either: the append-only event log is the sole source
of truth, and `apps/web` `HomeViews.tsx` landed on `effect/v4` three days ago (NEVR-455)
— the surface exists, the data exists, the law is missing. Ready-to-file brief posted as a
comment this run; Talos decides whether to file.

### P3 — One cause, one reconnect, one notice (TRIAL — addendum line to the filed startup-honesty brief)

Two same-day fixes for the same bug class: **Paseo #8855** — returning to the app fired the
reconnect cycle twice because the probe invalidated the state a concurrent reconnect
depended on; **Factory v1.4.0** — a queued message for an offline machine "waits instead of
resending and repeating notices". With Paseo's #8827 (reconnect backoff on foreground) the
law is: *re-entry events (foreground return, lease requeue, probe completion) must not
duplicate in-flight retries, and one failed side effect produces at most one notice.* Fold
into the filed startup-honesty brief next to yesterday's bounded-retry line when it's
picked up — verify-first, no new brief.

## Non-findings / notes

- **Stellarc releases still empty** (re-verified 11-05 via GitHub API) — the landed
  NEVR-198 scoped-permission pipeline remains unverified-on-a-release.
- The 11-04 tag prediction confirmed: Paseo trunk was 28 commits past v0.15.0 yesterday;
  two stable tags landed within ~9 hours today.
- **Methodology**: Factory's changelog moved to `docs.factory.com/changelog/release-notes`
  (`factory.ai` 404s; org repos contain no droid CLI releases — the docs site is the only
  source). Devin's release notes are now statically extractable — the browser-render
  deferral and its `dateModified` ≠ entry-date guard retire.
- Multica's window sealed at 17:13:35Z (#10010); no post-window commits as of 19:07Z.
