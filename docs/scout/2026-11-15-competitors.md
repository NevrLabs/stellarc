# Scout — Competitors, 2026-11-15

Beat: **competitors**. Delta window: 2026-11-14 19:03 UTC → 2026-11-15 19:03 UTC (~24h). Every
claim verified against the GitHub API (`gh api` — repo metadata, release tags, a `search/issues`
merged-window query per repo, PR detail bodies with additions/deletions) or a fetched changelog
(Linear, Cursor, Devin — devin.ai/changelog, Copilot — github.blog RSS feed with categories).
Factory **walled day 3 — the feed route is now marked dead** (see the Factory row). Context:
Stellarc = self-hostable, inert control plane (v2 charter) + BYO-agent runtime over ACP;
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters. Dev HEAD this
run: `79c56980`; effect/v4 head `9505c63d` (**ADR 0015 step 1 — the app registry — landed as
#284 between runs**; manifest, install at boot, per-org activation).

## The one-line read

Multica shipped the week's biggest window (45 merged PRs, no tag) and the story is **how the
Inbox came back after Thursday's revert**: not as the big-bang sectioned Inbox that was pulled,
but as ~15 incremental PRs folding notifications into the Work panel — #10614 (+4,140/−1,113)
moves the Inbox into Work (one row per issue, hover card with Open / Mark read / Archive),
#10640 adds agent activity to rows and opens at the oldest unread comment, #10663 archives on
cancelled too, and #10675 corrects the re-land the same day: **only your own notifications
archive when you complete an issue — "nobody's inbox changes when an agent completes an issue"**
— the derived-state law from the revert, applied. The agent-native datapoint of the day is
**#10656 (MUL-9314, +191/−3): the human who triggers an agent that files an issue is that
issue's *delegated subscriber* — notified on creation, and the agent's result comment is
always-delivered** (agents post results as comments; `new_comment` joins `mentioned`,
`task_failed`, `agent_blocked` in the mute-proof set; sub-issues whose parent the requester
already watches stay quiet). That is the exact loop Stellarc v2 exists for, and we have no
notification subsystem on effect/v4 to receive it — pre-registered, not briefed. Two more API
laws: **#10629 bulk-edit (+3,836/−372)** — `batch-update`/`batch-delete` take `dry_run` and
return per-issue `results[]` (`updated/unchanged/skipped/would_update…` + code + message,
retry just those; "agents face the same gap" is named in the PR body itself) — and
**#10677 (MUL-9320, +58/−1): Kiro reports throttling through the generic ACP `-32603` wrapper,
and the label mattered** — `request was throttled by the service` now classifies as rate limit
instead of provider-server-error, matched as the full phrase, never a bare keyword. **That is
today's ADOPT brief at our own seam**: `FAILURE_CODES` (packages/agents/src/protocol.ts:16)
has no rate/capacity class at all; the runner maps unknown stop reasons to
`agent_error.prompt_failed` (never retried) and thrown ACP errors to `platform.protocol_error`
(retried, burns attempts) — a throttled provider is currently a never-retried agent fault or an
attempt-burning retry loop, and the `budget_exhausted` park lane is the in-tree no-burn
precedent. Paseo (40 merged PRs, no release) shipped the **runtime-consult law**: #9744
(+188/−4) — idle cleanup must *ask the runtime* whether it holds pending scheduled work
(Claude's session-only crons die with the process; an unknown count means do-not-stop) — plus
a **built-in plugin gallery** (+5,093/−1,312), fork-across-background-work (#9627), per-model
ACP thinking levels (#9717 — capability metadata is per-model, not per-session), and Bypass
auto-accept with **no permission events emitted** (#9760). OpenHands #19744 is the self-hosted
OAuth law: **an MCP OAuth callback base is the URL the browser can reach**, never the server's
own localhost port. Linear (day 3), Cursor (day 9), Devin (day 2), Copilot (day 2), Plane
(day 2) and Huly (day 9) are quiet; Factory's feed route 404s — dead, per the pre-registered
rule.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **No new tag (v0.9.0 11-13 stands); 45 merged PRs in window (biggest of the week); head pushed 19:01Z; 56,199★ (+80).** The Inbox re-land (post-revert, ~15 incremental PRs — the anti-big-bang demonstration): **#10614 folds the Inbox into the Work panel** (MUL-9281, +4,140/−1,113 — notifications at the top of Work, then Pinned/Views/Projects; one row per issue, newest first; hover card with full title, the comment, status, Open/Mark read/Archive; clicking opens the issue *at the comment it is about*), #10633 unread release highlights as a corner card deck (hero mocks built from product tokens so they follow theme + all 8 languages without per-language images), **#10640 agent activity on Inbox rows; open at the oldest unread comment**, #10647 rows lead with the issue status, #10663 archive when cancelled (not only done), **#10675 same-day correction (+207/−119): only the person who completes an issue has their notifications archived — "nobody's inbox changes when an agent completes an issue" — behind an `auto_archive_completed` setting**, #10679 open a notification at the entry it is about, #10687 keep the open issue lit while the next page loads, #10683 mobile reuses core's inbox grouping/landing rule, #10672/#10676 row-height and panel-width tuning, #10673 Inbox docs. **Agent-native loop law: #10656 notify the human behind agent-created issues (MUL-9314, +191/−3)** — the delegated subscriber tier gets `issue_created` on creation; `new_comment` joins the always-delivered set (agents post results as comments); sub-issues whose parent the requester watches stay quiet (agent-split subtrees were the noise MUL-5483 suppressed); mute-proof except the tier's own preference. **API laws: #10629 bulk-edit every field (MUL-8882, +3,836/−372)** — `batch-update` gains `labels {add,remove,clear}` / `properties {set,unset}` / `dry_run`; `batch-delete` gains `dry_run`; both return `results[]` per issue `{issue_id, identifier, outcome, code, message}` with retry-just-those; the PR names the agent gap itself ("the CLI has no batch update command, and `issue delete` has no way to preview what it would do"); **#10628 All Projects board (MUL-8880, +2,448/−333)** — board columns by status/priority/lead (drag changes the field), grouping, search, start/due dates (late red, ≤7d yellow), recent activity, list API/CLI filters, server-saved display. Reading-position family, 5th vendor datapoint: **#10648 keep Jump to latest up while the timeline tail is unrendered (MUL-9303, +158/−39)** — react-virtuoso estimates unrendered rows at the first-measured height (usually the one-line "created the issue" row), so `scrollHeight` underestimates and the button hides; fix = measured-total-based visibility + a hysteresis buffer at the threshold + hiding the button no longer wipes the N-new counter. **Process laws: #10682 (MUL-9345, +1/−0) — an AGENTS.md rule: a PR that changes user-visible behavior updates the docs pages that describe it, in every locale, in the same PR, searching the OLD behavior's terms** (docs-ride-the-PR; second datapoint after #10595's drift test). Failure-classification: **#10677 Kiro throttling → rate limit (MUL-9320, +58/−1; today's ADOPT brief)** + #10668 CodeBuddy failure diagnostics. Private-project sweep continues: #10618 members-only visibility, #10619 lock icons in the sidebar, #10658 CLI `--member` add instead of drop, #10662 stop dropping `member_ids` on `PUT /api/projects`. CLI honesty: #10624 preserve issue description when stdin is disabled, #10634 escape metadata mutation keys before URL building, #10612 preserve local-environment auth exit code. Also #10684 desktop rail parity for New issue/Search (+16/−75), #10667 dev-toolbar Actions panel + #10664 whats-new Prompts panel, #10678 Cmd+K palette jumps to views, #10600 preserve reverted drafts during autosave, #10681 theme `data-slot` fix, #10620 CJK archive/restore docs, #10625 Desktop voice-input docs. | v0.9.0 2026-11-13 stands | proprietary (repo NOASSERTION) | 5 | **WATCH (steal surfaces)** | Three steals clear the brief/pin bar: **#10677 is the ADOPT brief** (rate/capacity failure class at our exact seam — see Proposal 1); **#10656 is the agent-native loop law** (requester-of-agent-work is a notification tier of its own — pre-registered: effect/v4 has no notification subsystem, grep-verified at `9505c63d`, only kaneo-legacy carries one); **#10629 is the batch-write honesty contract** (per-item outcomes + dry_run + retry-subset — agent-API surface, not UI sugar). The Inbox re-land is the execution lesson for our board/notification lanes: after a big-bang revert, re-land as a fan of small PRs with the same-day scope correction (#10675) riding in. |
| **Paseo** | **No new release (v0.16.0-beta.2 11-11 stands); 40 merged PRs in window; pushed 18:38Z; 24,115★ (+60).** All PR-body-verified. **#9744 (+188/−4) — the runtime-consult law:** a Claude agent that schedules a session-only cron (`CronCreate`) or a `/loop` wakeup and goes idle keeps that job inside its process; after an hour, idle cleanup killed the process and the job silently never ran ("Session-only, not written to disk, dies when Claude exits"). The session now registers an observation-only `Stop` hook, records Claude's `session_crons` list from its input, and refuses `canStopRuntime()` while it is non-empty; a `CronCreate`/`CronDelete`/`ScheduleWakeup` marks the count **unknown until the next Stop — and unknown means do-not-stop**. **#9752 built-in plugin gallery (+5,093/−1,312):** browse the directory, install, update, uninstall on-host (Updates section, Update-all, failed plugins marked with their error; plugin pages with settings inline + README) — no more leaving the app for plugins.paseo.sh. **#9627 (+194/−62) fork across background work:** you couldn't fork from a reply that a tool call started before and finished after (background Bash/Monitor/Task, Codex background terminals — exactly the replies the background-work pill makes common); the checkpoint-copy check is narrowed to rows the fork actually copies. **#9717 (+386/−21) per-model ACP thinking levels:** when a provider lists models whose metadata carries `_meta.reasoningEfforts`, each model's picker shows its own levels and default (before: every model showed the startup model's levels — Grok 4.7 lost `xhigh`); models without their own metadata keep the session's options, never no-picker. **#9760 (+68/−2) Bypass auto-accept:** Claude Bypass now approves execution requests *inside the provider callback, before creating or publishing a permission request* — no card flash, no transient waiting state, no permission events for bypassed execution; `AskUserQuestion` and `ExitPlanMode` stay interactive; prompts restore when the session leaves Bypass. Smaller laws: #9782 `paseo agent wait` FAILS when no agent matches the id; #9726 archive/detach/reload agents that `agent ls` leaves out; #9737 a closed agent is marked read even when its provider session is gone; #9779 local turn detection includes local provider config; #9777 archive non-Git workspaces from the command center; #9558 routed hosts recover when their gateway reconnects; #9043 desktop startup stays pending while its daemon becomes ready; #9647/#9657 composer popovers open in place, appear sooner, stop jumping as results change; #9748 Android Usage drag order + sheet gestures; #9745 keyboard focus ring on icon buttons; #9753 an archived worktree stays restorable when Undo races a background scan; #9734 New-workspace plugin metadata survives a retried first agent start; #9733 Playwright workers never load half-written workspace packages; #9731 a full agent id never resolves to a different agent titled with it; #9717's sibling #9718 tracks Antigravity models without per-model levels. | v0.16.0-beta.2 2026-11-11 stands (repo NOASSERTION; npm @getpaseo/* Apache-2.0) | Apache-2.0 (npm), 24,115★ | 4 | **TRIAL (stands)** | #9744 is the lifecycle law of the week: **cleanup that stops a runtime must consult the runtime, and an unknown pending-work count is not an empty one** — Stellarc's `reapExpired` (packages/agents/src/store.ts:1029) is task-lease reaping, a different class, and packages/agents has no idle-runtime cleanup or wakeup/cron concept (grep-verified at `9505c63d`) — pre-registered for the runtime-lifecycle/wakeup lane. #9717 feeds NEVR-309 directly (capability metadata is per-model, not per-session; never no-picker on absence). #9760's no-events-for-auto-approved-execution is the acceptance line for our `policyAllows` path (runner.ts:217 decides in-callback — assert no pending approval item is emitted). #9627 folds into §G (fork/checkpoint vs background work). The plugin gallery is a WATCH for the skills/MCP lane — a directory surface, not a protocol change. |
| **OpenHands** | **No release (v1.40.0 11-12 stands); 5 merged PRs in window (2 dependabot); pushed 17:37Z; 93,523★ (+56).** **#19744 (+66/−5) — the self-hosted OAuth law:** adding an OAuth MCP server registered `http://localhost:<random port>/callback` — a port on the *agent-server host*; the browser hit `ERR_CONNECTION_REFUSED` whenever Canvas runs in Docker (only 8000 published) or behind a reverse proxy on another machine. Fix: register **the browser's backend URL** as the OAuth callback base. **#18913 (+1,831/−6):** profile activation is pointer-only by design, so after ACP onboarding and a switch back to an OpenHands profile the account's global `agent_kind` still said `acp` — the home switcher showed the ACP model picker and profile-less cloud launches created ACP conversations; the global kind is now re-stated from the active profile through the same settings-write onboarding uses. **#18572 (+940/−26):** reuse the profile secret-consent modal for automatic managed-App enablement (enable selects secrets and starts managed apps through the server lifecycle API; disable and revoke stop active work). Both agent-authored, both with a HUMAN: block stating the human's actual involvement — the authorship-honesty pattern again. | v1.40.0 2026-11-12 stands | MIT, 93,523★ | 5 | **WATCH (pattern → ACP capability line)** | #19744 pre-registers for our MCP lane: **an OAuth callback must be the URL the browser can reach** — when Stellarc grows OAuth MCP servers, the redirect URI is derived from the client-facing base URL, never from the server's own interface. #18913 is the derived-state twin of Multica's Inbox law: a global cached kind that activation forgets to restate = stale classification shown to the user. |
| **GitHub Copilot** | **Quiet day 2** — github.blog RSS re-verified; newest Copilot entry is still the **Nov 13 deprecation table** (Gemini 4 Hydrogen GA + GHES GA + the Dec-14 model-deprecation list, all covered 11-13/11-14). Nothing Nov 14–15. | changelog 2026-11-13 (newest) | proprietary | 5 | **WATCH (pattern)** | Nothing new; the model-catalog churn pattern (named successors, per-plan exceptions, weekly cadence) stands as recorded. |
| **Devin (Cognition)** | **Quiet day 2** — devin.ai/changelog re-read; newest entry still **November 13** (Artifacts Rail; "Devin is told which files you saved"; code-host-did-not-respond attribution — covered 11-14). | notes 2026-11-13 (newest) | proprietary | 5 | **WATCH** | Nothing new; the three Nov-13 laws stand. |
| **Linear** | **Quiet day 3** — changelog unchanged; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. |
| **Plane** | **Quiet day 2** — zero merges in window; last push still 11-13 13:05Z (pre-window); v1.5.0-rc2 (11-12) stands; 62,472★ (+33). | v1.5.0-rc2 2026-11-12 | AGPL-3.0, 62,472★ | 4 | **TRIAL (stands)** | Quiet post-rc2; the authz brief (11-11/11-12) stays complete pending rc2→stable. |
| **Cursor** | **Quiet day 9** — changelog unchanged; newest entry still **Nov 6 Voice Chat with Agents**. | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Huly** | **Ninth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,124★ (+2). | platform trunk 2026-11-09 | EPL-2.0, 28,124★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **WALLED DAY 3 — the feed route is marked DEAD.** `factory.com/changelog/feed.json` now answers **HTTP 404** (337KB Vercel 404 shell; on 11-14 it was a 200 "Login – Vercel" shell — either way, no feed). Per the pre-registered rule from 11-14, three walled runs kill the route: future runs rely on **npm + repo docs only**. Re-probed today: npm `@factory-ai/droid` still carries **no dist-tags** (never published); repo `Factory-AI/factory` frozen at 11-11T23:50Z (93★); `docs/changelog` still ends at `1-10.mdx` (no `1-11.mdx`). **Last verified release: v1.9.0** (11-11, covered 11-12). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | v1.9.0's fault-isolation lines stand as the record. Signal watch shrinks to: any `@factory-ai` npm publish, any new `docs/changelog/*.mdx`, any repo push. |

## Proposals

### Proposal 1 — ADOPT brief: a provider rate/capacity failure class, classified from wrapped causes

**Precedent (verified):** Multica #10677 (MUL-9320, +58/−1, merged 11-15 17:48Z). Kiro reports
throttling through the generic ACP `-32603` wrapper: `session/prompt: Internal error
(code=-32603, data=… The request was throttled by the service …)`. The rate-limit rule matched
only `429` / `529` / "rate limit" / "overloaded", so the failure labelled
`agent_error.provider_server_error`. The raw error was already preserved and shown under
"details" — **only the label was wrong, and the label is what drives retry behavior.** The fix
matches the provider's **full fixed phrase** (`request was throttled by the service`), never a
bare keyword, so it cannot over-trigger.

**Our seam (verified this run at effect/v4 `9505c63d`):**

- `packages/agents/src/protocol.ts:16` — `FAILURE_CODES` has **no rate/capacity class at all**:
  five `platform.*` and five `agent_error.*` codes; `isRetryable` is the prefix test
  `code.startsWith("platform.")` (protocol.ts:30).
- `apps/stellarc-node/src/runner.ts` — an unknown stop reason maps to
  **`agent_error.prompt_failed` (line ~720), which is never retried** (an agent fault — but a
  throttled provider is not the agent's fault and is not permanently failed); a thrown
  ACP/JS error maps to **`platform.protocol_error` (line ~732), which retries and burns
  attempts immediately** (no backoff semantics, no capacity distinction). So today a throttled
  provider is either a never-retried "agent" fault or an attempt-burning retry loop.
- The in-tree no-attempt-burn precedent: `budget_exhausted` parking in `claimOnce`
  (packages/agents/src/store.ts:1304+) — budget-blocked tasks park without attempt burn and
  `reapExpired` resumes them when the window rolls over.

**Work:** add `platform.provider_rate_limited` (or `…capacity`) to `FAILURE_CODES`; in the
runner's prompt-failure path, classify from the **wrapped cause** before the generic bins —
HTTP-ish markers (`429`, `529`, "rate limit", "overloaded", "capacity") **and provider fixed
phrases inside ACP error `data`/`message`**, matched as full phrases; keep the raw message as
`failureMessage` detail (already the shape); give the new code park-or-backoff retry semantics
(no attempt burn — evaluate extending the `budget_exhausted` park lane vs. a bounded
backoff retry inside the attempt). Tests: a Kiro-style `-32603` fixture with the throttling
phrase classifies to the new code; a bare "Internal error" stays `protocol_error`; an unknown
stop reason stays `prompt_failed`; a rate-limited task does not burn an attempt.
**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — three pre-registrations (laws with no Stellarc surface yet, grep-verified at v4 `9505c63d`)

1. **Delegated-subscriber notifications** (Multica #10656): the human who triggers an agent
   that files an issue is a notification tier of its own — notified on creation, the agent's
   result comment always-delivered (mute-proof except the tier's own preference), sub-issues
   under a watched parent stay quiet. **The agent-native loop law.** effect/v4 has no
   notification subsystem (grep-verified; only kaneo-legacy carries one — the strangler will
   port the lane, and these are its acceptance lines).
2. **Runtime-consult idle cleanup** (Paseo #9744): anything that stops an agent runtime asks
   the runtime whether it holds pending scheduled work; **unknown count = do not stop**;
   session-local scheduled work dies with the process, so stopping silently deletes jobs.
   Stellarc has no runtime idle cleanup (`reapExpired` is lease reaping) and no wakeup/cron
   concept in packages/agents — parks until the runtime-lifecycle/wakeup lane opens.
3. **Batch-write honesty** (Multica #10629): every batch operation takes `dry_run` and returns
   a per-item outcome (`{issue_id, outcome, code, message}`), with retry-just-those; batch ops
   are agent-API surface ("agents face the same gap" — Multica's own PR says it). No batch API
   in Stellarc yet; acceptance lines for the issues API when it grows writes.

### Proposal 3 — confirmation pack (fold into existing briefs/rows at pickup)

| Vendor fix (verified) | Stellarc contract to fold into |
|---|---|
| Multica **#10648** — virtualizer row-height *estimation* hid Jump-to-latest (react-virtuoso estimates unrendered rows at the first-measured height); + hysteresis at the show/hide threshold; hiding the button must not wipe the N-new counter | **§A reading-position (implementation half open)** — 5th vendor datapoint and the first about *estimation*: visibility derived from estimated totals is wrong on long uneven lists; measured-or-conservative totals, hysteresis, and the N-new counter independent of button visibility. apps/web re-grepped at `9505c63d`: still no scroll/virtuoso code |
| Paseo **#9627** — fork blocked on a reply a background tool call spans | **§G background-work chapter** — a fork/branch point must reconcile with the background-work inventory: rows that span the checkpoint are either waited on or excluded from the copy set; "the reply you want to branch from" must not become "the reply you can't" |
| Paseo **#9717** — per-model `_meta.reasoningEfforts`; absence keeps session options, never no-picker | **NEVR-309 ACP capability line** — capability metadata is per-model, not per-session; absence degrades to inherited defaults, never to a broken control |
| Paseo **#9760** — Bypass auto-accept happens inside the provider callback, emitting no permission request/events (no card flash); questions/plan review stay interactive | **Permission lane** — auto-approved execution leaves no pending approval item and no transient waiting state. Our `policyAllows` (runner.ts:217) already decides in-callback; pin as an asserted acceptance line |
| Multica **#10682** — behavior changes update the docs pages that describe them, same PR, every locale, searching the OLD terms | **Agent-docs meta-law row** — second datapoint after #10595 (drift test); for Stellarc's own agent-facing docs when they exist: one source, test-locked, and docs ride the behavior PR |
| OpenHands **#19744** — MCP OAuth callback registered on the agent-server's localhost port; browser got `ERR_CONNECTION_REFUSED` behind Docker/proxy | **MCP lane pre-registration** — an OAuth callback base is derived from the client-facing URL (the URL the browser used to reach the backend), never the server's own interface |
| Multica **#10614/#10633/#10675** — the post-revert re-land: a fan of small PRs, same-day scope correction | **Execution pattern for our board/notification lanes** — after a big-bang revert, re-land incrementally; the derived-state-at-read law from 11-14 rides in as the acceptance line |

## Row updates

All ten competitor rows updated in `docs/scout/INDEX.md` (last-checked 2026-11-15); Factory's
ring note becomes "feed route dead" (walled day 3, per the pre-registered rule); the
reading-position row gains #10648 (the estimation law); the §G background-work row gains #9627;
the ACP row gains #9717 (per-model capability metadata). Four new rows: the rate/capacity
failure-class ADOPT brief (briefed 11-15) and the three pre-registrations above
(delegated-subscriber notifications, runtime-consult idle cleanup, batch-write honesty).
