# Scout — Competitors, 2026-11-21

Beat: **competitors**. Delta window: 2026-11-19 19:00 UTC → 2026-11-21 04:30 UTC (~33h; the 11-20 slot
ran design, so this window covers two days). Every claim verified against the GitHub API
(`gh api` — repo metadata, release tags + full bodies, `--merged-at` window searches per repo) or a
fetched changelog page/feed (Linear, Cursor, Devin — full page re-fetched and parsed; Copilot —
github.blog RSS with exact pubDates). Factory probed per the dead-route rule (npm registry +
default-branch commits + changelog dir). Context: Stellarc = self-hostable, inert control plane
(v2 charter) + BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters. Dev HEAD this run: `3ad10bf` (scout design 11-20, #332); effect/v4 head
`9505c63d` (frozen day 6; ADR 0015 step 2 = #286 still open; the D2/E5–E7 docs briefs queue behind
the unfreeze).

## The one-line read

**Devin broke its quiet streak with the field's biggest access-control week, and OpenHands shipped
the virtualization datapoint.** Devin published FOUR new changelog entries since the last check
(Nov 17, 18, 19, 20 — last verified newest was Nov 16): **Nov 19 "Introducing Devin Bots"** —
always-on agents with their own identity, memory and permissions that decompose a goal into
parallel Devin sessions on separate cloud machines and drive each to a mergeable PR (messageable
in web/Slack/text/**call** — the voice lane's fifth vendor touch); **Nov 20 "Introducing Access and
Sharing"** — user groups on every shareable object (secrets, environments, sessions, automations,
plugins, playbooks, skills, MCP servers, knowledge), per-session sharing that starts "just you"
with warnings before widening, service users/bots limited to explicitly granted resources, and an
**SCM access-mismatch checker** reporting where Devin's grants differ from GitHub/GitLab;
**Nov 18** — the private-sessions pack (composer "Shared with" picker, Start-as-Only-you, private
sessions never post to Slack, confirmations name who gains access, attachments follow session
visibility, and a Slack reply from someone without session access renders under their name **with
a note that Devin was not shown it**); **Nov 17** — Cmd+K searches Apps, Review security tab,
impact summaries on findings. → Proposal 1: pin the **sharing-visibility defaults law** into
`docs/design/scope-roots.md` — the NEVR-603 lane, which this run verified **LANDED**
(`7afd59a` #250, 11-12: taxonomy + `scope:audit` blocking CI) but carries no visibility axis;
grep-verified zero sharing/visibility surface in apps/web + contracts to conflict with.
**OpenHands v1.43.0** (11-20 18:51Z) ships **#17820 perf(chat): virtualize the conversation
message list** — the datapoint this radar has tracked since 11-19, now release-grade at the fifth
vendor (after Paseo, Multica, Linear, gpui-kit); plus #19503 a Features page for experimental
user feature flags, #19789 decision cards and #19794 agent message edits (both experimental),
#19903 conversation indicator on automation run rows. **Paseo #10289 "Forecast when provider
quotas will run out"** (PR-body-verified: "~19% left at reset" / "runs out in 2h 31m" from the
average pace of the last successful reading, the projected instant FROZEN between refreshes, and
the forecast HIDDEN for retained readings after a failed refresh — stale data never projects)
pairs with Multica #10752 (11-16, plan limits burn-rate-vs-elapsed) → Proposal 2: the
**context-exhaustion projection** acceptance line — our store already persists
`contextTokens` + `contextWindowSize` per usage update (`store.ts:418`, mapped at
`runner.ts:155`) and apps/web consumes neither (grep-verified). **Multica** (43 merged PRs, no
release — v0.12 prepped as "a safe rollback point"): **Cloud guests GA** (#10998 releases guests
with the commercial launch and drops `FF_WORKSPACE_GUESTS`; #11055 closes guest access gaps;
#11051 hides guest rows from clients that can't render them), **#11066/#11043 the assignee
picker ranked from local manual picks + a server-side-frequency Recent group** (attention is
personal, now with server-derived ranking), **#11034 CLI updates QUEUE while the machine is busy**
(queued update self-installs when idle, cancellable, 24h expiry, running agent work never
interrupted, queue stored server-side = non-disruptive maintenance), #10963 squad handoff
`fire_at` stamped with the **database clock**, #10999 a saved reply recovered after a missed chat
completion, #10961 editor Markdown tokenizers stop piling up on the global `marked`, #10823 a
wakeup reports a missing PR link BEFORE the snapshot gate, #9775 per-minute token quota
rejections classified as rate limits. Paseo also went **multi-forge** (#10279 GitLab MR watches,
#10280 Gitea/Forgejo/Codeberg) and bundled **goose** (#9719). **Plane unfroze** (1 merged PR,
i18n). **Copilot/Linear/Cursor quiet** (newest 11-18/11-12/11-06), **Huly frozen day 15**,
**Factory** moved again but CI-only (PR #112 droid/risk-install; npm still 404; changelog dir
still ends 1-10.mdx).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Devin (Cognition)** | **FOUR new changelog entries since last check (newest was Nov 16).** **Nov 19 — DEVIN BOTS:** always-on Devins with their own identity, memory and permissions; given a goal they break the work down, run Devin sessions in parallel (each on its own cloud machine) and keep each going until the PR is ready to merge; messageable in the web app, Slack, text or **call**, or group chat; templates (QA engineer, code reviewer, on-call engineer). Same entry: **session header shows "Syncing" until the session has caught up with the server** (the catch-up state named in the chrome — our C-lane), typing outside a text box no longer enters the composer, plugin edits render as a plugin card, Review billing rules (charge a repo's Reviews to an org/budget), **MCP approval cards say exactly what "Always allow" covers** (the tool + all-your-sessions vs everyone-in-org), org-wide MCP sign-ins warn and suggest a service account, the marketplace hides MCPs replaced by native integrations. **Nov 20 — Access and Sharing (enterprise, gradual, off by default):** user groups pickable wherever Manage access appears (secrets, environments, sessions, automations, plugins, playbooks, skills, MCP servers, knowledge); **per-session sharing: just you / user groups / org / account-wide, sessions using a narrowly-shared resource START as just-you with a warning before widening**; Slack sessions only take instructions from people they are shared with (a stranger's reply renders with a one-click share); automations inherit their sharing into the sessions they start; **service users and shared bots use only explicitly given repos and resources**; Review/DeepWiki/Ask list and answer from **only the repos you can access (SCM-mirrored)**; **SCM access-mismatch checker** (admin report of repos where Devin access ≠ GitHub/GitLab) + optional repo sync; paste videos into chat; citations open at the exact cited lines; Triaged state for findings; skills in the v3 Sessions API. **Nov 18 — private sessions:** composer "Shared with" picker; Start-sessions-as-Only-you preference; private sessions detach Slack and say why; Make-visible confirms and names who gains access; approval cards in private sessions warn who else will see the result; **attachments follow session visibility**; too-long messages offer to attach as a file; repeated pushes of the same commit collapse into one worklog row (5 min); **a watched Slack thread reply from someone without session access shows under their name with "Devin wasn't shown it"**; Devin deletes its own Slack messages. **Nov 17:** Share-dialog people search; Cmd+K searches Apps; Review settings Security tab; Azure DevOps review status; impact summaries on PR findings; richer Slack posts (images, tables, charts, cards). | changelog 2026-11-17→11-20 (4 entries) | proprietary | 5 | **WATCH (law source → access/sharing)** | The access pack is the strongest corroboration yet of the authz lane this radar has filed (NEVR-603, now landed): per-object visibility that starts narrow, confirmed widening that names who gains access, derived surfaces inheriting source scope, non-human principals on explicit grants only, and an SCM-diffed mismatch report → **Proposal 1**. Bots = agent-as-principal (new row). "Syncing" header folds into the live-status contract. The wasn't-shown-it Slack line is the channel-access honesty law. |
| **OpenHands** | **v1.43.0 SHIPPED 11-20 18:51Z (release body verified).** **#17820 perf(chat): virtualize the conversation message list** — the long-tracked datapoint lands release-grade. #19769 automations created enabled from the setup wizard; **#19503 Features page for experimental user feature flags** (first: Conversation reactions — user-visible flags with a settings surface, not env vars); **#19789 experimental decision cards** + **#19794 the agent's message edits shown** (both experimental — edit visibility into the transcript); #19903 conversation indicator icon on automation run rows; #19860 setup form kept when switching conversations. Post-release trunk: #19921 conversation mentions behind `conversation_mentions`; agent-server bumped 1.62→1.63.1 in-window. 21 merged PRs in window (7 dependabot). | v1.43.0 2026-11-20 18:51Z | MIT, 93,931★ | 5 | **WATCH** | #17820 confirms the virtualization seam the reading-position row pre-registered against (Paseo #9664's virtualizer-initial-offset law) — now at a fifth vendor. The Features-flag page is the experimental-surface pattern our control plane lacks (nothing to file yet). |
| **Multica** | **No release in window — v0.11.1 stands; v0.12 is explicitly prepped (#11055 "make 0.12 a safe rollback point"). 43 merged PRs in window; head pushed 11-21 04:30Z; 56,964★ (+218).** **Cloud guests GA:** #10998 releases guests with the commercial launch and drops `FF_WORKSPACE_GUESTS`; #11055 closes guest access gaps; #11051 hides guest rows from clients that can't render them. **Attention is personal, now server-ranked:** #11066 assignee picker ranked from local manual picks; #11043 Recent group from server-side frequency; #11057 unassignable agents/squads hidden. **#11034 CLI updates queue while the machine is busy** — a queued update installs itself when idle, is cancellable until install starts, expires after 24h, **never interrupts running agent work**, and the queue lives on the server (survives reloads; one update per machine; only real failures go red). Billing/entitlement: #11035 agent invocation, runtime sharing and Apps accounts restricted by plan; #11042 autopilot run add-ons; #11044 per-workspace attachment storage limits; #11032 plan-limited dashboard history. Honesty batch: #10999 a saved reply recovered after a missed chat completion; #10996 a vanished linked folder is named; #10963 squad handoff `fire_at` stamped with the **database clock**; #10961 per-editor Markdown tokenizers stop piling up on the global `marked`; #10980 `usage_count` off the hot path; #10823 a wakeup reports a missing PR link BEFORE the snapshot gate; #9775 per-minute token-quota rejections classified as rate limits. #10981 comment on selected text in docs. | v0.11.1 2026-11-19 (v0.12 prepped) | proprietary | 5 | **WATCH (steal surfaces)** | #11034 is the non-disruptive-maintenance law: platform updates never interrupt running agent work — folds into our runner/ops pre-registrations. #10963 = clock-source honesty for scheduled actions (our wakeup lane). The assignee-picker trio feeds the board-lane steal list when filed. |
| **Paseo** | **No release in window — v0.17.0-beta.1 stands. 19 merged PRs; pushed 11-21 01:50Z; 24,553★ (+96).** **#10289 Forecast when provider quotas will run out** (PR-body-verified): Usage Details shows "~19% left at reset" or "runs out in 2h 31m" beside the reset time — estimated from the average pace as of the last successful reading, **the projected runout instant stays FIXED between refreshes**, and **the forecast is hidden for retained readings after a failed refresh** (stale data never projects); amber at ≤10% projected left, red on projected early runout. **Multi-forge watches:** #10279 GitLab merge-request watches (+multi-forge groundwork), #10280 Gitea/Forgejo/Codeberg change-request watches — the agents-watch-PRs lane goes forge-neutral. #10304 wait for the restored checkout before showing Changes (no stale git state on restore). #10269 OpenRouter credits/spend in Usage; #10232 Antigravity account usage. **#9719 goose plugin bundled with multi-provider model selection** — the BYO-agent matrix adds goose. #10356 archive the active workspace from a collapsed sidebar; #10225 Android keyboard stays closed when swiping a terminal; #10271/#10270 Paseo Hub branding. | v0.17.0-beta.1 2026-11-19 | proprietary | 5 | **WATCH (law source)** | #10289 is the second vendor in five days to project budget exhaustion from observed burn (Multica #10752, 11-16) → **Proposal 2** — our event log already holds `contextTokens`/`contextWindowSize` per usage update and apps/web consumes neither. The staleness rule (failed refresh ⇒ no projection) is the D2 list-read law applied to forecasts. |
| **Plane** | **Unfroze after two frozen days — 1 merged PR in window:** #10355 translate the settings category headings in 16 locales. v1.5.0 (11-16) stands. 62,877★ (+73). | v1.5.0 2026-11-16 stands | AGPL-3.0, 62,877★ | 4 | **WATCH (sweep concluded)** | Trivial window; the 11-11 brief's acceptance lines are complete and the lane landed on our side (NEVR-603). |
| **GitHub Copilot** | **Zero entries in window** — github.blog changelog feed re-read; newest Copilot items remain the two 11-18 entries (Gemini 4 Neon GA; eight more GitHub-verified MCP connectors), both pre-window and covered by the 11-19 report. | changelog 2026-11-18 (newest) | proprietary | 5 | **WATCH** | Nothing new; model-catalog churn and the curated connector catalog stand as carried. |
| **Linear** | **Quiet day 9** — changelog re-fetched; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. |
| **Cursor** | **Quiet day 15** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands (now five vendor touches with Devin's Bots call lane). |
| **Huly** | **Fifteenth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,159★ (+6). | platform trunk 2026-11-09 | EPL-2.0, 28,159★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Movement resumed but CI-only:** 2 default-branch commits 11-20 07:55Z (PR #112 `droid/risk-install` — CI now runs a PR risk assessment after Droid Auto Review, auto-approving up to low risk). npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` still ends **1-10.mdx**. No release entry; **last verified release v1.9.0** (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | The droid-cli pre-release rhythm continues (docs + CI hardening, still no publish). Keep the npm + default-branch + changelog-dir probe trio. |

## Proposals

### Proposal 1 — ADOPT brief: sharing-visibility defaults (the visibility axis for the scope-roots lane)

**Precedent (verified this run):** Devin's Nov 18 + Nov 20 entries — the largest per-object
access pack any competitor has shipped in this radar's window: every shareable object (sessions,
secrets, environments, automations, plugins, playbooks, skills, MCP servers, knowledge) gains
user-group sharing; **new sessions start at their narrowest viable visibility** ("just you"),
with confirmations that **name who gains access** before widening; private sessions never leak
into Slack; **attachments follow session visibility**; derived surfaces (Review, DeepWiki, Ask)
**inherit SCM-mirrored access instead of org-wide defaults**; **service users and shared bots
read only explicitly granted resources**; and an **SCM access-mismatch checker** reports where
the control plane's grants have drifted from the upstream forge. Corroborated same-lane by
Multica's task-token workspace-binding trio + credential-class weeks (carried rows).

**Our gap (verified at effect/v4 `9505c63d`):**

- The lane LANDED: `docs/design/scope-roots.md` + `packages/contracts/src/scope.ts` +
  blocking `scope-audit` CI (`7afd59a`, NEVR-603 #250, 11-12) — but the taxonomy
  (org / board / task / user-self / public) carries **no visibility axis**: nothing says what a
  shareable object's *default* visibility is, what widening requires, or how derived surfaces
  inherit scope.
- apps/web + packages/contracts have **zero sharing/visibility surface** (git grep
  `sharedWith|share.?with|visibility|user.?group` at `9505c63d`: CSS `visibility` only) — the
  F4/F5/F6/E5–E7/D2 pattern: pin the law BEFORE the first shareable object exists.

**Work (docs-only, no app code):** add a **Visibility defaults** section to
`docs/design/scope-roots.md`, five acceptance lines with precedent:

1. **Narrow by default.** A newly created shareable object starts at the narrowest visibility
   its creation context admits (creator-only unless the context explicitly widens); org-wide is
   an explicit setting, never a default.
2. **Widening is a confirmed, named action.** Increasing an object's visibility requires an
   explicit confirm that names who gains access; silent widening (invite, link, attach, migrate)
   is a defect class.
3. **Derived surfaces inherit, never widen.** Search, digests, exports, agent-readable
   projections and downstream sessions answer from the source object's scope — a share-scoped
   object never reaches a wider audience through a derived surface.
4. **Non-human principals get explicit grants.** Agent/service credentials see only resources
   explicitly granted to them; they never inherit a human's org-role breadth (the Multica
   credential-class line, restated as a visibility law).
5. **Drift is reported, not assumed.** Where the control plane mirrors an upstream SCM's access,
   an admin-visible check reports mismatches between the two.

*Regression play:* an agent principal reading an object it was not explicitly granted fails;
search over org data returns only objects the caller's scope admits; a widening action without
confirmation is refused; a derived surface queried for a share-scoped object returns nothing to
a caller outside the share.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — ADOPT brief: context-exhaustion projection on the usage lane

**Precedent (verified this run):** Paseo #10289 (merged 11-20, PR body fetched): Usage Details
forecasts quota runout — "~19% left at reset" / "runs out in 2h 31m" — from the average pace as
of the last successful reading, with the projected instant **frozen between refreshes** and the
forecast **hidden for retained readings after a failed refresh** (stale data never projects).
Multica #10752 (11-16, carried): plan limits on runtime pages captured from the stream the
daemon already reads, burn-rate-vs-elapsed, no provider API. Two vendors, five days, one law.

**Our gap (verified at effect/v4 `9505c63d`):** the event log already persists
`contextTokens` and `contextWindowSize` on every usage update (`packages/agents/src/store.ts:418`;
`apps/stellarc-node/src/runner.ts:155` maps `used` → `contextTokens`) — and apps/web consumes
**neither** (git grep: no usage/token readout, no forecast concept anywhere in apps/web/src).
The carried open half of the retired cost/token UI row is exactly this readout.

**Work (acceptance line for the apps/web agent-view usage surface, no new events, no provider
API):** when the run-header usage readout lands, the context-window readout **projects
exhaustion**: from the trailing usage updates, burn = ΔcontextTokens / Δtime;
projection = (contextWindowSize − contextTokens) / burn, rendered with the assumed window
(e.g. "~18% window left; at this pace full in ~40 min"). The projection instant is stable
between refreshes, and **a stale or failed reading renders no projection** — the D2 law applied
to forecasts: a projection is an assertion about live data, never about retained data.

**Ready-to-file brief posted as an issue comment.**

### Proposal 3 — pre-registration pack (no new Stellarc surface; acceptance lines folded into standing rows)

- **Devin Bots (Nov 19)** — new WATCH row: always-on agents as first-class principals (identity,
  memory, permissions, parallel session spawning, mergeable-PR completion criteria, template
  personas, reachable by text/call). The agent-as-principal shape for the ADR 0011 BYO lane;
  no Stellarc surface (no persistent-agent concept — the wakeup lane is the nearest seam).
- **Devin "Syncing" session header (Nov 19)** — fold into the live-status & replay contract row:
  the catch-up state is named in the chrome until the session has caught up with the server.
- **OpenHands #17820 (v1.43.0)** — fold into the reading-position/virtualization rows: the
  virtualization seam is now release-grade at a fifth vendor.
- **Paseo #10279/#10280 multi-forge watches** — fold into the wakeup-lane note: PR-shaped
  triggers go forge-neutral (GitLab/Gitea/Forgejo/Codeberg), not GitHub-only.
- **Multica #11034 (queued CLI updates)** — fold into the runner startup-honesty/ops
  pre-registrations: platform maintenance never interrupts running agent work; the queue is
  server-stored, cancellable, expiring.
- **Multica #10963 (database-clock `fire_at`)** — fold into the ordering-law audit row:
  scheduled actions stamp their fire time from the database clock, not the app host's.
- **Authz sweep row** — EXECUTED: NEVR-603 #250 `7afd59a` (11-12) landed scope-roots + blocking
  audit on effect/v4, verified this run; row flips to ADOPT (landed).

---

Verification appendix (fetched 2026-11-21, window 11-19T19:00Z→11-21T04:30Z):
GitHub API — multica-ai/multica (meta 56,964★/pushed 11-21T04:30Z; releases v0.11.1 newest; 43
window PRs incl. bodies for #11034), getpaseo/paseo (meta 24,553★/pushed 11-21T01:50Z; releases
v0.17.0-beta.1 newest; 19 window PRs; #10289 body fetched), OpenHands/OpenHands (meta 93,931★;
v1.43.0 release body; 21 window PRs), makeplane/plane (meta 62,877★/pushed 11-20T13:14Z; 1
window PR), hcengineering/platform (meta 28,159★/pushed 11-09T14:14Z), Factory-AI/factory (2
window commits; npm @factory-ai/droid 404; docs/changelog ends 1-10.mdx). Changelog pages:
linear.app (newest Nov 12), cursor.com (newest Nov 6), devin.ai (newest Nov 20; entries 17–20
parsed in full). Copilot: github.blog changelog RSS (newest 11-18 22:04:50Z). Stellarc gaps:
git grep at effect/v4 `9505c63d` and dev `3ad10bf`.
