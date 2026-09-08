# Stellarc v2 Rewrite Charter

Ratified doctrine from the #4 deep dive (2026-08-25, operator-ratified D1–D19).
This document consolidates the decisions; the per-decision record with rationale
and rejected alternatives lives as comments on issue #4. Glossary: `CONTEXT.md`.
Supersedes the *vocabulary* of v1 ADR 0012/0015 (the taxonomy carries forward,
the documents do not).

## What stellarc v2 is

The "k8s of harnesses": a harness-agnostic, **inert** control plane. Stellarc
commands harnesses; intelligence stays in the harness. The CP never calls
models, never runs agent loops, never generates content (D4).

Topology (pending #5 ratification): Bun/TS control plane, Rust arclet node
daemon, standalone iroh tunnel, PG storage, ACP-shaped transcripts, TS workflow
manifests.

## Doctrine

### Extension model
- **D1** — Rich extension ecosystem: the full v1 extension taxonomy (extension
  classes + managed apps + embedded apps) is the v2 contract. Delivered in
  stages: contract + docs + stubs first, implementation per stage. Richness is
  a product goal, not a YAGNI cut.
- **D2** — Plugin venues are definitional: a plugin runs in `main` (inside the
  CP process, modifies system behaviour, full trust) or `isolate` (CP-owned
  sandboxed sub-component). Out-of-process is not a venue — that's an **app**.
  Trust boundary = process boundary.
- **D5** — Everything is a plugin, even ours. First-party features ship under
  the same classes, manifests, grants, and venues as third-party. No privileged
  built-ins beyond the kernel. Implementation reference: DeepSeek Harness.
- **D8** — Plane-global install, per-org activation. One plugin tree per boot
  generation; install makes a plugin *available*, each org's grant set makes it
  *active* (hot-reload, no restart). Per-org custom code = app now, isolate later.

### Kernel & transit
- **D6** — Kernel = boot + plugin loader + capability check + event log +
  authn/z + wire transit chokepoints (HTTP/MCP/WS). Everything else — including
  resources (arcdrive, sessions, tables, nodes, harnesses) — is an opt-in
  plugin. Auth plugin is non-removable at runtime; TCB = kernel, upgraded only
  by CP redeploy.
- **D7** — Composition at boot: plugin membership is fixed per boot generation
  (blue-green flip to change); config hot-reloads; every registration is
  effect-shaped (carries its own unwind). Scoped live mounts are a later stage.
- **D11** — Hybrid MCP transit: kernel owns the single stellarc MCP surface;
  `main` plugins register into it, apps are proxied as namespaced sub-servers;
  capability checks at the chokepoint for both. The aigw/llgw gateway may front
  the CP, never bypass its checks.

### Trust & identity
- **D3** — Capability grants: manifest declares, install surfaces, org
  ratifies; org allowlist is the ceiling; sensitive capabilities absent by
  default. SaaS adds a Nevrlabs ratification/signature gate before org review.
  RBAC deferred — flat org allowlist day one.
- **D4** — Inertness: `model:call` is never grantable. The top grantable
  capability is `session:drive` (workflows native, plugins by grant).
- **D12** — Humans, agents, and workflows are distinct first-class principals.
  Every action logs `actor` (mandatory — no anonymous agent actions) plus an
  optional `on-behalf-of` subject for delegation.
- **D14** — Nodes (arclets) are least-privilege principals on untrusted
  hardware. Node reports are claims, authoritative only within the node's
  scope; transcripts are node claims, not plane truths. Cross-node actions
  (deploys, MCP, session/agent orchestration) require CP authorization;
  same-node actions run on node authority alone. Rooted-node blast radius =
  that node's own scope.

### Events & storage
- **D10** — The log is append-only forever. Every event type is
  `pluginId:type` with owning-plugin provenance; replay tolerates unknown
  namespaces (bytes kept, projections skip); purge is an explicit operator
  command, never automatic.
- **D19** — Reader-side upcasting: `schemaVersion` on the envelope; the owning
  plugin ships a pure, total upcaster chain; readers see the latest shape only;
  un-upcastable events quarantine the plugin (D13), never drop silently.
- **D9** — SaaS: PG schema-per-org default, dedicated-DB escalation tier behind
  an org→storage routing seam. PaaS and apps always get their own DB. The
  event-sourced log mutes migration fan-out (new event types + replay, not
  ALTER TABLE × N).

### Faults & partitions
- **D13** — Kernel-wrapped dispatch + quarantine: extension-point failures are
  caught and logged as events; N failures auto-disable the plugin via the grant
  layer until operator re-enable. Fail-closed degradation: a quarantined
  enforcement plugin denies dependent requests, never waves through.
- **D15** — Partitioned nodes keep same-node autonomy: in-flight sessions
  continue, events journal locally and replay on reconnect as claims;
  CP-authorized actions block until reconnect. Claims from nodes dark beyond
  the staleness TTL are flagged for review, not silently merged.

### Config & secrets
- **D17** — Plane-declared desired state, node reconciles (the k8s arrow).
  Actual state reports back as a node claim; drift is a flagged diff. Node
  overrides are declared to the plane, never around it.
- **D16** — Secret management is external (openbao / HashiCorp Vault /
  Bitwarden Secrets); stellarc holds references, never values — at most a
  request-injector plugin later. Harness API keys are node-held or routed via
  the builtin aiproxy (aigw, recommended). "Vault" in stellarc means the
  docs/blob store, named **arcdrive**.

### Workflows
- **D18** — Durable by construction: workflow steps checkpoint as events;
  resume by replay across boot generations; side effects only through
  kernel-dispatched logged actions; interrupted steps are at-least-once with
  idempotency keys deduped by the arclet. Semantics are doctrine; engine
  implementation (own-log DBOS-style / Temporal / BullMQ / EffectMQ) is
  deferred to a dedicated design session — much of what happens in the system
  is a workflow, so this subsystem gets deep, deliberate architecture.

## Deferred (explicitly not doctrine)

- Workflow engine selection (D18 rider) — own design session/ticket.
- Arcdrive sync/merge semantics (D17 rider) — own ticket; the one resource that
  is both plane-stored and node-synced.
- Secret request-injector plugin (D16).
- Package format & distribution; plugin SDK versioning — forced by #9/#10.
- Scoped live mounts / per-org isolates (D7/D8).
- RBAC beyond the flat org allowlist (D3).

## Founding ADR stubs (for #11)

| ADR | Title | Source |
|-----|-------|--------|
| v2-001 | Inert control plane; session:drive capability model | D4, D12 |
| v2-002 | Extension model: classes, venues, apps, everything-is-a-plugin | D1, D2, D5 |
| v2-003 | Kernel boundary and TCB | D6, D7 |
| v2-004 | Capability grants, org ratification, SaaS operator gate | D3, D8 |
| v2-005 | Event log: namespacing, tolerant replay, upcasting | D10, D19 |
| v2-006 | Org partitioning and storage routing | D9 |
| v2-007 | MCP transit and gateway convergence (aigw) | D11 |
| v2-008 | Node trust, partitions, and claims | D14, D15 |
| v2-009 | Fault doctrine: quarantine and fail-closed degradation | D13 |
| v2-010 | Desired-state config; secrets external | D16, D17 |
| v2-011 | Durable workflow semantics | D18 |
