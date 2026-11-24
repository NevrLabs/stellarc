# Scout — Competitors, 2026-11-24

Beat: **competitors**. Delta window: 2026-11-21 19:05 UTC → 2026-11-24 19:00 UTC (~72h —
competitors last ran 11-21 run 2; 11-22/11-23 ran libraries, 11-24 ran
cross-platform-ui/design/libraries, so this is the first competitors read in three days).
Every claim verified against the GitHub API (`gh api` — repo metadata, release tags + full
bodies, `merged:>=` window searches per repo, full PR bodies for the load-bearing numbers) or
a fetched changelog page/feed (Linear, Cursor, Devin — full page re-fetched and date-parsed;
Copilot — github.blog RSS with exact pubDates; Factory — npm registry + default-branch
commits + changelog dir). Context: Stellarc = self-hostable, inert control plane (v2 charter)
+ BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the
standing filters. Dev HEAD this run: `8ad3d3c3` (scout design 11-24, #355); effect/v4 head
`54e6b372` (frozen; D2 pinned as #328 — the sharing-visibility and context-exhaustion briefs
from 11-21 still queue behind triage).

## The one-line read

**The steering lane went runtime-native and agent-to-agent in one window, OpenHands grew the
field's first sub-agent transcript tree, and GitHub itself entered the agent-native tracker
lane.** Multica merged **#11419 (11-24, PR-body verified): steer running Hermes turns in
issues and Chat via Hermes' own `/steer` command sent as a second `session/prompt` while the
primary prompt is in flight** — the `⏩ Steer queued for the active turn` chunk is the *only*
proof of delivery (kept out of the transcript), late guidance runs as a follow-up inside the
same admission, and a steer that misses the turn is stopped with `session/cancel` and falls
back to the next run instead of executing as a stray prompt. **Paseo #10483 (11-22, body
verified) gave agent senders the same steer/interrupt/queue choices people have**, with a
queued receipt that returns a `guidance` sentence telling the sender how to deliver now
*without resending* ("the follow-up carries this message ahead of it, so do not send this
message again"); **#10611 (v0.17.4) delivers urgent messages to ARCHIVED agents** — the
message restores the recipient and starts the turn. **OpenHands v1.45.0 ships #20010: sub-
agent conversations nest under their parent** (arbitrary depth, active child auto-expands its
ancestors, flat fallback), plus **#19495 OpenHands Projects (experimental): a coordinator
conversation hands work to worker conversations with shared files and memory** — "an agent
for your agents." **GitHub shipped issue statuses + repository boards (public preview,
11-23)** with agent-aware transitions: *assigning an agent moves the issue to In progress*,
and status changes are automation triggers for Copilot automations. → Proposal 1: pin the
**steer-delivery contract G8–G11** (receipt-proven delivery, sender parity with guidance,
archived ≠ unreachable, stray-prompt containment) — no steering surface exists in our code
(grep-verified at `54e6b372`). Proposal 2: pin the **sub-agent conversation hierarchy** before
NEVR-309's ACP v2 bump carries subagents to us. **Multica shipped v0.12.0 + v0.12.1 (11-23)**:
motion waves 1–3 with a lint that rejects system-only reduced-motion checks, realtime
**per-reader redaction** of references the reader cannot see (the 11-21 visibility brief
executing in production), and project workflows briefed as a **status map** instead of one
computed move. **Paseo released four times** (0.17.1–0.17.4 in three days). **Plane unfroze
with v1.5.1-rc1** (invite-integrity + attachment-scope fixes). **Devin's Nov 23 entry** adds
"Allow for this session" on MCP approvals and a secret-deletion guard that names dependents.
**Linear quiet day 12, Cursor quiet day 19, Copilot quiet (newest 11-18), Huly frozen day 20,
Factory frozen since 11-20.**

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **TWO releases: v0.12.0 (11-23 10:14Z) + v0.12.1 (11-23 20:18Z); v0.12.2 changelog PRs already merged (11355/11356/11357). ~220 merged PRs in the 72h window (search-verified); head pushed 11-24 13:43Z; 57,722★ (+686).** **v0.12.0:** the collab service + Cloud guests GA (covered 11-21, now release-grade); **Apps hub** (#10806 MUL-8990 — one account model for team and personal accounts, app requests); Antigravity steering via PreInvocation hooks (#11200 MUL-9862 — the steer lane's third runtime); **#11265/#11270 batch the brief's opening reads into one turn** (MUL-9919 — parallel, untruncated); **#11252 project workflows briefed as a status map** (MUL-9913, body verified: agents read what each status means, its lifecycle category and routes, and pick the status that matches where the issue stands — the server no longer computes one move per step; the `wont_fix`-before-`done` board-order bug is the failure story); motion Waves 1–3. **v0.12.1:** **reduced-motion discipline** — instant everywhere, **lint rejects system-only checks** (#11303 MUL-9969), CSS check covers every animation (#11312/#11322), focus rings survive animation (#11310); **realtime per-reader redaction** — duplicate marks that name an issue the reader can't see are redacted per reader, and deleted originals too (#11287 MUL-9955, #11332 MUL-9999, #11280 MUL-9932 = the 11-21 sharing-visibility law executing in production); quick actions scoped to the human a task represents (#11336); inbox J/K/U triage shortcuts; issue-tab scroll position kept across tab switches (#11296). **Post-release trunk (v0.12.2):** **#11419 steer running Hermes turns via ACP `/steer` (MUL-9970)** — negotiation at task start (`SupportsTaskSupplement` gains hermes ≥ 0.22.3, so the composer shows "Add to current run" from the beginning); while the primary `session/prompt` is in flight the daemon sends `/steer <guidance>` as a second `session/prompt`; the `⏩ Steer queued` chunk is the only proof of delivery and stays out of the transcript; the command's response never replaces the primary turn's stop reason or usage; it opens only after `available_commands_update` advertised `steer` and the primary turn produced output; **late guidance runs as a follow-up inside the same admission**; **a steer that misses the turn gets `session/cancel`, reports `turn_ended`, and queues for the next run** (a stray prompt executing with side effects is the guarded failure). Also #11383 the per-turn prompt now says to read the issue in the SAME turn as the comment scans (MUL-10028 — wording follows the batching law); #11353 squad direct-member handoff mode with guardrails; #11414 Relations section (blocked by / blocking / duplicates) + #11396 blocked-flag hover card; **#11391 task tokens refused once their task has ended** (MUL-10044 — a machine credential dies with its task); #11344 Antigravity conversation kept after a cancelled run or new workdir; #11313 confirmed Trae stream disconnects retried; #11415 wakeup timing editable from the Wakeups panel; #11416 squad reports delivered even when handoff comments are muted; #11428 session-list previews capped at 256 chars; #11401 Snoozed/Archived tabs warmed before opening; #11397 monthly app tool-call limits. | v0.12.1 2026-11-23 (v0.12.2 prepped) | proprietary | 5 | **WATCH (steal surfaces)** | #11419 is the steering lane's most complete shipped artifact and it is **ACP-shaped**: a second `session/prompt` carrying the agent's own slash command, gated on `available_commands_update`, contained by `session/cancel` — implementable on OUR pin (2.6.0) with no protocol extension. → Proposal 1. #11252's status-map law pairs with GitHub's agent-driven transitions (same day) as the field's answer to "who moves the board." The per-reader redaction trio is execution evidence for the filed sharing-visibility brief. |
| **Paseo** | **FOUR releases: v0.17.1 (11-21), v0.17.2 (11-22), v0.17.3 (11-22), v0.17.4 (11-23); 53 merged PRs in window; pushed 11-24 18:47Z; 24,989★ (+387).** **#10483 agent-to-agent steering (11-22, body verified):** agent senders now get the same three choices as people — `queue` (the new named default: wait for the turn to end), `steer` (join the running turn; interrupt-and-replace if the provider can't steer), `interrupt` (replace); **the response returns at once with `deliveryStatus` and a `guidance` sentence** that tells the sender how to deliver now without sending again, and a steer/interrupt carries the messages queued ahead of it (delivery order = admission order). The failure story: agents that believed a message was lost resent it, and the recipient read it twice. **#10611 urgent messages to archived agents (v0.17.4, release-verified):** an `interrupt`/`steer` to an archived recipient used to queue forever (the daemon's early command check failed); now normal dispatch restores the agent and delivers the original prompt — restore + dispatch run in the same lifecycle queue as archive. Honesty/perf cluster: #10428 full history when reopening a long Antigravity agent after a restart; #10533 OpenCode sessions reopen after tool definitions change; #10558 agent MCP served to `2026-07-28` protocol clients (version negotiation honesty); #10555 conversations preserved when directory capitalization differs (case-insensitive filesystems); #10586 Android terminal input opts out of keyboard personalized learning; #10585 the daemon survives a plugin process death; #10470 no zombie processes after plugin startup/reload; #9363 idle plugin sessions stop pinging the daemon; #10694 worktree teardown skipped for unapproved cross-repository checkouts; #10587 git commands never adopt bare-repository-shaped directories; #10614 Hermes terminal rows show the full command; #10496 provider session and turn metrics; #10491 usage summary on by default + a Sources list; #10487 troubleshoot providers from their settings page; #10481 catalogues refreshed in the background every 30 min; #10524 per-model thinking levels for Antigravity; #10484 stale slash-menu choices can no longer archive agents; #10395 working host connections stop flapping on busy heartbeats (background probes back off); #10702 host picker with auto-detected icons + latency. | v0.17.4 2026-11-23 | proprietary | 5 | **WATCH (law source)** | #10483 + #10611 are the agent-sender and archived-recipient halves of the steer-delivery law → Proposal 1. The plugin-lifecycle trio (#10470/#10585/#9363) folds into the runner startup-honesty row; #10586 is the mobile privacy micro-law (input surfaces opt out of keyboard learning); #10555/#10587 are filesystem-honesty lines. |
| **OpenHands** | **TWO releases: v1.44.0 (11-23 15:29Z) + v1.45.0 (11-24 09:13Z); 53 merged PRs in window; 94,233★ (+271).** **v1.44.0:** #19893 **choose who can see an automation (OHE-4206)** — the visibility axis reaches automations (third vendor after Devin's Nov 20 pack and Multica's realtime redaction); #19907 view and edit an automation's key-value store (automation state becomes a first-class surface); **#19926 readable error when a budget is reached** (body verified: the banner names WHICH budget — the member's or the org's, parsed from LiteLLM's wording — its configured monthly limit, the admin's instructions, and a link to Settings; raw text kept for local backends and failed lookups — the third vendor on the exhaustion lane, and its error-side half); #19921 conversation mentions behind `conversation_mentions`; #19875 a Home message's pending bubble drops once history has moved past it. **v1.45.0:** **#20010 nest sub-agent conversations under their parent (body verified)** — reads `parent_conversation_id` from the agent-server conversation list, groups rows by parent with the existing sort kept, **supports arbitrarily deep nesting** (each level its own expand/collapse; the active conversation auto-expands every loaded ancestor), orphans stay top-level when their parent page isn't loaded, every row action stays available at every level, and the list **falls back to flat when the backend doesn't expose the field**; **#19495 OpenHands Projects in Canvas (experimental, body verified)** — a project groups conversations around one goal: a coordinator conversation talks with the user and hands out work, worker conversations do it, and the project keeps shared files and memory ("an agent for your agents"); #19810 project conversations in the sidebar with files and PRs beside the chat; **#19800 Factories** — named groups of automations that together implement an SDLC (sidebar entry, list, drill-in dashboard gated on `/v1/capabilities` + a feature flag), with #19811 worklogs newest-first and #19861 delete; a mobile-a11y batch (focus trap in the drawer, combobox labels, Escape-cancel inline rename, phone-width setup fixes); #19978 first-run telemetry sequenced before onboarding. | v1.45.0 2026-11-24 | MIT, 94,233★ | 5 | **WATCH (law source)** | #20010 is the field's first release-grade sub-agent transcript tree → Proposal 2 (our delegation row pre-registers behavior, never rendering). Projects (coordinator/worker/shared-memory) is the open-source Devin-Bots shape for the ADR 0011 BYO lane. #19926 folds into the context-exhaustion row; #19893 folds into the filed sharing-visibility brief. |
| **Plane** | **Unfroze with v1.5.1-rc1 (11-23 20:59Z); 12 merged PRs in window; pushed 11-24 15:19Z; 63,093★ (+189).** #10369 **require project membership for v1 attachment upload** (the object-level scope sweep reaches the upload path); #10305 **require verified email to accept invites** (INFRA-1126) + #10368 invites claimable on instances without SMTP (the pair keeps the invite lane usable AND integrity-checked); #10366 clear the 2026-11-23 nightly scan findings (INFRA-1539 — a recurring nightly security scan exists); #10359 resolve open Dependabot alerts; i18n correctness (GitLab/plane.so spelling, Sticky brand mark); #10179 read-only link double-tab fix; #9939 burndown crash on non-numeric point estimates. | v1.5.1-rc1 2026-11-23 | AGPL-3.0, 63,093★ | 4 | **WATCH (sweep tail)** | The authz sweep's tail: invite integrity + upload scoping. Nothing new for the filed brief; the object-level lines already landed our side (NEVR-603). |
| **GitHub Copilot** | **Quiet — zero Copilot-specific entries in window** (github.blog changelog RSS re-read with pubDates; the 11-20→11-24 entries are notifications, secret scanning, code coverage, usage reports, GHES RC, dashboard pins, Desktop multi-account, PR overview — none Copilot). Newest Copilot item remains 11-18. **But the platform shipped the tracker story: "Issue statuses and repository boards are in public preview" (11-23, full page fetched and parsed)** — issue statuses (Backlog / Todo / In progress / In review / Done / Not planned / Duplicate) settable at creation or from the header, reflected in icons and filterable via `status:`; repository saved views gain a **board layout** with drag-to-update columns, swimlanes, configurable fields; **automated status transitions: linking a draft PR → In progress, marking it Ready for review → In review, linking an open PR → In review, assigning a user → Todo, assigning an AGENT → In progress**; GitHub Project status values two-way sync with issue statuses; **status changes are an automation trigger for Copilot automations**; GraphQL, REST and the MCP server all read and write statuses ("automations and agents can read an issue's status, set a status, and choose an initial status when creating"); issue fields become independent of issue types. | changelog 2026-11-18 (newest Copilot); boards 2026-11-23 | proprietary | 5 | **WATCH (tracker-lane entrant)** | GitHub just shipped the agent-native tracker core from the platform side: agent assignment IS a status transition and status IS an automation trigger, exposed over REST/GraphQL/MCP. This is the competitive bar arriving where Stellarc lives — folds into the board-lane steal list and the status-map law (Multica #11252). |
| **Devin (Cognition)** | **NEW Nov 23 changelog entry (page re-fetched and parsed in full; previous newest was Nov 20).** Sessions: **open a session side by side** (Option/Alt+click a session link → split pane); session search moved to the command palette (Cmd/Ctrl+K; the inline sidebar search removed). Security: code-scan cancellations recorded in audit logs (who cancelled, from the web app or the v3 API). Enterprise: **warning before deleting secrets used by Preflight checks** — the Secrets page lists the automations whose checks consume the org secret before you delete it (a deletion guard that names its dependents). MCP: marketplace plugins can be **Offered to members** instead of Required; **MCP tool approval cards add "Allow for this session"** (the middle scope between once and org-wide always); API-key MCP headers bound to secrets, unused secrets flagged; custom MCP servers default to Automatic authentication. Automations: right-click a row for Run now / Open in new tab / Copy link. | changelog 2026-11-23 (newest) | proprietary | 5 | **WATCH (law source)** | "Allow for this session" is the approval-scope ladder's missing rung (folds into the Paseo approval-lifecycle row); the secret-deletion guard is the destructive-action law (name the dependents before the irreversible delete); split-pane sessions + Cmd+K search are the chrome pattern for the workspace lane. |
| **Linear** | **Quiet day 12** — changelog re-fetched and date-parsed; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; carried rows stand. |
| **Cursor** | **Quiet day 19** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Huly** | **Twentieth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,182★ (+19). | platform trunk 2026-11-09 | EPL-2.0, 28,182★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Frozen — 0 default-branch commits since 11-20T07:57Z** (re-verified); npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` still ends **1-10.mdx** (contents re-listed). Last verified release v1.9.0 (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | Nothing new; the probe trio (npm + commits + changelog dir) holds. |

## Proposals

### Proposal 1 — ADOPT brief: the steer-delivery contract G8–G11 (docs-only)

**Precedent (verified this run):** Multica #11419 (merged 11-24, PR body fetched and quoted in
the findings table) — steering a running Hermes turn is done with the agent's own `/steer`
slash command, sent as a **second `session/prompt` while the primary is in flight**;
capability is negotiated at task start so the composer can offer "Add to current run" from
the beginning; the `⏩ Steer queued for the active turn` chunk is **the only proof of
delivery** and is kept out of the transcript; the command's response never replaces the
primary turn's stop reason or usage; the window opens only after `available_commands_update`
advertised `steer` and the primary turn produced output; **late guidance runs as a follow-up
inside the same admission**; a steer that misses the turn is stopped with `session/cancel`,
reported as `turn_ended`, and queued for the next run — a stray prompt executing with side
effects is the explicitly guarded failure. Paseo #10483 (11-22, body verified) — agent senders
get the same `queue`/`steer`/`interrupt` choices as people, the default is named (`queue`),
the receipt returns at once with `deliveryStatus` plus a **`guidance` sentence that tells the
sender how to deliver now without resending**, and delivery order equals admission order.
Paseo #10611 (v0.17.4, release-verified) — an urgent message to an **archived** recipient
restores it and delivers the original prompt; archived is a view state, never an unreachable
state.

**Our gap (verified at effect/v4 `54e6b372`):** git grep over `packages/**` + `apps/**`:
zero steer/supplement surface (the only hit is a comment in `apps/web/e2e/a11y.spec.ts`);
zero `available_commands` / `session/cancel` usage; no archived-agent concept. The G7
steer-queue ordering brief was filed 11-21 (run 2) — it pins the *ordering* half only. This
window shipped the *delivery* half at two vendors; pin it before the surface exists, the
F4/F5/F6/E5–E7/D2 pattern.

**Work (docs-only, no app code):** extend §G of `docs/design/agent-view-lifecycle-contracts.md`
beside the filed G7 lines with four laws, each with precedent and a pre-registered regression
play in the house style:

1. **G8 — receipt-proven delivery.** Guidance joins a running turn only through a receipt the
   runtime names (a response chunk, a protocol reply, an admission marker). Send-time
   optimism is not delivery, and the receipt is metadata — it never becomes transcript
   content and never overwrites the primary turn's stop reason or usage.
2. **G9 — sender parity with guidance.** Machine senders get the same steer/queue/interrupt
   choices as people, with the waiting default *named*. A queued receipt returns a guidance
   sentence saying how to deliver now (a steer/interrupt follow-up carries the queued message
   ahead of it) — the sender never resends to force delivery, because a resend is a duplicate
   read, not a faster one.
3. **G10 — archived ≠ unreachable.** An urgent message (steer/interrupt) addressed to an
   archived agent restores the recipient and delivers; archive is a view state.
4. **G11 — stray-prompt containment.** A steer that misses its turn is cancelled at the
   runtime before it can execute; the message falls back to the next run. A guidance message
   executing as a fresh prompt with side effects is the guarded defect class.

*Regression plays:* (a) guidance arriving after the last tool call lands inside the same
admission and the primary prompt answers after it; (b) a steer racing turn-end emits the
cancel, reports turn-ended, and queues for the next run with zero stray execution; (c) an
agent-sender's queued receipt carries a guidance sentence and the sender does not resend;
(d) an interrupt to an archived recipient restores it and starts exactly one turn.

*Implementation note for the eventual Builder (not part of this brief):* the mechanism is
ACP-shaped and needs no protocol extension — a second `session/prompt` carrying the agent's
own slash command, gated on the session's advertised commands, contained by `session/cancel`.
Our ACP pin (2.6.0, post-#224 rotation) already carries all three primitives.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — ADOPT brief: sub-agent conversation hierarchy (delegation visibility; docs-only)

**Precedent (verified this run):** OpenHands #20010 (v1.45.0, PR body fetched) — the
conversation sidebar nests sub-agent conversations under their parent: `parent_conversation_id`
read from the agent-server conversation list, rows grouped by parent with the existing sort
order preserved, **arbitrarily deep nesting** with an expand/collapse per level, **the active
conversation auto-expands every loaded ancestor**, orphan children stay top-level when their
parent page isn't loaded, row actions available at every level, grouped/workspace mode moves
children under parents across folder boundaries, and a **flat fallback** when the backend
doesn't expose parentage. Corroborated in the same release by **OpenHands Projects
(#19495, experimental)** — a coordinator conversation hands work to worker conversations with
shared files and memory — and carried by Devin Bots (11-19: parallel sessions spawned by an
always-on principal) plus ACP v2 moving subagents into the protocol (libraries row:
#2817 includes them without the `unstable_` prefix, target of the NEVR-309 bump).

**Our gap (verified at effect/v4 `54e6b372`):** git grep over `packages/**` + `apps/**`:
no subagent / parent-conversation / child-run / delegate concept (the only "delegation" is
the gateway's credential delegation; the only "spawn" is `child_process`). The delegation-law
pre-registration (11-04/05) pins *behavior* (inheritance, supervision) — nothing pins how a
run tree **renders**, and nothing records parentage on the conversation record. When NEVR-309
bumps ACP and subagents arrive at our seam, the tree will exist at the protocol level with no
contract for its projection.

**Work (docs-only, no app code):** pin the **conversation-tree laws** into
`docs/design/agent-view-lifecycle-contracts.md` (§B, the list/grouping lane), before the ACP
bump lands the surface:

1. **Parentage is recorded at birth.** A child run's parent id is written to the stored record
   at creation (the record-at-birth law already pre-registered in the runner-honesty row) and
   is never re-derived by querying the OS or the runtime.
2. **Children nest, at any depth.** The conversation list renders the parent/child tree with
   the existing sort preserved inside each level; every level gets its own expand/collapse.
3. **The active child reveals its chain.** Opening a child auto-expands every loaded
   ancestor; in grouped mode its root ancestor stays reachable even past the folder preview.
4. **Orphans degrade visibly.** A child whose parent is not loaded renders top-level; a
   backend without parentage renders the flat list — zero rows lost either way.
5. **Actions live at every level.** Pause, rename, archive, delete and siblings remain
   available on nested rows, not only on top-level ones.

*Regression plays:* a grandchild renders under its parent under its grandparent; activating
the grandchild expands the chain and force-includes its root in the folder preview; a
conversation list from a parentage-less backend renders flat with the same row count.

**Ready-to-file brief posted as an issue comment.**

### Proposal 3 — pre-registration pack (no new Stellarc surface; acceptance lines folded into standing rows)

- **GitHub issue statuses + repository boards (11-23)** — the platform-side entrant into the
  agent-native tracker lane: agent assignment is a status transition (→ In progress), status
  changes are Copilot-automation triggers, and statuses are read/writable over
  REST/GraphQL/MCP. Folds into the board-lane steal list: when a Stellarc board surface is
  filed, agent activity must be a first-class status actor and status a first-class trigger.
- **Multica #11252 (status-map briefs)** — agents read a map of the workflow (each status,
  its category, what entering it does, its routes) and pick the matching status; the server
  stops computing one move per step. Pairs with GitHub's transitions as the field's two-sided
  answer: machines write status, guidance stays a map.
- **OpenHands #19893 (automation visibility)** — the sharing-visibility axis reaches
  automations: third vendor datapoint for the brief filed 11-21.
- **OpenHands #19926 (budget-reached readable error)** — third vendor on the
  context-exhaustion lane, error-side half: exhaustion renders as a named, actionable error
  (which budget, its limit, admin instructions, a link), never a raw provider exception.
- **Multica #11383 (same-turn opening reads)** — the per-turn prompt tells the agent to read
  the issue and the comments in one turn; wording follows the batching law. Folds into the
  context-receipt lane.
- **Multica #11287/#11332/#11280 (per-reader realtime redaction)** — live surfaces redact
  references to objects the reader cannot see: the filed sharing-visibility law executing in
  production at the first vendor.
- **Multica v0.12.1 motion discipline** — reduced motion instant everywhere, lint rejects
  system-only checks, a CSS check covers every animation: the reduced-motion
  pre-registration's largest vendor execution (fold into that row).
- **Paseo #10586** — Android terminal input opts out of keyboard personalized learning: the
  mobile input privacy micro-law.
- **Paseo #10555 / #10587** — conversations survive case-insensitive directory collisions;
  git never adopts bare-repository-shaped directories: filesystem honesty for the node lane.
- **Devin "Allow for this session" (Nov 23)** — the middle approval scope joins
  once/always/session/org: folds into the Paseo approval-lifecycle row.
- **Devin secret-deletion guard (Nov 23)** — deleting an org secret warns with the automations
  whose Preflight checks consume it: destructive actions name their dependents.
- **Paseo #10470 / #10585 / #9363** — no zombies after plugin startup; the daemon survives a
  plugin process death; idle plugin sessions stop pinging: folds into the runner
  startup-honesty row.
- **Multica #11391** — task tokens refused once their task has ended: a machine credential
  dies with its task (the credential-class law's lifecycle half).
- **Paseo #10558 / #10524** — MCP served across protocol revisions (2026-07-28 clients);
  per-model thinking levels: BYO-agent matrix hardening for the ADR 0011 inventory.

---

Verification appendix (fetched 2026-11-24, window 11-21T19:05Z→11-24T19:00Z):
GitHub API — multica-ai/multica (meta 57,722★/pushed 11-24T13:43Z; releases v0.12.0 + v0.12.1
with full bodies; ~220 window PRs; bodies fetched for #11419, #11383, #11252),
getpaseo/paseo (meta 24,989★/pushed 11-24T18:47Z; releases v0.17.1–v0.17.4, v0.17.4 body;
53 window PRs; bodies fetched for #10483, #10611), OpenHands/OpenHands (meta 94,233★; v1.44.0
+ v1.45.0 release bodies; 53 window PRs; bodies fetched for #20010, #19495, #19800, #19926),
makeplane/plane (meta 63,093★/pushed 11-24T15:19Z; v1.5.1-rc1 body; 12 window PRs),
hcengineering/platform (meta 28,182★/pushed 11-09T14:14Z), Factory-AI/factory (0 window
commits; npm @factory-ai/droid 404; docs/changelog ends 1-10.mdx). Changelog pages: linear.app
(newest Nov 12), cursor.com (newest Nov 6), devin.ai (newest Nov 23; entry parsed in full).
Copilot: github.blog changelog RSS with pubDates (newest Copilot-specific 11-18; the 11-23
boards entry parsed from its blog page). Stellarc gaps: git grep at effect/v4 `54e6b372`
(steer/supplement, subagent/parent-conversation, available_commands/session-cancel, archived).
Dev HEAD `8ad3d3c3`, effect/v4 head `54e6b372`.
