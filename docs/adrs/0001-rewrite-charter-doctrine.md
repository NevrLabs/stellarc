# ADR 0001: v2 rewrite charter and doctrine (D1–D20)

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

Stellarc v2 is a ground-up rewrite: a harness-agnostic, **inert** control plane
("k8s of harnesses"). The full doctrine — twenty operator-ratified decisions
D1–D20 — is consolidated in [`docs/v2-charter.md`](../v2-charter.md); the
per-decision record with rationale and rejected alternatives lives on
tickets #4 and #5.

Load-bearing pillars:
- **Inertness (D4):** the CP never calls models, runs agent loops, or generates
  content. `model:call` is not grantable; the top capability is `session:drive`.
- **Everything is a plugin (D5):** first-party features ship under the same
  manifests/grants/venues as third-party; only the kernel is privileged (D6).
- **Venues are definitional (D2):** `main` | `isolate`; out-of-process = app.
- **Append-only event log as sole truth (D10/D19):** namespaced plugin events,
  tolerant replay, reader-side upcasting; the log is never rewritten.
- **Capability grants + org ceiling (D3/D8):** plane-global install, per-org
  activation; SaaS adds the operator ratification gate.
- **Nodes are least-privilege principals (D12/D14/D15):** node reports are
  claims; cross-node actions require CP authorization; partitions preserve
  same-node autonomy with journaled replay.
- **Durable workflows (D18/D20):** n8n-model graphs, event-checkpointed steps,
  freestyle steps in an isolate runner; workers and webhooks ride the engine.

## Context

Settled by ticket #4 (deep-dive grilling, 2026-08-25/26), ticket #5 riders.
Research corpus: `~/stellarc-research/` (SYNTHESIS.md + reports/).
Supersedes v1 ADR 0012/0015 vocabulary; the extension taxonomy carries forward.
