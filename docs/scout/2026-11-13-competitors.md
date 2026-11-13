# Scout — Competitors, 2026-11-13

Beat: **competitors**. Delta window: 2026-11-12 19:02 UTC → 2026-11-13 19:02 UTC (~24h). Every claim
verified against the GitHub API (`gh api` — repo metadata, release tags with full release-note bodies,
merged PRs with additions/deletions and merge timestamps) or a browser-rendered changelog (Linear,
Cursor, Devin — now on the Devin docs "Recent Updates" page, `notes.devin.ai` no longer resolves;
Copilot via github.blog; Factory **unverifiable this run** — see the Factory row). Context: Stellarc =
self-hostable, inert control plane (v2 charter) + BYO-agent runtime over ACP;
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters. Dev HEAD this run:
`d3cfef8`.

## The one-line read

Multica shipped **v0.9.0** (11-13 09:41Z) and the release **validates our two freshest briefs in one
tag** — and one of them is no longer a brief: **our 11-12 context-receipt ADOPT landed on effect/v4
the very same day as NEVR-624 #264** (`4f08d01` — `context-receipt` event + `agent_task_context_receipt`
table + `tests/bun/context-receipt.test.ts`, git-verified this run), **in lockstep with Multica shipping
the same surface in v0.9.0** (MUL-9013 — their line went merged-PR 11-12 → release 11-13; ours went
brief 11-12 → landed 11-13; the metadata-only shape held on both sides). The release also ships
**Jump to latest on desktop issues and in chat** (MUL-8951 #10291 — the reading-position family's
**fourth vendor in three days**, after gpui-kit #3922, NSH 0.5.0 and Linear's Nov-12 Latest button;
our §A contract already covers it), the **private-project authz trio**
(#10327 indirect references, #10329 background runs, #10317 runs resolved to their project before
show/stop — yesterday's async-lane addendum, now in a release), a **community theme store backed by a
GitHub registry**, and the **environments lane's supervision surface** (stop/restart/start + read logs
from the issue sidebar). And it contains one instructive *revert*: **#10459 "show captured file
changes for each agent run" merged 05:10Z and was pulled by #10548 at 08:17Z — before the tag** —
ship nothing rather than a broken diff-per-run surface (a lane to watch them finish, not steal yet).
**Paseo merged a five-fix law pack on seams we have already contracted** (no release; beta.2 stands):
**#9432** — an oversized history page retries with smaller pages instead of dead-ending "history too
large" (6th load-older-extreme datapoint); **#9497** — agent updates no longer re-render the
workspace screen, favicon and command center (§F(b) re-render scope at app scale — the favicon built
a full projection + deep-compare + sort to answer three yes/no questions); **#9506** — `null`
optional tool arguments treated as omitted (transcript item-shape tolerance, extends #9467); **#9512**
— cross-host children start in their caller's mode (delegation inheritance across the routing
boundary; the failure mode was *an unsupervised child asking approval with nobody watching*);
**#9537** — a second interrupting send during the cancel→reserve gap no longer fails "already has an
active run" and loses the message. **Copilot broke its quiet streak**: **GHES support in the Copilot
app went GA** (Nov 13) — the agent app now reaches self-hosted forges for repos/issues/PRs, **with
the boundary named in the release notes** ("cloud sessions aren't available for GHES"). **Factory's
changelog went dark**: `factory.com/changelog/feed.json` now serves an HTML shell behind Vercel
deployment protection, the in-repo docs changelog lags at 2025-era, and no droid package exists on
npm — the last verified release remains v1.9.0 (covered 11-12); recorded as a source-wall, not a
quiet day. Linear, Devin, Cursor and Huly are quiet; Plane shipped one a11y fix post-rc2; OpenHands
is deps-only after yesterday's #19436.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.9.0 TAGGED 11-13 09:41:04Z** (v0.8.2 was 11-10); 33 merged PRs in window, head pushed 18:55Z; 56,044★ (+163). Our briefs validated in-release: **per-run context receipts SHIPPED** (MUL-9013 — yesterday's Proposal 1 precedent: metadata-only, sizes + 12-char SHA-256 prefixes + skill/MCP names, shown in the transcript dialog — **and our own brief landed the same day as NEVR-624 #264 on effect/v4 `4f08d01`**, git-verified) and **Jump to latest on desktop issues and in chat** (MUL-8951 #10291 — reading-position family, 4th vendor in 3 days). **Private-project authz trio shipped**: #10327 indirect issue references, #10329 background runs + workspace-wide reads, #10317 runs resolved to their private project before showing *or stopping* them; + #10320 autopilots kept inside private projects. **Environments lane reaches supervision**: stop/restart/start + read logs from the issue sidebar (MUL-8923 #10330), switch to desktop app windows from the sidebar (#10328), declare web and desktop environments (#10338). **Community themes**: make/import your own theme (MUL-8944 #10287) + **theme store backed by a GitHub registry** (MUL-8945 #10304; #10552 makes the store always-on). Honesty lines: **#10517 Claude thinking text preserved in run transcripts**; **#10519 Copilot token usage reported from `--usage-output-file`**; #10531 Pi live steering restored; #10375 client-usage activity bounds preserved across out-of-order reports; #10387 bulk-edit names an invalid env *key*, never its value; #10458 **completed-task TTL defaults to 14d on every server**; #10528 daemon reclaims Codex caches and expires local task homes. Surfaces: bottom bar + quick chat (#10335, Shift+Cmd+J #10390); readers choose and order issue sidebar sections (#10364); linked PRs across view layouts (#10351); comment images as thumbnails (#10372); one app-drawn right-click menu everywhere (#10382) + issue-page right-click actions (#10467/#10408); show requester beneath agent creator (MUL-7031 #10532); Telegram shows what the agent is doing while it works (#10314). **Instructive revert: #10459 "captured file changes for each agent run" merged 05:10Z, reverted 08:17Z — before the tag** (no broken release surface). Post-tag: #10554 create-issue dialog reopens at its last size; #10565 dialogs survive Grammarly correction clicks. | v0.9.0 2026-11-13 | NOASSERTION, 56,044★ | 5 | **WATCH (steal surfaces)** | Two confidence datapoints for filed/landed work in one tag: the context-receipt brief **landed as NEVR-624 the same day** (dev-merge pending), and Jump-to-latest confirms §A from a second tracker. New steal-list entries: **retention defaults** (14d completed-task TTL + cache/task-home expiry — the shape our event-log retention lane should take when chartered), **GitHub-registry theme store** (themes as data files in a repo, imported by URL), and the **environments supervision bar** (stop/restart/logs from the issue sidebar). Do **not** steal per-run file-change capture yet — they pulled theirs before the tag. |
| **Paseo** | **No new release (v0.16.0-beta.2 11-11 stands); 22 merged PRs in window; pushed 15:27Z; 23,993★ (+86).** The law quintet, all PR-body-verified: **#9432 (+29/−9, 11-12 21:02Z)** — paginated Codex history reads 100 items/page; one page of screenshots can exceed the app-server line cap and the reader dead-ended with "the rest of this thread's history is too large to load"; now **retries with smaller pages** (a transport cap is not a dead end). **#9497 (+449/−127, 11-12 19:04Z)** — with many agents on a host, every agent update re-rendered the open workspace screen, favicon and command center via three always-mounted subscribers over the whole agent map; the favicon "built the full aggregated agent list (a projection, a deep compare, and a sort over every agent) on every update, to answer three yes/no questions." **#9506 (+31/−2, 11-13 07:00Z)** — models send `null` for optional tool args (`offset: null, limit: null`); zod schemas accepted only missing keys, so the call fell back to an `unknown` card with raw JSON instead of a Read/Shell card; now null keys are dropped before parsing (required-null still fails). **#9512 (+107/−11, 11-13 03:57Z)** — same-host children inherit the caller's mode, but cross-host children got the provider default: "a caller running in a no-prompt mode then got a remote child that asked for approval on every tool call, with nobody watching it." **#9537 (+193/−41, 11-13 03:09Z)** — a second interrupting send during the daemon's cancel→reserve gap failed `Agent already has an active run` and the message never started a turn; a phantom autonomous run was tracked. Plus: **#9594 usage stays visible after a failed refresh** (last-good data on partial failure); #9584 worktree diff files identified **by content, not stat metadata**; **#9573 BREAKING — the always-empty `timeline` dropped from `agent.turn.after`** (protocol surfaces don't ship always-empty fields); #9534 an edited agent draft starts after its first start failed; #9533 keystrokes typed during terminal restore are kept; #9562 unchanged Changes snapshots not re-sent to apps < 0.16 (version-gated wire); #8854 Copilot premium-request usage in the Usage card; #7645 plugins add items to sidebar workspace rows (plugin-UI surface grows); **#9553 public iOS TestFlight beta documented**; #7692 Cmd+Shift+[ / ] tabs on macOS. | trunk 2026-11-13 | repo NOASSERTION (npm @getpaseo/* Apache-2.0), 23,993★ | 4 | **TRIAL (stands)** | Five independent fixes on seams we have already contracted — each maps to an existing line, none opens a new one: #9432 → §A load-older extremes (pre-registered below); #9497 → §F(b) snapshot structural identity, with the sharpest formulation yet (**scope the subscriber to the question it asks**); #9506 → the item-shape fixture matrix from #9467 (add null-vs-omitted); #9512 → the delegation-law pre-registration (inheritance must survive routing; unsupervised approval prompts are the failure mode); #9537 → no surface today (we have no send-into-running seam — tasks are create-only; lands when a follow-up/steer lane opens). |
| **GitHub Copilot** | **Streak broken — November 13 entry** (first since Nov 10): **"GitHub Enterprise Server support in the GitHub Copilot app" — GA** (was opt-in preview). Add a GHES account to the Copilot app to "work with remote repositories, issues, and pull requests"; sign in with a github.com or GHE.com account first, then Settings → Accounts → Add account → GitHub Enterprise Server; **"Cloud sessions aren't available for GHES"** — the capability boundary is named in the release note itself. Requires Copilot app 1.2.0+. Carried: Nov 10 (Gemini 4 Carbon; GitHub App seat management; C++ MSBuild auto-config), usage-metrics API additions incl. BYOK breakdowns. | changelog 2026-11-13 | proprietary | 5 | **WATCH (pattern)** | The agent app ↔ self-hosted forge combination is now GA at GitHub — same week Linear's agent runs on BYOK gateways. For a self-hostable Stellarc: when our VCS lane opens, **self-hosted instances (GHES-class) are first-class, and their boundary lines (what the app can't do against them) are documented per capability, not discovered by users**. The release-note honesty ("cloud sessions aren't available for GHES") is the Devin pattern at GitHub's scale. |
| **Linear** | Changelog unchanged — newest entry still **November 12** (BYOK + the five agent-transcript honesty fixes); **quiet day 1 after the streak-break**. | changelog 2026-11-12 | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK + split-attribution row stands as written. |
| **Plane** | **v1.5.0-rc2 stands (11-12 15:17Z); one merged PR on preview trunk in window**: #10274 (+5/−2, 13:05Z) — keep the mobile sidebar toggle reachable on project pages (a11y-at-the-edges). 62,415★ (+48); pushed 13:05Z. | v1.5.0-rc2 2026-11-12 | AGPL-3.0, 62,415★ | 4 | **TRIAL (stands)** | Quiet post-rc2; the authz-sweep brief (filed 11-11, extended 11-12) is complete pending rc2→stable. |
| **OpenHands** | **Quiet after the #19436 burst** — 9 merged PRs in window, all dependency bumps (eslint, tanstack, i18next, electron, framer-motion, lucide, posthog) + a verify-openhands docs map (19715); no release (v1.40.0 11-12 stands); pushed 17:24Z; 93,414★ (+78). | v1.40.0 2026-11-12 | MIT, 93,414★ | 5 | **WATCH (pattern → ACP capability line)** | Nothing new; #19436 (capability vocabularies from the agent's own report) remains the NEVR-309 acceptance line of the week. |
| **Devin (Cognition)** | Notes unchanged — newest entry still **November 12** (same-kind request cards, per-tool MCP permissions, visible enterprise restrictions); quiet day. Source note: `notes.devin.ai` no longer resolves (DNS NXDOMAIN) — the changelog now lives on the Devin docs "Recent Updates" page (devin.ai/changelog), same content. | notes 2026-11-12 | proprietary | 5 | **WATCH** | Nothing new; approval-batching and per-tool three-state permissions stand as the lines to extend PermissionPolicy with. |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents**; **seventh consecutive quiet day**. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **Huly** | **Seventh consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z, zero commits in window (commits API: 0); 28,116★ (+9). | platform trunk 2026-11-09 | EPL-2.0, 28,116★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **SOURCE WALLED — no verifiable signal this run.** `factory.com/changelog/feed.json` (the machine-readable route used since 10-08) now serves a 338KB client-rendered HTML shell; in a browser the deployment answers **"Login – Vercel"** (deployment protection). The in-repo fallback `Factory-AI/factory` (docs/changelog/release-notes.mdx) is a 2025-era archive — newest dated entry "November 28" is 2025, and `1-10.mdx` is last year's 1.10; repo last pushed 11-11T23:50Z. npm: no droid CLI package (an unrelated `droid` 1.10.0 deploy tool; `@factory-ai/droid` has no dist-tags). **Last verified release: v1.9.0** (feed item read 11-12; fault-isolation masterclass — all lines carried). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; source walled)** | The metadata law compounds: *read the feed, not the date* now requires *a reachable feed*. No assumption of a new release — v1.9.0's lines stand as the record. Re-probe next run: the feed route, the repo docs dir (a `1-11.mdx` would signal a release), and any `@factory-ai` npm publishes. |

## Proposals

**No new ADOPT brief clears the bar today — and that is the finding.** Every law that shipped in this
window lands on a contract Stellarc has already filed, landed, or pre-registered (mapping below).
Forcing a new brief would duplicate an existing one. Three concrete outputs instead: a confirmation
pack (fold these into the named briefs at pickup), one new pre-registration, and three steal-list
additions.

### Proposal 1 — confirmation pack: four vendor fixes, four existing contracts (fold at pickup)

| Vendor fix (verified) | Stellarc contract to fold into |
|---|---|
| Paseo **#9497** — agent updates re-rendered workspace/favicon/command center; the favicon answered three yes/no questions with a full projection + deep-compare + sort over every agent | **§F(b) snapshot structural identity** (NEVR-530 family). Add the sharpest formulation of the law yet: **scope the subscriber to the question it asks.** Our Electric tail answers changes-only by construction; the risk lives in apps/web selectors that project the whole task/agent map for icon-level booleans (unread dot, running-anywhere). |
| Paseo **#9506** — `null` optional tool arguments broke zod parsing → `unknown` raw-JSON card | **The item-shape fixture matrix** (from #9467, 11-12). Add null-vs-omitted to the matrix: one fixture per ItemKind where every optional body field is `null`, asserting the renderer degrades to the typed card, never raw JSON or a crash. Our write seam is already defensive (runner.ts maps with `?? null` fallbacks and a compact-JSON fallback for unknown kinds) — the test pins it. |
| Paseo **#9512** — cross-host children started in the provider-default mode; a no-prompt caller got a remote child asking approval "with nobody watching it" | **Delegation-law pre-registration** (INDEX row, 11-05). Add the routing clause: *inherited decisions must survive the routing/host boundary; the failure mode of losing them is an unsupervised approval prompt*. |
| Multica **v0.9.0** — context receipts **shipped in a release**; Jump-to-latest (#10291) shipped; the private-project authz **trio** shipped (#10327/#10329/#10317) | **The 11-12 context-receipt brief — now LANDED as NEVR-624 #264 on effect/v4 `4f08d01`** (verified this run: event + table + tests; the precedent going release-grade the same day is confirmation, not new work); **§A reading-position** (4th vendor); **the 11-11 Plane authz brief + 11-12 async-lane addendum** (now three shipped Multica lines, not one). |

### Proposal 2 (pre-registration) — transcript pagination overflow: retry smaller, never dead-end

Paseo **#9432**: a paginated history reader whose 100-item page exceeded a transport line cap ended
with "the rest of this thread's history is too large to load" — everything after that point
invisible. Fix: retry the oversized page with a smaller page size. Sixth independent load-older
datapoint (OpenHands ×2, Factory pair, Paseo #8358, now this).

**Pre-register for §A's implementation half** (Stellarc has no paginated transcript reader yet —
`getTask` returns all items and replay renders from the log; grep-verified on dev `d3cfef8`): when
the load-older lane is built, **a page that exceeds any transport/query cap retries with a smaller
page size, both extremes load fully, and the UI never renders a dead end for content that exists.**
Anchor: content identity (item id), never index — the §A anchor law unchanged.

### Proposal 3 — steal-list additions (WATCH, no surface today)

1. **Retention defaults** — Multica #10458 (completed-task TTL **14d on every server**) + #10528
   (daemon reclaims Codex caches, expires local task homes). When Stellarc's event-log retention lane
   is chartered: a safe default everywhere + explicit per-org override, and runtime-side cache/home
   hygiene as daemon duties, not manual ops.
2. **Environments supervision bar** — Multica v0.9.0's environments trio (stop/restart/start + read
   logs from the issue sidebar; app-window switching; web+desktop environment declarations). The
   surface bar for Stellarc's equivalent lane if/when chartered (our docker-compose.otel.yml is the
   seed, not the surface).
3. **Per-run file-change capture: do not build yet** — Multica merged #10459 (captured file changes
   per agent run) at 05:10Z and **reverted it before the tag** at 08:17Z. A diff-per-run surface is
   being attempted, not shipped; watch them land it cleanly before we spec one.

## Row updates

All ten competitor rows updated in `docs/scout/INDEX.md`; the reading-position row gains the Multica
#10291 confirmation (fourth vendor); the live-status/replay row accumulates the Paseo #9497/#9506
pair for its next pin; and the per-run context-receipt row closes its verification note — **NEVR-624
verified landed at effect/v4 `4f08d01`** (event + table + tests), with the precedent going
release-grade in Multica v0.9.0 the same day.
