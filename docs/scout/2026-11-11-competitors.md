# Scout — Competitors, 2026-11-11

Beat: **competitors**. Delta window: 2026-11-10 19:02 UTC → 2026-11-11 19:03 UTC (~24h). Every claim
verified against the GitHub API (`gh api` — repo metadata, merged PRs with additions/deletions and merge
timestamps, release tags and full release-note bodies) or a browser-rendered changelog (Linear, Cursor,
Devin, Factory — the latter via its machine-readable `/changelog/feed.json`, parsed in-page; Copilot via
the github.blog changelog page). Context: Stellarc = self-hostable, inert control plane (v2 charter) +
BYO agent runtime over ACP; the UI future is `apps/web` greenfield on `effect/v4`
(docs/design/agent-view-lifecycle-contracts.md carries the landed A–G render contract, F6/C10 briefed
11-10). The Postgres event log is the sole source of truth; sync is an Electric-shaped shape-tail.
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters.

## The one-line read

The quiet vendors finally shipped — and the one that had been quiet longest shipped the most relevant
release of the week. **Plane broke its seven-day streak with v1.5.0-rc1** (tagged 11-10 12:21:57Z —
mid-window *yesterday*; the 11-10 report read "v1.4.3 stands" and missed it, correction carried below):
a React 19 / Router 8 upgrade, the full `@makeplane/propel` design-system cutover, nginx→Caddy, PostHog
analytics **removed** — and a **30+-fix object-level authorization sweep** that publishes, as shipped
code, the exact tenant-isolation checklist our TRIAL row had queued. They followed with a **9-commit
authz burst on preview today** (08:35–15:59Z: guest visibility on every live-collab socket, search
scoped to active members, legacy FileAsset POST rejected). **OpenHands cut v1.39.0** (17:14Z, second
release in ~36h), **Paseo shipped v0.16.0-beta.2** (18:33Z, second beta in 30h, folding the day's
fixes), and **Factory shipped v1.8.0** (third release in ~36h). Devin's notes gained a **November 9**
entry after yesterday's 19:10Z read. Linear (6th), Cursor (5th), Huly (5th) stayed quiet. Two structures
repeat across vendors **today, independently**: **(1) authorization scope is the shipping surface** —
Plane's whole release is object-level authz, Devin added a Deny button to Slack permission cards,
Multica fixed contradictory precedence rules in its agent runtime brief — and it is today's ADOPT brief:
**the authz object-scope sweep for our HttpApi surface** (steal the checklist, not the code — Plane is
AGPL). **(2) usage attribution must survive the transport** — Paseo **#9396** (ACP provider plugins were
*dropping* the token usage an agent reports in its prompt response), Multica **#10375** (usage activity
bounds preserved across out-of-order reports), Devin's new daily-consumption API, Copilot's usage-API
lines. Plus a same-day **environments convergence**: Multica took environments public (stop/restart/
start/logs from the issue sidebar +5,777/−306, a public Environments page and agent guide for
`.multica/environments.toml`) while Devin shipped an Enterprise **Active Build Queue** — environments
are first-class observable objects at two vendors at once.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Plane** | **STREAK BROKEN — v1.5.0-rc1 TAGGED 11-10 12:21:57Z** (inside yesterday's window; the 11-10 report's "v1.4.3 stands" was a miss — the tag sat on a release branch while preview showed zero commits; correction noted, and it re-confirms the metadata law: default-branch signals miss release-branch tags). **The release is a 30+-fix object-level authz sweep** (the `mguptahub` line): rate limiting on email/password sign-in+sign-up (#9335), webhook HMAC secret_key never returned on reads (#9382), page-list `order_by` sanitized against an allowlist (#9387), Spaces board IDs bound to the anchor project (#9442), SubIssuesEndpoint scoped to the URL project (#9466), draft→issue conversion scoped to the draft owner (#9443), project-join lookup scoped to the invited project (#9166), authority-relative `next_path` redirects rejected (#9709), state writes restricted to project admins (#10008), workspace-member mass-assignment blocked (#9460), **guest visibility enforced on attachments + activity** (#9467), public-Space asset mutations scoped to the creator (#9483), grouped-paginator cursor bound (#9486), workspace asset routes require project membership (INFRA-501), **body-supplied created_by/created_at refused on the external API** (INFRA-772), exports scoped to the requester (INFRA-778), unauthorized DRF-mixin actions refused (INFRA-496), global-view reads require membership (INFRA-499), archive/unarchive scoped (INFRA-777), DeployBoard scoped (WEB-8400), comment+relation endpoints scoped (SECUR-243), publish requires project membership (SECUR-247), raw comment HTML escaped in email notifications (#9651), repeated Trivy nightly-finding closures. Platform: **React 19 + React Router 8** (#9530, headlessui-v2 regression fixed #9694), full `@makeplane/propel` design-token cutover (web/Space/admin, #9682 + ~20 migration PRs), nginx→Caddy (#9716, built on 2.11.7), per-arch images merged by digest (#9673), **PostHog analytics + scaffold removed** (#9634), Georgian/Dutch/Bulgarian i18n. **TODAY, preview trunk: 9 commits 08:35–15:59Z continuing the sweep** — restricted guests blocked from links and others' subscribers (#10205), **page access checked on every live-collab socket** (#10207), project entity search restricted to active project members (#10213), active workspace members required as lead/assignee (#10214), legacy FileAsset POST rejected + query stripped from asset id (#10216/#10212), legacy POST fields read-only, migrations lockfile label (#10189), workspace switcher visible while scrolling (#10258), timezone select kept inside the modal (#10257). 62,302★ (+36). | v1.5.0-rc1 2026-11-10 | AGPL-3.0, 62,302★ | 4 | **TRIAL → ADOPT (the checklist; brief filed)** | The queued "tenant-isolation checklist for our auth surface" now exists as a shipped release. Steal the *acceptance lines* (URL-path scoping, server-derived identity, guest-read enforcement, bounded cursors, rate-limited auth, secrets never on reads) — clean-room from the changelog only, never the AGPL code. Today's proposal 1. PostHog removal is also the privacy posture a self-hostable inert control plane should match. |
| **Paseo** | **v0.16.0-beta.2 (18:33:46Z; #9422 reconciled into main 18:40:43Z) — second beta in 30h**; 16 merged PRs in window; 23,812★ (+84); `@getpaseo/*` npm packages now declare Apache-2.0 (they declared none before). The beta re-ships the 0.16 cohort (background tasks #6220, plugin sidebar views #8906, plugin composer controls #8744/#9209/#9207, faster diff loading #8907/#9241/#9243, mobile timeline #8717/#9085, the F6/C10 polish trio #8944/#9175/#9242/#9248/#9212) plus **new: keyboard shortcuts on mobile with a keyboard attached** (iPad/Android run desktop bindings incl. custom; also work in narrow desktop windows — #8625), **touch-sized tablet controls** (#8748 + 6 more), **undo workspace archive** (6-second toast, Cmd/Ctrl+Z restores the workspace with its tabs and agents — #8904/#9104), **fewer reconnects on return** (keep a working connection, reconnect once when needed). **Today's fixes folded in**: **#9396 — ACP provider plugins no longer drop the token usage an agent reports in its prompt response (+121/−5)** (usage attribution was being *lost at the ACP seam*); **#9362 — plugins get an agent's background task count (`backgroundWork.count`) and a `background` flag on agent snapshots + hooks (+283/−28)** (the background-work inventory becomes a first-class plugin-facing fact); **#9302 — a long user message paints collapsed from its FIRST frame (+398/−49)** (was showing without its fade/Show-more for one frame on open — F6 day-2 confirmation); #9370 — Codex reconnects and warnings appear in the timeline without false recovery on child completion (+559/−9); #9285 — a plugin the daemon terminated now reports its exit instead of staying listed (+34/−1, fail-visible runtime); #9210 — unarchiving restores the agents archived with the workspace (+505/−296); #9261 — resumed pi-subagent runs appear in the Subagents track; an ACP prompt to an exited process no longer stays running forever. | v0.16.0-beta.2 2026-11-11 | Apache-2.0 (npm now declared), 23,812★ | 4 | **TRIAL (stands; elevated)** | The two most Stellarc-relevant lines: #9396 pins *usage must survive the provider seam* — an acceptance line for our NEVR-309 ACP bump (we stream usage items per usage_update; assert none are dropped at the ACP boundary); #9362 makes background-work inventory a queryable fact, the runtime half of our Section G. #9302 reinforces yesterday's filed F6/C10 brief two days running. |
| **OpenHands** | **v1.39.0 RELEASED 11-11 17:14:58Z** (second release in ~36h; bundles yesterday's post-release trunk): #19472 automations dashboard filters by owner with a Service accounts option, #19623 message hover timestamp moved next to its message, **#19619 Stop hook feedback kept out of the chat** (system/harness feedback must not pollute the user transcript — transcript purity), #19595 Paper theme printed as aged newsprint, #18568 verify-openhands lines linking Canvas families to Agent Server features, #19603 resume visibility timestamps interpreted as UTC, #19290 memoized `filteredSubConversations`, #19574 chat delivered over HTTP until the session socket is served, #19630/#19633 automations fixes (Event Key dropdown opens; backend profile selection availability respected), #19640/#19642 the setup tour bounds to its dialog's lifecycle and drops unanswered questions when hidden, #16806 missing event file caught instead of crashing the UI; agent-server 1.62.0, automation 1.32.1, @openhands/extensions 0.42.0, electron 45.2.2, @heroui/react 3.2.7, ws 8.22.1. **Post-release trunk already moving: #19649 (17:14Z) — messages at tied history-page boundaries kept from vanishing/duplicating** (pagination correctness exactly at the page seam — the load-older extreme our live-status contract pins). 93,244★ (+102). | v1.39.0 2026-11-11 | MIT, 93,244★ | 5 | **WATCH (pattern → automation-lane bar)** | #19619 names a transcript law we haven't pinned: harness lifecycle feedback (stop hooks) is system state, never chat content. #19649 is the fourth load-older-extreme datapoint (after Paseo #8358 + Factory's 11-06 pair) — folds into the live-status contract's next pin. |
| **Factory (Droids)** | **v1.8.0 (CLI + Desktop; feed date 2026-11-11 — third release in ~36h after v1.7.0/v1.7.1)**: **Identity settings page** — API keys and service accounts share one Identity page in Settings, old links redirect (credential objects unified, deep links survive); **model-defaults popover now offers the same autonomy levels as the composer** (settings surfaces must expose the same capability vocabulary as the acting surface — parity law); **Exec refuses to take over a session another machine holds and points you to resume** (single-owner leases: takeover is refused, never silent-stealed, and the error names the recovery path); animated image generation caps at 16 frames up front instead of accepting more and failing later (impossible params rejected at entry); a new API key appears the moment it is created, without waiting for the list refresh (first-frame family applied to settings); connector settings name the rate limit you hit instead of a raw error (error specificity, extends v1.7.0's token-scope naming); the Git actions button no longer draws a gray box behind its icon; the Script tool runs on Windows without a separately installed Visual C++ runtime (environment config moves into the tool — the Copilot/MSBuild family, third datapoint). | v1.8.0 2026-11-11 | proprietary | 5 | **WATCH** | The exec-session refusal is a runner-lease law for us: our lease/requeue family (NEVR-309 brief, MUL-9960 precedent) gains the line *a lease another holder owns is never silently taken; refusal names the resume path*. Settings/composer capability parity is an apps/web acceptance line. |
| **Multica** | **No new tag (v0.8.2 11-10 stands); 60 merged PRs in window (search-page cap — at least 60), head #10424 18:51:01Z, pushed 19:02:11Z on-branch**; 55,748★ (+177). **The environments lane went public in one day**: #10330 — **stop, restart, start and read logs of declared environments from the issue sidebar (+5,777/−306, 62f, merged 11-10 19:25Z — 23 min into the window)**; #10338 — declare web and desktop environments, list their servers once (+814/−32, 17f, 11-10 19:12Z); #10374 — **public Environments page + agent guide for `.multica/environments.toml` (+1,730/−6)**; #10350 docs for environment controls and shared logs; #10366 project resources split into repositories and per-computer folders. **Quick chat / bottom bar**: #10335 bottom bar with quick chat inside it (+2,259/−67, 62f), #10390 Shift+Cmd+J starts an Ask-Multica chat, #10388 close from header, #10392 floating ChatWindow on useChatController, #10393 chat titles derived only on the server, #10379 titles from the message not page-link markup, #10386 the page-context chip drops at commit, not after the send settles (+56/−3), #10424 configurable chat reply notifications (+786/−114, 41f), #10394 quick-chat docs. **#10364 — readers choose and order the issue sidebar's sections (+840/−54, 16f)** (per-reader configurable issue view — today's pre-registration). **Agent-channel surface**: #10397 messaging connections moved to agent pages (+3,324/−7,958 — net −4,634, a large removal), #10396 **the Feishu ids of the message an agent answers are told to the agent (+276/−0)** (reply-channel attribution), #10419 connect as soon as a platform is clicked, #10417 unavailable-channel hint removed. **Usage**: #10375 — activity bounds preserved across out-of-order client-usage reports (+59/−2). **Transcript**: #10413 — command tool input shown line by line (+184/−21). #10362 — CLI rewrites body links to same-call attachments (+655/−15). #10372 — comment images as thumbnails with a full-size setting. #10404 — AGENTS.md opens with a codebase-ownership line (+2/−0). #10409 — contradictory reply and precedence rules in the agent runtime brief resolved. **Theme hardening**: contrast checked at every select/toggle value (#10365), tooltips + pressed chips (#10367), rail items in frame-less modes (#10380), store themes registered as `themes/<id>.json` (#10377), store previews use the app's component aliases (#10371), `theme:check --json` writes >64 KB reports in full (#10384), themes switchable from account menu (#10369) and command bar (#10378), Pop gets a paper frame (#10361) with distinct switch states (#10406). Desktop: app-drawn right-click menu everywhere (#10382), quick actions from the issue right-click menu (#10408). #10416 — same-day revert of #10401 (access-token update without webhook rotation). HTTP hygiene: #10432 canceled read requests handled consistently, #10376 canceled uploads classified 499. | trunk 2026-11-11 | proprietary (source-available repo), 55,748★ | 5 | **WATCH (steal surfaces)** | Three steals at Stellarc scale: environments as observable objects (controls + logs at the issue, a public page, an agent-readable declaration file — our `.multica/environments.toml` analog for the BYO-agent environment contract); #10364 configurable issue sidebar (pre-registered for the apps/web issue view); #10375 + #10396 join the usage-attribution and reply-attribution law families. The theme-contrast checker (measured at every interactive state) is the a11y bar for any theming we ship. |
| **Devin (Cognition)** | **Notes gained a November 9 entry that yesterday's 19:10Z read did not see** (added/edited late — the "quiet streak" was a reading artifact, not a shipping fact; no November 10–11 entry yet). The Nov-9 entry: **redacted-secret pills link to the matching Secrets entry** (redaction is traceable, not just masked); **forwarded messages show the original sender** with a "Forwarded by/via" label (provenance survives relaying); stacked PRs show **"In Merge Queue"** in Devin Review; one Source filter (Connections/Scans) for findings; findings tab with real columns + breadcrumb back; findings unlinkable from remediation sessions via API + MCP, batch remediation paced to protect repositories; **My Analytics for every member incl. Teams** (self-serve usage visibility); GitHub user tokens refresh automatically (relink once); **Enterprise Active Build Queue** — admins see environment builds running or waiting (environment observability); **Daily Session Consumption API** `GET /v3/enterprise/consumption/daily/sessions`; incident reports in a dedicated view with UTC/local switch; plugin logos from the manifest; **a Deny button on Slack permission cards** (approval surfaces carry both decisions); Slack PR cards turn green on reopen; Slack formatting failures retried as plain text (graceful degradation); Teams suggests recent work after linking (onboarding-from-recorded-activity family). | notes 2026-11-09 (added late) | proprietary | 5 | **WATCH** | The denial-affordance line joins our approval-lifecycle cluster: a permission surface that can only approve is half a surface (Paseo #8477 denial-reason preservation is the sibling). The daily-consumption API is the enterprise read-side of usage attribution. |
| **GitHub Copilot** | Two new changelog entries in window: **Gemini 4 Carbon in GitHub Copilot (11-10)** — the model-catalog convergence now runs daily (Fable 5.2 landed in Copilot 11-09 and in Paseo 0.15.4 the same day; Gemini 4 Carbon 11-10) — capability-gated catalog entries remain the right shape for any model list we surface; **GitHub App support for Enterprise Copilot seat management (11-10, admin)**. Nov-11's "Issue types and fields available for personal accounts" is Projects & Issues, not Copilot. Carried: MSBuild auto-configuration (env-config-in-tool), impact dashboard across nine experiences, usage-metrics API additions (code review details, telemetry/version-gap flags, BYOK breakdowns). | changelog 2026-11-10 | proprietary | 5 | **WATCH (pattern)** | Catalog convergence at 24h granularity confirms the capability-gated entry row; the usage-metrics API additions keep feeding the BYOK usage-attribution schema (per-surface, per-model attribution is table stakes). |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; **sixth consecutive quiet day** (the streak it set 11-06 extends again). | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; mobile diffs, guided reviews, and the carried agent fixes stand. |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents**; **fifth consecutive quiet day**. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **Huly** | **Fifth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z (the README edits), zero commits in window; 28,093★ (+9). | platform trunk 2026-11-09 | EPL-2.0, 28,093★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |

## Proposals

One new ADOPT brief clears the bar; one pre-registration; five addenda.

### Proposal 1 (ADOPT) — object-level authorization sweep for the Stellarc API surface

**Precedent (all shipped in v1.5.0-rc1 + today's preview burst, verified from the release notes and
commit log):** Plane's `mguptahub` sweep — 30+ object-level authz fixes across nested endpoints
(sub-issues #9466, comments+relations SECUR-243, drafts #9443, exports INFRA-778, global views INFRA-499,
archives INFRA-777, deploy boards WEB-8400), body-supplied `created_by/created_at` refused (INFRA-772),
guest visibility on attachments+activity (#9467), member mass-assignment blocked (#9460), cursors
bounded (#9486), auth endpoints rate-limited (#9335), HMAC secrets never on reads (#9382),
authority-relative redirects rejected (#9709) — then today: page access on **every** live-collab socket
(#10207), search scoped to active members (#10213), active-member requirement for lead/assignee (#10214),
legacy upload routes rejected (#10216). A mature tracker with a security-focused engineer accumulated
all of these in one minor cycle.

**Gap (Stellarc):** NEVR-198 landed the scoped permission pipeline (dev 10-15), but no acceptance line
pins *object scope per route* — nothing today would catch a nested handler trusting a body-supplied
parent, a list endpoint returning another project's rows, or a guest reading an attachment. Our surface
is young; Plane proves the holes accumulate silently with age unless a gate holds the line.

**Brief (ready to file):**

- **Problem.** Stellarc's permission model exists (NEVR-198) but per-route object scoping has no
  acceptance lines and no gate. Plane v1.5.0-rc1 (tagged 11-10 12:21Z, AGPL-3.0 — we steal the
  *behavioral checklist from the public changelog only, never the code) demonstrated the full failure
  class in one release: nested endpoints not scoped to their URL parent, body-supplied identity fields
  accepted, guest reads enforced on parents but not on attachments/activity, list endpoints leaking
  other scopes' rows, unbounded cursors, unthrottled auth, secrets readable, open redirects.
- **Work.**
  1. Inventory every route in the Effect HttpApi surface and record its **scope root** (org / project /
     issue / user-self) in a table under docs/design (or per-route declarative metadata, whichever fits
     the HttpApi idiom).
  2. Pin the acceptance lines: (a) a nested route derives its parent from the URL path, never the body;
     (b) actor/identity fields (`created_by`, `updated_by`, timestamps) are server-derived; (c) list
     endpoints are scoped to the caller's own resources; (d) restricted roles' read limits apply to
     attachments, activity, and comments — not just the parent object; (e) pagination cursors are
     validated and bounded; (f) better-auth credential endpoints are rate-limited; (g) no endpoint
     returns secret material (connection tokens, webhook secrets) on reads; (h) redirect/callback
     targets reject authority-relative paths.
  3. A CI audit that fails when a route lacks a declared scope root — the knip-gate pattern applied to
     authorization: young surface, zero-finding baseline, gate holds as routes grow.
  4. Cross-scope denial regression tests per nested resource class (issue, comment, attachment, view,
     export).
- **Acceptance.** Route/scope table complete for every existing route; audit green in CI; denial tests
  pass for every nested resource class; credential endpoints rate-limited; a grep for secret fields in
  response schemas comes back clean.
- **Scope guard.** Tests, docs, and any minimal middleware the audit needs. No feature work, no new
  dependencies, no UI, no schema changes beyond what a denial test requires.

### Proposal 2 (pre-register) — configurable issue sidebar

Multica #10364 (+840/−54, 16f, merged 11-11 04:59Z): **readers choose and order the issue sidebar's
sections**. No issue-sidebar surface in apps/web yet — pre-register the acceptance lines for when it is
filed: per-reader section choice + order, persisted cross-device, defaults untouched for new readers,
and the choice applies wherever the sidebar renders (desktop board lane, split view). This is the
"attention is personal" law — the same shape as Multica MUL-8713's per-workspace collapse persistence.
No brief until the surface exists.

### Addendum — usage attribution must survive the transport (four vendors, one day)

For the usage-telemetry contract (backend landed; UI contract carried) and the NEVR-309 ACP bump:
**(a)** Paseo #9396 — ACP provider plugins were *dropping* the token usage an agent reports in its
prompt response; the fix forwards it. Acceptance line for our ACP seam: usage items survive the
provider boundary — assert per prompt response, not just per session. **(b)** Multica #10375 — usage
activity bounds preserved across out-of-order reports (monotonic max under reordering). **(c)** Devin's
`GET /v3/enterprise/consumption/daily/sessions` — per-day consumption as a first-class API. **(d)**
Copilot's usage-metrics API additions (code review details, telemetry/version-gap flags, BYOK) —
per-surface attribution is table stakes. Law shape: *usage is accounted at the point of truth and
survives every transport between the agent and the ledger.*

### Addendum — environments are observable objects (convergence, same day)

Multica's environments burst (#10330 controls+logs at the issue sidebar, +5,777/−306; #10338 declared
web/desktop environments; #10374 public Environments page + agent guide for the declaration file;
#10350 shared-logs docs) and Devin's Enterprise Active Build Queue (admins see environment builds
running/waiting) land the same shape independently: a declared environment is a first-class object with
start/stop/status/logs surfaces and an admin-visible queue. Feeds the BYO-agent environment contract
when written (already carrying Paseo #8939 agent self-identification and the Copilot/Cursor
env-config-in-tool lines).

### Addendum — carried lines reinforced today

- **F6 first-frame finality, day 2** (Paseo #9302: a long user message paints collapsed from its first
  frame — one-frame wrong render class, same law as #9248/#9212; the brief filed 11-10 already pins it;
  this is the first post-filing confirmation).
- **Runner-lease refusal** (Factory v1.8.0: Exec refuses takeover of a session another machine holds,
  names the resume path) — joins MUL-9960 and the attempt-cap addendum in the runner-startup-honesty
  brief: *a lease is never silently stolen; refusal names recovery.*
- **Settings/action-surface capability parity** (Factory v1.8.0: model defaults offer the same autonomy
  levels as the composer) — an apps/web acceptance line: every settings mirror of an acting surface
  exposes the same vocabulary.
- **Transcript purity** (OpenHands #19619: Stop-hook feedback kept out of the chat; Devin: redacted
  pills link to their secret; forwarded messages keep their sender) — system lifecycle events are not
  transcript content, and provenance (sender, redaction target) travels with the artifact.
- **Denial is a first-class decision** (Devin's Deny button on Slack permission cards) — extends the
  approval-lifecycle cluster (Paseo #8477): surfaces that offer Approve must offer Deny with the reason
  preserved.
- **Pagination at the seam** (OpenHands #19649: messages at tied history-page boundaries) — fourth
  load-older-extreme datapoint; folds into the live-status contract's next pin.
- **Model-catalog convergence at 24h granularity** (Gemini 4 Carbon in Copilot 11-10, a day after
  Fable 5.2 hit Copilot and Paseo within hours of each other) — capability-gated catalog entries stand.
- **Plane correction** (v1.5.0-rc1 tagged 11-10 12:21Z, missed by the 11-10 report): reading only
  default-branch commit signals misses release-branch tags — the metadata law gains *read the releases
  list, not just the trunk*; applied today.
