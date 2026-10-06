# ADR 0012: Effect-native Kaneo backend via strangler migration

Status: **accepted** (2026-10-06, operator: "I just want Effect.ts working").
Supersedes the STL-15…27 slice plan (parked; see ADR 0011).

## Problem

The `dev` plan rewrote Kaneo's ~56k-line API domain by domain into a new
event-sourced schema behind a frozen UI. Six weeks in, two slices had landed,
eight were stuck at the forge rework cap, and **no Kaneo endpoint served the UI
from Effect**. A big-bang rewrite of a feature-dense product can't be
verified until it is finished, and it never finished.

## Decision

Make the whole backend **run on Effect now**, then migrate the domain
endpoint group by endpoint group, proven wire-identical at each step.

```
                    ┌────────────── apps/stellarc-api (Effect, Bun) ──────────────┐
 frozen UI ──HTTP──▶│ /health, /orgs/:o/v1/shape   → foundation HttpApi            │
            ──WS───▶│ /v1/node/*, /orgs/:o/v1/{nodes,agents,tasks} → agents plugin│
                    │ /api/{board,column}/*        → packages/kaneo (Effect HttpApi)│
                    │ every other /api/*           → packages/kaneo-legacy (Hono)  │
                    └─────────────────────────────────────────────────────────────┘
```

1. **Runtime is Effect.** `stellarc-api` owns every resource as a scoped
   Layer: the PG pools, the legacy domain's startup (migrations, seeds,
   plugins, scheduler, WS adapter) and its shutdown, plus OTel and the HTTP
   server. Shutdown is fiber interruption, not `process.on`.
2. **Lifted legacy, verbatim.** `packages/kaneo-legacy` is Kaneo
   `2504e645` with three documented local edits (see its README). It is
   outside the strict root typecheck and lint. It is the fallback, and every
   group that goes native deletes its legacy directory.
3. **Native groups are Effect HttpApi.** `packages/kaneo`:
   - `Db`: drizzle over `@effect/sql-pg` with Kaneo's exact schema and
     relations, so every query is an Effect with a span and a typed
     `SqlError`. Transactions use `SqlClient.withTransaction`.
   - `Authentication`: an HttpApiMiddleware that provides `CurrentUser`
     (BetterAuth session, bearer, or API key; same precedence as Kaneo).
   - `Access`: membership, org permission statements, and the resource
     privilege chain (grants → resource baseline → org default; owner and
     admin get manage). These are Kaneo's rules, as `Effect.fn`s.
   - Typed errors carry Kaneo's status codes; `SqlError` becomes a defect,
     which means an opaque 500 plus the full Cause in the log.
4. **Wire parity is the gate.** `tests/bun/kaneo-parity.test.ts` boots one
   disposable PG with Kaneo's own migrations and serves native and legacy
   side by side. It drives the same request script through both, interleaved
   step by step, and compares status and normalised JSON, once as an instance
   admin and once as a plain member (the permission paths). Negative
   control: removing the delete-permission check turns
   `delete board native=200 legacy=403` red.

## Why not the event-sourced rewrite first

The event log, sync engine and agents plugin stay. They are Stellarc's
future. But the UI needs Kaneo's relational read models today. Event-sourcing
a domain is a second migration *after* it is native and parity-proven:
replace a group's drizzle writes with `appendEvents` plus a projection, keep
the parity test green, and repeat.

## Migration order (by UI traffic and coupling)

| # | Group | Legacy LOC | Notes |
|---|---|---:|---|
| ✅ | board, column | 1.1k | done; 19/19 parity as admin and member |
| 1 | label, milestone, flag | 2.2k | small, publishEvent → Effect PubSub bridge |
| 2 | task (28 routes) | 4.8k | needs WS broadcast as an Effect service |
| 3 | activity, comment, notification | 1.7k | |
| 4 | project | 4.3k | |
| 5 | repo + github/gitea | 8.2k | Octokit as an Effect service |
| 6 | auth (BetterAuth) | — | stays a library; mount via HttpApi raw handler |

## Consequences

- One process, one runtime, one telemetry pipeline, today, with no UI change.
- The legacy tree inherits upstream bugs; they are documented in its README
  and not fixed in place (fix them by migrating the group).
- Kaneo's `0026` migration was guarded to boot fresh databases (upstream
  journal order applies it before `0025` creates the table).
