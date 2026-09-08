# ADR 0002: Topology and stack

Status: accepted (2026-08-26) · Supersedes the v1 ADR lineage for this domain.

## Decision

Three components (ticket #5, ratified as amended):
- **Control plane: Bun/TypeScript** — kernel + `main`-venue plugins in-process;
  BetterAuth as the first-party auth plugin (non-removable, D6); Hono + zod
  core; HTTP API + single MCP surface (D11); event log; scheduler + workflow
  engine in-process (D20); SSE/WS fan-out.
- **arclet: Rust node daemon** — host effects, adapter process ends, workspace
  CoW/symlink + git worktrees, iroh endpoint, local claim journal (D15).
- **tunnel: standalone Rust lib+bin** — capability-scoped harness exposure over
  iroh; later arclet's transport layer.

Effect is a **library, not a framework** (`effect/Schema`, `Data.Error` where
types earn it). Storage: PostgreSQL, schema-per-org default with db-per-org
escalation behind a routing seam (D9). Network: IPv6-preferred with an
`ipv6_only` knob; self-hosted iroh-dns-server discovery zone.

## Amendments recorded at ratification

1. DBOS-model workflow *tables* not ratified — engine + storage shape belong to
   the dedicated workflow-engine design session (D18).
2. "Bun sandbox" does not exist; workflow graphs run in-process as data (D20),
   and the freestyle-runner isolate boundary (deno_core / rquickjs / subprocess)
   is decided in that same session.

## Context

Ticket #5; synthesis 2026-08-19; Effect assessment in
`~/stellarc-research/reports/effect-ts.md`.
