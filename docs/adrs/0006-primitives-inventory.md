# ADR 0006: Primitives inventory

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

Full inventory: [`docs/primitives-v1.md`](../primitives-v1.md) (D25).

Structural entities (kernel-known): **org, principal, grant, node, event,
boot generation**. Resource kinds (opt-in, first-party plugins): **session,
agent, repo, arcdrive, table, workflow, template, project**, plus
app-registered kinds.

Non-primitives: **secret** (external per D16; references only), **budget**
(policy plugin over node-claimed usage + aigw enforcement — the inert CP
never meters tokens first-hand), **board** (an app; ADR 0026 v1 precedent).

## Context

Ticket #10. The kernel-known test: does authorization or actor logging key on
it? If not, it's a resource kind.
