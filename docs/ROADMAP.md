# Stellarc: product roadmap (owner: Talos)

Status: living document. Updated by the orchestrator loop
(`tools/orchestrator/`). Multica project "Stellarc v2 — agent-native" is the
system of record for tasks. This file is the *why* and the *order*.

## Product thesis

Stellarc is a work tracker where agents are first-class teammates, and those
agents can be **anyone's**. Multica proved the shape (issues → agents →
runtimes), but it locks you to its daemon's built-in adapters. Stellarc's
wedge:

1. **Bring your own agent.** Any ACP harness on any machine, via
   `stellarc-node` (ADR 0011). Credentials never leave the owner's box.
2. **Kaneo-grade tracker.** Boards, tickets, projects, repos, docs, the
   things humans actually live in, with the agent loop built in rather than
   bolted on.
3. **Inert, auditable control plane.** An event log of everything humans and
   agents did, transcripts as node claims, and grants as the security model
   (charter D1–D25).
4. **Effect v4 end to end.** Typed errors, spans on every call, schema at
   every boundary. That is how a small team ships something this broad
   without it rotting.

## Milestones

| M | Name | Exit criterion (demo) |
|---|---|---|
| **M0** | Effect v4 foundation | `dev` on effect 4.x; parity + agents + foundation suites green; drizzle-effect bridge proven (tx, relations, concurrency) |
| **M1** | Tracker parity on Effect | Every `/api/*` group native; `packages/kaneo-legacy` deleted; parity suite covers all 260 routes |
| **M2** | Agents in the tracker | Assign a ticket to an agent → task on a BYO node → live transcript in the ticket → PR linked → human review. Agents page, runtimes page |
| **M3** | Squads + autopilots | Multi-agent squads with a leader; scheduled/triggered autopilots; agent skills library; per-agent model choice |
| **M4** | Ship | Deploy to fxcluster behind CF Access; migrate NevrLabs Kaneo data; dogfood: Stellarc tracks its own development |

## M0 work items (now)

- E4-1: core migration of contracts/domain/sync/db/telemetry/api/worker/agents/node to Effect v4
- E4-2: kaneo native groups (board, column, label) on v4 HttpApi + drizzle-effect
- E4-3: OTel via `effect/unstable/observability` Otlp (drop the NodeSdk heavy path)
- E4-4: tests: adopt `@effect/vitest` 4.x `it.effect` where it helps; keep the parity harness

## M1 group order (each = 1 Multica issue → 1 PR, parity-gated)

milestone · flag · task-relation · external-link · time-entry · comment ·
activity · notification · notification-preferences · workflow-rule ·
task-template · team · invitation · user · organization · resource-grant ·
search · data-table · project · task (split 4) · repo (split 4) ·
github-integration · gitea-integration · webhooks/slack/discord/telegram ·
ai · mcp · admin · auth (BetterAuth mount) · ws (Effect Socket) · scheduler (Effect Cron)

## Design track (parallel)

The UI is pixel-frozen until M2. Agent UX gets designed now so M2 has
reviewed mockups: an agents directory, an agent profile with transcript
viewer, a runtimes/nodes page, ticket ↔ agent assignment, live run panel,
squads, autopilots. Deliverable per surface: a served interactive HTML
mockup and screenshots, reviewed by the operator before any implementation.
