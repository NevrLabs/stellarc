# Agent-view interaction contracts (apps/web)

> **Status:** Pinned 2026-11-03 (NEVR-456, from the 2026-11-03 design scout report, PR #177, adopted as filed after primary-source verification: shadcn-ui/ui#11465 diff and PR body, signoff-ui 0.12.1/0.13.0/0.14.0 release notes, and our own closed-PR bodies #91/#115/#118 read live). Slop-redline section (Section D) pinned 2026-11-05 (NEVR-493, from NEVR-491's triage of the 2026-11-05 design scout report NEVR-490, PR #194 → `dev` `6b793f7`; the unslop repo, README, and CC BY 4.0 license re-verified live at pin time).
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

## D. Slop redline

Source: [unslop](https://github.com/heydamir/unslop) — Damir Sokolovsky (@heydamir), created 2026-10-29, CC BY 4.0 (repo, README, and license re-verified live at pin time), reached through the 2026-11-05 design scout report (NEVR-490, PR #194 → `dev` `6b793f7`, adopted at NEVR-491 triage). The stack beneath this doc is mechanical: `@shadcn/lint` at error with zero exceptions (`ui-design-contracts`, NEVR-455/475), the `onsystem-diff` diff gate, the token law in [DESIGN.md](../../DESIGN.md) — the lint catches off-token classes, but nothing in the stack named the *aesthetic* failure modes agent-written views drift into. unslop turned that review into a method — find the slop first, set a direction from the product, then fix pass by pass like a designer working a redline — and that method is adopted here as the aesthetic acceptance layer on top of token/class discipline. Its five signs of slop are pinned below as **hard negatives**: a view that shows any of them fails review, and no direction argument rescues it. License discipline: the method is credited by name and link; every sentence below is ours, zero text is taken from the repo (CC BY 4.0 would make any taken text an attribution obligation — taking none is the intended path), and the skill itself is never vendored into this repo.

**D1 — Decoration is carried by the token layer; a view never paints its own gradient.**
Every gradient the system has lives in the token layer (`styles/app.css`): the accent sweep, the edge fades, the row-grid texture. A decorative gradient in a view source — background washes, gradient text fills, aurora/mesh blocks — is slop no matter how well it is built: if the design did not put the gradient in the token layer, the view does not get one.
*Regression play:* `slop: zero gradients in view sources outside the token layer` — CI grep gate over `apps/web/src` (excluding `styles/app.css`) for gradient declarations and gradient utilities; zero matches. Red when a view ships its own gradient decoration.

**D2 — Depth is flat; glow never stands in for it.**
Elevation is surface layering plus hairline borders; the one shadow ladder serves floating chrome only (DESIGN.md, Elevation & Depth). Glow effects — colored box-shadow blooms under buttons and cards, text-shadow halos, blur blooms behind headings — read as neon, not depth, and are a hard negative even when the color is on-token.
*Regression play:* `slop: zero glow shadows in view sources` — CI grep gate for non-token-ladder box-shadows and any text-shadow in view sources; zero matches. Red when a glowing card or haloed heading lands.

**D3 — Emoji never label the UI.**
Icons come from the lucide set; status reads through an 8px dot plus a text label (DESIGN.md, Components). An emoji standing in for either — in button labels, section headers, empty states, status lines — is a hard negative: it renders inconsistently across platforms, carries no accessible name, and reads as a placeholder, not a label.
*Regression play:* `slop: zero emoji in UI label positions` — CI grep gate over user-facing string literals in view sources for emoji code points; zero matches. Red when an emoji-labeled control lands.

**D4 — Copy speaks at speaking volume.**
Hierarchy is carried by size and weight, never by shouting (DESIGN.md, Typography). Shouty copy — ALL-CAPS strings, exclamation-driven CTAs — is a hard negative in every register the views own: buttons, headings, empty states, banners. Acronyms, keycap labels, and mono-rendered data are not copy and are exempt.
*Regression play:* `slop: zero shouty copy in view sources` — CI grep gate for all-caps string literals and exclamation-marked CTA/heading strings; zero matches. Red when a shouting empty state lands.

**D5 — Spacing resolves to the scale; nothing is hand-spaced.**
Density lives in the layout constants and the spacing scale; a view is never re-spaced by hand (DESIGN.md, Layout). Hand-tuned one-off gaps — arbitrary `p-[…]`/`gap-[…]` values, raw px margins stacked beside scale values — produce the uneven rhythm that is the fifth sign of slop; arbitrary values already fail `ui-design-contracts`, and the redline reads the same line aesthetically: if sibling gaps do not resolve to scale steps, the view is not done.
*Regression play:* `slop: every margin, padding, and gap resolves to the scale` — the `ui-design-contracts` arbitrary-value gate plus a review check that sibling gaps hit scale steps. Red when a hand-spaced view lands.

**The method — direction before edits, in that order, always.** The five negatives are a review instrument, never an edit list: editing straight from the slop list produces a clean screen with no character in it, and removing the failure modes is not the goal — a designed interface is. The required order is unslop's: **audit** the view against D1–D5 first, naming every sign found and where it lives; **direction** second — character and world taken from the product (what the surface is for, which one or two moments may carry the accent, what its signature detail is), stated before anything changes; **edits** third, pass by pass, one concern per pass. A clean audit is a finding — "no slop, at most small refinements" — not an invitation to redesign.

**Acceptance.** Agent-view PRs cite this checklist the way they cite Section F of the lifecycle contracts: the PR states the audit result and the direction before the edits, and a view PR carrying edits without both is not reviewable.

## Maintenance

- A law changes only by editing this doc in a PR. Implementation issues quote laws; they never fork them.
- When an implementation PR lands a play, add the link beside its law (one line: play name → PR/test file).
- Pinned sources: shadcn-ui/ui#11465 (message-scroller `reconcileFollowMode`/`handleResize`, merged 2026-11-02); signoff-ui release notes 0.12.1/0.13.0/0.14.0 (PRs #227/#231, #237, #230/#232/#239 upstream); our closed PRs #91, #115, #118 (branches kept for reference); the #73 close comment; ADR 0014; [unslop](https://github.com/heydamir/unslop) (CC BY 4.0 — method source for Section D, credited and linked, not vendored, zero text taken).
