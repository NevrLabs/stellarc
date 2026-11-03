# Agent-view interaction contracts (apps/web)

> **Status:** Pinned 2026-11-03 (NEVR-456, from the 2026-11-03 design scout report, PR #177, adopted as filed after primary-source verification: shadcn-ui/ui#11465 diff and PR body, signoff-ui 0.12.1/0.13.0/0.14.0 release notes, and our own closed-PR bodies #91/#115/#118 read live).
>
> **What this is.** The pinned acceptance criteria the `apps/web` transcript and agent views are built and reviewed against. It carries forward — and supersedes — the stellarc-ui-scoped spec deltas recorded on NEVR-355 (blocked; that substrate retires at cutover per ADR 0014, NEVR-436).
>
> **Provenance.** ADR 0014 closed the PRs that carried Stellarc's interaction contracts — #91 (chat primitives and the anchored-stream amendment), #115 (approval card), #118 (usage element), all closed 2026-11-02 with branches kept for reference. The #73 close comment is the governing promise: agent surfaces "are redesigned inside that shell when the agent views land in apps/web." The contracts do not die with those branches. They are restated here, substrate-free, for the apps/web agent views (durable-streams lane: NEVR-441/442 and after).
>
> **How to use.** Every law is phrased testably and carries exactly one **named regression play** (house rule: one play per law). At implementation time each play is demonstrated **red when the law is broken, green when it holds** — sabotage-and-revert — and stays in the suite as the law's guard. Briefs for the apps/web transcript/agent-view issues **quote these laws as acceptance criteria and link this doc**; they do not fork them.

Related: [agent-view-lifecycle-contracts.md](./agent-view-lifecycle-contracts.md) (NEVR-463 — the lifecycle & replay half of the same surfaces: render-first, live status, replay honesty; this doc owns interaction, that doc owns lifecycle), [ADR 0014](../adrs/0014-stellarc-app-tanstack-db.md) (apps/web decision), [transcript schema v2](../transcript-schema-v2.md) (the payload side these views render), [shell design](./shell/) (the visual shell they live in).

## Install path for reference parts

Reference parts enter `apps/web` via the **shadcn community registry, not npm**: `shadcn add @agent-ui-kit/<part>` (community directory) for agent-UI parts; `signoff-ui` ships registry-natively (`registry.json` in-repo — the shadcn CLI install is the documented part-by-part path; `npm i signoff-ui` exists only for the whole-kit route). What the registry copies in, we own: parts land as source in `apps/web`, are adapted to the Base UI dialect and the shell tokens, and are then covered by these contracts like first-party code. A registry pull that asks for runtime payload dependencies is a decision, not an install — the stellarc-ui lane's rule stands (no `@shadcn/react` payload deps, #115).

## A. Anchored-stream scroll contract

Source: shadcn-ui/ui#11465 (merged 2026-11-02, fixes #11125) — vendored `message-scroller` semantics: the `reconcileFollowMode` re-arm gate and the `handleResize` spacer drain. The pre-fix failure modes are the contract's motivation: with `autoScroll` on, a manual scroll released the anchor, follow re-armed, and `scrollToEnd` zeroed the reserved tail spacer in a single frame — the viewport yanked to the live edge mid-reply; with `autoScroll` off, the spacer froze at its height — a viewport of dead space stranded below the reply, never resolving.

Context: while a turn streams anchored (`autoScroll` + `scrollAnchor`), the scroller reserves a **tail spacer** below the content so the reply can grow without jumping the viewport.

**A1 — A manual scroll during an anchored streaming turn releases the anchor.**
The reader's gesture ends follow — not the next chunk. A commit arriving while the mode is `free-scrolling` does not re-arm following; re-arming requires the anchor conditions anew (including no reserved spacer, A4).
*Regression play:* `anchored-stream: manual wheel during a streaming turn releases follow, and the next chunk does not re-arm it` — stream an anchored turn, wheel up mid-stream, deliver the next chunk, assert follow is released and the viewport did not move to the live edge. Red when any commit path re-arms follow on a released anchor.

**A2 — A released tail spacer drains; no dead space is stranded.**
When follow releases during a manual scroll, the reserved room is consumed by the reply as it grows — the spacer shrinks toward zero (`max(0, scrollTop + clientHeight - contentBottom)`) and follow re-engages when the spacer reaches zero at the real bottom. The drain runs with `autoScroll` **off** as well: a released spacer never freezes at its reserved height.
*Regression play:* `anchored-stream: released spacer drains as the reply grows (follow off)` — release the anchor, stream enough content to fill the reserved room, assert the spacer height reaches 0 with no blank band below the last message. Red when the spacer is consumed only by `scrollToEnd` — the #11465 root cause.

**A3 — Release causes no one-frame viewport yank.**
Releasing the anchor never zeroes the spacer in a single frame. The reader keeps their scroll position while the reply fills the room below them.
*Regression play:* `anchored-stream: release does not move the viewport (no single-frame yank)` — record the scroll offset at release, deliver the next chunk, assert the offset is unchanged through every intermediate frame. Red when release triggers an immediate spacer collapse / `scrollToEnd`.

**A4 — "At end" is measured including the spacer zone.**
The at-end predicate is computed over the full scroll geometry **including the reserved tail spacer**. A reader resting inside the spacer zone is inside the live edge's reserved room: follow-mode decisions must be spacer-aware, and a reader in the spacer zone cannot re-arm following with their own gesture (re-arm additionally requires `spacerHeight === 0`).
*Regression play:* `anchored-stream: a reader inside the spacer zone is not re-armed into following by their own gesture` — park the viewport inside the reserved zone after release, gesture within the zone, deliver a chunk, assert follow stays off. Red when at-end is measured against `contentBottom` alone — the #11465 `scrollable.end` bug that made exactly this gesture re-arm follow.

## B. Human-in-the-loop interrupt contract (signoff-ui 0.12.1–0.14.0 deltas)

Source: dgesteves/signoff-ui releases 0.12.1 (2026-10-29), 0.13.0 (2026-10-29), 0.14.0 (2026-10-30), verified on npm; the release-note semantics restated as Stellarc law. #115's approval card established the answer seam (`onAnswer(toolCallId, optionId)`); these laws are what the wired apps/web surface must uphold.

**B1 — A tool approval returns a result the agent receives.**
An approval or denial is not a UI event that vanishes: it resolves the interrupt and becomes a tool result the agent acts on. Approve → the tool runs and its result returns; deny → the agent receives the denial (with reason, when given). A diff review resolves the same way: the agent gets back each file with only the accepted hunks applied, the rejected hunks, and every comment with its lines. No card may settle into a state whose answer was never delivered.
*Regression play:* `hitl: answering an approval card delivers a result to the agent` — scripted interrupt; approve via the card and assert the tool result the agent received carries the decision; deny with a reason and assert the reason reaches the agent. Red when the answer seam fires no result (the severed-seam sabotage from #115).

**B2 — Every tool call discloses its full arguments.**
The command line is not enough: every argument of the call is visible before approval. `{ command: 'rm -rf build', dangerouslyDisableSandbox: true }` must show both — secondary arguments rendered as JSON below the command line, the focused surface naming the salient ones. Repeated objects render truthfully; approving an edit made in the card's editor never sends a placeholder (`"[Circular]"`) to the tool in place of the object.
*Regression play:* `hitl: a call whose danger lives in a secondary argument shows it before approval` — propose a call with a risky non-command argument, assert the card renders it and the accessible description names it. Red when only `command` and a text `cwd` render — the 0.12.1 #227 bug.

**B3 — One answer per interrupt.**
A second answer to the same interrupt — a retry, a duplicate card, an app button — is ignored; the first answer stands. An interrupt past its expiry takes only a cancellation: deny sends `status: 'cancelled'`; approve sends nothing and surfaces the expiry error.
*Regression play:* `hitl: a second answer to the same interrupt changes nothing` — answer approve, then fire deny for the same interrupt from a duplicate card, assert the resumed run received exactly the first decision. Red when the second resume replaces the first — the 0.13.0 #237 bug.

**B4 — Markdown task-list checkboxes get accessible names.**
GFM task lists (`- [x] Read the route`) render as named checkboxes that read out with their state — never an unnamed control; an unnamed checkbox is an axe-critical `label` violation. Agents write plan lists constantly, so this is a standing a11y line for the **whole transcript renderer**, not only approval surfaces.
*Regression play:* `transcript-a11y: every markdown task checkbox has an accessible name and state` — render a message with a mixed `- [ ]`/`- [x]` plan, run axe on the transcript, assert zero unnamed-control violations and each checkbox announced with name and checked state. Red when checkboxes render bare — the 0.14.0 #230 axe-critical.

**B5 — A run that dies after resume reopens its interrupts.**
If the resumed run fails (`RUN_ERROR`, a broken stream) — or dies before it starts — the pending interrupts reopen: a call whose tool had not run asks again; a call whose tool ran resolves with its result. The thread is never left stuck with nothing answerable, and the next resume is never refused for a pending interrupt.
*Regression play:* `hitl: a resumed run dying on RUN_ERROR reopens the unanswered card` — approve, kill the resumed run mid-flight, assert the card asks again (tool not run) or shows its result (tool ran), and the next resume is accepted. Red when interrupts are cleared at run start — the 0.14.0 #239 bug.

**B6 — Cancelled mid-write reads stopped, not done.**
A turn cancelled while the agent was writing renders stopped with its text cut off (streaming state, not completed); `stop()` before the server answers reads as stopped, never as an abort error; only a natural end (`end_turn`, `max_tokens`, `refusal`) reads done.
*Regression play:* `transcript: cancelling during a streaming reply shows stopped with cut-off text` — stream a reply, cancel mid-write, assert the run reads stopped, the partial text is not styled or announced as a completed turn, and no abort error surfaces. Red when turn-close marks cancelled text done — the 0.14.0 #232 bug.

## C. Usage telemetry on the transcript

Source: the #118 usage element (NEVR-243 slice 2) — its charter laws were already proven by tests on the stellarc-ui lane and are restated here unchanged in substance. Shape: one compact line per turn (tokens in/out/total, context/window, cost + currency when reported) with a per-run roll-up above. The display is **harness-reported only**.

**C1 — Harness-reported only; no client-side cost math.**
Costs and token counts come from the harness's usage reports. No pricing table, no model-id normalization, no computation of cost from tokens anywhere in the client.
*Regression play:* `usage: zero pricing-table or cost-computation code in the transcript package` — CI grep gate (price maps, model→price mappings: zero matches). Red the moment fabricated-cost code lands — the #118 grep-gate pattern (sabotage: add a price map → red).

**C2 — Absent cost renders an em-dash, never $0.00.**
A turn with no reported cost shows `—`; currency comes only from the reported `cost_currency`. Fabricating `0.00` for absent cost is a lie about money.
*Regression play:* `usage: a tokens-only turn shows an em-dash, never $0.00` — render the tokens-only fixture, assert the serialized cost is null and the rendered line shows `—`, with no zero currency figure anywhere. Red when `formatCost` fabricates `0.00 USD` — the #118 sabotage.

**C3 — Within a turn, the last usage report wins; reports are never summed.**
Usage reports within one turn are cumulative snapshots — the last report is the truth for that turn; summing them double-counts.
*Regression play:* `usage: intra-turn duplicate reports take the last, not the sum` — feed two reports within one turn (the second a superset of the first), assert the line shows the second's totals, not their sum. Red when the adapter accumulates within a turn.

**C4 — The per-run roll-up sums tokens across turns and cost across turns that report one; no usage, no line.**
Totals: tokens summed over turns; cost summed only over turns that report a cost. When no turn reports usage, nothing renders at all.
*Regression play:* `usage: totals sum tokens across turns, cost only across reporting turns; the no-usage case renders nothing` — three fixtures (mixed, tokens-only, no-usage); assert the totals-line math on the first two and zero usage nodes on the third. Red when totals fabricate cost or render an empty row.

## Maintenance

- A law changes only by editing this doc in a PR. Implementation issues quote laws; they never fork them.
- When an implementation PR lands a play, add the link beside its law (one line: play name → PR/test file).
- Pinned sources: shadcn-ui/ui#11465 (message-scroller `reconcileFollowMode`/`handleResize`, merged 2026-11-02); signoff-ui release notes 0.12.1/0.13.0/0.14.0 (PRs #227/#231, #237, #230/#232/#239 upstream); our closed PRs #91, #115, #118 (branches kept for reference); the #73 close comment; ADR 0014.
