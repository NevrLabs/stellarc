# Scout — Competitors, 2026-11-12

Beat: **competitors**. Delta window: 2026-11-11 19:03 UTC → 2026-11-12 19:02 UTC (~24h). Every claim
verified against the GitHub API (`gh api` — repo metadata, release tags with full release-note bodies,
merged PRs with additions/deletions and merge timestamps, including post-release trunk commits) or a
browser-rendered changelog (Linear, Cursor, Devin — the markdown route — and Copilot via github.blog;
Factory via its machine-readable `/changelog/feed.json`). Context: Stellarc = self-hostable, inert
control plane (v2 charter) + BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and
`docs/v2-charter.md` are the standing filters. Dev HEAD this run: `74adc6f` (note: the lifecycle
contracts doc lives on open PR branches `agent/nevr-591` / `spike/auth-llmgw-maple`, not yet on dev —
INDEX references remain forward-looking; nothing here regresses them).

## The one-line read

The quiet giants broke their silence, and the day's two loudest structures are ones we already have
briefs for — plus one genuinely new surface. **Linear broke its seven-day streak** with **BYOK for its
cloud coding agent** (OpenAI/Anthropic/Bedrock/Azure/Foundry/OpenRouter/Vercel or any OpenAI-Responses /
Anthropic-Messages gateway; provider bills model usage, sandbox runtime stays on Linear credits) and
**five agent-transcript honesty fixes** — the headliners: coding sessions **show an error when the
sandbox fails to start or the agent doesn't start a turn "instead of looking busy"**, conversations
**keep following new output after you send**, and a **Latest button appears after scrolling up inside a
long reply**. **Plane shipped v1.5.0-rc2** (15:17:33Z): yesterday's 9-commit authz burst is now a
release, **plus new nested-scope lines** — restricted guests blocked from **assets of issues hidden
from them** (#10261: child-object visibility follows the parent's), `DynamicBaseSerializer` honoring
`fields=` allowlists (#10211: serialization-level scope), project cover uploads bound to URL workspace
+ admins (#10256). **Factory cut v1.9.0** (feed-dated 11-11 but first seen in today's read — the
metadata law again: read the feed, not the date) and it is a **fault-isolation masterclass**: one
invalid hook entry no longer disables the rest of the file *and is reported*; one failing hook keeps
the others' results; a Task no longer blocks the other calls in a Script run *and a failed run names
the Tasks it stopped*; **stopping a stalled session is answered instead of waiting behind an earlier
request that never finished**; **a tool call that will never run ends as interrupted on reload instead
of returning as pending**; hooks report the run's autonomy level and working directory **from the
first event**. **OpenHands cut v1.40.0** (14:22Z) and its post-release trunk landed the ACP line of
the week: **#19436 — choose the reasoning effort from what the agent reports** (+1,019/−121, effort
vocabulary capability-gated, switchable mid-conversation, survives model switches). **Devin's notes
gained a November 12 entry**: same-kind requests (credentials, approvals, network access) **merge
into one compact card** instead of a stack, and **MCP tool permissions** went per-tool
(Allow / Needs approval / Block, enterprise can limit tools to specific orgs). **Multica merged 37
PRs**: **two new harness adapters in one window** (Factory Droid #10399, Amp CLI #10477), the
**per-run context receipt** (#10426 — today's ADOPT brief below), and **#10329 — background runs and
workspace-wide reads kept inside private projects**, the async-lane authz line that extends
yesterday's Plane brief. **Paseo** shipped no release (v0.16.0-beta.2 stands) but merged **#9467 — a
failed ACP tool row no longer breaks agent history** (+70/−1). Two structures repeat across vendors
today, independently: **(1) fault isolation at every seam** — one bad item never disables its
siblings, and every such failure is named (Factory ×4, Paseo ×2, Multica #10450 refusal notices for
unavailable mention targets); **(2) work-starting paths re-check authorization** — Multica #10329
(wakeups, child-done, app decisions, delegated recovery all queued runs without the project check)
hours before Plane's rc2 shipped the same class for guests.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Linear** | **STREAK BROKEN — November 12 entry after seven quiet days.** **BYOK for the cloud coding agent**: bring your own key to Linear's agent — connect through OpenAI, Anthropic, AWS Bedrock, Azure OpenAI, Claude in Microsoft Foundry, OpenRouter, Vercel, **or any gateway supporting the OpenAI Responses or Anthropic Messages API**; the provider bills model usage directly while **sandbox runtime uses Linear AI credits** (split attribution); needs an API key, not a subscription; workspace admins enable it in Settings, all current plans. Five agent-transcript fixes, each a law: **queued messages over the length limit are truncated instead of showing a data error** (graceful degradation at the input seam); **agent conversations keep following new output after you send a message** (the follow-tail law — sending must not pin you to stale position); **coding sessions show the Latest button after you scroll up inside a long reply** (the live-tail affordance appears exactly when you leave the tail — reading-position family, third vendor in three days after gpui-kit #3922 and NSH 0.5.0); **non-image/video files attach to agent session messages** by drag or button; **coding sessions show an error when their sandbox fails to start or the agent doesn't start a turn, instead of looking busy** (status-display honesty — the exact NEVR-530 class). Also: exact-match commands outrank a same-titled issue; guests see Linear as loop-comment author; branch-prefix GitHub linking (`amy_ENG-123_fix`) fixed; SCIM-provisioned users mappable in imports; uppercase `.MP4` in synced Jira converts correctly; diff-with-session opens the session, not a blank chat; private-team loops read initiatives led by other teams. | changelog 2026-11-12 | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | BYOK is now table stakes at the agent-tracker layer (Copilot usage API 11-03, Paseo custom providers, Multica #10445 pricing, now Linear) — and Linear's **split billing** (model usage on your key, runtime on platform credits) is the attribution line for our BYOK usage schema: model spend and runtime spend are separately attributable. The five transcript fixes all fold into NEVR-530/live-status and the 11-12 reading-position brief. |
| **Plane** | **v1.5.0-rc2 TAGGED 11-12 15:17:33Z; preview trunk exactly at the tag (zero commits after).** The release ships yesterday's 9-commit authz burst (#10216 legacy file-asset POST rejected, #10214 active members as lead/assignee, #10213 search scoped to active members, #10207 page access on every live-collab socket, #10205 guests blocked from others' links/subscribers, #10212 legacy fields read-only, #10189 migrations lockfile, #10257/#10258 UI scoping) **plus six new lines**: **#10261 — restricted guests blocked from assets of issues hidden from them** (child-object visibility *derives from the parent's* — the deepest line of the sweep); **#10211 — `DynamicBaseSerializer` honors `fields=` allowlists** (serialization itself is a scope boundary: field selection cannot bypass policy); **#10256 — project cover uploads bound to the URL workspace and admins** (uploads inherit the URL's scope root); **#10259 — public module counts count issues, not state groups** (aggregate correctness on public surfaces); #10267 upload-status sync skipped on a destroyed editor (write to a dead target refused); #9818 AIO supervisor log dirs created on boot. Plus docs audit + deployment-script fixes (#10263/#10264), Dependabot closure (#10262). 62,367★ (+65). | v1.5.0-rc2 2026-11-12 | AGPL-3.0, 62,367★ | 4 | **TRIAL (stands; checklist shipped in a release)** | Yesterday's ADOPT brief (object-level authz sweep) gains three acceptance lines from rc2, clean-room from the changelog only: **child-object visibility follows its parent's** (an attachment is as visible as its issue), **serializer field allowlists are scope boundaries**, and **uploads bind to the URL's scope root + role**. Fold into the filed brief when picked up. |
| **Multica** | **No new tag (v0.8.2 11-10 stands); 37 merged PRs in window (search-cap), head pushed 18:49:58Z**; 55,881★ (+133). **Two new harness adapters in one window — the adapter seam keeps widening**: #10399 **Factory Droid harness** (+1,607/−8; discover a local Droid runtime, configure a Droid-backed agent, stream progress and final response with explicit failure/cancel/timeout outcomes — "reuse their installed runtime, instructions and skills") and #10477 **Amp CLI harness** (+1,394/−11; official execute-mode protocol, same registration/context/skill/lifecycle contracts, `MULTICA_AMP_PATH`/`MULTICA_AMP_MODEL`). **#10426 — per-run context receipt (daemon → server → transcript, +2,329/−27, merged 02:58Z)**: a record of which context sources the daemon handed a run, how big each was, how delivered, and **how sure we are the runtime actually loaded it**; **metadata only** — sizes, 12-char SHA-256 prefixes, workdir-relative paths, skill names, MCP server names; no source content, no MCP commands/URLs/env; shown in the run transcript dialog; explicitly the first step toward a context manifest *without prompt export* → today's Proposal 1. **#10329 — background runs and workspace-wide reads kept inside private projects (+1,073/−46, 05:51Z)**: issue wakeups, the child-done system wakeup, app decisions and delegated failure recovery queued runs **without the project check** foreground runs pass; a chat session linked to a private project kept passing title/description/resources to new runs after its creator left → the async-lane authz addendum (below). Scheduler: **#10463 — wake the runtime when an agent's concurrency cap changes** (+58/−0; raising `max_concurrent_tasks` now lets queued tasks start immediately). Transport: **#10469 — persist optional submission acceptance receipts** (+1,583/−24; a durable acceptance identity so retrying an uncertain chat submission never duplicates the user message + agent task). Usage: #10445 prices GLM-5.3, Kimi K3.1 Pro, Gemini 4 Carbon, Antigravity Claude effort ids (+364/−7; frontend table + Prometheus mirror kept in lockstep); #10415 runtime usage counts exactly the selected days. Fail-visible: **#10450 — refusal notices for `target_unavailable` mentions** (+40/−1; a malformed UUID, archived agent or missing squad now leaves a trace on the comment instead of stalling invisibly). #10461 Idle added to Agent status filter (+444/−44, saved-view support — the status vocabulary grows to running/idle). #10453 removes 69 unreachable Go functions (+21/−787 — the knip-class dead-code gate, server side). #10468 probes Hermes version via `acp --version`; #10478 model discovery preserved through confirmations; #10448 Qoder sessions tagged with the Multica source; #10465 repo checkout reused when run from inside itself; #10466 mise shim entrypoints preserved; #10458 completed-task TTL defaults 14d; #10246 install.sh no longer reports success when the version lookup failed; #10239 a schedule that never fires stores no next-run; #10351 linked PRs shown across issue layouts; #10356 confirmed inbox deletion; #10426-adjacent dev toolbar burst (#10442/#10470/#10492/#10508); #10443 desktop chat alerts + Dock counts restored. | trunk 2026-11-12 | proprietary (source-available repo), 55,881★ | 5 | **WATCH (steal surfaces)** | Four steals at Stellarc scale: the **context receipt** (Proposal 1 — the strongest new surface of the week, and our event log is the natural home); **async-lane authz** (#10329 — every path that *starts* work re-checks access; extends yesterday's filed brief); **submission idempotency** (#10469 — a durable acceptance identity per submission; our WS/REST seam has the same lost-response problem); **cap-change wake** (#10463 — config changes propagate to the scheduler immediately, no fallback-poll wait). Two adapters in one window is the BYO-agent breadth datapoint. |
| **Factory (Droids)** | **v1.9.0 (CLI + Desktop; feed item 0 — dated 2026-11-11 in the feed but absent from yesterday's 19:03Z read; fourth release in ~48h).** The release is a **fault-isolation sweep**: **one invalid hook entry no longer disables the rest of the file, and Droid reports it**; **one failing hook keeps the others' results** (a large message no longer stops a hook either); **a Task no longer blocks the other calls in a Script run, and a failed run names the Tasks it stopped** (isolation + attribution of what was lost). Control-plane responsiveness: **stopping a stalled session is now answered instead of waiting behind an earlier request that never finished** (user-initiated stop preempts the stuck queue). Reload honesty: **a tool call Droid will never run now ends as interrupted instead of returning as pending on reopen** (no zombie pending state across reloads). Record-at-birth: **hooks in an exec run report the run's autonomy level and working directory from the first event**; plugin hooks run with their own environment and arguments. Concurrency: **running many Tasks at once no longer fails on a separate limit, and new sessions keep room to start** (caps reserve start headroom). Also: transcript **keeps its place when the composer changes height** (resize-stability — the Section F family at a new seam); approved edits match the preview you saw; rewinding a moved file restores it; sign-in during an outage returns a temporary error instead of "sign in again" (error-class honesty); enterprise control history names every actor; editing a custom Droid keeps its tool restriction instead of granting every tool (**capability edits are narrow, never widening**); checkout kept when a commit lands during cleanup; Windows file-write lock fix; Sandboxed Script starts on Linux with sandbox tools outside default PATH; public API reference gives every operation a stable identifier and consistent error responses; **concurrent member changes can no longer leave an org without an Owner** (invariant enforcement); Open in Browser menu for links. | v1.9.0 (feed 2026-11-11, first seen 11-12) | proprietary | 5 | **WATCH (law source)** | Three lines graduate to brief-grade today: (1) **fault isolation** — one bad item never disables its siblings, and the failure is named (four independent fixes in one release); (2) **stop preempts** — a user stop is answered even while an earlier request hangs (our lease/queue family: stop is a control-plane operation, not queued behind payload work); (3) **no zombie pending on reload** — a state that will never be fulfilled renders as its terminal alternative (joins NEVR-530's display-honesty pair). Capability-edit narrowness joins the settings-parity law. |
| **OpenHands** | **v1.40.0 RELEASED 11-12 14:22:00Z** (fifth release in seven days; small, clean): #17194 improved Codex subscription auth guidance; **#19649 — messages at tied history-page boundaries kept from vanishing/duplicating** (yesterday's post-release trunk commit, now shipped — the fifth load-older-extreme datapoint); **#19382 — delayed echoes no longer delete newer drafts** (an out-of-order event must not clobber newer state — the ordering-law audit's exact class, now with a second vendor fix); #19682 the home model pick activates when a self-hosted instance turns Agent Profiles off (capability surfaces degrade coherently); **#19604 — a repository's real default branch used instead of assuming "main"**; #19685 Indonesian i18n for Codex keys; deps (mermaid 12.3, heroui 3.2.7, tanstack, lucide); #19109 review-artifact cleanup absorbed into release PRs. **Post-release trunk**: **#19436 — feat(acp): choose the reasoning effort from what the agent reports (+1,019/−121, merged 15:45:06Z)** — the effort vocabulary is capability-gated from the agent's own report, picked on the home page, **switchable mid-conversation, and the provider requests match each step across Claude Code and Codex logins**; #19670 verify-openhands scenarios beyond the happy path (map controls, browser timezone). 93,336★ (+92). | v1.40.0 2026-11-12 | MIT, 93,336★ | 5 | **WATCH (pattern → ACP capability line)** | #19436 is the NEVR-309 ACP-bump acceptance line of the week: **capability vocabularies (models, efforts, tools) come from what the agent reports, not a hardcoded list** — and mid-session switches re-resolve against the report. #19382 gives the ordering-law audit its second vendor confirmation (stale events may not delete newer drafts — same shape as Paseo #8396's stale-snapshot rule). #19604 is a small import-law: never assume the default branch. |
| **Paseo** | **No new release (v0.16.0-beta.2 11-11 stands); 6 merged PRs in window; 23,907★ (+95); pushed 17:57Z.** **#9467 — a failed ACP tool no longer breaks agent history (+70/−1)**: when an ACP agent reports a failed tool call with no output, the adapter emitted `status: "failed", error: null`, and the client history schema requires a failed tool to carry an error — **one such row made the whole history render-fail** (fault isolation at the transcript seam, hours after Factory shipped the same law for hooks). **#9426 — OpenCode V2 tools discovered from bound session catalogs (+170/−6)**: discovery read the global manifest while filtering/execution used the session catalog — **capability discovery must read the catalog the session will actually use** (the capability-source law; joins OpenHands #19436 today). #9477 — workspace scripts kept when `paseo.json` checks are slow (+139/−12): a slow config read no longer drops a workspace's scripts to "none" (a timeout is not a negative answer — fail-open on slow reads of additive config). #9483 Mermaid axis overlap/clipping (+132/−3); #9407 physical arrow keys restored in Android terminals (+198/−45); #9409 composer-recall browser journey (test). | trunk 2026-11-12 | repo NOASSERTION (npm @getpaseo/* declares Apache-2.0), 23,907★ | 4 | **TRIAL (stands)** | #9467 is the transcript-schema acceptance line for us: **our item renderer must tolerate every legal-but-partial item shape** (failed-without-error, empty output) — one malformed row may not take down the history view; pin with a fixture test per ItemKind. #9426 + OpenHands #19436 together set the capability law: discover from the source the session will use, gate by what the agent reports. |
| **Devin (Cognition)** | **Notes gained a November 12 entry** (new since yesterday's read, which saw Nov 9). **Same-kind requests merge into one card**: when Devin asks for several things of one kind at once (credentials, approvals, network access), they appear together in one compact card instead of a stack (approval batching). **MCP tool permissions**: every MCP tool set to **Allow / Needs approval / Block** from Customize, and enterprise admins can limit individual tools to specific orgs (per-tool, three-state, admin-scoped). **Enterprise-disabled agent modes are shown** with an explanation of who can enable them (capability restrictions are visible, not silent). **Login page explains IP-allowlist denials** including the user's current IP (refusal names its reason). Seven more optional GitHub permissions enterprise admins can revoke individually. Personal secrets shared with service users get an approval path. Security lane: findings each get their own chat; finding status changes undoable (Undo/Cmd+Z); org-wide tag deletion; named Custom connections; multi-connection scan sync (Veracode + Black Duck closed beta, write-back mitigations). Sessions: repo file links render as pills (file, lines, commit — not raw URLs); "Reminder set" rows with schedule + link (self-reminders are visible session facts); drag a session by its pane header; **folder attach no longer fails when one file can't be read — the rest attaches and you're told what was left out** (partial success + named omission); network-policy upload blocks say why. Review: redesigned page for all orgs; auto-fix setting split from Responding to bots. Integrations: mention-only Slack thread mode; archiving a session archives its Slack code channel; Teams edits render in place; working status shown immediately on @mention. Automations: readable schedules on cards ("Weekly on Thursday at 6:00 PM…" instead of raw RRULE); oncall notifications open the report. | notes 2026-11-12 | proprietary | 5 | **WATCH** | Approval batching joins the approval-lifecycle cluster (with Paseo #8548-#8585, Devin's own Deny button): **N simultaneous asks of one kind are one decision surface, not N cards**. MCP per-tool three-state permissions extend our `PermissionPolicy.autoAllow` globs (protocol.ts:64) — the toolgw spike's durable tool approval is the natural home. "Disabled but shown" and "refusal names its reason" are two more lines for the settings-parity and error-specificity laws. |
| **GitHub Copilot** | Changelog unchanged — newest entries still **Nov 10** (Gemini 4 Carbon; GitHub App seat management; C++ MSBuild auto-config); **second consecutive quiet day**. Carried: usage-metrics API additions (code review details, telemetry/version-gap flags, BYOK breakdowns), impact dashboard across nine experiences. | changelog 2026-11-10 | proprietary | 5 | **WATCH (pattern)** | Nothing new; the BYOK usage-API row gains Linear's BYOK launch as confirmation (below). |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents**; **sixth consecutive quiet day**. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **Huly** | **Sixth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z, zero commits in window; 28,107★ (+14). | platform trunk 2026-11-09 | EPL-2.0, 28,107★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |

## Proposals

One new ADOPT brief clears the bar; one filed-brief addendum; six standing addenda.

### Proposal 1 (ADOPT) — per-run context receipt on the event log

**Precedent (verified from the PR body, `gh api`):** Multica **#10426 — "per-run context receipt
(daemon → server → transcript)"** (+2,329/−27, merged 11-12 02:58Z). A receipt records **which context
sources the daemon handed a run, how big each was, how they were delivered, and how sure the plane is
that the runtime actually loaded them** — shown in the run transcript dialog, and explicitly the first
step toward a full context manifest **without prompt export**. The privacy shape is the design:
**metadata only** — sizes, 12-char SHA-256 prefixes, workdir-relative paths, skill names, MCP server
names; **no source content, no MCP commands, URLs or env**.

**Gap (Stellarc, verified on dev HEAD 74adc6f):** the plane already *knows* everything a receipt needs,
and records none of it. `task-started` carries `{id, attempt, nativeSessionId}` and nothing else
(`packages/agents/src/store.ts:1276`); the runner hands the session its MCP servers
(`apps/stellarc-node/src/runner.ts:537`), seeds instructions (`:579`), composes a prior-attempt
context digest on resume (`:312-315`), and already receives `contextTokens`/`contextWindowSize` per
usage update over the unstable ACP extension (`:143-150`) — but no event enumerates what a given
attempt actually received. grep-verified: zero hits for receipt/manifest concepts outside a passing
mention in the steal-reject matrix. For an inert control plane whose entire value is *being the record*,
"what did this run see?" is currently unanswerable.

**Brief (ready to file):**

- **Problem.** Stellarc records what a run *did* (transcript items, usage, pushes) but not what it
  *received* — instructions, prompt, resume digest, MCP servers, any plane-composed context. When a
  run behaves unexpectedly, the first question ("what context did it have?") has no answer in the log;
  nothing supports context debugging, cost attribution per source, or a future context manifest.
- **Work.**
  1. New event `context-receipt` (or an extended `task-started` payload — follow the store's event
     idiom), appended by stellarc-node in the same transaction as session start, one row per context
     source: `kind` (instructions | prompt | resume-digest | mcp-server | file | other),
     `name` (skill/MCP server name or workdir-relative path), `bytes`, a 12-char SHA-256 prefix,
     `delivery` (inline | reference), and a `confidence` field for "did the runtime load it"
     (seeded | referenced | unknown).
  2. Schema-enforced metadata-only: the event type carries no content fields and no MCP
     commands/URLs/env — the Multica privacy shape, in the DTO layer.
  3. Project it: per-task/attempt receipt in the store views; surface it in the run detail
     (transcript dialog equivalent in apps/web).
  4. Tests: every attempt emits a receipt; a receipt survives replay; a fixture asserts no content
     field can be added without failing a schema test.
- **Acceptance.** Every task attempt on a dev instance has a queryable context receipt; the UI shows
  it on the run; a redaction/privacy test proves metadata-only; replay renders receipts from the log
  alone.
- **Scope guard.** The node records only what it already composes — no harness changes, no file
  hashing beyond what the node already reads, no new dependencies, no capture of harness-internal
  context (that waits for ACP growth, NEVR-309).

### Addendum — the async lane gets authorization (extends yesterday's filed authz brief)

Multica **#10329** (+1,073/−46, merged 05:51Z): *issue wakeups, the child-done system wakeup, app
decisions and delegated failure recovery all queued runs **without** the project check foreground
runs pass*, and a chat session linked to a private project kept passing the project's title,
description and resources to new runs **after its creator left**. Plane rc2 hours later shipped the
same class for guests (#10261 assets follow parent issue visibility). Fold into the filed
object-level-authorization brief as a third acceptance class: **every path that starts work re-checks
access at start time** — wakeups, scheduled/requeued runs, chat-linked continuations, delegated
recovery — not only the interactive paths; and **membership changes take effect on the next run, not
the next session**.

### Addendum — status-display honesty, four vendors in one day

Linear: sessions show an error when the sandbox fails to start or the agent doesn't start a turn
**"instead of looking busy"**; conversations **keep following new output after you send**; a
**Latest** button appears once you scroll up in a long reply. Factory: **stop is answered** instead of
waiting behind a request that never finishes; a tool call that will never run **ends as interrupted on
reload instead of returning as pending**. OpenHands #19649 ships the tied-boundary pagination fix.
These accumulate into NEVR-530 (live-status contract) and the 11-12 reading-position brief — no new
brief needed; the Latest-button line is the reading-position brief's "explicit scroll-to-latest
affordance" confirmed at a third vendor.

### Addendum — fault isolation at every seam (today's loudest law)

Factory v1.9.0 (×4: invalid hook entry, failing hook, Task-in-Script, hooks with large inputs — one
bad item never disables its siblings, and the failure is named, including *naming the Tasks a failed
run stopped*); Paseo #9467 (a failed ACP tool row no longer breaks the whole history render — the
adapter now satisfies the schema, +70/−1); Paseo #9477 (a slow config read no longer drops a
workspace's scripts — a timeout is not a negative answer); Multica #10450 (`target_unavailable`
mentions leave refusal notices — the failure is visible on the artifact). Law shape: **one bad item
never disables its siblings; every such failure is named, and what was lost is listed.** For us:
a transcript-schema acceptance line — the item renderer tolerates every legal-but-partial ItemKind
shape (failed-without-error, empty), pinned by fixture tests per kind.

### Addendum — capability vocabularies come from the running source

OpenHands #19436 (+1,019/−121, post-release trunk): reasoning effort chosen **from what the agent
reports**, switchable mid-conversation, provider requests matching at every step. Paseo #9426:
OpenCode V2 tool discovery reads the **bound session's catalog**, not the global manifest. Factory:
hooks report the run's autonomy level and working directory **from the first event**. Multica #10463:
a concurrency-cap change **wakes the runtime** immediately. Devin: enterprise-disabled agent modes
are **shown with an explanation**. One law, five faces: **capability sets are read from the source
that will execute them, gated by the actor's report, propagated the moment they change, and visible
even where withheld.** Feeds NEVR-309 (ACP capability reporting), our PermissionPolicy surface, and
the scheduler's config-propagation lines.

### Addendum — submission idempotency receipts (transport law, second of the family)

Multica #10469 (+1,583/−24): an optional durable **acceptance identity** per chat submission, so a
client that never saw the HTTP response can retry the *logical* submission without duplicating the
user message and the agent task. Joins yesterday's usage-attribution-transport law as the second
member of the family: **exactly-once facts over an at-least-once transport need a durable identity
issued at acceptance.** Our WS/REST seam has the same lost-response window; pre-register for the
apps/web send path.

### Addendum — BYOK is now a tracker-layer feature (convergence)

Linear's BYOK launch (admin-enabled, all plans, any OpenAI-Responses/Anthropic-Messages gateway) with
**split attribution** — provider bills model usage, platform credits bill the sandbox runtime — joins
Copilot's BYOK usage-API rows (11-03), Paseo's custom providers, and Multica's per-model pricing
table (#10445: GLM-5.3, Kimi K3.1 Pro, Gemini 4 Carbon, Antigravity effort ids — frontend and
Prometheus mirror in lockstep). Two lines for our BYOK usage-attribution schema: **gateway
compatibility is the integration surface** (Responses/Messages-shaped endpoints, not per-vendor
OAuth), and **model spend and runtime spend are separately attributable line items**.

### Addendum — harness-adapter breadth (BYO-agent datapoint)

Multica added **two harness adapters in one window** — Factory Droid (#10399, +1,607/−8, "reuse their
installed runtime, instructions and skills") and Amp CLI (#10477, +1,394/−11, execute-mode protocol,
`MULTICA_AMP_PATH`/`MULTICA_AMP_MODEL`) — plus Qoder session-source tagging (#10448), Hermes version
probing via `acp --version` (#10468), and model discovery preserved through confirmations (#10478).
The field's answer to harness diversity is adapter-count velocity with **shared registration, context
and lifecycle contracts** — exactly Stellarc's adapter-seam design; the per-adapter acceptance lines
(discovery probe, explicit failure/cancel/timeout outcomes, source tagging) are the checklist for
every adapter we add.
