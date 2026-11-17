# Scout — Competitors, 2026-11-17

Beat: **competitors**. Delta window: 2026-11-16 19:00 UTC → 2026-11-17 19:00 UTC (~24h).
Every claim verified against the GitHub API (`gh api` — repo metadata, release tags + bodies,
a `search/issues` merged-window query per repo) or a fetched changelog feed (Linear, Cursor,
Devin, Copilot — github.blog label feed). Factory probed per the dead route rule (npm
registry + repo default branch + changelog dir; plus branch activity). Context: Stellarc =
self-hostable, inert control plane (v2 charter) + BYO-agent runtime over ACP;
`docs/steal-reject-matrix.md` and `docs/v2-charter.md` are the standing filters. Dev HEAD
this run: `46935792` (scout design 11-17); effect/v4 head `9505c63d` (unchanged since the
ADR 0015 step-1 merge; step 2 = #286 still open).

## The one-line read

**Two patch releases and a Microsoft Ignite burst.** Paseo **v0.16.1** (11-17 06:46Z, 15
merged PRs in window) ships the day's sharpest law — **#9927 "Keep the user's ask rules and
hooks in Claude Bypass"**: Bypass (auto-accept everything) was approving actions *without a
permission card* even when a `permissions.ask` rule or a hook returning `ask` explicitly
required one. An explicit ask must beat every broad auto-accept default. **Stellarc has this
bug class live today** (verified at effect/v4 `9505c63d`): `policyAllows`
(`apps/stellarc-node/src/runner.ts:219-226`) returns `true` for a **null policy** ("legacy
behaviour: everything auto-allowed"), and the `session_request_permission` handler
(`runner.ts:476-477`) answers `allow_once`/`allow_always` immediately — no park, no approval
transcript item, no operator card. A harness with agent-side ask rules (claude-agent-acp
`permissions.ask`, ask-returning hooks) escalates a permission request precisely because its
own policy demands a human decision; our null policy silently satisfies it. Today's ADOPT
brief (Proposal 1) adds the `ask` class that no default may short-circuit, plus an audit
trail for auto-allowed answers. OpenHands **v1.41.0** (11-16 20:46Z, 14 merged PRs) makes
**#19436 "choose the reasoning effort from what the agent reports"** a release feature — the
second vendor to ship agent-reported reasoning effort (Paseo #9717 on 11-15 feeds NEVR-309;
now fold this one too). **Copilot dropped a 10-entry Ignite burst dated Nov 17** — the ones
that matter for us: **code review "Adaptive"** (review depth matched to each PR — routine
changes get a quick pass), **Repository insights: review outcomes** (a closed loop on
whether review feedback actually landed — the review lane's honesty surface), **Copilot
Evals public preview**, and **agent-activity streaming into Microsoft Agent 365** (fleet
audit export). **Devin's Nov 16 entry** carries two UI-state laws: **"Mark done replaces
Archive"** — it moves a session to *your* Done folder while it keeps running and stays in
other subscribers' sidebars, "so you can clear your sidebar without stopping work others
depend on" (a dismissal is a view action, never a stop action) — and **an old Slack thread
too old to resume starts a new session instead of failing** (graceful degradation at the
resumability boundary). Multica: **55 merged PRs, no new tag** (v0.10.0 stands; head pushed
18:55Z) — highlights below. Plane: **28 more sweep PRs** past v1.5.0 (authz→input-validation
continuation). Linear quiet day 5 (newest still Nov 12), Cursor quiet day 11 (newest still
Nov 6), Huly 11th consecutive quiet day (frozen since 11-09), Factory route still dead
(default branch + changelog unchanged; npm never published — but ~8 docs branches pushed
today = weak pre-release signal). One no-gap verification: Multica #10788 "create retries on
the agent's current runtime" — our `claimOnce` already scopes claims to `agent.node_id`
(`packages/agents/src/store.ts:1309`), so a requeued retry can only land on the agent's own
node. Satisfied by design.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Paseo** | **v0.16.1 SHIPPED 06:46Z (15 merged PRs in window; pushed 18:44Z; 24,255★ (+77)).** Release notes + PR bodies verified. **#9927 keep the user's ask rules and hooks in Claude Bypass** — Bypass auto-accepted actions with NO permission card when a `permissions.ask` rule or an ask-returning hook required one; explicit asks survive every auto mode. **#9891 clear an OpenCode question when a new message replaces it** — a steer stranded an in-flight question unanswerable and undismissable; questions must remain answerable (or explicitly clear) across steering. **#10008 keep a Claude agent's process and background work when its effort level changes** — a config knob (reasoning effort) must not restart the session or kill background work. **#9931 show a Codex message canceled before it starts as canceled, not as a startup error** — terminal-state honesty at the cancel/startup boundary. **#9774 settle a stuck agent run after a repeated cancel.** #9926 agents archived while not loaded get the archive time as their last update (honest updatedAt); #9974 Import Session list stays in place when Load more fetches (the §A reader-anchor law, new surface); #9937 keep failed downloads inside the app; #9909 size controls by the primary pointer, not any touch screen; #9922 don't measure a filter row before it is laid out; #9903 keep workspaces reachable when sidebar nav overflows; #10010 create the workspace in the caller's directory when `--path` is relative; #10012 plugin-buttons release check reading an empty subscription id. | v0.16.1 2026-11-17 06:46Z | repo NOASSERTION, npm @getpaseo/* Apache-2.0, 24,255★ | 4 | **WATCH → ADOPT (brief vehicle: #9927)** | **#9927 is today's ADOPT brief** — our null-policy allow-all auto-answers harness-escalated asks today (Proposal 1). #9891 and #10008 fold into the 11-16 steering pre-registration (steering must not strand in-flight questions; config changes must not restart sessions). #9931 folds into the 11-15 failure-classification brief as an acceptance line (canceled-before-start ≠ startup error). |
| **OpenHands** | **v1.41.0 SHIPPED 11-16 20:46Z (14 merged PRs in window; pushed 18:04Z; 93,658★ (+62)).** Release notes verified. **feat(acp) #19436: choose the reasoning effort from what the agent reports** — the picker is built from agent-reported capabilities, not a hardcoded list (Paseo #9717's law, now two vendors). **fix(mcp) #19744: send the browser's backend URL as the MCP OAuth callback base** — OAuth callbacks must round-trip through the origin the user's browser actually used, not server-side config (self-host routing law). fix(conversations) #18367 delete all pages with one captured backend scope (scope-the-whole-resource); fix #19732 UUIDs without crypto.randomUUID on plain-HTTP (already pre-registered 11-14); #19745 automations dashboard grouped by tag; #19485/#18540 theme contrast/readability fixes; #19062 secure secret replacement (tracked 11-16). In-window post-release: **#19762 pick the exact connected git provider for repositories**; #19795 show relayed worker decisions + wrap board titles; #19817 close EnumFilterDropdown on Escape (keyboard-scope datapoint continues). | v1.41.0 2026-11-16 20:46Z | MIT, 93,658★ | 5 | **WATCH** | #19436 strengthens the NEVR-309 thinking-levels line: reasoning-effort options come from the agent's own report over ACP — our adapter seam should surface agent-reported effort levels, never a fixed list. #19744 pre-registers for any MCP OAuth lane: the callback base is the browser-visible origin. |
| **Multica** | **No new tag — v0.10.0 stands (55 merged PRs in window, head pushed 18:55Z; 56,470★ (+126)).** PR titles verified. **Agent-commit honesty: #10787 keep tracked runtime briefs out of agent commits** — platform-injected brief files were landing in the worktree and getting committed by agents. **#10788 create retries on the agent's current runtime** (affinity — we verified our claimOnce already enforces this via `agent.node_id`). **#10770 chat wakeups — come back to the conversation when dispatched work finishes (MUL-9439)**: the dispatched-work continuation loop. **#10778 mute status changes by default (MUL-9449)** — notification noise floor drops below content changes. **#10811 observe mode + per-workspace over-limit records (MUL-9481)** paired with **#10808 removing the issue-count limit** — hard limits became honest observability. **#10828 stop claim delivery deadlocking concurrent chat sends (MUL-9501)**; **#10801 serialize pending writes with runtime rebinding (MUL-9393)**. **#10836/#10780/#10841 Cursor MCP logins persist per agent across tasks** (login state scoped to the agent, not the task). #10772 invoke explicitly selected skills across chat AND issue comments; #10786 sub-issues in the issue sidebar; #10817 project folders (EE); #10746 bind custom runtimes to the selected machine; #10794 @squad mentions trigger only the leader; #10750/#10749 updater failure recovery + Windows arm64 downgrade guard; #10798 bound inbox read load; #10816 Codex credit balance trimmed to two decimals; #10523 selfhost first-run Postgres password plumbed to Compose; a GitLab-webhook cluster (#10810/#10809/#10796/#10559/#10411/#9485). | v0.10.0 2026-11-16 10:30Z stands | NOASSERTION, 56,470★ | 5 | **WATCH (steal surfaces)** | #10787 is an acceptance line for any future brief/context-file injection into worktrees (verified: our runner injects nothing — prompts ride ACP; no seam today). #10770 and #10778 fold into the delegated-subscriber notification pre-registration (return-to-conversation when dispatched work finishes; status changes muted by default). #10811/#10808 pattern: when Stellarc grows entitlements, over-limit = recorded + observed, never a silent wall. |
| **Plane** | **28 merged PRs in window (pushed 15:21Z; 62,600★ (+69)) — the authz→validation sweep continues past v1.5.0 stable.** PR titles verified. New classes beyond object-level authz: **#10317 cap outbound fetch response sizes** (SSRF-adjacent resource bound); **#10314 upload workspace exports as private objects** (storage ACL); **#10313 sanitize page description HTML on write + #10307 parse pasted editor HTML inertly** (stored-XSS pair); **#10302 omit the token from API token PATCH** (no secret echo on write); **#10301 eight-digit magic sign-in codes** (entropy); **#10300 enforce the OAuth provider enabled flag**; **#10318 derive CORS origins when none configured**. CI supply-chain trio: **#10298 pin third-party actions to commit SHAs, #10297 verify TLS in feature-deployment workflow, #10296 pass build-branch inputs through env**. Plus #10323/#10321/#10320/#10319/#10316/#10311/#10310/#10309/#10308/#10306/#10304 validation/scoping fixes; #9940 reject over-length intake names with 400 (fail-with-reason); #9941 deadlock in stack_email_notification. | v1.5.0 2026-11-16 stands | AGPL-3.0, 62,600★ | 4 | **WATCH (sweep continues)** | The 11-11 authz brief is resolved (v1.5.0); today adds adjacent acceptance lines for whenever Stellarc grows outbound fetches (webhooks): response-size caps, TLS verification, SHA-pinned CI actions, and no-secret-echo-on-write. Not a new brief — fold lines. |
| **Devin (Cognition)** | **NEW changelog entry November 16** (first since Nov 13). Verified from the entry body. **Subscribers + "Mark done replaces Archive"** — the sidebar now shows sessions you are subscribed to; Mark done moves a session to your Done folder *while it keeps running and stays in the sidebars of its other subscribers* — "clear your sidebar without stopping work others depend on." **Phonebook: one identity across connected services** — linked identities across Devin/Slack/Teams/git providers/Jira/Linear/Pylon; a Devin tool matches a person to their identities and a mention tags the person in both systems at once. **Tagging Devin in an old Slack thread starts a new session instead of failing** (too-old-to-resume → graceful fork, not an error). Session event search matches each word separately (any-order word matching). Session file editor saves on Cmd/Ctrl+S with unsaved-dot + save-confirmation + close-asks-first, and "Devin is told which files you saved so it can take your edits into account." Slack channel picker in the composer; Teams native @user mention writeback. | notes 2026-11-16 (newest) | proprietary | 5 | **WATCH (pattern → session-UX + channel laws)** | Three pre-registrations: (1) **dismissal is a view action, never a stop action** — clearing your surface never kills work other viewers depend on (sidebar = subscription list, not ownership); (2) **unresumable channel threads fork a new session with a link back, never error** (folds into the channel-adapter lane; our cross-channel continuation is already FORK-by-rule); (3) the file-editor loop — the agent is *told* which files the human saved, so human edits enter agent context explicitly. Phonebook = the identity-graph lane (cross-service person resolution) — watch. |
| **GitHub Copilot** | **10-entry Ignite burst, all dated Nov 17** (github.blog Copilot label feed, verified). **Copilot code review: "Adaptive" effort + secret detection** — review depth matched to each PR (routine changes get a quick pass) + secrets caught pre-merge. **Track code review outcomes in Repository insights** — a new page shows how Copilot review feedback *lands* per repository (accepted/dismissed/acted-on) = a closed loop on review comments. **Copilot Evals public preview** — evals over prompts/models/skills/tools. **Copilot Fusion updates** — new models, more surfaces, Terminal-Bench leaderboard results. **Monitor Copilot activity through Microsoft Agent 365** — agent audit events streamed into an external agent control plane. **GitHub Copilot app (Ignite)** — ADO repos + GHES + browser surfaces. **Copilot in JetBrains** — remote access, **on-device voice dictation**, browser-use controls, context-usage shortcuts. MAI Code 2 + MAI Code 2 Flash models; Copilot CLI Entra sign-in preview; secret scanning on demand for developers and agents. | changelog 2026-11-17 (10 entries) | proprietary | 5 | **WATCH (pattern → review/evals lanes)** | Review-outcome tracking is the review lane's honesty surface: a review comment's fate (applied/ignored/dismissed) is itself tracked data — pre-register for any Stellarc review lane. Adaptive effort = cost/depth matching per change class. Evals = the agent-config evals lane (watch). Agent-365 streaming = fleet audit export (watch). JetBrains on-device voice dictation = the voice lane's fourth vendor, second input-side datapoint (Multica #10572 was first). |
| **Linear** | **Quiet day 5** — changelog re-fetched; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. |
| **Cursor** | **Quiet day 11** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. |
| **Huly** | **Eleventh consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,137★ (+7). Adjacent: `hcengineering/huly-coder` (a lightweight autonomous coding agent TUI, 101★) exists but predates the freeze window; no movement tied to it. | platform trunk 2026-11-09 | EPL-2.0, 28,137★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Route dead (rule holds)** — npm `@factory-ai/droid` Not found (re-probed); default branch last commit still 11-11T23:50Z ("chore: pin patched Node.js security releases"); `docs/changelog` still ends `1-10.mdx`. **New signal:** pushed_at jumped to 18:51Z today — all on ~8 unmerged docs/CLI branches (`cli-args-audit/*` ×7, `ay/docs-terminal-bench-2-1`, `chore/update-jp-droid`) = docs work in flight, weak pre-release signal. **Last verified release: v1.9.0** (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | v1.9.0's fault-isolation lines stand as the record; branch-activity watch continues. |

## Proposals

### Proposal 1 — ADOPT brief: explicit-ask permission class — `ask` beats every auto default, and auto-allowed answers leave an audit item

**Precedent (verified, shipped in today's v0.16.1):** Paseo #9927 ("Keep the user's ask
rules and hooks in Claude Bypass"). Claude Bypass — the auto-accept-everything mode — was
approving actions **without a permission card** when a `permissions.ask` rule or a hook
returning `ask` explicitly required one. The shipped law: an explicit ask requirement
survives every broad auto-accept default; the card is emitted anyway.

**Our seam (verified this run at effect/v4 `9505c63d`):**

- `packages/agents/src/protocol.ts:67-76` — `PermissionPolicy` is `{ autoAllow: string[] }`
  only. There is no ask class anywhere in the policy.
- `apps/stellarc-node/src/runner.ts:219-226` — `policyAllows`: **a null policy returns
  `true`** ("A null policy preserves the legacy behaviour exactly: everything
  auto-allowed"); a non-null policy allows iff the tool matches an `autoAllow` glob.
- `apps/stellarc-node/src/runner.ts:476-477` — the `session_request_permission` handler:
  `if (policyAllows(task.agent.permissionPolicy, toolName)) return pickPermission(p.options)`
  — an allowed request is answered `allow_once`/`allow_always` immediately. No park, no
  approval transcript item, no operator visibility.
- The bug class, live: a harness with **agent-side ask rules** (claude-agent-acp
  `permissions.ask`, hooks returning ask) escalates `session_request_permission` precisely
  because its own policy demands a human decision. A null-policy agent in Stellarc
  auto-answers it. The host silently satisfies the agent's explicit ask — Paseo's #9927,
  in our tree, today. The same write path also has the adjacent edge: `pickPermission`
  with **no allow-kind option** in the request answers `cancelled` — silently rejecting a
  tool call no operator ever saw.
- Audit gap: a parked request writes an approval transcript item; an auto-allowed request
  writes only a `tool_call_update` — the trail cannot distinguish "policy allowed it" from
  "the harness never asked".

**Work:** (a) `PermissionPolicy` gains `ask: string[]` (same glob grammar, same
`toolMatches`); evaluation order is **ask > autoAllow > null-legacy** — a tool matching
`ask` parks unconditionally; an `ask`/`autoAllow` overlap on the same tool is a config
error surfaced at policy write time, never a silent allow. (b) Every auto-allowed answer
writes an approval transcript item (`status: "auto_allowed"`, `decidedBy: "policy"`) so
parks and auto-allows are distinguishable in the audit trail. (c) A request whose options
contain **no allow kind** parks for an operator instead of the silent `cancelled` answer —
a question with no auto-answer is a human question. (d) Keep the null-policy legacy
allow-all for agents with no policy (compat), but document it as the bypass mode it is, and
record its answers per (b). Tests: an agent-side ask rule escalated over ACP parks even
when the tool matches an `autoAllow` glob (the #9927 shape); `ask` ∩ `autoAllow` conflict
rejected at write time; auto-allowed request → transcript item present; no-allow-options
request → park, not silent cancel.
**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — pre-registration pack (no new Stellarc surface; acceptance lines folded into the standing rows)

- **Devin "Mark done" law → session-UX pre-registration (NEW):** a dismissal is a view
  action, never a stop action — clearing your surface never kills work other viewers
  depend on; the sidebar is a subscription list, not an ownership list. Folds into the
  session/agent-view lane.
- **Devin old-thread law → channel-adapter acceptance line (NEW):** a channel thread too
  old to resume starts a new session (with a link back) instead of erroring — graceful
  degradation at the resumability boundary; consistent with our FORK-not-edit rule.
- **Copilot review-outcome tracking → review-lane pre-registration (NEW):** a review
  comment's fate (applied/dismissed/ignored) is tracked, per-repo data — the review lane's
  honesty surface when one exists. Adaptive effort + Evals = watch lines.
- **Paseo #9891 + #10008 → steering pre-registration (fold):** steering must not strand an
  in-flight question (clear it or keep it answerable); non-destructive config changes
  (effort level) must not restart the session or kill background work.
- **Paseo #9931 → failure-classification brief (fold):** a send canceled before it starts
  reports `canceled`, never a startup/agent error — terminal-state honesty at the cancel
  boundary.
- **Multica #10770 + #10778 → delegated-subscriber notification pre-registration (fold):**
  return-to-conversation when dispatched work finishes; status changes muted by default.
- **OpenHands #19744 → MCP acceptance line (fold):** an MCP OAuth callback base is the
  origin the user's browser actually used, never server-side config.
- **Multica #10787 → acceptance line (fold, no seam today):** any future brief/context
  files injected into worktrees are excluded from agent commits (verified: our runner
  injects nothing — prompts ride ACP).

### Proposal 3 — no-gap verification (recorded, no brief)

Multica #10788 ("create retries on the agent's current runtime") — verified at effect/v4
`9505c63d`: `claimOnce` (`packages/agents/src/store.ts:1309`) claims only `WHERE
t.status='queued' AND a.node_id=${n.id}`, and `reapExpired` requeues without clearing the
agent binding — a retry can only be claimed by the agent's own node. The law is satisfied
by design; recorded so the next refactor of claim binding knows it is load-bearing.
