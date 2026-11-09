# Scout — Competitors, 2026-11-09

Beat: **competitors**. Delta window: 2026-11-08 19:05 UTC → 2026-11-09 19:03 UTC (~24h). Every claim
verified against a vendor changelog/release notes (browser-rendered), the GitHub API (`gh api` — repo
metadata, in-window commits, merged PRs, PR bodies), or the Copilot changelog RSS on 2026-11-09.
Context: Stellarc = self-hostable, inert control plane (v2 charter) + BYO agent runtime over ACP;
TS monorepo (`apps/stellarc-{api,node,ui,worker}`, `packages/{agents,contracts,db,domain,sync,telemetry}`);
the UI future is `apps/web` greenfield on `effect/v4` (React 19.3.1, TanStack Start/Router,
`@tanstack/db` rc, oxlint + `@shadcn/lint` design contracts, `@axe-core/playwright` e2e floor). The
Postgres event log is the sole source of truth: `event` PK `(org, seq)`, seq allocated from
`org_event_counter` inside the append transaction (`packages/agents/src/store.ts:228-243`); sync is an
Electric-shaped shape-tail (`packages/sync`). `docs/steal-reject-matrix.md` and `docs/v2-charter.md`
are the standing filters.

## The one-line read

The closed-source changelogs went **all quiet at once** — Linear a fourth consecutive day (new radar
record), Cursor a third, Copilot a second, Devin's Nov-6 entry still the newest, Factory's November
train takes a **second gap day**, Plane a sixth, Huly README-only — but the open trunk streams ran
hot, and the day's headline is a **production outage fix that is structurally ours**. **(1) Multica
MUL-8760/#10117**: a workspace's `issue_counter` drifted below `MAX(issue.number)` → the unique
violation rolled the counter bump back *with* the failed insert → the next create was handed the same
taken number → **every `POST /api/issues` 500ed forever** until a heal-on-collision fix. Stellarc's
`appendEvents` allocates event seqs from `org_event_counter` with the bump inside the same
transaction as inserts into `event` (PK `(org, seq)`) — the identical permanent-write-outage class,
one drift away (import, restore, manual fix). Today's ADOPT brief: collision-healing seq allocation.
**(2) Paseo's status-display honesty pair** — #9170: the timeline *holds* a finished turn and releases
it **in the same store write** as the rows that bring the chat current (the running footer never
lands under stale messages); #9175: the subscribe request carries the client's cursor and the server
answers `current` / `behind` per chat — unchanged chats render nothing, no "Updating" flash. Two laws
for our streaming views and the sync tail. **(3) Paseo #8744 (+17k/−3.3k)**: the plugin API now owns
composer controls (any plugin, not just providers), agent options/metadata, and the New-workspace
flow — the biggest plugin-surface expansion in the cohort. Plus OpenHands makes **install
automation-aware** (`mode=automation` + `POST /plugin-spec`, #18699) and splits **stop semantics**
(composer stop = agent interrupt only; sandbox stops stay separate and available after an interrupt,
#19546); Multica lint-gates **accessible names on icon-only buttons** (custom rule, zero false
positives — TRIAL for our oxlint `jsPlugins` seam) and rebuilds Connected Apps as **workspace-owned
team accounts + per-agent grants + admin catalog + confirmations** (#9849, +12.4k lines). One brief;
a dozen addenda and pre-registrations.

## Findings

| Name | What shipped (verified) | Version / date | License | Maturity (1–5) | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Multica** | v0.8.1 stands; **24 merged PRs in window** (head MUL-8893/#10230 17:42Z; pushed_at 18:22Z on-branch), 55,417★ (+121). **MUL-8760/#10117 — heal a drifted `issue_counter` only when a number collides** (+504/−5): production incident — counter 1094 vs `MAX(number)` 1096, the `uq_issue_workspace_number` violation rolled the allocation bump back with the INSERT, so every create (UI, CLI, autopilot) got the same taken number and `POST /api/issues` 500ed **forever**; fix = heal forward on collision (measure, don't assume), healthy path byte-identical. **MUL-8813/#10168 + MUL-8816/#10172 — `multica-a11y/icon-button-name` lint rule** (+151/−11): CI fails on icon-only buttons without an accessible name — the `Button` component first, then native `<button>`s (main had **eight** violations); icon-only = all content is icon imports incl. conditionals; claims zero false positives. **MUL-8516/#9849 — Connected Apps rebuild** (+12,429/−1,462): workspace-owned **team accounts** + personal accounts, admin catalog modes (all/curated/custom), per-tool automatic-class corrections, human **confirmations** for risky calls — before, every run used the agent owner's personal account. **MUL-8725/#10156 — PR evidence as native GitHub attachments** (`scripts/pr-shots`: `gh pr edit --attach` wrapper, content-hash dedupe in hidden PR-body comments, sequential fail-stop, never disposable branches). **MUL-8853/#10221 — an agent can start its own dev environment's daemon** (dev-`<env>` profile, `MULTICA_*` task vars stripped; the `requireHumanLocalCommand` guard stays for the human profile). **#10207 — daemon start fails without matching child health** (third dev-env honesty entry). MUL-8758/#10115 pending invitations recovered on focus/reconnect (30 s freshness + focus refetch + WS recovery covers account-level lists); MUL-8702/#10165 unify annotation saves and whole-draft sends; MUL-8754/#10111 refetch a failed issue mention on focus; MUL-8797/#10161 inbox filter aligned with the issue filter; MUL-8889/#10228 Edit-view entry in the saved-view menu; MUL-8820/#10171 project rename menu; MUL-8735/#10170 open web issues in desktop; #10215 exact agent-name resolution for squads/autopilots; MUL-8857/#10224 a live task never deletes its own marker; MUL-8822/#10182 ask for a GitHub star after enough agent-finished issues; #10145 CI frontend-validation perf; MUL-8808/#10166 dev-env one-shot fixtures. | trunk 2026-11-09 (#10117 et al.) | proprietary, 55,417★ | 5 | **WATCH (steal surfaces)** | MUL-8760 is the day's ADOPT brief: our `appendEvents` has the identical structure — `UPDATE org_event_counter SET seq=seq+N RETURNING` inside the same tx as `event` inserts, PK `(org, seq)` — so one counter drift freezes the org's **entire event log** (the sole source of truth), and nothing today reconciles against `MAX(event.seq)`. The icon-button lint pair maps onto our existing oxlint `jsPlugins: ["@shadcn/lint"]` seam (in-repo rule, no new deps) — TRIAL while apps/web is small and clean. #9849 pre-registers the governance shape for our future integrations/MCP surface. #10156's idempotent-native-attachments law applies to any agent-authored PR evidence we emit. |
| **Paseo** | v0.15.3 stands; **15 trunk commits in window** (newest e0f545f/#8901 15:03Z; pushed_at 15:55Z on-branch), 23,640★ (+128). **#8744 — plugin API for agent options, metadata, composer and New workspace** (+17,151/−3,328, replaces a six-PR stack): any plugin can declare composer **controls** (toggles/selects over option keys, carrying `icon` + `description`) and add composer **actions** (`addComposerItem`) — the provider-scoped composer contract is dead; plugins surface agent options/metadata and contribute the New-workspace flow; `settings` deprecated for `controls`. **#9170 — keep the running footer until a chat's messages are current** (+912/−17): returning to an agent that went idle while away, the completed footer used to land above still-stale messages; the timeline now **holds the turn its messages were captured during and releases it in the same store write** as the catch-up rows — no new footer state. **#9175 — stop showing "Updating" for a chat that has not changed** (+1,322/−105): the subscribe request carries per-chat cursors and the response answers `current` \| `behind`; unchanged chats render nothing (attach-with-cursor, no fetch theater). **#9160 — fx as a catalog opt-in provider**: Vercel Labs' open-source native agent (built-in ACP server, `fx acp`) added with the same shape as every ACP provider (`requiresConfiguration` plugin over `runAcpProvider`, **zero vendor protocol code**) — and running the real binary exposed three bugs from provider-declared controls that depend on one another. #9116 a healthy host connection is never replaced on stale latency data (adaptive switching flapped live connections); #9151 the composer's trailing action stays in place while typing; #9162 composer pills scroll sideways on Android; #9153 the respawn port test holds a listener on the old port (ephemeral-port reuse made the assertion vacuous); #9104 archive undo toast with only Undo pressable; #9106 Terraform/HCL highlight; #8901 iPhone Duo top band; journeys #9199/#9186/#9146/#9141. | trunk 2026-11-09 (v0.15.3 of 11-06 stands) | Apache-2.0 + carve-out, 23,640★ | 4 | **TRIAL (stands)** | #9170/#9175 extend the live-status contract: terminal state releases atomically with the rows that make it current, and attach-with-cursor must render nothing when nothing changed — addenda for the replay contract + the Electric-shaped tail (`packages/sync` answers changes-only from a cursor by construction; the UI half is the law). #8744 feeds the D11 plugin-lane pre-registration (composer as plugin surface). #9160 pins the BYO-agent lane law: new hosts join by ACP conformance + catalog opt-in with zero vendor code, and provider-declared control metadata (order, category, interdependency) is authoritative data the UI must honor. #9116 joins the one-cause-one-reconnect family; #9151 is a Section F line (the composer never reflows while typing). |
| **OpenHands** | v1.37.0 stands; **23 commits in window** (newest 379c88f/#19564 18:08Z; pushed_at 18:09Z on-branch), 93,045★ (+84). **#18699 — automation-aware install** (+1,980/−69): `mode=automation` + `POST /plugin-spec` — one-click install of a plugin *as* an automation (toward #18793); install flow carries the runtime config. **#19421 — prompt/plugin presets run from an agent profile**: services advertising `presetAgentProfiles` get a profile pill; choosing a profile **clears and locks the model pill** (`agent_profile_id` sent, `model: null`) — profile-owned config wins over field-level config. **#19546 — composer stop interrupts the agent instead of pausing the Cloud sandbox** (+411/−210): the composer/goal stop calls `/interrupt` on every backend; explicit sandbox stops (title menu, status dot, list) stay separate **and remain available after an interrupt**. **#19568 — reconcile the active LLM profile against the backend model** (+292/−15, incl. a race fix): the stamped `active_profile` was never checked against the conversation's authoritative `llm_model` — third independent confirmation of the model-identity pair. **#18975 — conversation workspaces inside the persisted volume** (+51): the all-in-one image built the frontend without `VITE_WORKING_DIR` → Canvas fell back to a relative default anchored at the agent-server home → workspaces lost on restart; build-time path config determines runtime persistence. #16512 fail fast on unwritable Docker bind mounts (documented remedy); #19501 diff-viewer releases models after editor teardown; #19470 enterprise license banner in Canvas; #19471 agent-profile switch hidden when the capability is off (capability-gated UI); #17730 Light+/Solarized contrast pass; token/lint program continues (#19564 typography/shadow owners, #19566 Commit viewer, #19530 Canvas colors, #19561 context meters, #19534/#19533 badges/letter-spacing, #19529 palette boundaries); deps: framer-motion 12.38→**14.9** (major), lucide-react 1.66, @shadcn/lint 0.2.3. | trunk 2026-11-09 (v1.37.0 of 11-06 stands) | MIT, 93,045★ | 4 | **WATCH (pattern)** | #18699 + #19421 extend the automation-lane pre-registration bar: install is automation-aware, and an automation's agent profile owns the model (the model control locks rather than conflicts). #19546's stop split is the precise law for our Section G interrupt scoping: the stop nearest the user's focus acts on the agent only; coarser stops live in dedicated places and stay usable after the fine stop fires. #19568 confirms the model-identity law on a third codebase (displayed model reconciled against the backend's authoritative model, race included). #18975's law for any containerized future: every writable runtime path resolves inside persisted storage, proven by a restart test. |
| **Devin (Cognition)** | **Quiet** — release-notes TOC newest is still **November 6, 2026** (browser read 19:01Z; the Nov-6 entry — child-session reveal switch, persistent queue-or-interrupt side chats, secret-request setup steps, session-visibility governance — was carried in full on 11-08). | release notes 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; the delegation-tree and side-channel pre-registrations stand. Yesterday's TOC-lag note (check one extra scroll on quiet days) paid off — the page is consistent today. |
| **Factory (Droids)** | **Second consecutive gap day** — Full Changelog header verified: "260 RELEASES · LATEST CLI V1.6.0 · DESKTOP V1.6.0 · NOVEMBER 7, 2026" through 19:02Z; November counter says **5 releases** (slight revision of yesterday's seven-release count — the page's own counter is authoritative). v1.6.0 (11-07) stands: /side Side Chat, steered background Tasks report their final answer, pause-boundary status honesty, no Initializing-Session flash. | v1.6.0 2026-11-07 | proprietary | 5 | **WATCH** | Cadence note: burst, not daily. Nothing new to steal; carried lines stand. |
| **Cursor** | Changelog unchanged — newest entry still **Nov 6, Voice Chat with Agents** (browser-verified 19:00Z); **third consecutive quiet day**. | changelog 2026-11-06 | proprietary | 5 | **WATCH** | Nothing new; voice-as-status-surface pre-registration stands. |
| **Linear** | Changelog unchanged — newest entry still **November 5 (Mobile Diffs)**; **fourth consecutive quiet day — extends the longest Linear streak the radar has recorded**. | changelog 2026-11-05 | proprietary | 5 | **WATCH** | Nothing new; mobile diffs, guided reviews, and the carried agent fixes stand. |
| **GitHub Copilot** | **Quiet** — changelog RSS newest item still **11-07 00:27Z** (code review API management); second consecutive day with zero new entries. | changelog 2026-11-07 | proprietary | 5 | **WATCH (pattern)** | Streak continues; per-surface usage attribution stays the enterprise bar our BYOK schema note tracks. |
| **Plane** | **Sixth consecutive quiet day** — `preview` trunk carries **zero commits in window**; pushed_at moved to 11-09 18:37Z = off-branch again (metadata law, fourth confirmation); v1.4.3 (10-28) stands; 62,209★ (+56). | v1.4.3 2026-10-28 | AGPL-3.0, 62,209★ | 4 | **TRIAL (stands)** | The streak keeps extending; the v1.4.3 auth/tenant-isolation checklist stays queued on our side. |
| **Huly** | **Third consecutive quiet day** — only two README.md updates (#11165, #11166, 14:11–14:14Z); 28,078★ (+4). | platform trunk 2026-11-09 | EPL-2.0, 28,078★ | 3 | **REJECT (stands)** | README-only activity; no agent story; nothing to re-litigate. |

## Proposals

One new ADOPT brief clears the bar today; everything else is addendum or pre-registration.

### Proposal 1 (ADOPT) — collision-healing event-seq allocation (`org_event_counter`)

**Precedent:** Multica **MUL-8760/#10117** (merged 11-09 08:44Z, +504/−5). Their production board hit `issue_counter = 1094` against `MAX(issue.number) = 1096`:
allocation bumped the counter **inside the same transaction as the INSERT**, the unique violation
(`uq_issue_workspace_number`) rolled the bump back with the insert, the next create was handed the
same taken number — every `POST /api/issues` (UI, CLI, autopilot) returned 500 **in a loop, forever**.
Fix: heal the counter forward **only when a number collides** (measure drift, never assume it), healthy
path performs byte-identical statements, regression test seeds real drifted rows.

**Stellarc exposure (verified on `effect/v4` @ `origin/effect/v4`, 11-09):** `appendEvents`
(`packages/agents/src/store.ts:228-243`) does exactly the vulnerable shape:

- `INSERT INTO org_event_counter(org) VALUES (…) ON CONFLICT DO NOTHING` (creates the row only),
- `UPDATE org_event_counter SET seq = seq + N RETURNING seq` — **inside the append transaction**,
- inserts into `event`, whose PK is **`(org, seq)`** (`packages/db/migrations/0001_foundation.sql:5-15`).

If `org_event_counter.seq` ever drifts below `MAX(event.seq)` (partial restore, manual data fix, a
backfill, a future second writer), every append collides on the PK, the rollback un-bumps the
counter, and the next append gets the same taken seqs — **the org's entire event log freezes**, and
with it every API write, node report, and sync tail. Nothing today reconciles the counter against
`MAX(event.seq)`. (Transcript items are immune by construction — `maxItemSeq` reads
`COALESCE(MAX(seq), -1)` per task/attempt, store.ts:406-414; the event counter is the one exposed
allocation.)

**Brief (ready to file):**

- **Problem.** Event seqs are allocated from `org_event_counter` with the bump inside the same
  transaction as the `event` inserts (PK `(org, seq)`). A counter that drifts below `MAX(event.seq)`
  makes every append collide and roll back, re-handing out the same seq forever: a permanent,
  org-wide append outage of the sole source of truth, with no healing path. Precedent: Multica
  #10117 — identical structure, production outage (counter 1094 vs MAX 1096, every create 500).
- **Work.**
  1. Reproduce in a test: seed `event` rows above the counter, call the append path, observe the
     loop (one collision per retry, counter never advances past the taken seq).
  2. On unique-violation (SQLSTATE 23505) in `appendEvents`: outside the failed transaction, read
     `MAX(event.seq)` for the org, heal `org_event_counter.seq` forward to it (own committed
     transaction), then retry the append **once**. Healing is collision-triggered only — never eager,
     never on a timer.
  3. Healthy path unchanged: an append that does not collide performs exactly the statements it
     performs today (no extra reads on the hot path).
- **Acceptance.** The seeded-drift test recovers on the next append (events land with seq >
  MAX, no duplicate PK); a second consecutive collision after heal-and-retry surfaces a typed error
  (never an infinite loop); the healthy-path statement count is asserted unchanged in a test;
  `store.ts` comment states the law: *counters that allocate inside the insert transaction must
  heal on collision, or one drift becomes a permanent write outage.*
- **Scope guard.** `packages/agents` store + tests only; no schema change; no new dependencies; no
  UI, no runner changes.

### Proposal 2 (TRIAL) — icon-only accessible-name lint gate at the oxlint seam

Multica's `multica-a11y/icon-button-name` pair (#10168 for the Button component, #10172 for native
`<button>`s — main had eight violations) makes accessible names a **static CI gate**, not just an
e2e finding: icon-only = all content is icon imports (named, aliased, namespace, and conditional
icon choices all count); claims zero false positives. Stellarc's apps/web already has the seam —
`.oxlintrc.json` runs `jsPlugins: ["@shadcn/lint"]`, so an in-repo `stellarc/icon-button-name`
plugin rule fits the existing mechanism with zero new dependencies — and the codebase is currently
clean (all 27 buttons visibly named; Header.tsx:90-96 even carries the NEVR-505 naming comment) with
`@axe-core/playwright` catching the class at e2e. **TRIAL, not brief**: the axe floor already gates
the class on the routes it covers; promote to a lint rule when apps/web's button count grows past
trivial or before the next surface push — the rule is cheap to write exactly when it's first needed.

### Addendum — status-display honesty pair (Paseo #9170/#9175)

For the live-status & replay contract (pinned via NEVR-530): **(a) atomic terminal release** — a
finished turn's terminal state is released in the same store write as the rows that bring the view
current; the running indicator persists until then (extends turn-boundary atomicity #8944 from the
item level to the indicator level). **(b) Attach-with-cursor renders nothing when nothing changed**
— the subscribe/attach request carries the client's cursor; the server answers `current`/`behind`
per target; unchanged targets never show fetch theater ("Updating"). Our Electric-shaped tail
answers changes-only from a cursor by construction; the law's open half is the apps/web render side.

### Addendum — carried lines reinforced today

- **Stop split** (OpenHands #19546): the stop nearest the user's focus interrupts the agent only;
  coarser stops (the runtime/sandbox) live in dedicated surfaces and **remain available after** the
  interrupt. Section G line.
- **Model identity, third confirmation** (OpenHands #19568; after Paseo #8957/#8948): the displayed
  active model is reconciled against the backend's authoritative model — including the race where a
  stale profile stamp survives a backend switch.
- **Profile-owned config locks the field** (OpenHands #19421): when an agent profile owns the model,
  the model control clears and locks (`model: null`), rather than two sources of truth fighting.
- **Automation-aware install** (OpenHands #18699): installing a thing *as an automation* is one
  click and carries its runtime config — extends the automation-lane pre-registered bar (install-time
  mode, plugin-spec-shaped).
- **Stale metrics never evict a healthy connection** (Paseo #9116): adaptive connection switching
  acted on stale latency data and replaced a live connection — joins one-cause-one-reconnect.
- **Counter-test honesty** (Paseo #9153): a port-change assertion is meaningless if the OS can
  re-hand you the same ephemeral port — hold a listener on the old port.
- **Writable paths persist** (OpenHands #18975): every writable runtime path resolves inside
  persisted storage, proven by a restart test — for any containerized deploy in our future.
- **Pending client state recovers on focus/reconnect** (Multica #10115): every client-visible list
  belongs to a recovery path (focus refetch, network recovery, WS recovery) — a missed realtime event
  must not freeze an account-level list.
- **PR evidence is idempotent native attachments** (Multica #10156): content-hash dedupe, sequential
  fail-stop, never disposable branches — the shape for any agent-authored PR evidence we emit.
- **Integration governance** (Multica #9849): workspace-owned team accounts + per-agent grants +
  admin catalog modes + human confirmations for risky calls — pre-registered for Stellarc's future
  integrations/MCP surface (before this, every run used the owner's personal account — the failure
  it fixes is the default we must not ship).
