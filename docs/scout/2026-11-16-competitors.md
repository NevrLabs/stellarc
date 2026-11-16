# Scout — Competitors, 2026-11-16

Beat: **competitors**. Delta window: 2026-11-15 19:03 UTC → 2026-11-16 19:03 UTC (~24h).
Every claim verified against the GitHub API (`gh api` — repo metadata, release tags, a
`search/issues` merged-window query per repo, PR detail bodies) or a fetched changelog
(Linear, Cursor, Devin, Copilot — github.blog changelog feed). Factory probed per the dead
route rule (npm registry + repo docs; both empty). Context: Stellarc = self-hostable, inert
control plane (v2 charter) + BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and
`docs/v2-charter.md` are the standing filters. Dev HEAD this run: `46565d75` (docs-only);
effect/v4 head `9505c63d` (unchanged since the ADR 0015 step-1 merge; step 2 = #286 still
open).

## The one-line read

**Three stable releases inside one 24h window** — Multica v0.10.0 (10:30Z, 57 merges in
window), Paseo v0.16.0 (06:58Z, 27 merges), Plane v1.5.0 (14:45Z, 10 merges) — and the
convergent law of the day is **non-interrupting steering, shipped twice, same day**:
Multica **#10715 (MUL-9374)** makes Chat steering *default to non-interrupting* ("sending
text during a supported direct Chat reply adds guidance to the same run; guidance that
cannot be delivered automatically becomes input for a subsequent turn; queuing remains an
explicit secondary action" — delivery receipts **name the exact active attempt**, undelivered
messages **requeue atomically on completion, terminal failure, cancellation, or provider
rejection**, and on retry guidance keeps its original request), plus mobile parity
(#10735 steer running replies + explicit queue) and a current-run hint (#10743); Paseo
**#9757** removes the last agent-send interruption fallback — **messages from other agents
and automatic finish/error/permission/closed notifications queue until the current turn
ends**, which also stops machine-sent traffic from breaking Claude compaction. The 11-01
pre-registration ("steering must queue behind a starting turn, never replace it") is now
field law at two vendors; still no steering surface in Stellarc (grep re-verified at
`9505c63d`: zero steer/queue hits in packages/agents + stellarc-node). The second law of
the day is **credential-class separation**: Multica **#10704 (MUL-9356)** — task tokens
(`mat_`) and cloud-node credentials (`mcn_`) *inherit their owner's workspace role*, so a
machine credential could publish/install plugins, approve MCP tools and issue standing
plugin tokens; the fix wraps 12 plugin-management routes in `RequireHumanActor` **plus
handler-level backstops** — and **#10723** shows why backstops are needed: owner recovery
was already guarded, but `resolveActor` classified a cloud PAT as *member*, so the machine
credential could list every private project and join one; `isMachineCredentialActor` now
rejects `task_token`/`cloud_pat` inside the handler. **Role checks are not credential-class
checks.** Third: **Multica #10703 (MUL-9312) — usage honesty on resume**, the day's ADOPT
brief at our seam: CodeBuddy's terminal result carries `modelUsage` (29,844 input = *this
execution*) alongside `usage` (59,665 = *session-cumulative*); the fallback accepted the
session-scoped number when per-model totals were unavailable, silently overwriting the
streamed counters and inflating the issue's usage. Our `agent_task_usage` holds the exact
shape (details in Proposal 1). Plane's stable closes our 11-11 authz brief's wait: the 30+
object-level fixes — incl. **#10303 `fields="__all__"` serialized OAuth
access/refresh/id tokens to the browser** ("no frontend reads them") — are now
release-grade. OpenHands moved orgs (`All-Hands-AI` → **`OpenHands/OpenHands`** — cite the
new path); its law of the day is **#19062**: a `request_secret` call for an existing name
auto-completed from stored metadata, dismissing the queued card and reporting `saved`
*without user action* — rotation was impossible; a secret request must stay a real user
decision. Linear (day 4), Cursor (day 10), Devin (day 3), Copilot (day 3) quiet; Huly 10th
consecutive quiet day; Factory route dead per rule (npm never published, repo frozen
11-11, docs end `1-10.mdx`).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.10.0 SHIPPED 10:30Z (57 merged PRs in window; head pushed 18:32Z; 56,344★ (+145)).** Release + PR bodies verified. **Steering law (the day's headline): #10715 default NON-INTERRUPTING Chat steering (MUL-9374)** — text sent during a supported reply adds guidance to the same run; undeliverable guidance becomes input for a subsequent turn; queuing is the explicit secondary action; delivery receipts name **the exact active attempt**; messages belong to the root input batch so retries retain original request + guidance; **requeue is atomic on completion, terminal failure, cancellation, provider rejection**; extends the task-supplement capability handshake to Chat. #10735 mobile: steer running replies with an explicit queue (MUL-9404); #10743 deliver steering + current-run hint, #10738 remove the extra queue button (MUL-9410). **Credential-class separation: #10704 plugin management requires HUMAN credentials (MUL-9356)** — task tokens (`mat_`) and cloud-node creds (`mcn_`) inherit the owner's workspace role, so machine credentials could publish/install plugins, approve MCP tools, issue standing plugin tokens; `RequireHumanActor` on 12 routes + handler-level backstops. **#10723 machine credentials out of private-project owner recovery** — `resolveActor` classified a cloud PAT as member, bypassing the router guard; handler now rejects `task_token`/`cloud_pat` via `isMachineCredentialActor` (role ≠ credential class). **Usage honesty: #10703 avoid cumulative CodeBuddy usage on resume (MUL-9312)** — terminal `modelUsage` (29,844 input, this execution) vs `usage` (59,665, session); the fallback overwrote streamed counters → inflated usage; record only usage attributable to the current execution. **#10752 Claude Code + Codex plan limits on runtime pages (MUL-9427)** — 5-hour and weekly windows captured from the stream the daemon already reads, with reset times and burn-rate-vs-elapsed, **without calling provider APIs or reading credentials** (agents on a quota'd runtime fail `provider_quota_limit` "and nobody saw it coming"). **Inbox/notify: #10739 archived-notification reads require owner-triggered runs (MUL-9411)** — a task credential gets the owner's notifications only when the server verifies the owner is the upstream human who triggered the run (closes the #10726 archive gap; any run — another member's trigger, no verifiable trigger, a finished task's leftover token — is denied); **#10765 suppress same-issue agent self-mentions (MUL-9435)** — an agent quoting its own canonical mention link on its own issue scheduled a successor run (pending-task dedup excludes running tasks; completion reconciliation re-resolved them); suppressed across comment threads, cross-issue handoffs preserved; **#10694 server reports each subscription's delivery tier (MUL-9360)**; #10680 snooze until a time + Snoozed view (MUL-9333); #10711 triage moves on, side effects stay in place (MUL-9372); #10685/#10688 unsubscribe on others' issues / key updates only for other people's issues (MUL-9343); #10767 sidebar toggles no longer re-render the issue timeline (MUL-9426); #10744 virtualize long-content threads + remember reply heights (MUL-9409); #10736 preserve scroll offsets when switching issue views (MUL-9402). Also: #10705 verify GitHub installation control *before* workspace binding (MUL-6056); #7824 force a server-side re-check for woken runtimes to clear a stale empty-claim stall (MUL-6895/6586, daemon); #10763 preserve empty tool arguments (composio, MUL-9433); #10747 retain actionable DSH profile startup diagnostics; #10743/#10738 chat queue UX; #9869 native QR-linked WeChat IM channel (MUL-8549). | v0.10.0 2026-11-16 10:30Z | proprietary (NOASSERTION), 56,344★ | 5 | **WATCH → law source ×4** | Four Stellarc-relevant law clusters: (1) steering = non-interrupting by default, machine-sent traffic included — pre-registration upgraded (Proposal 2); (2) credential-class separation folds into the 11-11 authz sweep brief as new acceptance lines; (3) **usage-resume scope mismatch is today's ADOPT brief** — our `agent_task_usage` + budget SUM has the identical failure shape; (4) plan-limit surfacing from already-read streams is the usage-lane's provider-side twin (budgets park on OUR windows; plan windows are the provider's). |
| **Paseo** | **v0.16.0 STABLE SHIPPED 06:58Z (27 merged PRs in window; pushed 18:45Z; 24,178★ (+63)).** PR bodies verified. **#9757 queue agent messages until the current turn ends** — removes the remaining agent-send interruption fallback: messages from other agents and automatic finish/error/permission/closed notifications interrupted Claude compaction; person/plugin steers keep existing behavior. Machine-sent traffic never interrupts a turn. **#9781 plugins append agent instructions** — compose saved prompt + daemon instructions + plugin additions in order on create/resume/refresh/import; reloading or disabling a plugin updates the next session without changing the agent's saved config; history opens don't apply additions; running turns uninterrupted; Codex ≥0.121.0 gets an authoritative developer-message snapshot when an existing thread's instructions change (with session invalidation). **#9846 return only the newest reply as an agent's last message after a daemon restart** — the timeline is rebuilt from provider history after a restart, and the rebuild returned previous reply + new one appended (wait results and finish notifications showed the wrong text; pre-restart behavior was already correct per #9793). **#9859 release Codex chats opened only to read history when idle** — a history-only session starts an app-server, reads the thread, disposes it; idle cleanup's `canStopRuntime()` answered *no because the session has no app-server client* — every read Codex chat stayed loaded until restart; the history-state session now reports stoppable. **#9855 keep Claude signed in when model discovery runs during a token refresh** (auth race). #9793 preview the newest reply in finished notifications after an agent wakes on its own; #9828 stop timed-out watcher setups rescanning large repos every 5 minutes; #9799 end bare links at CJK and fullwidth punctuation; #9836/#9823 show OMP/Pi model names with slashes and underscores in full; #9837 dismiss chat errors and identify timed-out requests; #9854 show same-size edits saved right after staging in diffs; #9784 surface the daemon's stream error instead of a delivery timeout (dictation); #9847 keep saved hosts when one entry can't be read; #9888 preview tab identities unique across split panes. | v0.16.0 2026-11-16 06:58Z | Apache-2.0 (NOASSERTION + carve-out), 24,178★ | 5 | **WATCH → law source ×3** | #9757 completes the steering law's machine half (with Multica #10715 — same day, two vendors). #9781 is an **ADR 0015 datapoint**: plugins as instruction sources with ordered composition, session invalidation, and running turns uninterrupted — exactly the composition question our app registry (step 2, #286) will hit when apps grow agent-facing config. #9846/#9859 feed the replay/stop-consult pre-registrations (Proposal 3). |
| **Plane** | **v1.5.0 STABLE SHIPPED 14:45Z (10 merged PRs in window; 62,531★ (+59)).** The rc-line authz sweep is now release-grade; in-window fixes continue the same sweep, all PR-verified: **#10303 stop returning OAuth provider tokens** — `GET /api/users/me/accounts/` serialized `Account` with `fields="__all__"`, returning stored OAuth `access_token`/`refresh_token`/`id_token` to the browser; "no frontend reads them"; serializer now excludes the three fields. #10326 scope project metadata to caller access (WEB-10180); #10325 hide member emails from workspace guests (WEB-10179); #10324 scope intake duplicate_to to the project (WEB-10178); #10322 page system fields read-only (WEB-10176); #10315 check permission before cache invalidation (WEB-10186); #10312 limit API intake edits to admin or creator (WEB-10183). | v1.5.0 2026-11-16 14:45Z | AGPL-3.0, 62,531★ | 4 | **TRIAL → ADOPT (brief's vehicle resolved)** | Our 11-11 object-level authz sweep brief waited on "rc2→stable" — **v1.5.0 stable shipped**; the 30+ acceptance-line precedents are now release-grade. #10303 is the no-secrets-on-reads line's sharpest datapoint (`__all__` serialization, zero frontend consumers). New acceptance line for the same brief from Multica's pair: credential-class separation (see Multica row). |
| **OpenHands** | **REPO MOVED: `All-Hands-AI/OpenHands` → `OpenHands/OpenHands`** (search API 422s on the old path; `repos/` redirects — cite the new slug). v1.40.0 11-12 stands; 19 merged PRs in window (7 dependabot, 3 docs); pushed 18:55Z; 93,596★ (+73). **#19062 allow secure replacement of requested secrets** — an existing-name `request_secret` call was immediately completed with stored metadata, dismissing its queued card and reporting `saved` without user action; the add form also rejected duplicates, so rotation was impossible. Agent-authored with a HUMAN block (authorship honesty again). #19729 refresh ACP login status on focus and remount; #19688 an open combobox listbox takes Escape before the dialog closes; #19386 retain mobile setup drafts across view switches; #19786 advance Debian snapshot for linux-libc-dev security fixes; #19745 group the automations dashboard by tag. | v1.40.0 2026-11-12 stands | MIT, 93,596★ | 5 | **WATCH (pattern → secrets lane)** | #19062 pre-registers for any Stellarc secrets lane: **a secret request for an existing name never auto-resolves from stored state** — it stays a queued user decision (that's what makes rotation possible); completion ≠ presence of metadata. #19688 is a Base-UI-era keyboard-scope datapoint (open layer consumes the key first). Citation path change for this INDEX. |
| **Linear** | **Quiet day 4** — changelog re-fetched; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. |
| **Cursor** | **Quiet day 10** — changelog re-fetched; newest entry still **Nov 6 Voice Chat with Agents**. | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Devin (Cognition)** | **Quiet day 3** — devin.ai/changelog re-fetched; newest entry still **November 13** (Artifacts Rail et al.). | notes 2026-11-13 (newest) | proprietary | 5 | **WATCH** | Nothing new; the Nov-13 laws stand. |
| **GitHub Copilot** | **Quiet day 3** — github.blog changelog feed re-read; two Nov-16 entries are not Copilot items (Bulk start AI Scan; GitHub Mobile on iPhone Duo); newest Copilot entries remain the **Nov 13** set (deprecation table, GHES GA, Gemini 4 Hydrogen). | changelog 2026-11-13 (newest Copilot) | proprietary | 5 | **WATCH (pattern)** | Nothing new; the model-catalog churn pattern stands. |
| **Huly** | **Tenth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,130★ (+6). | platform trunk 2026-11-09 | EPL-2.0, 28,130★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Route dead (rule holds).** npm `@factory-ai/droid` = Not found (never published, re-probed); repo frozen at 11-11T23:50Z; `docs/changelog` still ends `1-10.mdx`. **Last verified release: v1.9.0** (11-11, covered 11-12). Signal watch unchanged: any `@factory-ai` npm publish, any new `docs/changelog/*.mdx`, any repo push. | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | v1.9.0's fault-isolation lines stand as the record. |

## Proposals

### Proposal 1 — ADOPT brief: usage-scope honesty on resume (per-execution vs session-cumulative), guarded at the upsert and the budget sum

**Precedent (verified, shipped in today's v0.10.0):** Multica #10703 (MUL-9312). CodeBuddy's
resumed terminal result carries `modelUsage` (29,844 input tokens = *this execution*) and
`usage` (59,665 = *the session*) in one record; the fallback path accepted the
session-cumulative number whenever per-model totals were unavailable, silently overwriting
the streamed per-execution counters and inflating the issue's usage. Their rule after the
fix: **record only usage attributable to the current execution, including when terminal
per-model totals are unavailable.**

**Our seam (verified this run at effect/v4 `9505c63d`):**

- `packages/agents/src/store.ts:400-437` — `upsertUsage` keys on `(task_id, attempt)` and
  COALESCE-merges with last-report-wins; the doc contract (store.ts:122-125) says harness
  numbers are "cumulative for the session … cumulative within the attempt (last report
  wins, never summed)". **Nothing records WHICH session-scope a report carries.**
- `store.ts:1347` — resume increments the attempt (`attempt=attempt+1,
  resumed_from_attempt=…`). A resumed attempt is a new harness session whose cumulative
  counter may restart at zero **or** keep counting from the prior session (the CodeBuddy
  shape) — the schema cannot tell them apart.
- `store.ts:784-822` — `exhaustedBudgets` **SUMs `tokens_total`/`cost_amount` across every
  `agent_task_usage` row in the window**, i.e. across attempts of the same task. If a
  resumed attempt's row re-reports prior-session usage, the budget double-counts every
  resumed task and parks healthy work early (`budget_exhausted` in `claimOnce`); if it
  under-reports, windows overspend. Either way the plane lies.
- `store.ts:385-397` + `apps/stellarc-node/src/runner.ts:705-722` — the finish-time
  `usageFromFinish` mapping writes through the same last-wins upsert as streamed
  `usage_update` items (runner.ts:148-156): a terminal report in a different scope than
  the streamed items **silently overwrites them mid-attempt** — exactly Multica's fallback
  bug, on our write path.

**Work:** (a) tag each usage record with its scope (`execution` | `session`) — one field on
the `usage_update`/finish mapping, plumbed into `agent_task_usage`; (b) at attempt start,
capture the session-cumulative baseline the harness reports (if any) and store it per
attempt; session-scoped reports on a resumed attempt are normalized to the attempt's own
usage (baseline subtraction), execution-scoped reports pass through; (c) the upsert never
silently changes scope or regresses a cumulative counter — a report that would shrink a
cumulative field, or a finish report whose scope disagrees with the streamed items, is an
event (recorded, surfaced in run detail), not a quiet overwrite; (d) the budget SUM counts
each token once across a resume chain — assert it. Tests: a CodeBuddy-shaped fixture
(finish `usage` = session 59,665 vs `modelUsage` = execution 29,844 after 29,844 already
streamed → attempt total 29,844, not 59,665); a resumed-attempt fixture whose session
counter restarts at 0 → budget counts both attempts exactly once; a mid-attempt counter
regression → event, stored value unchanged; finish/`usage_update` scope disagreement →
event, streamed values stand.
**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — steering pre-registration upgrade + credential-class addendum (no new Stellarc surface / folds into an existing brief)

1. **Non-interrupting steering (upgrade of the 11-01 pre-registration; still no surface —
   grep re-verified at `9505c63d`).** The law is now two-vendor, same-day, and richer than
   "queue behind the turn": steering **defaults to non-interrupting** and is *delivered
   into the running turn* where the harness supports it (Multica #10715 — via the
   task-supplement capability handshake; receipts name the exact active attempt; messages
   ride the root input batch so retries keep request + guidance together; undeliverable
   guidance becomes next-turn input; **requeue is atomic across completion, terminal
   failure, cancellation, provider rejection**; queuing is the explicit secondary action;
   a current-run hint shows where the message will land — #10743; mobile steers running
   replies with an explicit queue — #10735). Paseo #9757 adds the machine half: **messages
   from other agents and automatic finish/error/permission/closed notifications queue
   until the current turn ends — machine-sent traffic never interrupts, and never breaks
   compaction.** Acceptance lines when our steering lane opens: default non-interrupting;
   deliver-into-run when capable; per-message state visible; atomic requeue on every
   terminal path; guidance survives retry with its request; machine/system sends queue,
   never interrupt.
2. **Credential-class separation (addendum to the 11-11 object-level authz sweep brief,
   ADOPT-briefed).** Multica #10704 + #10723 (both in v0.10.0): machine credentials
   inherit their owner's role, so role checks alone let a task token or cloud-node PAT
   reach human-only actions; the owner-recovery route was router-guarded yet bypassed
   because `resolveActor` classified a cloud PAT as *member* — the fix adds
   handler-level `isMachineCredentialActor` backstops. New acceptance lines for our
   sweep: **consent/trust-boundary/recovery/credential-management routes require a human
   credential class (not merely a role); every such route carries a handler-level
   backstop, because classification gaps bypass router guards.** Plane's stable #10303
   (`__all__` serializer returned OAuth tokens no frontend read) rides the same brief's
   no-secrets-on-reads line.

### Proposal 3 — confirmation pack (fold into existing briefs/rows at pickup)

| Vendor fix (verified) | Stellarc contract to fold into |
|---|---|
| Multica **#10765** — an agent quoting its own mention link on its own issue scheduled a successor run; suppressed across threads, cross-issue handoffs preserved | **Delegated-subscriber notification pre-registration** — agent-authored self-mentions on the same issue never dispatch; the mention resolver compares authorship before eligibility |
| Multica **#10726/#10739** — a task credential reads the owner's notifications (active + archived) only when the server verifies the owner triggered the run; finished-task leftover tokens denied | Same pre-registration — agent reads of human notification state are owner-trigger-gated, both list and archive paths (the archive gap was the follow-up fix — scope the WHOLE resource, not the first route) |
| Multica **#10694** — the server reports each subscription's delivery tier | Same pre-registration — tiers are API-visible, not just delivery-internal |
| Multica **#10752** — Claude Code/Codex plan limits (5h + weekly) captured from the stream the daemon already reads; reset times + burn-rate-vs-elapsed; no provider API, no credential reads | **Usage/budget lane** — provider plan windows are the twin of our budget windows; when plan-limit signals appear on the ACP stream, surface them next to our own budget parking (the failure mode is named: every agent on the runtime fails `provider_quota_limit` unseen) |
| Paseo **#9859** — history-only sessions answered `canStopRuntime()` = no because they had no app-server client; every read chat stayed loaded until restart | **Runtime-consult idle-cleanup pre-registration (11-15)** — refinement: the consult must distinguish *holds pending work* from *cannot answer*; "no client" must answer stoppable, never block |
| Paseo **#9846** — after a daemon restart the provider-history rebuild appended the previous reply to the new one; wait results/finish notifications showed wrong text | **Replay/rebuild contracts (§A family)** — a rebuilt timeline preserves the live path's last-message semantics; rebuild is not a different read model |
| Paseo **#9781** — plugins append agent instructions; ordered composition on create/resume/refresh/import; running turns uninterrupted; version-gated authoritative snapshot on change | **ADR 0015 app lane (step 2, #286)** — app-provided config overlays compose in a defined order, take effect on the next session, and never mutate a saved agent config in place |
| Multica **#10744/#10736/#10767** — virtualized long threads with remembered reply heights; scroll offsets preserved across view switches; sidebar toggles don't re-render the timeline | **§F/re-render-scope + §A reading-position rows** — 6th/7th datapoints; re-render scope = the changed region, heights and offsets are state that survives |
| OpenHands **#19062** — existing-name `request_secret` auto-completed from stored metadata, dismissing the card; rotation impossible | **Secrets-lane pre-registration** — a secret request for an existing name never auto-resolves; completion requires a user action, always |

## Row updates

All ten competitor rows updated in `docs/scout/INDEX.md` (last-checked 2026-11-16):
Multica/Paseo/Plane rows carry today's stable releases and law packs; Plane's ring moves
TRIAL → ADOPT with the brief's vehicle resolved (v1.5.0 stable); OpenHands' citation path
becomes `OpenHands/OpenHands`; Factory's dead-route note stands. New row: the usage-scope
ADOPT brief (briefed 11-16). Upgraded: the steering pre-registration (two-vendor law,
default non-interrupting, machine-sent queues); the 11-11 authz sweep brief gains the
credential-class acceptance lines.
