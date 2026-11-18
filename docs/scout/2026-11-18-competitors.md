# Scout — Competitors, 2026-11-18

Beat: **competitors**. Delta window: 2026-11-17 19:00 UTC → 2026-11-18 19:00 UTC (~24h).
Every claim verified against the GitHub API (`gh api` — repo metadata, release tags + full
bodies, a `search/issues` merged-window query per repo, PR bodies for the load-bearing
items) or a fetched changelog feed (Linear, Cursor, Devin, Copilot — github.blog page +
RSS with exact pubDates). Factory probed per the dead-route rule (npm registry + default
branch + changelog dir). Context: Stellarc = self-hostable, inert control plane (v2
charter) + BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and
`docs/v2-charter.md` are the standing filters. Dev HEAD this run: `5daf3b91` (scout design
11-18); effect/v4 head `9505c63d` (frozen day 3; ADR 0015 step 2 = #286 still open).

## The one-line read

**Three patch releases in one window, and Multica shipped the week's sharpest UI-perf law
set.** **Multica v0.11.0** (11-18 10:00Z; 46 merged PRs in window) carries the
**MUL-9538 deep-link family** — #10910 "a deep link's first frame renders only its
target" (landing mounts the header + target thread; sidebar/composer/rail mount after the
target paints, overscan grows back in idle steps), **#10874 "land deep links on the
target without mounting the history"** (Virtuoso's uniform height estimate made landing
on row 32 mount items 1–53 — a single ~560ms task, **1,512ms on the reporter's real
issue** — fixed by content-derived height estimates), and **#10860 "find in a long issue
without rendering its history"** (opening Ctrl+F swapped the virtualized timeline for a
flat render of every comment: **2,405ms to the bar, a 2,062ms main-thread task, visible
text 6.9k→101.3k chars**; find now stays virtualized, matches come from reduced
Markdown text, stepping to an unmounted match lands it like a deep link). This is
today's ADOPT brief (Proposal 1): pin **E5–E7 navigation open-path laws** into
`docs/design/agent-view-lifecycle-contracts.md` — docs-only, the exact F4/F5/F6
pre-registration pattern, before apps/web has the surface (grep-verified: zero
deep-link/scroll-to-comment code in apps/web/src at `9505c63d`). **Paseo v0.16.2**
(14:47Z; 30 merged PRs) ships steering's missing half — **#10028 "let a steered message
wait out a Claude compaction instead of cancelling it"** (steering may never destroy the
very context it is joining — third datapoint in the steering law after #9757 queue-until-
turn-ends and Multica #10715 non-interrupting default), plus **#10022 background work
reported from `get_agent_status`/`list_agents`** (the background-work chapter's API
half: the inventory is a first-class status field, not UI chrome) and #10097 heartbeats
shown/stopped in background tasks. **OpenHands v1.42.0** (16:36Z; 14 merged PRs) is
modest: #19762 pick the exact connected git provider, **#19756 every run gets a
non-loopback plain-HTTP origin** (the crypto.randomUUID self-host class promoted from
bug-fix to feature), #19600 native webhook source validation restored; **#17820
"virtualize the conversation message list" merged 16:34Z — 11 min after the release-PR
merge, absent from the release body → rides v1.43.0**. **Copilot**: two genuinely
in-window entries by RSS pubDate — **GPT-6.2 Astra and GPT-6.2 Sol** (11-17 20:20Z,
model-catalog churn continues) and **"Customize GitHub Copilot for your team"** (11-18
16:00Z, GA: team-default Agent Plugins with individual < team < org precedence, policies
win). Catalog correction: the Nov-17 Ignite set is **14** entries, not 10 — browser-use
public preview (Chrome extension pairing in CLI/app/VS Code/JetBrains), a benchmarks
site, and a MAI-Code-1.1-Flash deprecation were pre-window hours missed yesterday.
**Plane's sweep STOPPED** — 1 merged PR (#9942, an S3Storage `super().__init__()` fix)
against yesterday's 28. Huly frozen day 12; Linear quiet day 6 (newest still Nov 12),
Cursor quiet day 12 (still Nov 6), Devin quiet day 2 (still Nov 16). **Factory moved**
— two docs commits on the default branch (11-17 19:10Z/19:53Z, "document Microsoft MXC
sandbox on Windows"), the first default-branch movement since 11-11; docs-only, npm
still never published, changelog still ends 1-10.mdx.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **v0.11.0 SHIPPED 11-18 10:00:39Z (46 merged PRs in window; head pushed 19:02Z; 56,598★ (+128)).** Release body + PR bodies verified. **THE DEEP-LINK LAW SET (MUL-9538):** #10910 a deep link's first frame renders ONLY its target (overscan held at viewport during landing, grows back 0→200→400→800px one idle period at a time; sidebar/composer/rail mount after the target paints; applies only when data is already in hand); #10874 land on the target WITHOUT mounting the history (content-derived row-height estimates from wrapped-lines/chrome counting, fitted to ~10% — the uniform-estimate "measure everything from row 0" defect: ~560ms task seeded, 1,512ms real-world); #10860 Ctrl+F never de-virtualizes the timeline (matches computed from reduced Markdown per row, folded/collapsed threads contribute their collapsed text, stepping to an unmounted match uses the deep-link landing path, DOM stays the highlight source of truth); #10920 reuse + fully prefetch route payloads. **Run-honesty pair: #10858 tell the caller why an issue write started no run + #10857 log it** — an issue update returned the same 200 whether or not a run started; agents then claimed "the assignee is working on it" while no run existed (issue #10845); fix = `run_outcome {target_type, target_id, status, reason_code}` on the write response, mirroring the comment path's `trigger_outcomes`. **#10859 leave the parent's session behind when a retry changes runtime** — a provider session stays attached to the runtime that recorded it; a retry on a different runtime starts without one (verified no-gap in our tree, Proposal 3). **#10896 keep every page's scroll position across Desktop tab switches** (reading-position law, ~sixth vendor datapoint). #10904 CLI distinguishes incomplete responses from unreachable servers (failure classification); #10908 report runtime version probe timeouts; #10846 release execution capacity while Direct tasks wait for a directory; #10859+#10788 the retry-affinity pair complete. #10819 paid-feature restrictions with read-only downgrade; #10861 CLI inbox management, owner-gated writes; #10921 a test walking EVERY /api/inbox route for the owner gate; #10922 issue sidebar on floating cards; #10924 dev-fixtures task kind (a fixture that holds a running agent task); #10774 target-agent skills in the comment slash menu; #8918 an @agent mention of the assigned squad's leader runs as a leader task. | v0.11.0 2026-11-18 10:00Z | NOASSERTION, 56,598★ | 5 | **WATCH → ADOPT (brief vehicle: MUL-9538 #10910/#10874/#10860)** | The deep-link family is today's ADOPT brief (E5–E7, Proposal 1) — the open path's navigation half pinned before apps/web grows it. #10858 pre-registers the why-no-run law for any future issue-write→run trigger surface (grep-verified: no such seam today). #10896 folds into the reading-position row; #10904/#10908 fold into failure classification. | 
| **Paseo** | **v0.16.2 SHIPPED 11-18 14:47:21Z (30 merged PRs in window; pushed 18:52Z; 24,373★ (+118)).** Release body + PR titles verified. **#10028 a steered message waits out a Claude compaction instead of cancelling it** — steering joins a turn; it may never destroy the context it is joining (the steering law's third leg with #9757 + Multica #10715). **#10022 MCP agent status and list responses omitted background work for idle agents** — `get_agent_status`/`list_agents` now report the background-work inventory: the §G chapter's API half, the inventory is queryable state, not UI chrome. **#10097 show and stop Paseo heartbeats in agent background tasks** — scheduled heartbeats join the background-work inventory with per-item Stop (extends the #9744 runtime-consult law's observable class). **#9847 saved hosts disappeared when one stored entry could not be read** — list isolation: one unreadable entry must never hide the whole list. **#10092 a finished reply stays visible when a background-task notification lands between turns** (Collapse turns was hiding it — transcript honesty). **#9723 the prompt and whole reply survive an empty chat reconnecting mid-reply** (reconnection is catch-up, not amnesia — third vendor for the law). **#10067 Desktop updates replace Desktop's own daemon after relaunch** (updater: the app never leaves an older self-started daemon running). **#10035 Desktop reloads when its renderer exits** (renderer death = visible reload, not a blank window). #10113 Hub daemons stay connected after execution-permission changes; #10126 allowing a tool approval approves it when OMP offers session/grant choices (approval-choice semantics); #10009 detached worktree commits preserved when archiving a workspace; #10020 worktrees created in large repos without scanning every ignored file; #9841 thinking selector follows OMP's own level changes (derived-state-at-read, again); #9774 agents unstuck after a second Stop when the provider reuses the cancelled turn ID; #10010 `--path` resolves to the caller's directory. | v0.16.2 2026-11-18 14:47Z | repo NOASSERTION, npm @getpaseo/* Apache-2.0, 24,373★ | 4 | **WATCH (fold lines)** | #10028 folds into the steering pre-registration (now three legs: queue-don't-interrupt, non-interrupting default, wait-out-compaction). #10022/#10097 extend the §G background-work chapter (API half + heartbeat class). #9847 = list-isolation acceptance line; #9723 = reconnection catch-up; #10035/#10067 fold into the desktop lifecycle-honesty bundle; #10126 into the approval cluster. | 
| **OpenHands** | **v1.42.0 SHIPPED 11-18 16:36:17Z (14 merged PRs in window; pushed 18:09Z; 93,757★ (+99)).** Release body verified. **feat #19756 (verify-openhands): every run has a non-loopback plain-HTTP origin** — the plain-HTTP self-host class (crypto.randomUUID SecureContext, 11-14) promoted from bug fix to enforced feature: every run gets a reachable non-loopback origin. **feat #19762 pick the exact connected git provider for repositories** (post-v1.41, in release). fix #19600 restore native webhook source validation (reverted-then-restored — the webhook lane's validation must survive refactors); fix #18583 clipboard fallback when the Clipboard API is unavailable; #19817 Escape closes EnumFilterDropdown (keyboard scope continues). 8 dependabot chores + 2 docs(verify) mappings. **In-window post-release: #17820 "perf(chat): virtualize the conversation message list" merged 16:34:40Z — 11 minutes AFTER the release PR #19819 (16:23:12Z) and absent from the v1.42.0 body → rides v1.43.0** (the transcript-virtualization lane's second vendor after Paseo #9664, and the biggest: a whole conversation list). | v1.42.0 2026-11-18 16:36Z | MIT, 93,757★ | 5 | **WATCH** | #19756 strengthens the self-host acceptance line (a reachable non-loopback plain-HTTP origin per run is a feature, not a caveat). #19600: webhook source validation must be regression-tested, they lost and restored it. #17820 (v1.43.0) is the virtualization lane's datapoint to watch. | 
| **GitHub Copilot** | **Two entries IN WINDOW by RSS pubDate** (github.blog Copilot label feed, exact timestamps verified). **GPT-6.2 Astra and GPT-6.2 Sol now available** (11-17 20:20:29Z) — the model catalog churns weekly at the top end now. **Customize GitHub Copilot for your team** (11-18 16:00:13Z, GA for org teams) — team maintainers/org owners set approved Agent Plugins as TEAM DEFAULTS: browse marketplaces (built-in, enterprise, team-added GitHub-repo marketplaces), plugins enabled by default for DIRECT members only (child teams don't inherit), members can turn a team plugin off where policy permits, **enterprise/org policies always win** — a three-tier precedence: individual < team < org. **Catalog correction:** the Nov-17 Ignite set is 14 entries, not yesterday's 10 — missed pre-window hours: **"Let GitHub Copilot interact with your browser"** (browser-use public preview via the Chrome extension, paired with computer use, in CLI/app/VS Code/JetBrains, extension-managed permission levels), a Copilot benchmarks site with harness comparisons, and the MAI-Code-1.1-Flash December deprecation. | changelog 2026-11-18 (newest) | proprietary | 5 | **WATCH (pattern → plugin-precedence + model-churn lines)** | Team-default plugins = the config-precedence law (individual < team < org, policies win) — pre-register for the ADR 0015 app-registry lane when per-team config surfaces. Browser-use preview = the computer-use lane's fourth vendor; rides the harness, so our tool/permission policy would govern it (watch). GPT-6.2 Astra/Sol: BYO-agent model churn is weekly — never hardcode a catalog (already our law). | 
| **Plane** | **THE SWEEP STOPPED — 1 merged PR in window (#9942, merged 13:05Z; pushed 13:05Z; 62,704★ (+104)) vs yesterday's 28.** #9942: call `super().__init__()` in S3Storage so `location` is set — a storage-backend initialization defect (an omitted super call left location unset; the class looked configured and wasn't). v1.5.0 (11-16) stands. | v1.5.0 2026-11-16 stands | AGPL-3.0, 62,704★ | 4 | **WATCH (sweep concluded)** | The authz→validation sweep that produced the 11-11 brief's acceptance lines has concluded; today's single PR is a mundane-but-instructive class: a configured-looking object whose init silently skipped — "constructor must actually run" is the base class of the fail-visible law. No new brief. | 
| **Devin (Cognition)** | **Quiet day 2** — devin.ai/changelog re-fetched; newest entry still **November 16** (Subscribers + Mark done; Phonebook; old-thread fork). | notes 2026-11-16 (newest) | proprietary | 5 | **WATCH** | Nothing new; the 11-17 pre-registrations (dismissal-is-a-view-action, unresumable-thread fork) stand. | 
| **Linear** | **Quiet day 6** — changelog re-fetched; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; the BYOK split-attribution row stands. | 
| **Cursor** | **Quiet day 12** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new; the voice pre-registration stands. | 
| **Huly** | **Twelfth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,144★ (+7). | platform trunk 2026-11-09 | EPL-2.0, 28,144★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. | 
| **Factory (Droids)** | **Default branch MOVED (docs-only)** — two commits in window: 74ae7347 11-17T19:10Z "docs(cli): document Microsoft MXC sandbox on Windows" + merge a557958d 19:53Z (#104 emily/update-os-sandboxing-docs) — the first default-branch movement since 11-11, continuing the docs burst yesterday's branches foreshadowed. npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` still ends **1-10.mdx**. No release entry. **Last verified release: v1.9.0** (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | The docs burst (OS sandboxing on Windows = MXC) reads as pre-release platform documentation; keep the branch watch. v1.9.0's fault-isolation lines stand as the record. | 

## Proposals

### Proposal 1 — ADOPT brief: navigation open-path laws E5–E7 (a deep link lands on its target, first frame final, history unmounted; find never de-virtualizes)

**Precedent (verified this run, PR bodies + release body):** Multica v0.11.0's MUL-9538
family — #10910 (a deep link's first frame renders only its target; overscan held during
landing then grown back in idle steps; off-path chrome mounts after the target paints),
#10874 (landing mounts only the rows around its target via content-derived height
estimates — the uniform-estimate defect mounted items 1–53 to reach row 32, one ~560ms
task, 1,512ms real-world), #10860 (Ctrl+F froze the page 2,405ms by flattening the
virtualized timeline; find now stays virtualized, matches from reduced per-row text,
stepping to an unmounted match lands it through the deep-link path), #10920 (route
payloads reused and prefetched). All shipped in v0.11.0 (10:00Z).

**Our gap (verified at effect/v4 `9505c63d`):**

- `docs/design/agent-view-lifecycle-contracts.md` §E "Perf shape of the open path"
  carries E1–E4 (defer inactive panels; metadata on selection; keyed rows; snapshot
  identity). **No navigation law exists** — nothing pins what a deep link (notification →
  issue → comment) may mount, and nothing pins in-page find.
- apps/web has **zero deep-link surface today** (git grep `deep.?link|scrollToComment|
  scrollIntoView` over apps/web/src at `9505c63d`: no hits) — which is exactly the F4/F5/
  F6 situation: pin the law BEFORE the surface exists, so the first implementation
  inherits acceptance lines instead of retrofitting them.

**Work (docs-only, no app code):** pin three laws into §E of
`docs/design/agent-view-lifecycle-contracts.md` on effect/v4, each with precedent +
pre-registered regression play in the house style:

- **E5 — A deep link's landing frame renders its target, not its neighborhood.** The
  first frame after a navigation paints the view header and the target item only;
  off-reading-path chrome (sidebars, rails, composer) mounts after the target paints,
  in tasks small enough not to block input; list overscan is held at the viewport
  during landing and relaxed afterwards in idle steps. Regression play: navigate to a
  target deep in a long virtualized list; assert the landing frame mounted only
  viewport-visible rows plus chrome-deferred mounts, and no single long task. Red when
  the landing eagerly mounts the full overscan or the whole view tree — the #10910
  pre-fix shape.
- **E6 — Navigation reaches its target without mounting the history above it.** Landing
  on an item uses content-derived size estimates (or an equivalent anchor-to-content
  mechanism) so the virtualizer jumps near the target; it never measures every row from
  index 0 to find it. Regression play: navigate to row N deep in a list whose rows vary
  wildly in height; assert rows far above the target were never mounted/estimated.
  Red when the jump mounts a prefix of the list — the #10874 pre-fix shape.
- **E7 — In-page find never de-virtualizes.** Opening find and stepping through matches
  keeps the list virtualized; matches over unmounted content come from persisted or
  reduced text, and stepping to an unmounted match mounts only that region via the
  E5/E6 landing path. Regression play: open find on a long virtualized view; assert no
  frame renders the full list and no find interaction blocks input for a long task.
  Red when find swaps virtualization for a flat render — the #10860 pre-fix shape.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — pre-registration pack (no new Stellarc surface; acceptance lines folded into the standing rows)

- **Why-no-run reason codes (NEW, from Multica #10858/#10857):** when an issue write can
  start a run, the write response says whether it did, and if not, why — a stable
  `reason_code` (triage state, no runtime, run already pending), same shape as the
  comment path's trigger outcomes. An agent must never be able to report "work started"
  while no run exists. No trigger-on-write seam in Stellarc today (grep-verified at
  `9505c63d`) — pre-register for the trigger/wakeup lane.
- **Steering waits out compaction (fold, Paseo #10028):** steering joins a turn; it must
  wait out an in-flight context compaction, never cancel it. The steering law now has
  three legs: queue-until-turn-ends (#9757), non-interrupting default (Multica #10715),
  wait-out-compaction (#10028).
- **Background work is queryable state (fold, Paseo #10022 + #10097):** the §G
  background-work inventory is reported by status/list APIs (not just UI), and
  scheduled heartbeats join the inventory with per-item Stop — extends the #9744
  runtime-consult law's observable class.
- **List isolation (NEW, Paseo #9847):** one unreadable entry in a stored collection
  never hides the rest of the list — lists degrade per-entry, fail visibly, and render
  what survived.
- **Config precedence for shared defaults (watch, Copilot 11-18):** when shared
  plugin/app defaults arrive (ADR 0015 lane), precedence is individual < team < org,
  policies win, and inheritance to child scopes is explicit, never implicit.
- **Browser-use/computer-use (watch, Copilot Nov 17):** the fourth major vendor; rides
  the harness — our tool/permission policy governs it when a harness exposes it; no
  host-side surface to build.
- **Model churn (watch):** GPT-6.2 Astra/Sol (11-17) — top-end catalogs churn weekly;
  BYO-agent means we never name models, only surfaces (already law).

### Proposal 3 — no-gap verification (recorded, no brief)

Multica #10859 ("leave the parent's session behind when a retry changes runtime") — the
law: **a provider session stays attached to the runtime that recorded it; a retry that
lands on a different runtime starts without one.** Verified in our tree at effect/v4
`9505c63d`: the runner ALWAYS calls `session_new` (runner.ts:610) — there is no
session-id resume path; NEVR-415 attempt continuity resumes by replaying the transcript
chain through the new session (store.ts:1360–1405), and `native_session_id` is metadata
that self-corrects at the next `markRunning` (store.ts:1501). The requeue paths
(reapExpired store.ts:1259–1266, unparkPassing :858) do keep `native_session_id` on the
row while claim rebinds `node_id` — but nothing behaviorally consumes the stale value,
so the defect class cannot arise today. Recorded so the ACP 2.x `session_resume` lane
knows the session↔runtime binding rule is load-bearing the day a resume-by-session-id
path opens: resume only on the runtime that recorded the session; otherwise start fresh.

## Sources

- GitHub API (fetched 2026-11-18, window 11-17T19:00Z→11-18T19:00Z): repos/{multica-ai/multica (meta, v0.11.0 body, 46-window PRs, bodies #10858/#10859/#10860/#10874/#10910), getpaseo/paseo (meta, v0.16.2 body, 30-window PRs), OpenHands/OpenHands (meta, v1.42.0 body, 14-window PRs), makeplane/plane (meta, 1-window PRs), hcengineering/platform (meta), Factory-AI/factory (meta, commits, contents docs/changelog)}
- registry.npmjs.org/@factory-ai/droid — `{"error":"Not found"}` (re-probed 2026-11-18)
- Changelog feeds fetched 2026-11-18: linear.app/changelog (newest Nov 12), cursor.com/changelog (newest Nov 6), devin.ai/changelog (newest Nov 16), github.blog/changelog/label/copilot/ + RSS feed (pubDates: Customize 11-18 16:00:13Z; GPT-6.2 Astra/Sol 11-17 20:20:29Z) + entry bodies (customize…your-team, let…interact-with-your-browser)
- Stellarc seams verified at origin/effect/v4 `9505c63d` (git grep/show): contracts §E inventory; apps/web deep-link grep (zero hits); runner.ts session_new; store.ts requeue/claim/native_session_id paths
