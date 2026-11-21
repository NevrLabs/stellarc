# Scout — Competitors, 2026-11-21 (run 2)

Beat: **competitors**. Delta window: 2026-11-21 04:30 UTC → 19:05 UTC (~14.5h — the second
competitors run today; the 04:30Z run covered 11-19 19:00 → 11-21 04:30 and merged as #333, so
this window starts where that one ended). Every claim verified against the GitHub API (`gh api` —
repo metadata, release tags, `merged:>=` window searches per repo, full PR bodies for the
load-bearing numbers) or a re-fetched changelog page/feed (Linear, Cursor, Devin — full page
re-fetched and date-parsed; Copilot — github.blog RSS with exact pubDates; Factory — npm registry
+ default-branch commits + changelog dir). Context: Stellarc = self-hostable, inert control plane
(v2 charter) + BYO-agent runtime over ACP; `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters. Dev HEAD this run: `c028913b`; effect/v4 head `54e6b372` (D2 pinned
11-19 as #328; the morning run's two briefs — sharing-visibility, context-exhaustion — queue
behind triage).

## The one-line read

**Multica made documents multi-writer for people and agents in one day, and Paseo fixed the
steering-order defect — the ordering half of the steering law now has a shipped failure story at
a second vendor.** Multica merged **28 PRs** (no release; v0.11.1 stands, v0.12 still prepped as
a rollback point; 57,036★ +72; head pushed 18:16Z): **#11092 live co-editing for people and
agents** (+6,165/−813 — a new `apps/collab` service on Hocuspocus/Yjs: one live Y.Doc per open
doc, presence and carets, an agent's edit lands in the live session while people keep typing,
one co-editing session folds into one version that **credits every editor**, "nothing is lost
when the collaboration service is unavailable"); **#11122 shipped it everywhere the same day**
(ghcr image, Helm `collab.enabled` default-off for Helm and self-host, `make up` runs it
locally, SIGTERM handler stores open docs); then the same-day conflict-honesty fix **#11137**
(+99/−19): when the API bypassed the collab service with a **direct write it had already
acknowledged** (collab down during a deploy, a 5xx, a network blip), the service's failed diff3
reconcile **kept the live text and silently overwrote the acknowledged write** — and diff3's
"conflict" covered *adjacent*-block edits, so an agent fixing a paragraph next to the one a
person typed was lost too. Fix: block-by-block merge when no blocks moved, and real conflicts
resolve **keeping both sides**. **Paseo #10404** (merged 13:41Z, +1,886/−281, PR-body verified)
is the steering-order law with a live failure: an agent sent "go ahead" as a `steer`, ten
minutes later sent "pause" as an `interrupt`; the recipient obeyed "pause", ended its turn — and
the daemon then delivered the **stale "go ahead" as a fresh turn**. The queue dispatched
interrupts alone, ahead of older queued steers, which stayed queued for the next turn-end; a
person's prompt and Stop had the same flaw. Fix: one replacement prompt `[steer, interrupt]`
replaces the turn at once and **nothing fires afterwards**; a person's prompt P folds the same
way as `[A, P]` with P keeping its own transcript. → **Proposal 1: pin the G7 steer-queue
ordering contract** (Paseo #10404 + the carried Multica #10715 receipts half; no steering queue
exists in our code — grep-verified at `54e6b372`). Paseo's window (24 merged PRs, no release,
v0.17.0-beta.1 stands, 24,602★ +49) also hardened its release pipeline (**#10396**: releases
verified on isolated short-lived `release/vX.Y.Z` branches because high-traffic `main` cancelled
27 of the last 50 main CI runs) and kept the usage-forecast lane moving (#10385 forecast as one
more `·`-separated datapoint, #10397 quota-bar polish). **OpenHands** quiet (6 merged PRs — 5
dependabot + 1 maintenance-map doc; 93,962★ +31). **Plane refroze** (0 merged, pushed_at still
11-20T13:14Z; v1.5.0 stands; 62,904★ +27). **Huly frozen day 16** (pushed 11-09; 28,163★ +4).
**Linear quiet day 10** (newest changelog still Nov 12), **Cursor quiet day 16** (still 11-06),
**Devin quiet** (newest still Nov 20), **Copilot quiet** (newest Copilot-specific still 11-18;
the feed's 11-20 entries are not Copilot), **Factory quiet** (no commits since 11-20T07:57Z; npm
404; changelog dir unchanged).

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | **No release in window — v0.11.1 stands; v0.12 still prepped. 28 merged PRs 09:18–17:34Z; head pushed 18:16:54Z; 57,036★ (+72).** **Docs go collaborative:** #11092 live co-editing for people AND agents (Hocuspocus + Yjs `apps/collab`; browser joins over `/collab` behind a short-lived HMAC ticket the Go API proxies; Postgres Markdown stays the source of truth; debounced saves are revisions; **one co-editing session folds into one version crediting every editor**; goal list includes "nothing is lost when the collaboration service is unavailable"); #11122 ships it (multi-arch ghcr image, Helm `collab.enabled` default **off** for Helm/self-host, on for dev, SIGTERM handler stores open docs); #11137 the acknowledged-write fix — a direct API write the writer (usually an agent) had been **told succeeded** was overwritten when the collab service's diff3 reconcile failed, and diff3 flagged adjacent-block edits as conflicts (agent edits next to a person's typing were lost); now block-level merge + **keep both sides** + fewer false 409s for agent writes; #11132 image sizes and in-flight uploads survive a Markdown write. **#11134 Cursor MCP logins mirrored instead of linked**: cursor-agent 2026.11.19 replaces a symlinked `mcp-auth.json` by rename (verified 2026.11.13/11.17 keep the link, 11.19 replaces it), so the symlink persistence trick (#10780/#10836) silently detached every login — the daemon now mirrors. Also: #11128 Projects/Views counts hidden by default; #11110 Pinned above the Inbox in Work; #11123/#11124 self-host Compose/Helm can set feature flags + documented backend vars checked generically; #11140 web-navigation measured on a **production** build; #11116 window titles localized via the tab-title contract; #11126 the shared dev 8080 backend never registered/destroyed; #11091 doc page frame + skeleton while loading; #11114 server thumbnails for comment images; #11098 i18n copy/glossary unification; #11109 tests catch unrendered Markdown links and broken anchors. | v0.11.1 2026-11-19 (no new tag) | proprietary | 5 | **WATCH (steal surfaces)** | The docs-collab trio is the biggest agent-coauthoring surface any competitor has shipped: agents edit live alongside humans, history credits machines, and the failure class is **an acknowledged write silently losing a merge** — the inverse of our append-only event log + fork-not-merge (D10), which makes the class structurally unreachable for transcripts. Fold the acknowledged-write law as a pre-registration IF a collaborative surface ever charts (Proposal 2). #11134's version-pinned behavior table is the adapters-lane law: persistence built on an external tool's undocumented write behavior breaks between its minor versions (Proposal 2). |
| **Paseo** | **No release in window — v0.17.0-beta.1 stands. 24 merged PRs 06:20–18:49Z; pushed 18:49:31Z; 24,602★ (+49).** **#10404 steer/interrupt ordering** (+1,886/−281, body verified): the queue dispatched an `interrupt` alone, ahead of older queued steers, and those steers stayed queued for the next turn-end — a recipient obeyed "pause", then the stale "go ahead" fired as a fresh turn; a person's prompt and Stop had the same flaw. Now: interrupt + queued steer = **one replacement prompt `[A, B]`, nothing fires after it**; a person's prompt folds as `[A, P]` with P keeping its own transcript. **#10396 release hardening** (+1,955/−260): releases verified on isolated short-lived `release/vX.Y.Z` branches because high-traffic `main` cancelled 27 of the last 50 main CI runs; macOS notarytool polling retried, npm publish idempotent, no duplicate 21-job CI after tagging. Usage-forecast lane: #10385 the quota forecast renders as one more `·`-separated datapoint in the reset line ("resets in 2d 11h · Mon 9:49 PM · runs out in 2d 5h"), #10397 meter/label polish. Honesty/perf cluster: #10406 checkout status in Changes after a worktree restore (pairs with #10304); #10391 workspace-archive progress across sessions; #10390 the working directory honored when resuming Codex; #10381 agent recovery preserved when stopping Paseo from a terminal; #10368/#10371 timelines and live images responsive after reconnect/during replay; #10369 Claude history reload fast under daemon load; #10318 a host's workspaces restored when its cached directory is evicted; #10310 (ACP) the Antigravity turn stays open while non-daemon background tools run; #10308 Android composer buttons on first tap; #10278 plugins manage worktree create/remove/restore; #10432 Add-model sheet closes when save completes; #6200/#5996 two long-lived PRs landed (composer focus hint, split-divider drag). | v0.17.0-beta.1 2026-11-19 | proprietary | 5 | **WATCH (law source)** | #10404 is the steering lane's second shipped ordering story (Multica #10715 pinned the semantics, Paseo shipped the ordering defect + fix) → **Proposal 1: G7 steer-queue ordering contract**. #10396 is release-pipeline honesty for the ops row (verify releases where trunk traffic can't cancel them). The #10385 presentation fold (forecast = ordinary datapoint, same line/style) joins the context-exhaustion brief's rendering half. |
| **OpenHands** | **Quiet. 6 merged PRs in window — five dependabot bumps (driver.js, electron, posthog-js, eslint, testing group) + #19894 a maintenance-map doc.** 93,962★ (+31); pushed 16:53Z. v1.43.0 (11-20) stands. | v1.43.0 2026-11-20 | MIT, 93,962★ | 5 | **WATCH** | Post-release dependency churn; nothing for the radar. |
| **Plane** | **Refroze — 0 merged PRs in window (search-verified); pushed_at still 11-20T13:14Z.** v1.5.0 (11-16) stands. 62,904★ (+27). | v1.5.0 2026-11-16 | AGPL-3.0, 62,904★ | 4 | **WATCH (sweep concluded)** | Yesterday's single i18n PR was the unfreeze; the lane is back to frozen. Nothing owed. |
| **Linear** | **Quiet day 10** — changelog re-fetched and date-parsed; newest entry still **November 12** (BYOK + the agent-transcript honesty five). | changelog 2026-11-12 (newest) | proprietary | 5 | **WATCH (pattern → BYOK + honesty lines)** | Nothing new; carried rows stand. |
| **Cursor** | **Quiet day 16** — changelog re-fetched; newest embedded entry date still **2026-11-06** (Voice Chat with Agents). | changelog 2026-11-06 (newest) | proprietary | 5 | **WATCH** | Nothing new. The voice pre-registration stands (five vendor touches). |
| **Devin (Cognition)** | **Quiet in window** — devin.ai/changelog re-fetched and date-parsed; newest entry still **November 20** ("Access and Sharing"). The 11-17→11-20 access pack parsed by the morning run stands as filed. | changelog 2026-11-20 (newest) | proprietary | 5 | **WATCH (law source → access/sharing)** | Nothing new; the morning run's sharing-visibility brief (Proposal 1, #333) carries the lane. |
| **GitHub Copilot** | **Quiet — zero Copilot-specific entries in window.** github.blog changelog RSS re-read with pubDates: the 11-19/11-20 entries (CLI PR-event wait, GHES 3.23 RC, dashboard repo pins, Desktop multi-account, PR-overview preview, security-advisory permissions GA) are not Copilot; newest Copilot item remains 11-18 22:04Z (Supabase/Box/Calendly MCP connectors). | changelog 2026-11-18 (newest Copilot) | proprietary | 5 | **WATCH** | Nothing new. |
| **Huly** | **Sixteenth consecutive quiet day** — pushed_at still frozen at 11-09T14:14Z; 28,163★ (+4). | platform trunk 2026-11-09 | EPL-2.0, 28,163★ | 3 | **REJECT (stands)** | No agent story; nothing to re-litigate. |
| **Factory (Droids)** | **Quiet** — 0 default-branch commits since 11-21T00:00Z (last push 11-20T07:57Z, the PR #112 CI risk-assess commit); npm `@factory-ai/droid` still **Not found** (registry re-probed); `docs/changelog` unchanged (dated entries still end 1-10.mdx). Last verified release v1.9.0 (11-11). | v1.9.0 2026-11-11 (last verified) | proprietary | 5 | **WATCH (law source; feed route dead)** | Nothing new; the probe trio (npm + commits + changelog dir) holds. |

## Proposals

### Proposal 1 — ADOPT brief: pin the G7 steer-queue ordering contract (docs-only)

**Precedent (verified this run):** Paseo #10404 (merged 2026-11-21T13:41:28Z, +1,886/−281, PR
body fetched and quoted in the findings table) — the steering lane's first shipped **ordering
defect**: the daemon dispatched an interrupt alone, ahead of older queued steers; the steers
survived the interrupt's turn and fired as fresh turns after it. An agent that obeyed "pause"
then acted on a ten-minute-old "go ahead". The fix makes interrupt+queue **one atomic
replacement** (`[A, B]`, nothing fires after) and folds a person's prompt the same way
(`[A, P]`, P keeps its transcript identity). Multica #10715 (v0.10.0, 11-16, carried) pinned the
semantics half — non-interrupting steering, undeliverable guidance as next-turn input, delivery
receipts naming the exact active attempt. Two vendors, one law, both halves shipped.

**Our gap (verified at effect/v4 `54e6b372`):** no steering queue exists anywhere in our code —
`git grep -i steer` over `packages/` + `apps/` hits one e2e spec and nothing else; the nearest
surface is the pinned-but-unimplemented §G6 ("Steering is a reply channel",
`docs/design/agent-view-lifecycle-contracts.md`), whose §G already owns the interrupt family
(G3: foreground Interrupt scopes to the active turn). Per the house rule (D2 pinned at two
vendors; laws pin **before** the surface exists), the ordering half pins now, as **G7**, beside
its siblings.

**Work (docs-only, no app code):** add **G7 — Steer-queue ordering contract** to §G of
`docs/design/agent-view-lifecycle-contracts.md`, three testable laws, each with exactly one
named regression play (pre-registered, like G1–G6):

1. **G7a — An interrupt atomically consumes the guidance it invalidates.** When an interrupt
   arrives while guidance is queued behind a running turn, the interrupt and every queued steer
   are delivered as ONE replacement prompt; after that replacement resolves, no queued guidance
   fires as a fresh turn. A steer that outlives the interrupt that answered it is a defect.
2. **G7b — A person's prompt folds the queue the same way.** A person's prompt submitted while
   guidance is queued delivers as one prompt `[queued, prompt]`, the prompt keeping its own
   transcript identity; the queued guidance never starts a turn of its own after the person's
   turn ends.
3. **G7c — Undeliverable guidance is named, never dropped** (the Multica #10715 receipts half):
   guidance that cannot be delivered to the attempt it targeted is reported with the exact
   attempt it names, or carried as next-turn input — silence is the defect.

*Regression play (one, covering the trio):* `steering: an interrupt consumes the queued guidance
it invalidates` — script a running turn, queue steer A, then fire interrupt B; assert the turn
is replaced by one prompt carrying A and B in queue order and that nothing fires after it
resolves; repeat with a person's prompt P asserting `[A, P]` with P's transcript identity intact;
end with guidance targeted at a dead attempt asserting a named non-delivery record. Red in the
Paseo pre-fix shape — B dispatched alone, A firing as a fresh turn after B ends.

**Ready-to-file brief posted as an issue comment.**

### Proposal 2 — pre-registration pack (no new Stellarc surface; acceptance lines folded into standing rows)

- **Multica #11137 — the acknowledged-write law.** A write the platform has acknowledged (HTTP
  200, a receipt, a result event) is never silently overwritten by a conflict-resolution loser;
  a real conflict keeps **both sides** and names them, and merge-granularity must not inflate
  conflict regions (adjacent-block edits merge). Fold as a pre-registration against any future
  collaborative/documented surface — and record the inverse as a **charter validation**: our
  append-only event log + fork-not-merge (D10) makes the class unreachable for transcripts;
  Multica's +6,165/−813 service + same-day conflict fixes is the cost of the CRDT road we did
  not take.
- **Multica #11134 — external-tool write behavior is version-fragile.** A persistence mechanism
  built on an external agent's undocumented filesystem behavior (symlink write-through) broke
  between its 11.17 and 11.19 builds — replace-by-rename. Law for the adapters lane (ADR 0011
  BYO): never build persistence on an external tool's implicit write path; where unavoidable,
  verify per tool version and record the verified versions (Multica's PR body carries the exact
  behavior table).
- **Paseo #10396 — release verification is isolated from trunk traffic.** When Stellarc ships
  tagged releases, release verification runs on short-lived isolated branches; trunk-merge
  cancellations (Paseo: 27 of 50 main CI runs) must never stall a release. Fold into the ops row.
- **Paseo #10385 — a forecast is an ordinary datapoint.** The quota forecast renders in the same
  line and style as the reset countdown (`·`-separated), not as a differently-styled aside —
  presentation fold for the context-exhaustion brief (this morning's Proposal 2) when it files.
- **Paseo #10406 — restored worktrees report checkout status before diffs render.** Pairs with
  #10304 (carried); folds into the replay-honesty lane (§C): no stale git state on restore.

---

Verification appendix (fetched 2026-11-21 ~19:00Z, window 11-21T04:30Z→19:05Z):
GitHub API — multica-ai/multica (meta 57,036★/pushed 18:16:54Z; releases newest v0.11.1; 28
window PRs; bodies fetched for #11092, #11122, #11137, #11134), getpaseo/paseo (meta
24,602★/pushed 18:49:31Z; releases newest v0.17.0-beta.1; 24 window PRs; bodies fetched for
#10404, #10385, #10396), OpenHands/OpenHands (meta 93,962★/pushed 16:53Z; 6 window PRs),
makeplane/plane (meta 62,904★/pushed 11-20T13:14Z; 0 window PRs, search-verified),
hcengineering/platform (meta 28,163★/pushed 11-09T14:14Z), Factory-AI/factory (0 commits since
11-21T00:00Z; npm @factory-ai/droid "Not found"; docs/changelog = 1-8/1-9/1-10.mdx +
release-notes.mdx, dated entries unchanged). Changelog pages re-fetched and date-parsed:
linear.app (newest Nov 12), cursor.com (newest 2026-11-06), devin.ai (newest Nov 20). Copilot:
github.blog changelog RSS (newest Copilot-specific 11-18 22:04:50Z; 11-19/11-20 entries not
Copilot). Stellarc seams: git grep at effect/v4 `54e6b372` (steer: one e2e spec hit, no queue)
and dev `c028913b`; contract docs read at effect/v4 `54e6b372`
(agent-view-lifecycle-contracts.md §G, agent-view-contracts.md §B).
