# Primitives sign-off (#10)

Ratified 2026-08-26 (operator-delegated defaults; veto window open — D25 on the ticket).
Rule of thumb applied: **structural entities** are what the kernel must know to
authorize and log (D6/D12); **resource kinds** are opt-in, plugin-provided (D6).

## Structural entities (kernel-known)

| entity | why kernel-level |
|---|---|
| **org** | tenancy boundary (D8/D9) |
| **principal** | human / agent / workflow / node — authn/z + actor logging (D12/D14) |
| **grant** | capability ceiling enforcement at chokepoints (D3) |
| **node** | claim scoping, cross-node authorization (D14) |
| **event** | the log itself (D6/D10) |
| **boot generation** | composition identity (D7) |

`project` is NOT structural — it's a grouping resource (see below). Nothing in
authz keys on project; grants attach to org/principal/resource.

## Resource kinds (v1, each a first-party plugin)

| kind | notes |
|---|---|
| **session** | + transcript projections (D21–D23) |
| **agent** | named config: harness+model+skills+MCP (what templates instantiate) |
| **repo** | workspace/worktree refs node-side (multica/paseo pattern) |
| **arcdrive** | docs/blob store (D16/D17 rider; careful-implementation ticket pending) |
| **table** | org structured data |
| **workflow** | definitions + runs (D18/D20) |
| **template** | per D24 |
| **project** | grouping: context md + resource refs |
| *(app-registered)* | apps may register their own kinds — the extension seam |

## Explicitly NOT primitives (v1)

- **secret** — dropped as a resource kind. Secret management is external (D16);
  stellarc stores references. The v1-roadmap "vault/secret" kind is renamed and
  re-scoped: arcdrive covers docs, an injector plugin covers secrets later.
- **budget** — no. Spend lives where models are called: the harness/aigw (D4 —
  the CP never calls models, so it never meters tokens first-hand). Node-reported
  usage arrives in transcript `usage` fields (a claim, D14); budget *policy*
  (limits, alerts) is a policy-plugin over those claims + aigw enforcement when
  it lands. A kernel budget primitive would meter data the kernel never sees.
- **board** — an app, not a kind (ADR 0026 precedent; multica's board-as-core is
  on the reject list). Boards read sessions/workflows via grants like any app.

## Open→closed items from 2026-08-19

- template a kind? **yes** (D24).
- boards? **app**.
- budget primitive? **no — policy plugin + aigw, over claim data.**
