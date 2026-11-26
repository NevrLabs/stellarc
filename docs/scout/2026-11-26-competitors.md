# Scout — Competitors, 2026-11-26

Beat: **competitors**. Delta window: 2026-11-24 19:00 UTC → 2026-11-26 19:00 UTC (~48h —
competitors last ran 11-24; 11-25/11-26 ran libraries, cross-platform-ui and design, so
this is the first competitors read in two days). Every claim verified against the GitHub
API (`gh api` — repo metadata, release tags + full bodies, `merged:>=` window searches
per repo, full PR bodies for the load-bearing numbers) or a fetched changelog page/feed
(Linear, Cursor, Devin — full page re-fetched and date-parsed; Copilot — github.blog RSS
with exact pubDates; Factory — npm registry + default-branch commits + changelog dir).
Context: Stellarc = self-hostable, inert control plane (v2 charter) + BYO-agent runtime
over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing
filters. Dev HEAD this run: `98e791f9` (scout design 11-26, #366); effect/v4 head
`80ee7c91` (ADR 0016 Drizzle persistence, 11-26 — the branch moved past the
`54e6b372` freeze this window; all gaps re-verified at the new head).

## The one-line read

**Multica made the tracker dependency-aware, three vendors shipped machine-scale content
bounds in one window, and OpenHands fixed the loopback DNS-rebinding class our gateway
already carries by construction.** Multica v0.13.0 (11-25) lands **MUL-8860 #10279
(+2,401/−157, body-verified): issue blockers and automatic dependency wakeups** —
"assigning an issue could start an agent before its prerequisites were finished" is now
a guarded flow: blockers are computed (manual + stage siblings), cycles rejected at
write, a dependency release is **acknowledged in the same transaction as task creation**
(the shared ready state prevents a second dispatch after that run completes), backlog
stays parked, status stays under the person or agent's control. Multica also shipped the
keyboard plan (MUL-10203: issue verbs S/A/P/L/⇧D/⇧P/Q/R, a keyboard cursor for
list/table/board, G-prefix navigation + a `?` sheet), runtime visibility editable from
the list (MUL-10200), and two honesty masterclasses: **#11656 (MUL-10197)** — a single
pasted JSON export froze the issue page because GFM's autolink-literal walks back to an
unclosed `[` quadratically; the fix bounds what gets formatted (200k-char threshold →
plain text, capped code block, Download as .txt) — and **#11648 (MUL-10124)** — Codex
silently truncates the runtime brief at 32 KiB with no marker; the cap is now lifted
per-thread on `thread/start` **and** `thread/resume` because the override is not
persisted. **Paseo v0.17.5** (11-26): plugin sandbox launchers (#10786, +3,994/−530 —
one launch wrap for agents, terminals and commands), agents no longer invited to hide
the subagents they create (#10887 — the *tool description* invited it), and desktop
update pacing (canary first, ≤1 check/6h, 24h between updates). **OpenHands v1.46.0**
(11-25) + post-release trunk: **#20061 guards loopback servers against DNS rebinding
and CSWSH** (their static server accepted any Host and served a page with an embedded
session API key; ours already carries the class — exact-Host at the loopback ingress,
exact-Origin, pinned URL origin, CSP `frame-ancestors 'none'`), **#19424 makes usage
cost transparent and attributable** (a 20.1M-token session showed $0.0030; the number
is a LiteLLM estimate recorded only for priced calls — now labeled, per-model,
unpriced shows `—`), and #19954 lists/unshares conversations shared with a team org
(the sharing-visibility axis' fourth vendor). **Plane v1.5.1 STABLE (11-25) closes the
v1.5.0 authz sweep vehicle** ("self-hosted instances should upgrade"). **Devin shipped
two entries (Nov 24 + Nov 25)**: Bots' self-saved automations can require a human's
approval, and failed MCP client-credentials token requests now name the token endpoint,
HTTP status and error code instead of reporting success. **GitHub: Copilot code review
billing defaults to the organization from Dec 30.** Linear quiet day 14, Cursor quiet
day 21, Huly frozen day 22, Factory frozen day 6.
→ Proposal 1: pin the **machine-scale content bounds** laws into the lifecycle
contracts before apps/web has a transcript renderer (three vendors in one window; our
render surface doesn't exist yet — grep-verified at `80ee7c91`). Proposal 2:
pre-register the **dependency-aware dispatch** law pack for the board lane (zero
blocker surface in `packages/kaneo` + `apps/web` — grep-verified).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.13.0 (11-25 10:24Z); ~104 merged PRs in the 48h window (search-verified, both result pages); head pushed 11-26 18:59Z; 58,076★ (+354).** **MUL-8860 #10279 issue blockers + automatic dependency wakeups (+2,401/−157, body-verified):** workspace-scoped manual blockers + stage blockers computed from earlier siblings; cycles rejected at write (incl. cycles through stages, parent/descendant dependencies, cross-subtree moves); **the dependency release is acknowledged in the same transaction as task creation** — "the shared ready state prevents another dispatch after that run completes"; an acknowledgement error rolls back admission; backlog stays parked; **status stays under the person or agent's control**; completion wakes the assignee, notifies a member, or *records that no usable assignee exists*; the Waiting sidebar, blocked markers, a Blocked filter, and private blockers kept out of release timelines and inbox entries. Relations section #11414 + blocker hover card #11396 + submenu #11394. **Keyboard plan (MUL-10203):** #11563 issue verbs S/A/P/L/⇧D/⇧P/Q/R opening the existing ⌘K sub-pages (guests get only R; IME composition skipped), #11593 keyboard cursor for issue list/table/board, #11599 G-prefix navigation, two-key recording, `?` sheet. **#11419 steer running Hermes turns via ACP `/steer` — release-grade** (the 11-24 G8–G11 brief's precedent goes stable). **#11557 runtime visibility from the list (MUL-10200):** quiet scope marks (lock/globe/members+count) in the name cell, owner edits in place, non-owners read-only, revocation review + paid-plan gate preserved, shared `useRuntimeAccess` hook so list and detail cannot drift. **#11656 huge comment bodies (MUL-10197, body-verified):** quadratic GFM autolink on an unclosed `[` froze the page (2 MB export never became responsive); fix = `pnpm patch` of the upstream micromark fix + **bound what gets formatted** (over 200,000 chars → plain text, code block capped at 60vh with its own scroll, notice + Download as .txt; the timeline's row-height estimate uses the same bound; perf test #11643 + #11656). **#11648 Codex brief truncation (MUL-10124, body-verified):** Codex reads `{workDir}/AGENTS.md` only up to `project_doc_max_bytes` (32 KiB) and **silently drops the rest with no marker** — the platform brief alone is ~20 KB; fix lifts to 4,194,304 on every `thread/start` **and** `thread/resume` (the override is not persisted with the thread; a first revision using `developerInstructions` failed on real Codex: resumed threads kept the original brief, and it replaced the user's own `config.toml` developer instructions). **#11662 member removal revokes everything (MUL-10284):** `RetireMemberAssets` archives every non-system agent the member owns wherever it runs, cancels their tasks, transfers product agents to an heir, pauses autopilots (`pause_reason = 'member_removed'`), disables wakeups; daemon heartbeat leases re-check membership ≤1/min. **#11669 clear run log + base64 secret redaction:** admins clear a finished run's transcript (audited `transcript_purged_by`, late flushes dropped, run row kept) and the ingest redactor decodes base64 runs (standard + URL-safe, wrapped or cut) and masks the run when the decoded text contains a secret. **#11633 CLI autopilot deliveries (MUL-10265):** the skill's debugging step referenced delivery fields no CLI command could read — "an agent following the step either stalls or tries to work around the CLI." **#11524 turn attribution (MUL-10147, body-verified):** after a daemon restart mid-task, Claude Code re-runs the interrupted turn as its own command; the pooled turn ended on the *foreign* result, the user's reply landed one turn late; fix gives each prompt frame a uuid and a turn ends only on the result of the prompt it wrote. Post-release trunk: #11620 Windows worktree removal, #11634 Codex reconnects no longer hold a turn open, #11642/#11637 wakeup-delivery reply cookbooks, #11668 agent archiving from Settings. | v0.13.0 2026-11-25 | NOASSERTION, 58,076★ | 5 | **WATCH (steal surfaces)** | The dependency-wakeup flow is the agent-native tracker pattern going dependency-aware — the exact lane Stellarc's board will enter (proposal 2). The content-bounds trio, the brief-truncation fix, and the turn-attribution fix are three honesty laws for surfaces we are about to build; the CLI-deliveries gap is the agent-self-service law. |
| **Paseo** | **v0.17.5 (11-26 15:04Z); 67 merged PRs in window; pushed 11-26 18:56Z; 25,683★ (+694).** **#10786 plugin sandbox launchers (+3,994/−530, body-verified):** one launch wrap for all three launch points — `agent.open.before` (every built-in provider that starts a harness), `terminal.create.before`, `command.run.before` — so a sandbox plugin starts everything a workspace runs behind `/usr/local/bin/sandbox-run --profile agent`; `agent.create.before` receives a read-only `workspaceId`; fail-closed. **#10887 agents no longer invited to hide the subagents they create (+32/−3, body-verified):** the tool description *invited* the defect ("use it for helpers the user does not need to watch") — agents passed `background: true` unasked, so delegated subagents vanished from tabs, lists and the subagent track; the fix is wording: "Hide the agent from the UI. Inherits your visibility when omitted. Omit unless the user asks for a specific value." **#10864 delegated-agent finish semantics (+1,106/−109):** a finish subscription now separates "the turn ended" from "the child has stopped" — a child ending its turn with background work pending yields one notice and the subscription is kept, so the child's later final reply still reaches the parent. **#9013** restore stopped Claude background subagents as canceled after reopening (task-only notifications resolved through the native task-to-tool link; outcomes keep transcript order; only declared children admitted). **#8794 timeline rewind epoch recovery:** a client that missed the single rewind invalidation treated new-epoch live rows as droppable; an epoch mismatch is now catch-up (the reset tail installed atomically), never silent divergence. **#10698 Claude MCP servers over stdin (+339/−22, body-verified):** the SDK's `--mcp-config <json>` argv carried the Paseo MCP `Authorization: Bearer` header — readable by every account on the machine via `/proc/<pid>/cmdline` ("any local login into control of the user's agents"); fix sets `mcpServersDelivery: "initialize"` — no secret in argv, none on disk. **#10752 OpenCode v2 agents with their own MCP servers and env on a shared server (+2,000/−465):** Paseo connects the agent's MCP servers itself through the bridge plugin; two sessions with same-named servers see only their own tools. **#8661 long desktop turns virtualized** ("Desktop freezing when you open a chat whose last turn has hundreds of tool calls"). **#10862 OMP 19.1+ ask forms render as question cards instead of hanging the tool.** Desktop updates get pacing (#10882/#10901: canary first, at most one check every 6h, 24h between updates) and a choice (#10785: auto-download / notify only / never). Tailscale first-class (#10801/#10903/#10918); Settings reorganized by device vs host scope (#10933); per-device notification preferences + a plugin notification API (#10888); E2EE relay + privacy posture surfaced (#10749); #10866 archived chats free memory once unshown; #10867 leftover provider processes stopped when a catalog refresh times out; #10921 background git fetch no longer spawns D-Bus daemons; #10920 AppImage runtime environment stripped from shells. | v0.17.5 2026-11-26 | NOASSERTION, 25,683★ | 4 | **TRIAL (stands; ask-class brief filed)** | The sandbox-launcher seam is the plugin-capability law for our D11 lane; #10887 is the prompt-engineering-as-state law (a tool description that invites a defect is a defect); #10698's argv class is ours by construction (env + ACP protocol) — confirmatory; the subagent-visible/delegated-finish pair executes the 11-24 sub-agent hierarchy brief's runtime half. |
| **OpenHands** | **v1.46.0 (11-25 14:13Z) + 21 merged PRs in window; pushed 11-26 15:13Z; 94,409★ (+176).** **v1.46.0: #19954 list and unshare conversations shared with a team org (OHE-4205, body-verified)** — a Private \| Shared toggle under Conversations, paged 20-at-a-time, org-admin "Discover shared conversations" setting, unshare from the row's … menu: the sharing-visibility axis reaches the conversation list (fourth vendor on the filed 11-21 brief). #19925 Git Sync switch to keep automation activation status local (OHE-3927 — "Git ends up deciding whether an automation runs, and not only what it does"; the switch is hidden when the backend doesn't report the capability). #19272 Feedback button + submission flow. **Post-release: #20061 guard loopback servers against DNS rebinding and CSWSH (+841/−54, body-verified)** — `static-server.mjs` and `ingress.mjs` accepted any Host and any WS Origin when bound to loopback, `GET /` injected the plaintext session API key into the page (a DNS-rebound `Host: evil.example` reads it and drives `/api/*` same-origin), `httpxy changeOrigin` rewrote foreign Hosts to `127.0.0.1` before forwarding, and `new URL("http://"+host).hostname` passed `Host: evil.example@127.0.0.1` userinfo spoofs; the fix adds shared `parseHttpHostHeader`/`parseHttpOriginHeader`/`isLoopbackHostname`/`isForeignLoopbackRequest` — reject missing, duplicate, malformed or `@`-userinfo Hosts and non-loopback hostnames when bound to loopback, validate Origin on WS upgrades and unsafe methods, permit loopback cross-port traffic. **#19424 usage-panel cost transparent and attributable (body-verified)** — a 20.1M-token conversation showing Total Cost $0.0030 because `accumulated_cost` is a LiteLLM estimate recorded only for calls the server can price; now the priced total says "Estimated from model pricing — may differ from what your provider bills," an unpriced session shows `—` + "No cost data reported," and a per-model section breaks cost and tokens down by usage id. **#20013 isolate corrupted conversations in history** — one malformed local row failed the entire history list; now healthy rows and pagination are kept and damaged conversations render as expandable Corrupted rows with full ID, diagnostic and delete-just-that-one. #19990 mobile edge-swipe opens the drawer; agent-server bumped to 1.64.1. | v1.46.0 2026-11-25 | MIT, 94,409★ | 5 | **WATCH (pattern → ACP capability line)** | #20061 is the field-level loopback law — and our gateway already carries it by construction (exact-Host at the loopback ingress `main.ts:677`, exact-Origin `:143`, URL-origin pinned `:202`, CSP `frame-ancestors 'none'`; verified this run at `80ee7c91`) — a confirm, plus a pre-registration for any future WS/cookie surface. #19424 is the cost half of the context-exhaustion lane; #20013 is the D2 sibling for corrupted rows. |
| **Plane** | **v1.5.1 STABLE (11-25 12:05Z; 1 in-window PR); pushed 11-26 14:32Z; 63,221★ (+128).** The v1.5.0 object-level authz sweep's closing release — "continues the access control and hardening work from v1.5.0. Self-hosted instances should upgrade": external-API attachment upload now requires active project membership (a removed creator could still upload); guest restriction applied to sub-work items (403 for a parent they didn't create); board publish/update/unpublish requires a project admin; the activity feed, dashboard lists and recent visits only carry projects the user is still an active member of; asset upload bound to the URL's workspace and the caller's own draft; workspace guests no longer see other members' emails on profile/external-API endpoints; page `is_locked`/`archived_at`/audit fields read-only; intake `duplicate_to` same-project; intake edits require creator/admin/member-admin; accepting emailed invitations without the token requires a verified email on SMTP instances; magic codes are eight digits; turning an OAuth provider off disables its sign-in endpoints (not just the button); `next_path` validated after full percent-decoding; S3 storage backend initialization fixed (direct uploads were failing server-side); burndown crash on text point estimates. | v1.5.1 2026-11-25 | AGPL-3.0, 63,221★ | 4 | **WATCH (sweep concluded)** | The 11-11 object-level authz brief's vehicle is fully resolved (v1.5.0 + v1.5.1 tail). "OAuth disable disables the endpoints, not the button" and "removed members lose upload paths" are two more acceptance lines for the filed pack. |
| **Devin (Cognition)** | **TWO new changelog entries (Nov 24 + Nov 25; previous newest Nov 23; both parsed in full).** **Nov 24:** message-box rich text (bold/italic/strikethrough/inline code, lists, quotes, code blocks; paste rich text or type Markdown); Cmd+K gains category tabs (All/Sessions/Bots/Apps/Actions) and lists every left-rail page; the Apps page opens on popular Apps sorted by this week's traffic; **Engineering pulse App template** (PRs waiting on review, review and merge times, failing CI — replaces the Incident dashboard); DevinDash Bot template; **Approve automations that Bots save** — a Bot's Automations settings get an Auto-approve switch, and enterprise admins can require every Bot to get a person's approval before it saves its own automations (Trigger policies); saved Findings views can be shared and updated. **Nov 25:** the element picker works on Devin Apps in the Browser tab; Devin Review's full PR page gains a **Fixes** tab listing the code-scan findings the PR fixes; an enterprise admin can add themselves to a session under the Creator-only sharing limit (read-only); blueprints accept `clone.filter` (blobless/treeless initial clones); **failed client-credentials token requests now say so on MCP save and Connect** — token endpoint, HTTP status, error code, a "token not issued" state and an IP-allowlisting docs link, "instead of reporting success"; Jira Rovo sessions apply configured playbooks and ingest work-item attachments. | changelog 2026-11-25 (newest) | proprietary | 5 | **WATCH (law source)** | Bots-need-approval-for-own-automations is the agent-as-principal guardrail the Devin Bots row pre-registered; the MCP token-failure attribution is the failure-honesty law (a failed credential exchange never reports success); the read-only admin self-add is the sharing-visibility row's enterprise half. |
| **GitHub Copilot** | **One entry in window: "Copilot code review billing will default to the organization" (11-25 22:18Z, RSS pubDate-verified)** — members with a Copilot license whose review-billing choice was never made will bill to the organization starting **December 30, 2026**; the entry tells admins to choose before then. The attribution question ("who pays for agent work") gets a default-with-deadline — the billing lane's counterpart to the BYOK split-attribution pattern (Linear 11-12). Carried: the 11-23 issue-statuses + repository boards entry (agent assignment → In progress; status changes as automation triggers; REST/GraphQL/MCP read-write) remains the tracker-lane entrant. | changelog 2026-11-25 (newest Copilot) | proprietary | 5 | **WATCH (tracker-lane entrant)** | Default-with-deadline is the cost-attribution lane's shape: when Stellarc ever meters agent work, the unchosen case must land somewhere named, on a date, with an exit — never silently. |
| **Linear** | **Quiet day 14** — changelog re-fetched (full page); newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; carried rows stand. |
| **Cursor** | **Quiet day 21** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Huly** | **Twenty-second consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,209★ (+27). | platform trunk 2026-11-09 | EPL-2.0, 28,209★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Frozen day 6** — default branch last push 11-20T07:57Z (re-verified); npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` still ends **1-10.mdx** (contents re-listed this run). Last verified release v1.9.0 (11-11). 105★. | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | The probe trio (npm + commits + changelog dir) holds; nothing to re-litigate. |

## Proposals

### Proposal 1 — ADOPT brief: machine-scale content bounds (§F extension; docs-only)

**Precedent (verified this run):** Multica #11656 (MUL-10197, PR body fetched, +397/−29)
—"A single comment holding a pasted JSON export freezes the issue page... a long
paragraph that opens with an unclosed `[`... GFM's autolink-literal extension walks back
through the whole paragraph to that `[` at every candidate word... parsing grows with
the square of the paragraph's length... a 2 MB one never becomes responsive." The fix is
two layers, both in the shared renderer path: patch the parser defect, **and bound what
gets formatted** — bodies over **200,000 characters** render as plain text in a code
block capped at 60vh with its own scroll, plus a notice and **Download as .txt**; the
timeline's row-height estimate uses the same bound; a perf test times one huge comment
body (#11643/#11656). Paseo #8661 (v0.17.5, release-verified) — "Desktop freezing when
you open a chat whose last turn has hundreds of tool calls" — fixed by keeping long
turns virtualized. OpenHands #20013 (v1.46.0, body-verified) — one corrupted
conversation row failed the *entire* history list; now healthy rows and pagination are
kept and the damaged conversation renders as an expandable Corrupted row with its full
ID, a diagnostic, and a delete-just-that-one. **Three vendors, one window, one law.**

**Our gap (verified at effect/v4 `80ee7c91`):** apps/web has **no transcript/message
renderer yet** — the only agent-view surface is `components/agents/RunDetail.tsx` (the
NEVR-624 context-receipt view); `apps/web/package.json` carries no
markdown/marked/micromark/remark or virtualization dependency (grep-verified). The
transcript surface is on the roadmap (§F of the lifecycle contracts already pins
layout stability); the content-bounds laws must exist **before** that renderer is
written — the F4/F5/F6/E5–E7/D2 pre-registration pattern.

**Work (docs-only, no app code):** extend §F of
`docs/design/agent-view-lifecycle-contracts.md` with the laws, each with precedent and
a pre-registered regression play in the house style:

1. **F7 — no body freezes the page that shows it.** However large or shape-hostile a
   body is, the surface that displays it stays responsive; ordinary long content
   (notes, logs to hundreds of KB) renders exactly as before.
2. **F8 — a formatting threshold bounds the parsed path.** Bodies over a named
   threshold render as plain text in a capped, self-scrolling block with a notice and
   a download affordance; the row-height estimate uses the same threshold, so the
   estimate and the render cannot disagree.
3. **F9 — long turns virtualize by the same bound.** A turn whose item count or byte
   size crosses the bound virtualizes (Paseo #8661's hundreds-of-tool-calls case).
4. **F10 — one bad entry degrades alone.** A malformed or corrupted entry renders as
   its own degraded row (id, diagnostic, delete-this-one) and never hides its siblings
   or breaks pagination (OpenHands #20013 — the D2 law's corrupted-row sibling).

*Regression plays:* (a) a 1 MB single-paragraph body with an unclosed `[` opens under a
named time budget and never blocks the main thread past the budget; (b) a body over the
threshold renders plain, capped, downloadable, and the list's height estimate matches;
(c) a turn with 300 tool calls opens virtualized with constant memory per frame; (d)
one corrupted entry in a list of fifty leaves forty-nine rendered and one degraded row
visible.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — ADOPT brief: dependency-aware dispatch laws for the board lane (pre-registration; docs-only)

**Precedent (verified this run):** Multica #10279 (MUL-8860, +2,401/−157, PR body
fetched): "Assigning an issue could start an agent before its prerequisites were
finished... Promoting a parked issue after its blockers ended could also start it
twice: an ordinary run completed before the next dependency scan, and the scan admitted
the same released work again." Their laws: blockers are computed (workspace-scoped
manual + stage siblings from current positions); **cycles rejected at write** (through
stages, parent/descendant, across moved subtrees); **the dependency release is
acknowledged in the same transaction as task creation** and the shared ready state
prevents a second dispatch after that run completes (an acknowledgement error rolls
back admission; reopening a blocker creates a new wait); **waiting/parked/closed rules
clear their due time instead of polling** and transactional changes rearm them; backlog
stays parked; **status stays under the person or agent's control**; completion wakes
the assignee, notifies a member, or *records that no usable assignee exists*; the
Waiting sidebar, blocked markers and Blocked filter make the state visible; private
blockers stay out of release timelines and inbox entries. GitHub (11-23, carried):
assigning an agent *is* a status transition and status changes are automation
triggers. The two-sided answer: machines write status; dispatch gates on dependency
truth.

**Our gap (verified at effect/v4 `80ee7c91`):** git grep over `packages/kaneo` +
`apps/web`: **zero blocker/blocked_by/dependency-surface concepts** (the only hits are
`package.json` and a fiber comment). The board lane (`BoardWorkspace.tsx`) exists
without dependencies, and the wakeup lane is the nearest seam.

**Work (docs-only, no app code):** pre-register the acceptance-line pack for the board
lane — pin it where the board/wakeup lane's design notes live (the roadmap's board
epic) so the laws exist before the dependency surface is filed:

1. **Admission acknowledges release.** A dependency release is acknowledged in the same
   transaction as task creation, and the acknowledged ready state is idempotent — no
   second dispatch after the run completes (Multica's double-start failure story).
2. **Cycles die at write.** Cycle and parent/descendant dependency attempts are
   rejected with a readable error at write time, including cycles through stage order.
3. **Waiting is a state, not a poll.** Blocked objects render a visible Waiting/
   blocked state with their blockers named; the wait clears on transactional events,
   not scans.
4. **Automation wakes, humans (and agents) steer.** Dependency completion may *start*
   the assignee's run; it never flips the object's status by itself — status stays
   under the person or agent's control.
5. **No assignee is an event.** A released dependency with no usable assignee records
   that fact (an event, a surface), never a silent no-op.
6. **Blocked visibility follows reader scope.** Blockers the reader cannot see are
   redacted from derived surfaces (release timelines, inbox) — the filed
   sharing-visibility law applied to the dependency graph.

*Regression plays:* (a) a blocker completing while a run is already active produces
exactly one follow-up run; (b) a cycle A→B→A is rejected at write with the cycle named;
(c) an object with a private blocker shows a redacted relation to an unauthorized
reader; (d) a released dependency with no assignee writes a no-assignee event and the
board shows it.

**Ready-to-file brief posted as an issue comment.**

### Proposal 3 — pre-registration pack (no new Stellarc surface; acceptance lines folded into standing rows)

- **Codex brief truncation (Multica #11648)** → the context-receipt row: delivered ≠
  loaded — a harness cap that silently truncates the brief (Codex `project_doc_max_bytes`,
  32 KiB, no marker) is either lifted per-thread or named in the receipt; a
  thread-scoped override is re-sent on **resume** because the harness does not persist
  it. Our instructions ride the ACP prompt seed today (runner.ts:367/666), so this is a
  law for the day a file-based brief path exists.
- **CLI autopilot deliveries (Multica #11633, MUL-10265)** → the agent-self-service
  law: every debugging read a skill/brief names must have a surface the agent can
  actually read through its sanctioned tooling — "an agent following the step either
  stalls or tries to work around the CLI."
- **Turn attribution after restart (Multica #11524, MUL-10147)** → the ordering-law
  row: a turn ends on the result of the prompt it wrote, never on a foreign command's
  result (Claude Code re-runs an interrupted turn on resume; the foreign `result`
  closed the turn and every reply landed one turn late).
- **MCP over stdin (Paseo #10698)** → the runner-honesty row: secrets never ride argv
  (`/proc/<pid>/cmdline` is world-readable; any local user becomes the agents'
  controller). Ours by construction — we spawn with env (runner.ts:423-426) and hand
  MCP over the ACP protocol — confirmatory, hold as a pinned law.
- **Loopback Host/Origin guard (OpenHands #20061)** → **ours by construction** at the
  gateway: exact-Host at the loopback ingress (main.ts:677-678), exact-Origin on
  browser routes (:143-144, 403 `origin_denied`), pinned URL origin (:202-203), CSP
  `frame-ancestors 'none'`, "forwarded identity/origin headers have no authority."
  Pre-registration: any future WS-upgrade or cookie-auth surface inherits the same
  exact-match gates; the stellarc-api CORS middleware's reflect-any default is
  dev-only (`NODE_ENV !== "production"` — main.ts:55-58) and dies if cookie auth ever
  lands.
- **Plugin sandbox launchers (Paseo #10786)** → the D11 plugin-transit reference row:
  one launch wrap covering agents, terminals and commands, fail-closed, workspace
  identity at create time.
- **Subagent visibility wording (Paseo #10887) + delegated finish semantics (#10864) +
  stopped-subagent restore (#9013)** → the filed sub-agent hierarchy brief: a tool
  description that invites agents to hide their children is a defect; "turn ended" ≠
  "child stopped" when background work is pending; a recorded stopped notification
  replays as canceled.
- **Desktop update pacing (Paseo #10882/#10901/#10785)** → the desktop update-honesty
  row: canary first, at most one check every 6h, 24h between updates, and a
  three-way choice (auto / notify / never).
- **Cost transparency (OpenHands #19424)** → the context-exhaustion row's cost half:
  an estimate is labeled as an estimate, an unpriced session shows `—` (never
  `$0.0000`), and the breakdown is attributable per model/usage id.
- **Git Sync activation locality (OpenHands #19925)** → the automation-lane row: the
  repository describes what an automation does, never whether it runs.
- **Devin Bots automation approval (Nov 24)** → the automation-lane row's
  agent-as-principal guardrail: an agent-saved automation can require a human's
  approval before it becomes live.
- **Devin MCP token-failure attribution (Nov 25)** → the failure-honesty law: a failed
  client-credentials exchange names the endpoint, status and error code; it never
  reports success.
- **Copilot code-review billing default (11-25)** → the attribution lane datapoint:
  the unchosen billing case lands somewhere named, on a date, with an exit.
- **Paseo #10862 (OMP ask forms as question cards)** → the approval-lifecycle row: a
  permission ask renders as an answerable card, never a hanging tool call.

---

Verification appendix (fetched 2026-11-26, window 11-24T19:00Z→11-26T19:00Z):
GitHub API — multica-ai/multica (meta 58,076★/pushed 11-26T18:59Z; release v0.13.0 with
full body; 157 PRs merged since 11-24 date-bound, 104 window-precise across both search
pages; bodies fetched for #10279, #11419, #11524, #11557, #11563, #11633, #11648,
#11656, #11662, #11669), getpaseo/paseo (meta 25,683★/pushed 11-26T18:56Z; release
v0.17.5 with full body; 67 window PRs; bodies fetched for #10786, #10887, #10864,
#9013, #8794, #10698, #10752), OpenHands/OpenHands (meta 94,409★/pushed 11-26T15:13Z;
release v1.46.0 with full body; 21 window PRs; bodies fetched for #19954, #20061,
#19424, #20013, #19925), makeplane/plane (meta 63,221★/pushed 11-26T14:32Z; v1.5.1
release body; 1 window PR), hcengineering/platform (meta 28,209★/pushed 11-09T14:14Z),
Factory-AI/factory (meta 105★/pushed 11-20T07:57Z; npm @factory-ai/droid 404;
docs/changelog ends 1-10.mdx, contents re-listed). Changelog pages: linear.app (newest
Nov 12; full page fetched, 2.0 MB), cursor.com (newest embedded date 2026-11-06),
devin.ai (newest Nov 25; both new entries parsed in full from their section anchors).
Copilot: github.blog changelog RSS with pubDates (one in-window entry, 11-25 22:18Z,
body read from the feed). Stellarc gaps: git grep at effect/v4 `80ee7c91` (subagent:
zero hits; blocker/dependency surface: zero hits in packages/kaneo + apps/web;
markdown/virtualization deps in apps/web: zero; transcript renderer: none — RunDetail
receipts only; gateway Host/Origin guards read at
apps/stellarc-gateway/src/main.ts:143/:202/:677; stellarc-api CORS middleware read at
apps/stellarc-api/src/main.ts:41-66; runner spawn/instructions read at
apps/stellarc-node/src/runner.ts:367/:423/:666). Dev HEAD `98e791f9`, effect/v4 head
`80ee7c91`.
