# Scout — Competitors, 2026-11-19

Beat: **competitors**. Delta window: 2026-11-18 19:00 UTC → 2026-11-19 19:00 UTC (~24h).
Every claim verified against the GitHub API (`gh api` — repo metadata, release tags + full
bodies, a `--merged-at` window search per repo) or a fetched changelog feed (Linear, Cursor,
Devin, Copilot — github.blog RSS with exact pubDates, entry bodies fetched). Factory probed
per the dead-route rule (npm registry + default-branch commits since window + changelog
dir). Context: Stellarc = self-hostable, inert control plane (v2 charter) + BYO-agent
runtime over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing
filters. Dev HEAD this run: `8ead5ef7` (scout design 11-18, #326); effect/v4 head
`9505c63d` (frozen day 5; ADR 0015 step 2 = #286 still open).

## The one-line read

**Two releases again, and Multica shipped the day's law at the list-read seam.** **Multica
v0.11.1** (11-19 10:12:27Z; 42 merged PRs in window) is a patch, but it carries today's
ADOPT brief: **#10959 (MUL-9635) "retry busy inbox reads and show a load error instead of
an empty Inbox"** — a read that is busy retries, a read that fails renders a visible load
error, and **an empty state is never painted for data whose read did not succeed**. Pairs
with Paseo #9847 (v0.16.2, 11-18: one unreadable stored entry never hides the whole list)
into a two-vendor **list-read honesty** law → Proposal 1: pin **D2** into
`docs/design/agent-view-lifecycle-contracts.md` §D (which carries D1 alone; apps/web has
**zero** error/empty-state surfaces at `9505c63d` — grep-verified — the exact F4/F5/F6/
E5–E7 before-the-surface pattern). The same release ships **MUL-9644 inbox retention**
(#10969: each inbox keeps its newest 2,000 notifications; #10973: a woken issue keeps its
return rank without waiting on the trimmer — rank stability under retention), the
**MUL-9651 task-token binding trio** (#10984 list only the bound workspace for a task
token, #10975 task-token attachment reads stay in the bound workspace, #10974 unread
summary scoped the same) **+ #10994 workspace deletion refused from machine credentials**
— the credential-class law's third consecutive week of enforcement PRs; **#10911 "parse a
comment's Markdown once and reuse it across mounts"** (derived presentation computed once
per content version), **#11000 explicit insufficient-balance classified as quota** (not a
generic failure), lightweight **Docs with version history** behind the `docs_v1` flag
(#10176/#10954/#10946), and Free/Pro/Business billing (MUL-9484/#10885 — commercial lane,
not ours). One process datapoint: the floating issue-sidebar cards (#10922/#10928,
MUL-9592) shipped in the release body and were **reverted in-window** (#10948) — the
release body carries both. **Paseo v0.17.0-beta.1** (11-19 15:17:54Z; 35 merged PRs):
**#10190** start a workspace in an existing worktree / branch off or check out any branch
or PR; **#10193 interactive permissions + session history for Antigravity** — the BYO-agent
matrix adds a Google harness with host-managed approvals; **#10148 agents watch pull
requests** (checks/reviews/comments wake the agent); **#10216 waiting heartbeats are kept
out of Running**; **#10200 notify once while a finish is unread, not per self-started
turn**; **#10172 name which `browser_wait` condition expired** instead of blaming the
browser host; **#10187 fail the turn when the shared OpenCode service stops**;
**#9568/#9661 provider versions shown and updated from provider settings + one provider
page everywhere**. **OpenHands** quiet: 11 merged PRs (6 dependabot, 1 docs, 1 CI), the
substance being **#19769 automations created enabled from the setup wizard** + #19860
setup form kept when switching conversations; v1.42.0 (11-18 16:36Z) was pre-window; the
#17820 conversation virtualization still rides v1.43.0. **Copilot**: two in-window entries
by RSS pubDate — **Gemini 4 Neon GA** (11-18 21:49Z; agentic-coding tier under Carbon at
lower token cost, provider-list pricing under usage-based billing) and **eight more
GitHub-verified MCP connectors** (11-18 22:04Z; Supabase, Box, Calendly, Buildkite…,
joining 25+ like Slack/Figma/Sentry — "connect once, use across Copilot"). Model churn is
now daily-grade (Astra/Sol 11-17, Neon 11-18). **Plane frozen day 2** (0 merged PRs,
pushed_at still 11-18T13:05Z). **Linear quiet day 7** (newest still Nov 12), **Cursor
quiet day 13** (still Nov 6), **Devin quiet day 3** (still Nov 16), **Huly frozen day 13**
(pushed_at 11-09T14:14Z), **Factory dead day 1** of the new rhythm (npm `@factory-ai/droid`
Not found re-probed; zero commits since window start; `docs/changelog` still ends
1-10.mdx; last verified release v1.9.0, 11-11).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.11.1 SHIPPED 11-19 10:12:27Z (42 merged PRs in window; head pushed 18:41Z; 56,746★ (+148)).** Release body + PR titles verified. **THE LIST-READ HONESTY LAW (today's brief):** #10959 (MUL-9635) busy inbox reads retry, failed reads show a load error, and an empty Inbox is never painted for an unread one — with Paseo #9847 (one unreadable entry never hides the list) this is a two-vendor law in two days. **MUL-9644 retention:** #10969 each inbox keeps its newest 2,000 notifications; #10973 a woken issue keeps its return rank without waiting on the trimmer (rank stability under trimming). **MUL-9651 task-token binding:** #10984 a task token lists only the workspace it is bound to; #10975 attachment reads stay in the bound workspace; #10974 unread summary scoped the same — plus #10994 workspace deletion refused from machine credentials (credential-class enforcement, week 3). **#10911 (MUL-9538) parse a comment's Markdown once and reuse it across mounts.** **#11000 explicit insufficient balance classified as quota** (failure-class precision). #10991 efforts confirmed by partial discovery are validated; #10977 only a sub-issue closing wakes the parent's assignee; #10950 subturn waits for managed background tasks; #10952 scroll-fade mask skipped on coarse pointers; #10902/#10939/#10930 the perf benchmark suite grows (big-issue + Inbox switching, tab switches, idle CPU/memory growth); #10913/#10993/#10892 perf riders; #10922/#10928 issue-sidebar cards shipped then **reverted in-window** (#10948). **Docs with version history behind `docs_v1`** (#10176, #10954 content search for people and agents, #10946 deletion restricted to creators/admins, #10953 deleted doc renders not-found). Billing: MUL-9484 Free/Pro/Business plans + checkout/switching, #10957 Free member caps, #10956 no-card Business trial, #10876 member-started Run now not metered. | v0.11.1 2026-11-19 10:12Z | proprietary | 5 | **WATCH (pattern → list-read honesty, retention, credential-class)** | D2 brief (Proposal 1). Retention + rank stability pre-registers for our notification lane (no inbox surface — grep-verified). Task-token binding folds into the standing 11-11 authz brief as its third addendum: scope every list/read/summary a machine credential can reach to the binding, refuse destructive writes outright. #11000/#10991 join the resumable-codes classification family. | 
| **Paseo** | **v0.17.0-beta.1 SHIPPED 11-19 15:17:54Z (35 merged PRs in window; pushed 15:10Z; 24,457★ (+84)).** Release body verified. **#10190 use existing worktrees:** start a workspace in a worktree you already have, or create one from any branch/PR. **#10193 Antigravity approvals + history:** permission modes, interactive tool approvals, CLI session import, history on reopen — the BYO-agent matrix grows a Google harness with host-managed approvals. **#10148 agents watch pull requests** — checks/reviews/comments notify the watching agent (the wakeup lane's PR-shaped trigger, third vendor). **#10216 waiting heartbeats are kept out of Running** — scheduled/waiting work is its own status, never Running. **#10200 notify once while a finish is unread** — one notification per unread terminal state, not one per self-started turn (notification-volume honesty). **#10172 say which `browser_wait` condition expired** instead of blaming the browser host (failure attribution names the condition). **#10187 fail an OpenCode turn when the shared OpenCode service stops** (shared-service death is a turn failure, not a hang). #10224 a restored worktree's git status is re-read, never a stale not-git snapshot; #10236 current Claude usage shown after switching accounts; #10171 subagent status restored after reopen and rewind; #10153 a plugin agent stays usable after its provider closes the session; #9723 prompt + reply survive a mid-reply reconnect; **#9568 provider versions shown and updates run from provider settings; #9661 each provider's state shown in the list, one provider page everywhere**; #9887 taps acknowledged promptly, fewer offscreen rows mounted on mobile; #10135 finished replies stay visible across idle notifications; #9852 worktree teardown stops after one minute and keeps the worktree (configurable). | v0.17.0-beta.1 2026-11-19 15:17Z | proprietary | 5 | **WATCH (law source)** | Waiting≠Running holds in our v4 status model by construction (Proposal 3) — pre-register the line for the wakeup lane. #10200 + Multica MUL-9644 are the notification lane's first two acceptance lines. #10193 feeds the ADR 0011 adapter inventory (harness approvals are host-managed across Claude/Codex/OpenCode/OMP/Antigravity now). #10148: PR-watch is a first-class agent tool; our wakeup lane's PR rules are the platform-side sibling. #9568/#9661: provider version+state visibility is the BYO-agent settings surface to pre-register. | 
| **OpenHands** | **Quiet window — 11 merged PRs (6 dependabot, 1 docs mapping, 1 CI pin-bundle chore, 1 version bump); pushed 17:42Z; 93,841★ (+84).** Substance: **#19769 automations are created enabled from the setup wizard** (the automation lane's default-on creation origin), #19860 the automation setup form is kept when switching conversations (draft retention across view switches — the #19386 class again). v1.42.0 (11-18 16:36Z) was pre-window and covered yesterday; **#17820 "perf(chat): virtualize the conversation message list" still has no release — rides v1.43.0.** | v1.42.0 2026-11-18 (no new release) | MIT, 93,841★ | 5 | **WATCH** | Automations-enabled-from-setup joins the standing automation-lane pre-registration (creation origins). #17820 remains the virtualization datapoint to re-check at v1.43.0. | 
| **GitHub Copilot** | **Two entries IN WINDOW by RSS pubDate** (github.blog Copilot feed, timestamps verified, bodies fetched). **Gemini 4 Neon in GitHub Copilot, GA** (11-18 21:49:21Z) — agentic coding/multistep tool use; Google claims Carbon-adjacent quality at lower token cost per task; provider-list pricing under usage-based billing; Pro+/Max/Business/Enterprise; gradual rollout. **Connect Supabase, Box, Calendly, and more to Copilot** (11-18 22:04:50Z, public preview) — eight more **GitHub-verified MCP servers ("connectors")**, joining 25+ (Slack, Figma, Sentry); "connect once, use across Copilot"; examples: Buildkite build failure → fix in-session, Supabase schema check before a migration. | changelog 2026-11-18 (both newest) | proprietary | 5 | **WATCH (pattern → model churn + connector catalog)** | Fourth catalog entry in two days (Astra/Sol 11-17, Neon 11-18) — BYO-agent never names models (already law). The verified-connector catalog is the MCP-lane consolidation line: platform-curated, connect-once, cross-surface reuse — the shape our MCP registry lane should study when it opens. | 
| **Plane** | **Frozen day 2 — 0 merged PRs in window** (search verified); pushed_at still 11-18T13:05Z; 62,804★ (+100). v1.5.0 (11-16) stands; the authz→validation sweep stays concluded. | v1.5.0 2026-11-16 stands | AGPL-3.0, 62,804★ | 4 | **WATCH (sweep concluded)** | Nothing new; the 11-11 brief's acceptance lines are complete. | 
| **Devin (Cognition)** | **Quiet day 3** — devin.ai/changelog re-fetched; newest entry still **November 16** (Subscribers + Mark done; Phonebook; old-thread fork). | notes 2026-11-16 (newest) | proprietary | 5 | **WATCH** | Nothing new; the 11-17 pre-registrations (dismissal-is-a-view-action, unresumable-thread fork) stand. | 
| **Linear** | **Quiet day 7** — changelog re-fetched; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. | 
| **Cursor** | **Quiet day 13** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. | 
| **Huly** | **Thirteenth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,153★ (+9). | platform trunk 2026-11-09 | EPL-2.0, 28,153★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. | 
| **Factory (Droids)** | **Dead day 1 of the new rhythm** — zero commits since window start (API-verified), pushed_at still 11-17T19:54Z (yesterday's two docs commits stand as the last movement); npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` dir still ends **1-10.mdx**. No release entry. **Last verified release: v1.9.0** (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | The 11-17 docs burst (Windows MXC sandbox) still reads as pre-release platform documentation; keep the npm + default-branch + changelog-dir probe trio. v1.9.0's fault-isolation lines stand as the record. | 

## Proposals

### Proposal 1 — ADOPT brief: list-read honesty (D2 — an empty state is an assertion about the data, so a read that did not succeed never renders one)

**Precedent (verified this run):** Multica v0.11.1 #10959 (MUL-9635, merged 11-19 06:51Z)
— a busy Inbox read retried, and a failed read rendered a load error, **because the
pre-fix shape painted an empty Inbox for a read that never completed**. Paseo #9847
(v0.16.2, 11-18) is the collection-level sibling: one unreadable stored entry never hides
the rest of the list. Two vendors, two days, one law.

**Our gap (verified at effect/v4 `9505c63d`):**

- `docs/design/agent-view-lifecycle-contracts.md` §D "One failure, one surface" carries
  **D1 only** — where a failure surfaces, how many times. Nothing pins what a **busy or
  failed list read** may render, and §C9's replay-side law (persisted items paint before
  empty-state suggestions) is the positive half only.
- apps/web has **zero empty-state or error-state surfaces today** (git grep
  `EmptyState|isEmpty|empty.?state|errorState|LoadError` over apps/web/src at `9505c63d`:
  no hits) — the board (`BoardWorkspace.tsx`), agents/runs (`agents.tsx`, `RunDetail.tsx`)
  and home views (`HomeViews.tsx`) are exactly the list surfaces that will need this law,
  and pinning it **before** the first empty state is written is the F4/F5/F6/E5–E7
  pattern.

**Work (docs-only, no app code):** pin **D2** into §D of
`docs/design/agent-view-lifecycle-contracts.md` on effect/v4, with precedent + a
pre-registered regression play in the house style:

- **D2 — A failed read is an error; a busy read is a retry; emptiness is an assertion
  about the data.** An empty state asserts "the query succeeded and returned nothing" —
  it may render only after a successful read. A read that is still in flight renders
  its loading shape (and a **busy**/contended read retries before surfacing anything);
  a read that fails renders the view's error state (per D1: once, one surface) with its
  retry affordance. A collection degrades per-entry: one unreadable entry never hides
  the others — the list renders what survived and names what didn't. *Regression play:*
  `failure: a failed list read renders an error, never an empty state` — drive a board/
  runs query to failure under a scripted transport; assert the error surface renders,
  zero empty-state frames paint, and a subsequently successful empty read *does* render
  the empty state. Then fail one entry of a collection read and assert the surviving
  entries still render. Red when a failed read paints emptiness — the #10959 pre-fix
  shape — or when one bad entry blanks the list — the #9847 pre-fix shape.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — pre-registration pack (no new Stellarc surface; acceptance lines folded into the standing rows)

- **Notification retention + rank stability (NEW, Multica MUL-9644 #10969/#10973):** when
  a notification/inbox store arrives, it is capped at its newest N (theirs: 2,000), and
  an item's return rank is computed without waiting on the trimmer — retention never
  reorders what survived. No inbox/notification surface in Stellarc (grep-verified at
  `9505c63d`).
- **Notify once per unread terminal state (NEW, Paseo #10200):** while an agent's finish
  is unread, subsequent self-started turns do not re-notify — one notification per unread
  terminal state. Notification-volume honesty; rides the same lane.
- **Parse-once, reuse-across-mounts (NEW, Multica #10911):** derived presentation (a
  comment's Markdown) is parsed once per content version and the result shared across
  mounts — re-mounting a rendered item never re-parses unchanged content. Pre-register
  for the apps/web transcript-render lane (no markdown dep today — verified).
- **Provider version + state visibility (NEW, Paseo #9568/#9661):** the BYO-agent
  settings surface shows each harness's version and live state in the list, opens one
  provider page everywhere, and can run provider updates from settings. Feeds the ADR
  0011 adapter inventory.
- **Task-token workspace binding (fold into the standing 11-11 authz brief, Multica
  MUL-9651 trio + #10994):** scope every list/read/summary a task token can reach to its
  bound workspace, and refuse destructive writes (workspace deletion) from machine
  credentials outright — credential-class separation, week 3 of enforcement.
- **Failure-classification folds:** Multica #11000 (explicit insufficient balance is
  quota, not generic error — the resumable-codes family), #10991 (capabilities confirmed
  by partial discovery are validated before use), Paseo #10172 (a timeout failure names
  the condition that expired, never blames the host), #10187 (shared-service death fails
  the dependent turns, never hangs them).
- **PR-watch as an agent tool (watch, Paseo #10148):** agents watch a PR and are notified
  on checks/reviews/comments — the tool-side sibling of our platform-side PR wakeup
  rules; the two lanes are complementary, not duplicative.
- **Automations enabled from setup (fold, OpenHands #19769):** joins the automation-lane
  pre-registration's creation-origin list (default-on from the setup wizard).
- **Connector catalog consolidation (watch, Copilot 11-18):** platform-curated,
  GitHub-verified MCP connectors, connect-once cross-surface reuse — the shape to study
  for our MCP registry lane; and model churn is now daily-grade (Astra/Sol, Neon) —
  BYO-agent never names models (already law).

### Proposal 3 — no-gap verification (recorded, no brief)

Paseo #10216 "waiting heartbeats are kept out of Running" — the law: **scheduled or
waiting work presents as its own status, never as Running.** Verified in our tree at
effect/v4 `9505c63d`: `packages/agents/src/protocol.ts` `TASK_STATUSES` carries
`queued | claimed | running | completed | failed | cancelled | budget_exhausted |
needs_permission` — the two parked states (`budget_exhausted`, `needs_permission`) are
**first-class statuses excluded from claims**, not flavors of running, and no
heartbeat/scheduled-wait concept exists yet (grep-verified: no wakeup/heartbeat/cron
concept in packages/agents/src). The law holds by construction today. Pre-registered for
the wakeup/scheduling lane the day it opens: a waiting-on-schedule state is its own
status value, never folded into `running`.

## Sources

- GitHub API (fetched 2026-11-19, window 11-18T19:00Z→11-19T19:00Z): repos/{multica-ai/multica (meta, v0.11.1 full body, 42-window PRs), getpaseo/paseo (meta, v0.17.0-beta.1 full body, 35-window PRs), OpenHands/OpenHands (meta, 11-window PRs), makeplane/plane (meta, 0-window PRs), hcengineering/platform (meta), Factory-AI/factory (meta, commits?since=window → empty, contents docs/changelog)}
- registry.npmjs.org/@factory-ai/droid — `{"error":"Not found"}` (re-probed 2026-11-19)
- Changelog feeds fetched 2026-11-19: linear.app/changelog (newest Nov 12), cursor.com/changelog (newest Nov 6), devin.ai/changelog (newest Nov 16), github.blog Copilot RSS (pubDates: Neon 11-18 21:49:21Z; connectors 11-18 22:04:50Z) + both entry bodies fetched
- Stellarc seams verified at origin/effect/v4 `9505c63d` (git grep/show): contracts §C/§D/§E/§F inventory (§D = D1 only; §E ends E4); apps/web empty/error-state grep (zero hits); apps/web tree inventory (board/agents/home list surfaces); protocol.ts TASK_STATUSES; markdown-dep grep (zero)
