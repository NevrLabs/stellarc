# Scout — Competitors, 2026-11-10

Beat: **competitors**. Delta window: 2026-11-09 19:03 UTC → 2026-11-10 19:02 UTC (~24h). Every claim
verified against the GitHub API (`gh api` — repo metadata, commits, merged PRs incl. additions/deletions,
release tags and bodies) or a browser-rendered changelog (Linear, Cursor, Devin, Factory read 19:00–19:15Z;
Copilot via the github.blog changelog feed, parsed). Context: Stellarc = self-hostable, inert control plane
(v2 charter) + BYO agent runtime over ACP; the UI future is `apps/web` greenfield on `effect/v4`
(docs/design/agent-view-lifecycle-contracts.md is the landed A–G render contract, Sections F4/F5 added by
NEVR-530/NEVR-544). The Postgres event log is the sole source of truth; sync is an Electric-shaped
shape-tail. `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

The quiet vendors stayed quiet — Linear a **fifth** consecutive day (the streak it set yesterday now
extends by one), Cursor a fourth, Devin a fourth, Plane a seventh — but everything that ships code
shipped a **release**: Multica tagged **v0.8.2** (10:17Z) behind a 50-merged-PR day, Paseo cut **v0.15.4
and v0.16.0-beta.1** (the beta is the release that ships the radar's whole tracked cohort — background
tasks with per-item Stop, plugin composer/sidebar surfaces, the rebuilt mobile timeline), OpenHands
released **v1.38.0** (04:47Z), Factory shipped **v1.7.0 + v1.7.1**, and Copilot broke its own streak with
an 17:04Z entry. Two structures repeat across vendors **today, independently**: **(1) first-frame /
reopen honesty** — Paseo 0.16.0-beta.1's polish section: a streamed tool call's final title and icon
render from its **first frame** (#9248), the context popover opens with usage **already loaded** (#9212),
and returning to an unchanged chat shows **zero flash** (#9242, completing #9175's render half) — while
Factory v1.7.0 and OpenHands #19290 land the same-day triple confirmation that **streaming must not
redraw the whole list** (our E3/E4, already pinned). Today's ADOPT brief pins the two laws our contract
does not yet carry: **F6 first-frame finality** and **C10 unchanged-reopen paints zero theater**.
**(2) Session-continuity leniency** — Factory v1.7.1: a session whose earlier thinking went stale after a
context change **continues** instead of failing the next message; v1.7.0: compaction **keeps the approved
spec and its comment** — both join the resumable-codes brief as addenda. Plus Multica's day holds three
hygiene steals at Stellarc scale: **knip made blocking** with 2,832 dead frontend lines removed (#10331),
test fixtures anchored on the **UTC date** (#10323, same-day twin of OpenHands #19603's UTC-timestamp
bug), and the daemon telling agents **not to use the shared git stash list** (#10326 — 14 lines, the
shared-mutable-git-state law).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.8.2 TAGGED 11-10 10:17Z** (#10278 changelog prep, #10292 follow-up); **50 merged PRs in window** (search-page cap — at least 50; head #10341 18:48:36Z; pushed_at 19:02:14Z on-branch), 55,571★ (+154). **#10331 — knip blocking + dead-code purge (−2,832 lines across 43 files)**: unreferenced frontend code removed and the detector made a CI gate. **#10265 — the environments an issue started in, in its sidebar (+4,664/−5, 62f)**: environment attribution surfaces on the issue itself. **#10287 — community themes 1/3, make and import your own theme (+4,264/−179)**. **#10286 — ⌘K hands to an agent through a fixed row instead of guessing (176/−880)**: net −704 lines — deterministic agent selection replaces inference. **#10315 — annotate agent replies into the next message (+520/−41)**: quoting-annotation joins #10165's save/send unification. **#10310 — one meaning for "my agents' work" across filters and sidebar (+477/−215, 44f)**: vocabulary unification law. **#10328 — switch to desktop app windows from the issue sidebar (+1,380/−62)**. **#10268 — simplify connected app setup for agents (+544/−249)** (extends the #9849 rebuild). **#10282 — private-project issues kept out of workspace wakeup lists (139/−25)**: source-scope flows to derived cross-cutting surfaces. **#10326 — daemon tells agents not to use the shared git stash list (14/−0)**: shared-checkout hygiene injected at the runtime boundary. **#10323 — dashboard fixtures anchored on the UTC date (15/−12)**. #10274 — recover Antigravity turns when earlier step errors resolved (158/−14); #10291 — Jump to latest on desktop issues and in chat (+681/−40); #10297 — skip session renewal for non-session credentials (94/−12); #10299 — stop autolinking URLs inside HTML tags (131/−1); #10240 — CLI validates self-host health before saving config (231/−31); #10258 — hide turned-off system wakeups in the sidebar; #10273 — private projects for everyone (9/−100, flag removal); #10340 — lint bans full-page navigation in shared code → openExternal (96/−1); #10336 — same-day revert of #10296 (description-image click-through). | v0.8.2 2026-11-10 | source-available (NOASSERTION) | 5 | **WATCH (steal surfaces)** | The release train we track for structure, not adoption. Today's steals at our scale: the knip gate while apps/web is young (proposal 2), UTC-anchored fixtures (same-day twin of an OpenHands bug), environment-attribution and vocabulary-unification as acceptance lines for the board lane, and the git-stash law for any shared-checkout future. |
| **Paseo** | **v0.15.4 (01:52Z) + v0.16.0-beta.1 (12:13Z) — two tags in 11 hours**; 17 merged PRs in window, 23,728★ (+88). **v0.15.4**: Claude Fable 5.2 + Mythos 5.2 in the catalog (#9233; requires Claude Code 2.1.321+; Mythos appears only when the CLI advertises access — capability-gated catalog entries). **v0.16.0-beta.1 ships the tracked cohort**: #6220 **background tasks** — shells and monitors listed above the composer with a per-item Stop, working across Claude Code, Codex and OpenCode v2 (**the provider-extension path our Section G runtime half waits on, now proven in a release**); #8744/#9209/**#9207** plugin composer controls — read/set prompt, attachments, provider, model, mode, thinking, **put the cursor in any agent's composer** (+1,544/−69), New-workspace items, agent/workspace metadata; #8906 plugin sidebar views (plugin replaces sidebar content across every connected host, per-device); #8683 background agents (`background: true` helpers: no tab, no notification, out of default lists); the rebuilt mobile timeline (#8717/#9085); reconnect discipline (#8651/#9086/#8855/#9116); **the polish trio that is today's ADOPT brief**: #9248 — a streamed tool call's final title and icon from its **first frame** (165/−18); #9212 — the context popover opens with usage **already loaded** (253/−22); #9242 — returning to an unchanged chat shows **zero "Updating" flash** (104/−30, completing #9175); plus #9241/#9243 — the Changes diff stays on screen when its panel reopens (232/−0) and loads in batches with priority over the daemon's background worktree scans (641/−96); #8636 — issue/PR reference links (`#123`, `owner/repo#123`) across GitHub/GitLab/Gitea/Forgejo/Codeberg; #8642 — change-base picker for worktree workspaces; **#8939 — `PASEO_WORKSPACE_ID` in each agent's env, so an agent can identify, rename or archive its own workspace** (agent self-identification); #9281 — every release leads with highlights in What's new, changelog and release notes (+1,217/−107); #9211 — prepare terminal replay input **before** signaling readiness (3/−1); #9247 — popovers stay above their trigger when content grows (192/−84); #9296/#9304 — plugin test assertions independent of fixture setup time. | v0.15.4 / v0.16.0-beta.1 2026-11-10 | source-available (Apache-2.0 + carve-out) | 5 | **TRIAL (stands; elevated)** | The closest shipped product to Stellarc's target surface. The beta closes the loop on three radar pre-registrations at once (background tasks, plugin surfaces, timeline rebuild) and contributes the two render laws our contract lacks — F6 and C10 (proposal 1). `PASEO_WORKSPACE_ID` joins the BYO-agent environment-contract pre-registrations. |
| **OpenHands** | **v1.38.0 RELEASED 11-10 04:47Z** (bundles the carried cluster — #18699 automation-aware install, #19421 profile-owned presets, #19546 stop split, #19568 model reconciliation, #18975 persisted workspaces, #19330 portable bundles, #19307 admin edits, #18533 semantic budget meters, #19494 resolved banners, #17730 contrast pass); 27 commits in window; 93,142★ (+97). **Post-release trunk**: **#19574 — deliver chat over HTTP until the session socket is served** (the transport degrades to polling-shaped delivery rather than dropping; readiness-ordered transport fallback); **#19290 — memoize `filteredSubConversations` in the WebSocket provider** (the same-day third confirmation of the streaming-list redraw law — with Factory v1.7.0 and carried Paseo #8916; our E3/E4 already pin it); **#19603 — interpret resume visibility timestamps as UTC** (local-time interpretation bug; same-day twin of Multica #10323); **#19472 — automations dashboard filters by owner, with a Service accounts option** (service principals are first-class filter citizens); #19397 — don't yank focus when the user has navigated away; #18734 — message-only `/launch` links without a plugin (deep links degrade to plain prompts); #19275 — Docker exits non-zero when the agent-server stops responding (fail-visible containers); #19426 — e2e waits on the live page after deleting the active LLM profile; deps: @heroui/react 2.8.10→**3.2.4** (major), electron 43→45, typescript 6.0.3→7.0.2. | v1.38.0 2026-11-10 | MIT | 5 | **WATCH (pattern → automation-lane bar)** | The 1.38.0 release consolidates the automation-lane bar we pre-registered. Today's new lines: readiness-ordered transport fallback (#19574 — candidate law for our WS/REST seam), UTC timestamp interpretation (#19603), and service-account filter citizenship. |
| **Factory (Droids)** | **Two releases today — v1.7.0 and v1.7.1 (CLI + Desktop)**; Full Changelog header verified: "262 RELEASES · LATEST CLI V1.7.1 · NOVEMBER 10, 2026" (+2 releases, yesterday's gap days were the burst gathering). **v1.7.1 — stale thinking no longer fails the next message in a session**: after context changes, a session whose earlier thinking went stale **continues**; the next message is not failed — stale reasoning artifacts must not poison subsequent turns. **v1.7.0**: **streaming sessions no longer redraw the whole session list** (sidebar stays responsive during busy sessions — same-day triple with OpenHands #19290 and carried Paseo #8916); **an offline Droid Computer no longer retries connections in a loop that slows the sidebar** (bounded retries, again — the reconnect-cap family); **compacting a long session keeps the spec you approved and the comment you left with it** (approved artifacts survive compaction); **checks on merge commits scope to your conflict resolutions**, not every change the merge brings in (diff attribution scoped to what the actor did); GitLab token scope errors name the missing scope instead of "invalid"; sign-in walls when fetching pages are reported with the matching connector offered; typed answers to questions get a Next-question affordance; environment-panel git actions moved into a menu on the Changes row. | v1.7.1 2026-11-10 | proprietary | 5 | **WATCH** | The session-continuity pair (stale-thinking continuation + approved-spec-survives-compaction) joins our resumable-codes brief as addenda — the field keeps converging on "recover, don't fail" for anything whose corruption mechanism is stale-not-lost. |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; **fifth consecutive quiet day — the streak it set yesterday extends by one**. | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; mobile diffs, guided reviews, and the carried agent fixes stand. |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents**; **fourth consecutive quiet day**. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **GitHub Copilot** | **Streak broken** — three new changelog entries in window: **C++ language server now auto-configures MSBuild builds (11-10 17:04Z, Copilot CLI)** — the language server bundles its MSBuild compile-commands extractor and invokes it automatically, "an agent no longer needs to discover and run a separate configuration skill" = **environment configuration moves into the tool, not the agent's skill library**; Dependabot alerts pause on inactive repositories (11-10 14:20Z, not Copilot); Claude Fable 5.2 in GitHub Copilot (11-09 16:46Z, pre-window — but the same model Paseo shipped today: **cross-vendor catalog convergence within 24h**). | changelog 2026-11-10 | proprietary | 5 | **WATCH (pattern)** | The MSBuild entry is the second datapoint (after Cursor's publish-gate) that per-environment setup belongs in tooling the agent inherits, not prompts it re-derives — feeds the BYO-agent environment contract when written. |
| **Plane** | **Seventh consecutive quiet day** — `preview` trunk carries **zero commits in window**; pushed_at moved to 11-10 15:15:25Z = off-branch again (**metadata law, fifth confirmation**); v1.4.3 (10-28) stands; 62,266★ (+57). | v1.4.3 2026-10-28 | AGPL-3.0, 62,266★ | 4 | **TRIAL (stands)** | Streak extends; the v1.4.3 auth/tenant-isolation checklist stays queued on our side. |
| **Devin (Cognition)** | **Quiet** — release-notes TOC newest is still **November 6, 2026** (browser-read 19:10Z); fourth consecutive quiet day. | release notes 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; the delegation-tree and side-channel pre-registrations stand. |
| **Huly** | **Fourth consecutive quiet day** — pushed_at still 11-09T14:14Z (the README edits, pre-window); zero commits in window; 28,084★ (+6). | platform trunk 2026-11-09 | EPL-2.0, 28,084★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |

## Proposals

One new ADOPT brief clears the bar; one TRIAL; five addenda.

### Proposal 1 (ADOPT) — pin F6 (first-frame finality) + C10 (unchanged-reopen paints zero theater) in the agent-view lifecycle contract

**Precedent (all shipped today, in Paseo 0.16.0-beta.1, verified via PR + release notes):**
#9248 — "Show a streamed tool call's final title and icon from its first frame" (165/−18, merged 04:05Z);
#9212 — "Show loaded usage in the first frame of the context popover" (253/−22, 02:49Z); #9242 — "Stop
flashing Updating messages when returning to an unchanged chat" (104/−30, 02:28Z; completes #9175's
render half, which the 11-09 report pre-registered as "the open half is the apps/web render side").

**Gap (verified on `origin/effect/v4` today):** `docs/design/agent-view-lifecycle-contracts.md` carries
A1–A3, B1–B5, C1–C9, D1, E1–E4, F1–F5, G. A3 bans the initializing flash **between open and first
content** (view-level); E3/E4 pin list rebuild/invalidation scope. No law pins **the content of a
streamed element's first frame**, and no law pins **the reopen path for an unchanged target** — the two
shapes Paseo just shipped fixes for. apps/web's agent surfaces (`routes/agents.tsx`, the transcript lane
under construction) are exactly where these laws will be enforced; pinning them now, with pre-registered
regression plays, is the NEVR-530/NEVR-544 pattern (F4/F5 were pre-registered before their app surfaces
existed).

**Brief (ready to file):**

- **Problem.** The agent-view render contract pins when content appears (A3: no placeholder between open
  and first content) but not what the first frame of a streamed element contains, and pins replay honesty
  for changed transcripts (C1–C9) but not the reopen path for **unchanged** ones. Two shipped competitor
  fixes (Paseo #9248/#9212/#9242, 2026-11-10) show the missing failure shapes: (a) a streamed tool call
  first renders a generic placeholder and renames to its final title/icon one flush later; (b) a popover
  opens against a skeleton and fills a beat later although the data was synchronously available; (c)
  reopening a view whose data is unchanged paints an "Updating"/refetch flash anyway.
- **Work.**
  1. Add **F6 — First-frame finality** to Section F: where an element's final presentation is
     synchronously derivable at insert time (a tool call's title/icon from its own kind/name in the
     persisted item; a popover's usage numbers from the already-loaded context snapshot), its first frame
     IS its final frame. Skeleton/placeholder states are reserved for data that is genuinely not yet
     known — never for data the client already holds.
  2. Add **C10 — Reopening an unchanged view paints zero theater** to Section C: the reopen/attach path
     carries the client's cursor; a target the server answers `current` for renders its persisted state
     with zero intermediate "Updating"/refetch frames (extends C1's "if it didn't persist, it doesn't
     render" to "if nothing changed, nothing repaints"; the sync tail already answers changes-only — the
     law binds the render side, as pre-registered 11-09).
  3. Pre-register both regression plays in the contract's house style: `stability: a streamed tool call
     renders its final title and icon in its first frame` (red when any frame shows the generic
     placeholder where the item carried a derivable title) and `replay: reopening an unchanged view
     paints zero Updating frames` (red when any theater frame paints between open and persisted state).
     No app code in this brief — the plays pin before the surfaces land, exactly as F4's did.
- **Acceptance.** Contract doc updated on `effect/v4` with F6 and C10, each carrying precedent
  (Paseo #9248, #9212, #9242 with merge timestamps) and its pre-registered regression play; the
  Maintenance section's law index updated; `make verify` untouched (docs-only change).
- **Scope guard.** `docs/design/agent-view-lifecycle-contracts.md` on `effect/v4` only; no schema, no
  dependencies, no runner changes, no UI code.

### Proposal 2 (TRIAL) — knip dead-code gate while apps/web is young

Multica #10331 removed **2,832 lines of unreferenced frontend code across 43 files** and made knip a
**blocking** CI gate — in a codebase with a full-time team and review discipline; the dead code
accumulated anyway. Stellarc's apps/web is at the age where the gate is nearly free: the surface is ~30
source files, everything is reachable or deletable in one pass, and the gate then holds the line as the
agent views grow. **TRIAL, not brief**: run `bunx knip` against apps/web once manually first; file the
gate brief only if the report is clean-or-trivially-fixable (a noisy first run on a young app means the
config cost exceeds the benefit today — re-look when the routes double).

### Addendum — session-continuity pair (Factory v1.7.0/v1.7.1) → resumable-codes brief

For the filed resumable-codes extension (INDEX row, brief filed 11-03): **(a)** a session whose earlier
thinking went stale after a context change **continues** — the next message is not failed
(v1.7.1); **(b)** compaction keeps the approved spec and its comment (v1.7.0). Both extend the brief's
rule — *admit codes whose failure mechanism cannot corrupt the recorded transcript* — with a sibling:
**stale-not-lost session artifacts are recoverable state, not failures**; when we classify platform
codes, "stale reasoning/context after compaction" belongs on the resumable side of the line.

### Addendum — carried lines reinforced today

- **Streaming must not redraw the whole list — triple confirmation in one day**: Factory v1.7.0
  (streaming sessions no longer redraw the session list), OpenHands #19290 (memoize
  `filteredSubConversations` in the WS provider), Paseo #8916 (carried). Our E3/E4 already pin it;
  the triple raises it from law to industry consensus.
- **Bounded retries, again** (Factory v1.7.0: an offline runtime no longer retry-loops; joins Paseo
  #8827, Factory v1.3.0, the runner-startup-honesty brief's attempt-cap addendum).
- **UTC determinism pair** (Multica #10323 fixtures anchored on the UTC date; OpenHands #19603 resume
  visibility timestamps interpreted as UTC after a local-time bug): every stored timestamp is a UTC
  instant, every time-windowed fixture pins its date. apps/web's `dayKey` already slices
  `toISOString()` (BoardWorkspace.tsx:250) — the pair pins the **test-fixture** half.
- **Agent git hygiene** (Multica #10326, 14 lines): agents sharing a checkout must be told, at the
  runtime boundary, not to use shared mutable git state (the stash list). Joins the record-at-birth /
  shared-environment laws for any shared-checkout future.
- **Environment config moves into the tool** (Copilot changelog 11-10: the C++ language server
  auto-configures MSBuild; "an agent no longer needs to discover and run a separate configuration
  skill"): per-environment setup belongs in tooling the agent inherits — second datapoint after
  Cursor's publish-gate; feeds the BYO-agent environment contract when written.
- **Background-tasks runtime half — provider-extension path proven** (Paseo 0.16.0-beta.1 ships #6220
  with per-item Stop across Claude Code, Codex and OpenCode v2, none via ACP): Section G's runtime half
  stays gated on our ACP seam, but the reference implementation now exists in a release; re-evaluate at
  the NEVR-309 ACP bump (target 2.5.0).
- **Agent self-identification** (Paseo #8939, `PASEO_WORKSPACE_ID`): an agent can identify, rename or
  archive its own workspace through a documented env var — a BYO-agent environment-contract line.
- **Vocabulary unification** (Multica #10310, +477/−215): one phrase ("my agents' work") must select one
  set everywhere it appears — filters, sidebar, API. Board-lane acceptance line.
- **Deterministic agent selection** (Multica #10286, net −704): ⌘K hands to an agent through a fixed
  row, never an inference — command surfaces don't guess intent.
- **Release-notes discipline** (Paseo #9281, +1,217/−107): every release leads with highlights across
  What's new, changelog and release notes — the shape our scout radar consumes; worth copying when
  Stellarc ships releases.
