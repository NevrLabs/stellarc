# Dependency-aware dispatch contracts (board lane)

> **Status:** Pinned 2026-11-26 (NEVR-845, from NEVR-843's triage of the 2026-11-26 competitors scout report NEVR-842, PR #367 → `dev` `12fd2c9e`; the Multica #10279 PR body re-read live at pin time — merged 2026-11-24T04:12:29Z, +2,401/−157 — and the gap greps re-run at this branch's head, `80ee7c91`).
>
> **What this is.** The pinned acceptance criteria the board's dependency-aware dispatch surface — blockers, waiting, dependency-gated run admission — is built and reviewed against. Pre-registered ahead of the surface, the F4/F5/F6/E5–E7/D2/V1–V5 pattern: the lines below are pinned **before** any dependency, admission, or waiting surface exists, so the first task-relation port brief quotes law instead of inventing it. This doc is acceptance lines only — it mandates no implementation, no schema, no route. The laws precede the surface; that is the point.
>
> **How to use.** Every law is phrased testably and carries exactly one **named regression play** (house rule: one play per law). At implementation time each play is demonstrated **red when the law is broken, green when it holds** — sabotage-and-revert — and stays in the suite as the law's guard. Briefs for the dependency/board issues **quote these laws as acceptance criteria and link this doc**; they do not fork them.

Related: [scope-roots.md](./scope-roots.md) (the authorization inventory — a dependency surface still declares exactly one scope root there, and NEVR-754's §Visibility defaults is law 6's source), [agent-view-lifecycle-contracts.md](./agent-view-lifecycle-contracts.md) (its "Board-lane applicability" section is recorded, not laws), [ROADMAP.md](../ROADMAP.md) (the M1 group order names **task-relation** as a future port group).

## Pre-registered ahead of the surface

Verified at pin time, `effect/v4` @ `80ee7c91` (greps re-run at pickup; head unchanged from filing):

- **No native dependency/admission surface.** `git grep -iE 'blocked_by|blocker|task.?relation|depends' -- packages/kaneo apps/web` matches only the MCP **proxy** tools (`packages/kaneo/src/mcp/schemas.ts`, `packages/kaneo/src/mcp/tools.ts`: `create/get/delete_task_relation`, proxying the legacy `/api/task-relation` routes — native code over the legacy surface, the strangler estate, zero dispatch logic) plus prose uses of the word "dependency" in comments. Nothing gates a run on a blocker; nothing admits, waits, or wakes.
- **The legacy estate carries the relation graph, not dispatch.** `packages/kaneo-legacy/src/task-relation/` is Kaneo's lifted relation surface: `relationType` picklist `["subtask", "blocks", "related"]`, a depth-clamped subtask tree, `task-relation.*` websocket refresh events. A display graph — and that estate is deleted at M1 exit ("`packages/kaneo-legacy` deleted", ROADMAP M1 exit criterion).
- **The fork estate carries the relation UI.** `apps/stellarc-ui/src/components/task/relation-direction.ts` maps the `blocked_by`/`blocks` intent; `task-relations.tsx` renders it. That is the pixel-frozen fork lift scheduled for deletion at M1 exit — the future port's reference, **not** a native surface and not law.
- **No brief exists for the port.** ROADMAP's M1 group order names task-relation as a future port group; no Multica brief for it is open at pin time. These laws are pinned before that brief is written.
- **Lane hygiene.** `agent-view-lifecycle-contracts.md`'s "Board-lane applicability" section (~line 198) is explicitly recorded-not-laws and agent-view-scoped; `scope-roots.md` is the authorization inventory whose law is code (`packages/contracts/src/scope.ts` + the `scope` field of every `McpToolSpec`) — dependency laws do not go there. Hence this new lane doc (the NEVR-603 precedent: a new lane ships as a new doc).

## The laws

**1 — Admission acknowledges release.**
A dependency release is acknowledged in the same transaction as the run admission it triggers: the admitted run's ready state is written with the admission, and that ready state is idempotent — once the run completes, no later scan or event re-admits the same released work. An acknowledgement failure rolls back the admission (the object stays waiting, never half-admitted), and reopening a blocker creates a new wait rather than resurrecting the old release.
*Precedent:* Multica #10279 — "ordinary agent, squad leader and deferred admissions acknowledge the dependency release in the same transaction as task creation. The shared ready state prevents another dispatch after that run completes; an acknowledgement error rolls back admission, and reopening a blocker creates a new wait." The pre-fix shape it closes: promoting a parked issue after its blockers ended "could also start it twice: an ordinary run completed before the next dependency scan, and the scan admitted the same released work again."
*Regression play (pre-registered):* `dispatch: a released dependency admits exactly one follow-up run, never a second` — release a blocker whose object's run is already active, let that run complete, and let any later dependency scan fire; assert exactly one follow-up run was created for the release. Red when the release is re-admitted after the first run completes — the #10279 double-start shape.

**2 — Cycles die at write.**
A dependency write that would create a cycle is rejected at write time with a readable error that names the cycle — including cycles through stage order, parent/descendant dependencies, and edges that would form across a moved subtree. The graph never persists an invalid edge for a background job to trip over; ancestry validation stays bounded to the changed object's ancestors and descendants, so it stays cheap at write.
*Precedent:* Multica #10279 — "Reject cycles, including cycles through stages, and parent/descendant dependencies. Limit ancestry validation to the changed issue's ancestors and descendants, including dependencies across a moved subtree."
*Regression play (pre-registered):* `dispatch: a cycle A→B→A is rejected at write with the cycle named` — create A blocked-by B, then attempt B blocked-by A; assert a 4xx whose error names the cycle path, and that no edge persisted. Red when the write succeeds and the cycle surfaces later as a stuck wait or a spinning scan.

**3 — Waiting is a state, not a poll.**
An object with unresolved blockers renders a visible Waiting/blocked state that names its blockers; the wait clears on the transactional event that resolves the blocker (close, cancel, delete) and rearms on the transactional change that creates one — never on a periodic scan. Waiting is a first-class state on list/board/table surfaces with its own markers and filter, derived from persisted dependency facts so every reader — live, reconnecting, or reopening — sees the same wait.
*Precedent:* Multica #10279 — "Waiting, parked and closed dependency rules clear their due time instead of polling. Transactional issue/dependency changes rearm them"; the Waiting sidebar, blocked markers on list/board/table, and a Blocked filter.
*Regression play (pre-registered):* `waiting: a blocked object shows Waiting with its blockers named, and the wait clears on the release transaction` — create a blocked object, assert the Waiting state renders with the blocker named; close the blocker and assert the wait clears with that transaction, with no polling interval in the path. Red when the state moves only on a scan, or renders without naming its blockers.

**4 — Automation wakes, humans (and agents) steer.**
Dependency completion may *start* the assignee's run — that is automation's whole job on this surface — but it never changes the object's status by itself: status stays under the person or agent's control, status categories are immutable through the API, and a parked object stays parked even when its prerequisites end. A woken run is a dispatch fact, not a state transition.
*Precedent:* Multica #10279 — "Keep issue status under the person or agent's control. Status categories are immutable through the API… Backlog remains parked." Carried, GitHub 11-23 (issue-statuses + repository boards): assigning an agent IS a status transition, and status changes are automation triggers — the field's two-sided answer is ours too: machines write status; dispatch gates on dependency truth.
*Regression play (pre-registered):* `dispatch: completion wakes the assignee's run and never touches the object's status` — complete the blocker of an assigned ready object and of a parked one; assert the assignee's run starts, both objects' statuses are unchanged, and the parked one dispatches nothing. Red when a release flips status on its own — the machine-steers shape.

**5 — No assignee is an event.**
A released dependency whose object has no usable assignee — unassigned, or an assignee that cannot run — records that fact as a persisted, surfaced event; it is never a silent no-op. The release is not lost: it stands as recorded work, and a later assignment picks it up.
*Precedent:* Multica #10279 — "Completion wakes the agent or squad leader, notifies a member, or records that no usable assignee exists."
*Regression play (pre-registered):* `dispatch: a released dependency with no assignee writes a no-assignee event the board shows` — complete the blocker of an unassigned object; assert a no-assignee event is persisted and visible on the board/notification surfaces. Red when the release vanishes without a trace.

**6 — Blocked visibility follows reader scope.**
Blockers the reader cannot see are redacted from every derived surface — release timelines, notifications, inbox, broadcasts, trigger evidence — the sharing-visibility law applied to the dependency graph: derived surfaces answer from the source object's scope, never wider. A private blocker renders as a redacted relation (no title, no identifier), never a titled one; the aggregate waiting count survives the redaction.
*Precedent:* Multica #10279 — "Keep private blocker titles and identifiers out of unauthorized reads, public broadcasts, notifications and trigger evidence. Preserve the aggregate waiting count." Ours: the sharing-visibility law, NEVR-754 `docs/design/scope-roots.md` §Visibility defaults (PR #335, open at pin time) — V3, derived surfaces inherit, never widen.
*Regression play (pre-registered):* `dispatch: a private blocker shows a redacted relation to an unauthorized reader` — block an object with a private blocker; read the relation surface as a reader who cannot see the blocker; assert the relation renders redacted — no title, no identifier — while an authorized reader sees it named. Red when a private blocker's title or id reaches an unauthorized surface.

## The pre-registered play set

The four plays the first implementation brief quotes as its checklist — each already attached to its law above, restated here as the set:

- **(a)** a blocker completing while a run is already active produces exactly one follow-up run (law 1);
- **(b)** a cycle A→B→A is rejected at write with the cycle named (law 2);
- **(c)** an object with a private blocker shows a redacted relation to an unauthorized reader (law 6);
- **(d)** a released dependency with no assignee writes a no-assignee event and the board shows it (law 5).

## Sources

- Multica #10279 / MUL-8860 — "add issue blockers and automatic dependency wakeups" (+2,401/−157, merged 2026-11-24T04:12:29Z; PR body re-read live at pin time) + Multica v0.13.0 (published 2026-11-25T10:24:34Z).
- GitHub, 11-23 issue-statuses + repository boards changelog entries (carried): agent assignment as a status transition; status changes as automation triggers.
- The 2026-11-26 competitors scout report (NEVR-842, PR #367 → `dev` `12fd2c9e`) and NEVR-843's triage of it.
- The fork estate's lifted relation UI (`apps/stellarc-ui/src/components/task/`) as the future port's pixel reference, **not as law**.
- Gap verification: `effect/v4` `80ee7c91` (greps re-run at pin time).

## Maintenance

- A law changes only by editing this doc in a PR. Implementation issues quote laws; they never fork them.
- When an implementation PR lands a play, add the link beside its law (one line: play name → PR/test file).
