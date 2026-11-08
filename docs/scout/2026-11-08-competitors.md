# Scout — Competitors, 2026-11-08

Beat: **competitors**. Delta window: 2026-11-07 19:10 UTC → 2026-11-08 19:05 UTC (~24h). Every claim
verified against a vendor changelog/release notes (fetched raw or browser-rendered), the GitHub API,
or repo metadata on 2026-11-08. Context: Stellarc = self-hostable, inert control plane (v2 charter)
+ BYO agent runtime over ACP, Bun/TS monorepo (`apps/stellarc-{api,node,ui,worker}`,
`packages/{agents,contracts,db,domain,sync,telemetry}`, plus `packages/kaneo-legacy`); the UI future
is `apps/web` greenfield on `effect/v4` (ADR 0014), React 19.3.1 + vite 8.3.6, streaming agent views
at 500 ms flush. `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

A release-quiet, law-rich day: **no vendor shipped a release at all** — Factory's November daily
train takes its first gap day (seven straight releases 11-01→11-07, nothing on 11-08 through
19:05Z), Linear is quiet a third day, Cursor a second, and Copilot's three-day metrics streak ends
with an empty changelog — but the trunk streams carried three chapters. **(1) Memory is a streaming
UI's budget line** — Multica MUL-8781/#10131: React 19.2's *dev build* calls
`performance.measure(detail=props-diff)` on every render and never `clearMeasures()`; with
streaming runs re-rendering the issue page constantly, a Desktop Canary left open two days hit
**30 GB+** and the macOS out-of-memory panel. Fix: cap the dev User Timing buffer. Stellarc runs
the same workload shape (React 19.3.1, streaming agent views) — today's one ADOPT brief.
**(2) Identity, drafts, and fan-out got their honesty laws** — Paseo's 22-commit day headlines with
#9098: harnesses restart session-local turn counters on resume, **reusing IDs already persisted on
earlier timeline rows**, so with Collapse turns the first reply hid inside a summary spanning both
turns (fix: fresh UUID namespace per session; the provider contract now documents turn-ID
uniqueness across the agent lifetime). Our transcript keys `(task_id, attempt, seq)` self-minted —
verified hold, not a bug. Plus: unsent drafts survive tab close (#9079), cleared attention actually
reaches independently subscribed clients (#9087 — writes must flow through the subscription owner),
and "no timestamp" renders `unknown`, never `never` (#9054). **(3) Devin's missed November 6 entry
surfaced** — the TOC now tops with it: a **child-session tree** (reveal switch in the sidebar),
**side chats with queue-or-interrupt semantics that persist** across reload, step-by-step setup
instructions on secret-request cards, and enterprise **session-visibility governance** (account
default read-only/read-write, org-level sharing caps, log-out-of-all-devices). Also: OpenHands
moves conversations from chat toward structured lifecycle (`resolved=user|auto` banner, #19494),
and its lint-enforced token program keeps tightening. One new brief; eleven addenda/pre-registrations.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | v0.8.1 stands; **8 trunk commits in window** (head badeeae 18:43:51Z; pushed_at 18:59:36Z = off-branch, metadata law), 55,296★ (+65). **MUL-8781/#10131 — cap the dev User Timing buffer**: React 19.2's dev build calls `performance.measure()` with a `detail` object (the changed-props diff behind DevTools' Components track) on every render and never `clearMeasures()`; the browser keeps User Timing entries as long as the page is open; streaming runs re-render the issue page constantly → a Desktop Canary left open ~2 days reached **30 GB+**, macOS out-of-application-memory panel. **MUL-8766/#10123 — the sidebar tree only changes when the user changes it**: opening an issue had expanded its project *and saved the expansion as if user-opened* — projects piled open, both view and project lit, and a project that loads only 5 issues expanded without showing the target. Implicit navigation no longer writes persistent UI state. **MUL-8764/#10121 — rail spaces drag-reorder** (dnd-kit sortable, 5 px threshold, vertical-axis lock, release-doesn't-open; order persists). **#10097 — a running run-only autopilot run can be stopped from run history** (permission = can-edit-the-autopilot; webhook/schedule-fired runs previously unstoppable until timeout). **MUL-8780/#10129 + MUL-8775/#10127 — dev-env honesty pair**: `make up` waits for our own compiling web server (12–27 s route compiles measured) instead of calling the port busy; reports stale API or busy web instead of a foreign listener. MUL-8779/#10130 rail 64→56 px; MUL-8744/#10101 remove the header logo hover-hop. | trunk 2026-11-08 (#10131 et al.) | proprietary, 55,296★ | 5 | **WATCH (steal surfaces)** | MUL-8781 is the day's ADOPT brief: our apps/web runs React 19.3.1 dev builds with exactly that workload (streaming agent views, constant re-render), so the leak class is ours to pre-empt — memory becomes a streaming-page budget line. MUL-8766 is a state-attribution law for the apps/web board lane (BoardWorkspace landed on effect/v4): programmatic navigation never persists UI state. #10097: stop authority surfaces where the run is visible, bound to edit rights on the triggering object. |
| **Paseo** | v0.15.3 stands; **22 trunk commits in window** (11-07 20:02Z → 11-08 18:29Z, head #9130), 23,512★ (+110). **#9098 — turn-ID uniqueness across resume**: Claude/Codex/OpenCode restart session-local turn counters on resume, reusing IDs persisted on earlier timeline rows; with Collapse turns, the first reply hid inside a summary covering both turns. Each session now mints turn IDs in a fresh UUID namespace; the provider interface documents uniqueness across the agent lifetime, including resume and daemon restart. **#9079 — unsent drafts (text + attachments) preserved when closing agent tabs**, surviving archive/unarchive and app reload. **#9087 — cleared workspace attention reaches independently subscribed clients**: the stored-agent path wrote directly to storage and emitted an update without subscription ownership; now the agent-manager command handles stored agents and publishes its normal state event so every client's subscription gets the filtered update. **#9054 — `Last online: unknown` when no timestamp** (a host that connected then disconnected rendered "never"; absence of data is not a negative claim). **#9029 — History loads after browser reload**: React Compiler removed a memo's connection-state dependency (a discarded version counter), caching the unreachable-host result forever. **#9038 — host identity and actual error kept in desktop logs** (no more `[object Object]` from Electron's text-only console capture). #9086 dead host connection replaced ~10 s after foreground return (was 40 s+); **#8907 Changes revisions streamed** — file tree renders on the daemon's announcement, loader until bodies arrive, paced binary frames let pongs/replies through, refresh replaces changed files atomically at revision end; **#9109 large routed timelines stay connected when the receiver falls behind** (`resource_limit` backpressure fix); #9085 Show-more/plan-card toggles respect the timeline's disclosure hold on Android (no overpaint, blank frame, or jump-to-end); #9083 latest turn footer stays in the chat column on web; #9071 one hover card at a time; #9058 routed connections identified in diagnostics; #9067 abandoned browser connections closed immediately; #9046/#9059 website hydration fixes; test journeys #9130/#9102/#9089/#9080. | trunk 2026-11-08 (v0.15.3 of 11-06 stands) | Apache-2.0 + carve-out, 23,512★ | 4 | **TRIAL (stands)** | #9098 is the identity law for our resume seam: IDs minted for transcript items must be unique across the agent lifetime — **verified hold for us** (our items key `(task_id, attempt, seq)` self-minted, store.ts:404-414; a resumed attempt is a new attempt number, `resumed_from` markers link chains — collision impossible by construction; pin with a regression test). #9079 extends the composer lane (drafts are data: closing/archiving never destroys unsent input). #9087 is the fan-out law for packages/sync: writes flow through the path that owns subscription invalidation. #9054/#9038 are diagnostics/logging honesty lines. #9029 pre-registers the React Compiler stale-cache bug class. |
| **OpenHands** | v1.37.0 stands; **15 commits in window** (newest main cc99322 12:01:26Z; pushed_at 19:00:03Z = off-branch), 92,961★ (+75). **#19494 — resolved banner for project conversations**: conversations tagged `resolved=user\|auto` show a resolved banner and will group under a "Resolved" section in the upcoming Projects feature — stated goal: "move up from chat UI to a real UX/UI for agents". Token-discipline program continues: #19492 named shared horizontal scroll-fade tokens, #19491 named font-relative code padding, #19486 named file-drop illustration coordinates, #19493 spacing-scale aliases for rem layout limits. #19518 wide-table fades blend into message bubbles; #19498 Paper-theme recipes tightened; #19519 maintenance map. Deps: posthog-js 1.415→1.444, i18next 26.5.12→26.6.0, eslint group, globals 16.5→17.13, postcss-prefix-selector 2.1.1→2.2.1. | trunk 2026-11-08 (v1.37.0 of 11-06 stands) | MIT, 92,961★ | 4 | **WATCH (pattern)** | #19494 pre-registers conversation-lifecycle attribution: terminal "resolved" carries an attribution dimension (user vs auto), rendered as a banner and used for grouping. For Stellarc's agent threads: a terminal state that records *who* resolved it (human vs agent) is cheap to store now and load-bearing later. The token program keeps proving the lint-enforced named-value method our design lane copied. |
| **Devin (Cognition)** | **November 6 entry surfaced at docs.devin.ai** (not present at yesterday's 19:07Z browser read; TOC now tops with it — the SPA lags or the entry posted late). **"Reveal child sessions" switch in the sidebar** — child sessions hidden under their parent until expanded (delegation tree UI). **Side chats: queue or interrupt, and the list persists** — send while a side chat is working: interrupt or queue-after, as in the main chat; older side chats survive reload/reconnect. **Setup steps on secret-request cards** — when Devin needs an API key, the request card shows step-by-step instructions for getting it. **Session sharing: account defaults + org cap** — admins set default visibility for new sessions (Account read-only / read-write, enterprise or per-org) and can limit sharing to the session's org. **Log out of all devices** (web, Desktop, CLI, mobile at once). Redesigned share-artifact dialog (General-access row); Ask screenshots carry into agent sessions; settings search opens each Customizations tab; Gerrit changes in "PRs needing you" (email-matched); repository named on findings + sortable security-repos table (**sort kept in the page URL**); Pylon allowed-orgs; Gerrit permission sync (group membership → repo access; long-lived service-account password exchanged for short-lived tokens, Gerrit 3.13+); Jira admin connection finishes in-app; machine catalog (OS icons, tier names with slot counts, one row per platform); enterprise Environments page no longer times out at scale; multi-org incidents + PagerDuty→org routing. | release notes 2026-11-06 | proprietary | 5 | **WATCH** | The child-session reveal switch is the first *collapsible tree* UI for delegated runs in the cohort — feeds the delegation pre-registration (visibility default: collapsed under parent). Side chats gaining queue-or-interrupt + persistence hardens the side-channel pattern (Factory `/side` pre-registered 11-07). Setup-steps-on-request-cards raises the approval-surface bar: a permission request teaches the user how to satisfy it. Session-visibility defaults + org caps are enterprise-governance lines for our org/permission surface (per-object default visibility, admin-settable). |
| **Factory (Droids)** | **No release 11-08 through 19:05Z** — the November daily train's first gap after seven consecutive releases (v1.0.0→v1.6.0, 11-01→11-07). v1.6.0 (11-07) stands: /side Side Chat, steered background Tasks report their final answer, pause-boundary status honesty, no Initializing-Session flash. | v1.6.0 2026-11-07 | proprietary | 5 | **WATCH** | A gap day, not a stop — the train's cadence note flips from daily to burst. Nothing new to steal; carried lines stand. |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents** (HTML re-fetched, verified); second consecutive quiet day. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; **third consecutive quiet day** (longest Linear streak the radar has recorded). | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; mobile review + carried fixes stand. |
| **GitHub Copilot** | **Quiet day** — changelog RSS newest item still 11-07 00:27Z (code review API management); the changelog page carries **zero 11-08 items** (HTML verified). The three-day metrics/attribution streak ends with nine experiences on the adoption chart as the standing total. | changelog 2026-11-07 | proprietary | 5 | **WATCH (pattern)** | Streak end, not a reversal — per-surface usage attribution stays the enterprise bar our BYOK schema note tracks (dimensions: surface, activity kind, data-quality). |
| **Plane** | **Fifth consecutive quiet day** — `preview` trunk newest still 11-03 (#9922 base_host OAuth fix 16:53Z, carried); pushed_at 11-07 14:41Z remains off-branch (metadata law); v1.4.3 (10-28) stands; 62,153★ (+28). | v1.4.3 2026-10-28 | AGPL-3.0, 62,153★ | 4 | **TRIAL (stands)** | Longest quiet streak in the beat's history extends; the v1.4.3 auth/tenant-isolation checklist stays queued on our side. |
| **Huly** | **Second consecutive quiet day** — `hcengineering/platform` newest commit still 11-06 06:56Z (#11161, carried); 28,074★ (+4). | platform trunk 2026-11-06 | EPL-2.0, 28,074★ | 3 | **REJECT (stands)** | Maintenance cadence without an agent story; nothing to re-litigate. |

## Proposals

One new ADOPT brief clears the bar today; everything else is addendum material or pre-registration.

### Proposal 1 (ADOPT) — dev-build User Timing memory hygiene for apps/web

**Precedent:** Multica MUL-8781/#10131 (11-08). React 19.2's development build calls
`performance.measure()` with a `detail` object (the changed-props diff behind DevTools' Components
track) on every render and never calls `clearMeasures()`; the browser retains User Timing entries
for the life of the page. A page that re-renders constantly — streaming agent runs — grows the
buffer without bound: Multica measured **30 GB+ after ~2 days** of a Desktop Canary with several
agent runs, ending in the macOS out-of-memory panel. Fix: cap the dev User Timing buffer.

**Stellarc exposure:** apps/web (effect/v4) pins **React 19.3.1** and renders streaming agent views
(500 ms flush → constant re-renders while runs are open). Dev builds dogfooded for days are the
exact failure shape. This is dev-only by precedent (React's production build skips the measure),
so the fix is cheap and carries zero production risk.

**Brief (ready to file):**

- **Problem.** Long-lived dev sessions of apps/web with streaming agent views accumulate
  unbounded User Timing entries (React dev-build `performance.measure(detail)` per render, never
  cleared); memory grows until the tab dies. Precedent: Multica #10131, 30 GB+/2 days.
- **Work.**
  1. Reproduce/measure in a dev build: open a streaming agent view, sample
     `performance.getEntriesByType("measure").length` and `performance.memory` over a long
     session; record the growth curve.
  2. If affected (expected), add dev-only buffer hygiene at the app root
     (`apps/web/src/routes/__root.tsx` / `router.tsx`), behind `import.meta.env.DEV`: bound the
     measure buffer — e.g. an interval that calls `performance.clearMeasures()` (and
     `clearResourceTimings()`) when entry counts pass a cap.
  3. Document the law in the apps/web contract docs: *long-lived streaming pages carry a memory
     budget; instrumentation buffers are capped by the app, not left to the browser.*
- **Acceptance.** In a dev build with a streaming run open, measure-entry count stays bounded
  (flat under the cap) and no heap growth is attributable to User Timing; production bundle
  unchanged (the hook is dev-only, tree-shaken in prod); a comment at the anchor states the law.
- **Scope guard.** apps/web only; no new dependencies; no application-code changes beyond the
  dev entry; never touches the runner or packages/*.

### Addendum 1 — identity-uniqueness verified hold (Paseo #9098)

Paseo's resume bug (session-local turn counters restarting on resume → ID reuse → earlier replies
swallowed by a collapsed summary) cannot occur in our store by construction: transcript items key
`(task_id, attempt, seq)` with `seq` self-minted (`maxItemSeq`, packages/agents/src/store.ts:404-414,
idempotent on seq), a resumed attempt is a *new* attempt number, and `resumed_from` markers link
the chain (store.ts:1128-1168). **Pin with one regression test** when the ordering-law row is next
touched: a resumed attempt's items never collide with any prior attempt's rows. The general law for
any future provider-fed ID surface (e.g. ACP itemId passthrough): *identities minted for transcript
rows are unique across the agent lifetime — including resume and daemon restart — and uniqueness is
a documented provider-interface contract, not an accident of format.*

### Addendum 2 — interaction/state laws for carried chapters

- **State attribution** (Multica MUL-8766): implicit/programmatic navigation never writes
  persistent UI state — expansion, selection, and scroll state persist only from direct user
  action. Board-lane acceptance line (BoardWorkspace landed on effect/v4).
- **Drafts are data** (Paseo #9079): closing or archiving a conversation never destroys unsent
  composer text/attachments; drafts survive reload on the same client. Joins composer-stays-ready
  (Paseo #9015, carried).
- **Subscription-ownership fan-out** (Paseo #9087): every state write flows through the path that
  owns subscription invalidation — a direct-storage write that "emits an update" without ownership
  leaves independently subscribed clients stale. Architecture line for packages/sync (shape
  invalidation) and any future push fan-out.
- **Diagnostics honesty** (Paseo #9054): absence of a timestamp renders `unknown`, never `never` —
  absent data is not a negative claim. For our node/runner status surfaces.
- **Structured logging fidelity** (Paseo #9038): diagnostic objects are logged through a structured
  interface so identity and error detail survive log capture (never `[object Object]`).
- **Stop authority surfaces where the run is visible** (Multica #10097): a running agent run can be
  stopped from its history surface by anyone with edit rights on the triggering object — our
  cancelTask seam already exists (store.ts:1000); the line is the permission binding.
- **Disclosure hold at the mobile extreme** (Paseo #9085): inline expand/collapse toggles route
  size changes through the timeline's disclosure hold — no overpaint, no blank frame, no
  jump-to-end. Section F corroborated by a second vendor on a second platform.
- **Diff transport discipline** (Paseo #8907 + #9109): structural tree renders on announcement
  with a loader for bodies; frames are paced so control frames (pongs/replies) are never starved;
  revisions replace atomically; and large streams stay connected when the receiver falls behind
  (backpressure instead of `resource_limit` disconnects). Lines for our diff surfaces and
  packages/sync tailing.

### Addendum 3 — three pre-registrations

- **Delegated-run tree + queue-or-interrupt side channels** (Devin Nov 6): child sessions render
  as a collapsed tree under their parent (opt-in reveal); secondary channels accept a message
  mid-run as interrupt *or* queue-after, and their list persists across reload/reconnect. Feeds
  the delegation-law pre-registration and the side-channel pattern (Factory `/side`).
- **Approval requests that teach** (Devin Nov 6): a secret/permission request card carries
  step-by-step instructions for obtaining the secret — the request surface includes the path to
  satisfy it. For our approval items when a secrets surface exists.
- **Conversation-lifecycle attribution** (OpenHands #19494): terminal state `resolved` carries
  attribution (`user|auto`), rendered as a banner and used for grouping. For agent threads: record
  who terminalized, cheap now, load-bearing later. (Stellarc's issues already carry status; the
  line is the attribution dimension on agent-thread terminal states.)
- **Enterprise visibility governance** (Devin Nov 6): admin-settable default visibility for new
  sessions (read-only/read-write, per-org), org-level sharing caps, and log-out-of-all-devices —
  lines for our org/permission surface if/when sharing lands.
- **React Compiler stale-cache class** (Paseo #9029): the compiler may elide a memo dependency it
  proves redundant and cache an unreachable-state result forever — subscribe to *status*, not
  derived counters. Pre-registered against any future React Compiler adoption in apps/web.

## Non-findings / notes

- **Stellarc releases still empty** (0 releases via GitHub API, re-verified 11-08 19:04Z; default
  branch `main`, pushed 13:35Z) — the landed NEVR-198 scoped-permission pipeline remains
  unverified-on-a-release; row stays open.
- **Vendor quiet-day matrix**: Factory first gap day (train note flips to burst), Linear 3rd
  (longest recorded), Cursor 2nd, Copilot streak end, Plane 5th (longest in beat history), Huly
  2nd.
- **Devin TOC lag**: yesterday's browser read at ~19:07Z showed newest = Nov 2; today the TOC tops
  with November 6. Either the entry posted after the read or the SPA's index lagged — worth one
  extra scroll-check on quiet days.
- **Methodology**: `web_search`/`web_extract` still down (`9router` unregistered, second day) —
  vendor changelogs fetched via curl (Linear, Cursor, Factory docs HTML, github.blog RSS + page)
  and browser rendering (Devin docs SPA); GitHub data via `gh api`. Star deltas: Multica +65,
  Paseo +110, OpenHands +75, Plane +28, Huly +4.
- Windows sealed at: Multica #10131 18:43:51Z (pushed_at 18:59:36Z off-branch), Paseo #9130
  18:29:07Z (trunk head), OpenHands cc99322 12:01:26Z (pushed_at 19:00:03Z off-branch).
- Verification sources (2026-11-08 ~19:00Z): api.github.com/repos/{multica-ai/multica (commits,
  PRs #10131/#10121/#10123/#10097/#10129, metadata), getpaseo/paseo (commits, releases, PRs
  #9098/#9086/#9079/#9087/#9054/#8907/#9109/#9029/#9038/#9085), OpenHands/OpenHands (commits,
  releases, PR #19494), makeplane/plane (preview commits, metadata), hcengineering/platform
  (commits, metadata), NevrLabs/stellarc (releases, metadata)}; linear.app/changelog (HTML);
  cursor.com/changelog (HTML); docs.factory.com/changelog/release-notes (HTML);
  docs.devin.ai/release-notes/2026 (browser-rendered); github.blog/changelog (RSS + HTML).
