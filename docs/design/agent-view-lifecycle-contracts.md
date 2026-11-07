# Agent-view lifecycle & replay contracts (apps/web)

> **Status:** Pinned 2026-11-03 (NEVR-463, from the 2026-11-03 competitors scout report NEVR-460, PR #180 — merged to `dev` as `9c71951` after primary-source verification; the OpenHands v1.35.0 release body, published 2026-11-03T18:47Z, is the source of every PR number below, re-verified at pin time). Layout-stability addendum (Section F) pinned 2026-11-05 (NEVR-480 triage of NEVR-478, PR #189 → `dev` `864e87e`; Paseo trunk #8717/#8742). Background-work contract (Section G) pinned 2026-11-06 (NEVR-514, from NEVR-513 triage of NEVR-512, PR #205 → `dev` `8dc638b`; precedents verified at pin time: getpaseo/paseo#6220 merged 12:49:50Z, Multica MUL-9960, Factory changelog 2026-11-06).
>
> **What this is.** The pinned lifecycle and rendering acceptance criteria the `apps/web` agent views — the live task/transcript route, the sidebar, and reopen/replay — are built and reviewed against. Sibling to [agent-view-contracts.md](./agent-view-contracts.md) (NEVR-456): that doc owns **interaction** (anchored-stream scroll, HITL approvals, diff review, cost telemetry); this one owns **lifecycle and rendering** for the same surfaces. Neither blocks anything until the agent views start (durable-streams lane: NEVR-441/442 and after).
>
> **Provenance.** OpenHands v1.35.0 hardened a startup/live-status/replay doctrine — with a perf chapter — into release law; the scout report's P2 proposal was adopted as filed (NEVR-461 triage). Our backend already satisfies the streaming half: items flush every 500 ms (`runner.ts` flushTimer), a `usage` item arrives on every ACP `usage_update`, the event log is the source of truth, and `docs/transcript-schema-v2.md`'s kind union is the item vocabulary. These contracts are UI acceptance criteria only; no backend change is in scope here.
>
> **How to use.** Every law is phrased testably and carries exactly one **named regression play** (house rule: one play per law). At implementation time each play is demonstrated **red when the law is broken, green when it holds** — sabotage-and-revert — and stays in the suite as the law's guard. Briefs for the apps/web agent-view issues **quote these laws as acceptance criteria and link this doc**; they do not fork them.

Related: [agent-view-contracts.md](./agent-view-contracts.md) (the interaction half of the same surfaces), [ADR 0014](../adrs/0014-stellarc-app-tanstack-db.md) (apps/web decision), [transcript schema v2](../transcript-schema-v2.md) (the payload side these views render), [shell design](./shell/) (the visual shell they live in).

## A. Render-first contract (the open path)

Source: OpenHands #19155 — "open conversations immediately with inline startup progress." The pre-fix failure mode is the doctrine's motivation: opening a conversation gated on runtime readiness, so the reader stared at nothing while the run started up behind a closed door.

**A1 — The task route paints on open; readiness never gates it.**
Opening the task/transcript route renders the view immediately: the persisted transcript if one exists, an empty-but-mounted transcript shell otherwise. Establishing the stream, resolving the run's claim state, and receiving the first agent token all arrive **after** the paint, into the mounted view. No full-route blocking overlay (spinner-only route, blank-while-connecting gate) may sit between navigation and first paint.
*Regression play:* `render-first: the task route paints before the stream is ready` — navigate to a task with a scripted transport that delays connection, assert the transcript shell committed a paint with zero route-blocking overlays, then complete the connection and assert items stream into the same mounted view. Red when first render awaits stream/session readiness — the #19155 pre-fix shape.

**A2 — Pre-token phases are transcript items, not chrome.**
The states a run passes through before its first agent token — queued, claimed, session bootstrap, first-token pending (the `queued`/`claimed` end of our `TASK_STATUSES`, `protocol.ts`) — surface **as items the transcript renders**, so the space above the first token is narrated by the transcript itself. Chrome (a header badge) may mirror these states but never replaces the item form: what the transcript showed must be what the event log holds, or it cannot replay (C1) and cannot live-update (B1).
*Regression play:* `render-first: queue, claim, and startup arrive as ordered transcript items` — start a run whose harness handshake stalls, assert ordered pre-token items (queued → claimed → startup) render inside the transcript and are carried by the event log, not as ephemeral route chrome. Red when the phases exist only outside the item stream.

## B. Live-status contract

Source: OpenHands #19130 (live agent status in chat), #19190 (startup activity in sidebar rows), #19211 + #19219 (startup and agent activity in one stable group), #19254 (sentence-style activity summaries).

**B1 — The agent's current status renders in the conversation.**
Whatever the run is doing right now — its current activity and its lifecycle state — is visible inside the transcript view itself. The conversation is the status surface: the reader never needs a second inspector to answer "is it alive, and what is it doing."
*Regression play:* `live-status: the conversation shows what the agent is doing right now` — stream a run through tool calls, assert the transcript renders the current activity at the live edge, updating as items arrive, with no external inspector required. Red when status lives only in chrome outside the conversation — the #19130 pre-fix shape.

**B2 — Sidebar task rows surface run state, live.**
A task row in the sidebar shows the run's lifecycle state — queued, claimed/starting, running, finished (completed/failed) — without opening the task, and the row updates as the run progresses. A newly running agent never appears finished (the stale-snapshot class, Paseo #8396 in the same scout report).
*Regression play:* `live-status: a sidebar row shows queued → running → finished live, never a stale snapshot` — start a run with the sidebar visible, assert the row's state transitions in order and never shows a terminal state while the run is live. Red when a row renders a stale snapshot — the #19190 pre-fix shape.

**B3 — One stable activity group; no re-grouping mid-stream.**
Consecutive activity items collapse into a **single** activity group that accumulates in place: new entries join the already-rendered group, and the group's identity is stable while the stream is live. The UI never tears the group down and re-creates it, and never re-sorts live items into new groups mid-stream — a reader watching the stream sees one thing growing, not a layout being rebuilt under them.
*Regression play:* `live-status: a streaming turn's activity entries join one stable group` — stream a turn with many activity items, assert they land in one group whose keyed identity survives every append, with zero group re-creation events. Red when each arrival re-buckets the group — the #19211/#19219 pre-fix shape.

**B4 — Activity summaries read as sentences.**
The group's collapsed summary is human-readable prose — sentence-style phrases naming what happened or is happening — not raw kind codes, event names, or JSON fragments. Raw detail stays available on expand; the summary layer is sentences.
*Regression play:* `live-status: the collapsed activity summary is sentence-style, not raw codes` — render a mixed activity stream collapsed, assert the summary contains no bare kind/event identifiers (no `tool_call`, no JSON keys) and reads as phrases. Red when the summary echoes item kinds — the #19254 pre-fix shape.

## C. Replay-honesty contract

Source: OpenHands #19225 (no "Thinking" flash during replay), #19220 (terminal output restored as itself), #19195 (saved history displayed before runtime readiness), #19245 (older history not loaded before the initial scroll). Seam: our `resumed_from` marker (NEVR-415, #162, ported to effect/v4 in #164).

**C1 — Replay renders only persisted items; nothing is synthesized.**
Reopening or replaying a transcript renders exactly what the event log holds. Transient live-stream states — a thinking flash, an in-progress spinner, an activity group's live pulse — are never synthesized during replay: **if it didn't persist, it doesn't render.** The replay path and the live path differ only by which items exist, never by extra fabricated states.
*Regression play:* `replay: a reopened transcript renders zero synthesized transient states` — reopen a transcript whose turn never closed (items exist, no terminal item), assert no transient node (thinking flash, live spinner, pulsing group) renders and every rendered node maps to a persisted item. Red when replay re-plays live-only chrome — the #19225 pre-fix shape.

**C2 — Restored terminal output renders as itself.**
A persisted terminal/tool output item replays with its own terminal rendering — same block, same framing as live — never downgraded to flattened text or a generic output node. What the reader saw live is what the reader sees again.
*Regression play:* `replay: persisted terminal output re-renders as a terminal block` — persist a transcript containing terminal output, reopen it, assert the item renders in the terminal form (same component) as the live rendering. Red when replay falls back to a generic text node — the #19220 pre-fix shape.

**C3 — Saved state paints before runtime readiness.**
On reopen, the persisted transcript renders first; runtime readiness (is a harness attached, can this run be steered) resolves after, surfacing as state on the already-rendered view. Readiness never delays the saved transcript, and loading saved state never probes the runtime at all.
*Regression play:* `replay: the saved transcript paints before the runtime reports readiness` — reopen a task with the readiness handshake delayed, assert the persisted items painted first and readiness state arrives into the painted view. Red when the route awaits runtime readiness before rendering saved state — the #19195 pre-fix shape.

**C4 — Older history is fetched only on demand.**
Reopen loads what the initial viewport needs; older items are fetched when the reader scrolls up, never eagerly before the first scroll. Opening a long transcript costs one bounded fetch, not the whole log.
*Regression play:* `replay: reopening a long transcript does not fetch older history before the first scroll` — open a transcript with many pages of history behind a scripted transport, assert only the initial page is requested until an upward scroll, then the next page. Red when open fetches the full log — the #19245 pre-fix shape.

**C5 — The `resumed_from` marker renders as context, not instruction.**
The attempt-continuity seam (NEVR-415: the `resumed_from` item — the first item of the new attempt, pushed by `resumedFrom` in `runner.ts`) renders in the transcript as a labeled boundary the reader can inspect: "resumed from attempt N." The UI never renders the resume digest as the user's prompt, as an assistant message, or as anything the operator is asked to act on — it is the model's context made visible. (Mirror of the backend seam: `renderResumeDigest` composes the digest *before* the original prompt precisely so the model reads it as context, not instruction; the UI owes the reader the same honesty.)
*Regression play:* `replay: a resumed run renders the resumed_from boundary as labeled context` — reopen a task whose transcript contains a `resumed_from` item, assert it renders as a distinct boundary/marker node labeled with the attempt number — not as a user message, an assistant message, or an actionable prompt. Red when the marker renders as prompt-like content.

## D. One failure, one surface

Source: OpenHands #19175 — "report a missing conversation once" — the third sighting of this law across the field per the 2026-11-03 scout report; pinned by name here.

**D1 — One failure, one surface.**
When the view's resource fails or is missing (task not found, transcript gone, stream dead), the failure is reported **exactly once, on exactly one surface** — the view's own error state. The same failure is never multiplied across surfaces (toast + inline banner + row badge together) and never repeated on re-render. A failure the view already shows is not shown again elsewhere.
*Regression play:* `failure: a missing task reports once, on one surface` — navigate to a task id that does not resolve, assert exactly one error node renders in the view, zero duplicate toasts/banners, and a re-render of the same state adds nothing. Red when the failure fans out to multiple surfaces or repeats — the #19175 pre-fix shape.

## E. Perf shape of the open path

Source: OpenHands #19153 (defer inactive panels), #19205 (metadata load on sidebar selection), #19213 (no rebuilding unchanged sidebar rows).

**E1 — Inactive panels defer on open.**
Opening the task view renders the active surface — the conversation; secondary panels (details, usage, diffs, settings tabs) mount lazily on first activation, not eagerly on open. Initial-open cost scales with the conversation, not the whole view tree.
*Regression play:* `perf: opening a task view mounts only the active panel` — open a task view with several secondary panels available, assert only the conversation panel mounted (zero mount records for the others), then activate one and assert it alone mounts. Red when open eagerly mounts every panel — the #19153 pre-fix shape.

**E2 — Task metadata loads on selection, not app open.**
The metadata fetch for a task begins when the reader selects it in the sidebar — not when the app or shell first opens. The app-open path loads the shell's own data; per-task work waits for a selection.
*Regression play:* `perf: selecting a sidebar task starts the metadata load; app open does not` — open the app with tasks present and nothing selected, assert zero task-metadata requests fire; select a task, assert its metadata request starts. Red when app open prefetches every task's metadata — the #19205 pre-fix shape.

**E3 — Unchanged sidebar rows are not rebuilt.**
Sidebar row updates are keyed and diffed: a row whose inputs are unchanged is not re-rendered or re-created when sibling rows or unrelated state update. A streaming update to one task touches one row, not the list.
*Regression play:* `perf: a streaming update rebuilds only its own sidebar row` — stream updates for task A while tasks B…N render unchanged, assert only A's row re-renders (stable keys, zero re-mounts for the others). Red when any list update re-creates unchanged rows — the #19213 pre-fix shape.

## F. Streaming layout-stability contract

Source: Paseo 2026-11-04 trunk — #8717 ("Keep the tapped line in place when chat disclosures expand or collapse, with the native timeline on LegendList", merged 2026-11-04T10:21Z) and #8742 ("Keep context details open while chat streams", merged 2026-11-04T07:05Z), titles and merge times re-verified at triage; plus one test-methodology datapoint, #8791 (merged 2026-11-04T15:35Z), cited as provenance for F3's failure mode, **not** as a shipped fix. Scope: layout stability — content must not move under the reader while a stream is open. The scroll mechanics of anchored streams remain owned by the interaction half ([agent-view-contracts.md](./agent-view-contracts.md), NEVR-456); F1–F3 pin what the reader's viewport and reader-set state must survive, a rendering concern. F2 extends B3 by cross-reference (identity → reader-set state); the pinned A–E laws are unchanged.

**F1 — Anchor stability under disclosure.**
The line the reader has tapped or otherwise anchored keeps its position in the viewport when a disclosure above it expands or collapses: expansion inserts space **below** the anchor, and the viewport never reflows around it. Measured immediately before and after the toggle, the anchored line's viewport offset is unchanged, and no node outside the disclosure's own span moves on screen.
*Regression play:* `stability: an anchored line holds its viewport offset across disclosure expand/collapse` — anchor a line (tap or long-press), expand a disclosure above it, assert the anchor's viewport offset is identical before and after, then collapse the disclosure and assert it again; also assert no sibling node outside the disclosure shifted. Red when expansion pushes the anchor down the screen — the #8717 pre-fix shape.

**F2 — Streaming must not reset reader-set UI state.**
While a stream is in flight, state the reader has set in the view survives every items flush: open context/detail panels stay open, groups the reader expanded stay expanded, and a scroll position the reader pinned stays pinned. Our backend's 500 ms flush cadence (`runner.ts` flushTimer) is the pacing the law must hold against — each flush re-renders the live edge, never the reader's choices. (B3 pins group **identity** through appends; F2 extends the same guarantee to the reader's open/closed and scroll state, which no flush may reset.)
*Regression play:* `stability: reader-set panels, groups, and scroll survive every items flush` — with a stream flushing every 500 ms, open a context/detail panel, expand a group, and pin scroll above the live edge; assert all three survive consecutive flushes unchanged. Red when any flush collapses the panel, re-closes the group, or snaps the reader's scroll back — the #8742 pre-fix shape.

**F3 — Reveal makes room before it expands: scroll-then-expand, never expand-then-jump.**
An interaction that reveals content — opening a thinking or tool-call group, expanding a disclosure — first scrolls the target into view, **then** expands it, in that order. The expansion must never race a scroll snap or trigger layout that moves content the reader is looking at: by the time any height changes, the reveal target is already in view and the content at the reader's pre-interaction viewport offset has not moved. **Provenance (corrected at triage):** Paseo #8791 is a *test-methodology* datapoint, not a shipped product fix — its Playwright suite "wheels the group into view before clicking, as a reader would" because the web timeline leaves sticky-bottom only on user input and snaps back to the bottom mid-interaction (PR body, merged 2026-11-04T15:35Z). The sticky-bottom snap-back failure mode is real and documented in that PR body; the product law above is ours to pin.
*Regression play:* `stability: opening a group scrolls it into view before it expands` — with the timeline in a reader-scrolled (non-sticky-bottom) state, open a partially-visible thinking/tool group; assert the scroll-into-view completes before any height change (the scroll event precedes the expand's layout), and assert the content at the reader's pre-interaction viewport offset is unmoved after the reveal. Red when the expand fires while the target is still out of view, or a snap-back yanks the viewport mid-interaction — the sticky-bottom snap-back failure #8791's PR body documents (test-methodology provenance, not a shipped fix).

## G. Background-work contract

Source: Paseo #6220 — "Show and stop agent background work" (merged 2026-11-06T12:49:50Z, title and merge time re-verified at triage) — the field's complete shipped surface for the doctrine that **an agent session's lifecycle is not one turn**: when a foreground turn ends while agent-owned work continues (live shells, monitors, scheduled loops, delegated tasks), the product says so — it does not silently flip to done. Convergent precedents: Multica MUL-9960 (pending tasks modeled first-class, moved along on runtime switch), Factory changelog 2026-11-06 (Loops scheduled across idle pauses), Devin background sessions. Pinned from NEVR-513's triage of the 2026-11-06 competitors scout report (NEVR-512, PR #205 → `dev` `8dc638b`), with triage's one anchor correction: the chapter lives here, in the lifecycle doc — run-state transitions (G1, G4) and replay-from-persisted-state (G5) are lifecycle laws under the two docs' split ("this doc owns interaction, that doc owns lifecycle"); the interaction half cross-references and owns none of it.

**Data-source note — the runtime half does not exist yet, and the chapter does not wait for it.** Stellarc has no runtime surface for agent-owned background work today: no background/shell/monitor concept anywhere in `packages/agents/src` (grep-verified 2026-11-06 on `dev`), and ACP 1.7 — our exact `@agentclientprotocol/sdk` pin — carries no background-work inventory (Paseo reads provider-specific inventories from Claude, Codex, and OpenCode v2). The UI contract below is pinned now, as acceptance lines; the data arrives when ACP grows an inventory or a provider extension lands. Every play in this section is therefore **pre-registered**: named and specified here per the house rule, to be demonstrated red-when-broken / green-when-it-holds at implementation time, against whatever inventory source exists by then.

**G1 — A turn ending is not the run ending while agent-owned work continues.**
When a foreground turn reaches its end and agent-owned work (a live shell, a monitor, a scheduled loop, a delegated task) is still running, the run does not transition to a terminal state: it stays running and surfaces a **background-work count near the composer**. The count is non-zero exactly when the inventory is non-empty. The reader is told the session is still working — never a silent flip to done.
*Regression play (pre-registered):* `background: a turn that ends with live agent-owned work keeps the run running and shows the count` — end a foreground turn with scripted background items live, assert the run state remains running (its `TASK_STATUSES` value, `protocol.ts`, never crosses to terminal) and the composer area renders a non-zero background-work count. Red when the run flips terminal while agent-owned work continues — the silent-done failure mode.

**G2 — The count opens an expandable track of live items.**
Activating the count expands a track with one entry per live background item: its **kind**, a **friendly description**, its **elapsed time**, and — where the provider supports stopping an individual item — a per-item **Stop** action. The track is the inventory rendered; nothing live is hidden behind a bare badge.
*Regression play (pre-registered):* `background: the count opens a track listing every live item with kind, description, elapsed, and per-item Stop` — with N scripted live items, open the count, assert the track lists exactly N entries, each carrying its kind, a human-readable description, and a ticking elapsed time; where the provider supports per-item stop, each entry exposes its own Stop. Red when the count expands to nothing, or entries omit kind, description, elapsed time, or their Stop.

**G3 — The composer stays usable; foreground Interrupt scopes to the active turn only.**
While background work runs, the composer remains editable and accepting input — starting a new turn never requires stopping background work. The foreground Interrupt control stops the active turn only; it never silently stops background items.
*Regression play (pre-registered):* `background: the composer stays editable while background work runs, and Interrupt stops only the active turn` — with background items live, type into and send from the composer; then, with a turn in flight and background items live, fire Interrupt; assert the composer accepted the input, the in-flight turn stopped, and every background item survived. Red when background work disables the composer, or Interrupt sweeps background items along with the turn.

**G4 — Stopping the last background item is the real terminal transition, attributed.**
Stopping the run's last live background item transitions the run to its real terminal state — not before (G1) — and the stop is **attributed in the transcript**: a persisted item records what stopped it, so the transition replays honestly under C1.
*Regression play (pre-registered):* `background: stopping the last live item terminals the run, with the stop attributed in the transcript` — with exactly one background item live, stop it; assert the run reaches its terminal state and the transcript carries an attributed stop item naming what stopped it. Red when the run lingers running on an empty inventory, or terminals with no attributed stop item.

**G5 — Reconnect and replay render the inventory from persisted state.**
A reader who reconnects mid-run — or reopens the task later — sees the background-work inventory rendered **from persisted state, not just the live stream**: the same count and track (G2) a continuously-connected reader sees, rebuilt from the event log. If it didn't persist, it doesn't render (C1's law, extended to the inventory).
*Regression play (pre-registered):* `background: reconnect and reopen render the live-item track from persisted state` — with background items live, drop and reconnect the transport, and separately reopen the task from persisted state only; assert both paths render the same live-item track from persisted items, not from the live stream alone. Red when the inventory renders only for a reader who never dropped.

## Board-lane applicability (recorded, not laws)

The same scout report verified Multica v0.8.0's attention surfaces — noted here so they are on record when the `apps/web` board-lane briefs are written. They are operator-attention concerns for the board surface, not agent-view laws:

- **Unread dot on finished agent runs** (MUL-8438): a finished agent run the operator has not seen is visually distinct from one they have.
- **Agent-status filters savable into views** (MUL-8436): filtering by agent-run status is a first-class saved-view dimension.
- **Status flip from the board without opening the issue** (MUL-8437): triage actions act directly on the board row.

All three ride the same `TASK_STATUSES` vocabulary (`protocol.ts`) that law B2 renders in sidebar rows.

## Maintenance

- A law changes only by editing this doc in a PR. Implementation issues quote laws; they never fork them.
- When an implementation PR lands a play, add the link beside its law (one line: play name → PR/test file).
- Pinned sources: OpenHands v1.35.0 release body (published 2026-11-03T18:47Z — #19155, #19130, #19190, #19211/#19219, #19254, #19225, #19220, #19195, #19245, #19175, #19153, #19205, #19213, titles re-verified at pin time); the 2026-11-03 competitors scout report (NEVR-460, PR #180, merged to `dev` as `9c71951`); Multica v0.8.0 release body (MUL-8436/8437/8438); our NEVR-415 `resumed_from` seam (#162, effect/v4 port #164); [transcript schema v2](../transcript-schema-v2.md); the 2026-11-04 competitors scout report (NEVR-478, PR #189, merged to `dev` as `864e87e`); Paseo 2026-11-04 trunk — #8717 and #8742 (shipped product fixes; sources of F1/F2, titles and merge times re-verified at triage) and #8791 (**test-methodology provenance only, not a shipped fix**: its PR body documents the web timeline leaving sticky-bottom only on user input and snapping back to the bottom mid-interaction, and its Playwright suite "wheels the group into view before clicking, as a reader would" — that documented failure mode is why F3 pins scroll-then-expand; do not "correct" #8791 into a shipped product fix); the 2026-11-06 competitors scout report (NEVR-512, PR #205, merged to `dev` as `8dc638b`); getpaseo/paseo #6220 (merged 2026-11-06T12:49:50Z — the complete background-work surface, source of G1–G5); Multica MUL-9960; Factory changelog 2026-11-06.
