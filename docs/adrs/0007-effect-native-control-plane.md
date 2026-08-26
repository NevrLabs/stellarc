# ADR 0007: Effect-native control plane

Status: accepted (2026-08-26) · Amends ADR 0002 ("Effect is a library, not a
framework").

## Decision

The control plane is **Effect-native**, operator decision overriding the
0002 library-only stance. Effect is the application substrate, not a utility:

- **`effect/Schema`** replaces zod everywhere — one schema system for the
  event envelope, the 9-kind transcript union (ADR 0003), DTOs, and config.
  Upcaster chains (D19) are Schema transforms.
- **Typed errors + `Effect` values** are the kernel dispatch contract (D13):
  plugin calls are Effects; quarantine/fail-closed policy is implemented as
  Effect error handling, not try/catch convention.
- **`Layer`** is the boot-composition mechanism (D7): kernel services and
  `main`-venue plugins compose as Layers per boot generation.
- **`@effect/platform` HttpApi** serves HTTP + the MCP surface (Hono dropped;
  zod dropped). SSE/WS fan-out via Effect Streams.
- **`@effect/sql-pg`** for the Postgres event log.
- **Workflow engine (D18/D20):** `@effect/workflow` + `@effect/cluster` are
  now the *default candidate* for the durable engine — same substrate as the
  rest of the CP, checkpoint-and-replay model matches our
  durable-by-construction doctrine. Still confirmed at the dedicated
  workflow-engine design session; the alternative list (DBOS-style own-log,
  Temporal) stands only if cluster falls short in that session.

## Why override 0002

Operator: the stack should be the thing that is great in five years, not the
thing that is familiar today. Concretely: we are building an event-sourced,
plugin-composed, long-running concurrent system — precisely the shape Effect
is designed for. Half-adopting it (0002) means hand-rolling structured
concurrency, resource scoping, typed errors, and retry/timeout policy around
a library that already ships them coherently. The cost is onboarding
steepness; the payoff is that kernel guarantees (D7, D13, D18, D19) map to
first-class primitives instead of conventions.

## Consequences

- Rust components (arclet, tunnel) unaffected.
- `apps/control` skeleton is rebuilt Effect-native before any plugin work.
- Contributors must know Effect; CONTEXT.md points at the effect-ts report.
- If Effect stalls as a project, migration cost is high and accepted — the
  event log (plain Postgres rows) and the wire contracts (JSON) stay
  substrate-neutral, which bounds the blast radius.

## Context

Operator decision 2026-08-26 ("full in Effect... choose something that we know
will be great in the future"). Assessment: `~/stellarc-research/reports/effect-ts.md`.
