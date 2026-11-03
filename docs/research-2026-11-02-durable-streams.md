# Durable Streams over the event log for agent sessions and transcripts

Spike report for NEVR-438 (2026-11-02). Evaluates `@durable-streams/client` +
`@durable-streams/state/db` (Electric team's durable-streams project) as the
transport for agent sessions, transcripts and live progress, served from
Stellarc's event log by an Effect handler. Prototype: `packages/durable-streams-spike`
(this branch), proof: `tests/integration/durable-streams.test.ts`.

## What the prototype proves

`DurableStreamsEngine` (`packages/durable-streams-spike/src/engine.ts`, ~440
lines incl. fault injection) implements the Durable Streams protocol **read
path** (PROTOCOL.md §§5.5–5.8, 9.1: catch-up, long-poll, SSE, HEAD,
idempotent PUT, JSON message boundaries) directly over `event` /
`org_event_counter` (migration 0001). Streams are *derived views* —
`/orgs/:org/streams/sessions/:sessionId` is the subsequence of
`agent.session.message` events for that session — so the commit-ordered
per-org counter satisfies the ADR 0007 monotonic-cursor contract by
construction. Writes stay on the existing event-log append path
(`append.ts` mirrors `packages/domain` runMutations: counter advanced inside
the write tx, `pg_current_xact_id` carried into every row). Per
docs/building-a-server.md, read- and write-paths are independent servers;
POST/DELETE are 501.

Each event row maps to one Durable State change message:
`{ type: "message", key: seq, value: {…payload, id, seq},
headers: { operation: "insert", txid, timestamp } }`. The stream is
append-only, so no snapshot control messages are synthesized — the log IS the
state, and byte-exact resumption holds because serialization is
deterministic.

Proofs (stock clients, disposable PostgreSQL, `bun --bun x vitest -c
vitest.integration.config.ts durable-streams`):

- **T1 — resume-after-disconnect is exactly-once.** 50 events, connection
  torn down mid-catch-up (~24 delivered), resume from `Stream-Next-Offset`:
  the union is 50 distinct messages in log order — no duplicates, no gaps.
  `MaterializedState` (typed state layer) rebuilds identical state.
- **T2 — live SSE tail survives disconnect.** Live `live=sse` subscription,
  disconnect mid-tail, fresh catch-up: every live-delivered message sits at
  its exact log position; 20/20 exactly-once across the boundary.
- **T3 — StreamDB (`@durable-streams/state/db`) + TanStack DB.**
  `createStreamDB` preloads 10 events into a typed collection, appends flow
  through the event log while live, and `utils.awaitTxId(txid)` settles when
  the batch carrying `headers.txid` arrives — the ADR 0007 contract-3 write
  settle works on this transport unchanged.
- **NC1/NC2 — negative controls.** With the resume feature removed at the
  server (`SpikeFaults`), T1's exactly-once assertions go red:
  `AssertionError: expected 58 to be less than 50` (offset ignored → replayed
  prefix) and a forced gap for the skip fault. The detector demonstrably
  detects the failure mode it exists for.

## Defects the spike caught (evidence the proofs bite)

- `SELECT seq::text … ORDER BY seq` sorts by the **text output alias**
  lexicographically (1, 10, 11, …, 2) — silently corrupts pagination. Must be
  `ORDER BY event.seq`.
- A long-poll that returns data only when `!upToDate` reads rows, advances
  `Stream-Next-Offset` past them in the eventual 204, and **silently loses
  them** — the client never sees the gap. §5.7 requires an immediate 200 on
  any data.

## Durable Streams vs the ADR 0007 shape engine (append-only data)

| Dimension | ADR 0007 (Electric shape protocol) | Durable Streams (this spike) |
| --- | --- | --- |
| Spec status | Reverse-engineered: OpenAPI + d.ts evidence; engine hand-rolled | Public spec (DRAFT) + 232-test conformance suite for servers |
| Client | `@electric-sql/client` + `electric-db-collection` (mature, years of field use) | `@durable-streams/client` 0.2.7 + `state/db` 0.3.2 (beta, single repo) |
| TanStack DB story | `electric-db-collection` (txid settle, subset params; known-ness pitfalls documented in ADR 0007) | `state/db` is purpose-built: `createStreamDB` → typed collections, `awaitTxId`, optimistic actions |
| Append-only fit | Shapes model *tables*: snapshot + tail, insert/update labelling, must-refetch, known-ness bookkeeping (T09 class) | A log is a log: every message is an insert; no snapshot, no labelling hazards; resumption = one opaque token |
| Server complexity | Projection snapshot under REPEATABLE READ + compact known-ness representation (explicit ADR 0007 requirement) | Filtered log read + offset codec; ~440 lines incl. faults for all three read modes |
| Projections (relational live queries) | Native — this is what shapes are for | Not served: state streams carry logs, not relational views |
| Write settle | `awaitTxId` via `headers.txids` | `awaitTxId` via `headers.txid` — parity |
| Auth/chokepoint (D6) | Inline grant check, proven in `packages/sync` | Same pattern applies (spike runs unauthenticated by design) |
| Maturity risk | Low (Electric client 1.5.x) | High: 0.x everywhere, PROTOCOL.md is a DRAFT, repo quiet since 2026-09-28, 1.7k stars, reference server is in-memory/LMDB (production = Caddy plugin or Electric Cloud) |

Compatibility findings worth recording:

- `@durable-streams/state@0.3.2` peers `@tanstack/db >=0.6.0 <1.0.0` —
  **incompatible with the `@tanstack/db` 1.0.0-rc pin** in the issue brief /
  ADR 0014 direction. The prototype pins `@tanstack/db@0.15.2` (repo lock).
  Adoption means pinning TanStack DB <1.0 on this surface until state ships a
  1.0-compatible release.
- License metadata is mixed: repo says MIT, the npm package manifests say
  Apache-2.0 (client 0.2.7, state 0.3.2). Confirm before any production
  dependency.
- `@durable-streams/server` is a reference/test server (in-memory or
  LMDB-backed), not an embeddable Effect/Bun component — the spike's handler
  *is* the server, which matches ADR 0007's "server is ours, in-process,
  behind the D6 chokepoint" property.

## Recommendation

**ADOPT for the append-only agent surfaces (sessions, transcripts, live
progress); KEEP ADR 0007 for relational projections. Two read models, one
event log, one write path.**

- Transcripts and progress are logs, and on logs Durable Streams is strictly
  simpler than shapes: no snapshot machinery, no operation labelling, no
  known-ness bookkeeping, protocol-standard resumption the conformance suite
  can hold in CI.
- The TanStack-first operator rule (ADR 0014 §4) is satisfied on the client:
  `state/db` lands the data in TanStack DB collections; no new client stack.
- Projections keep the shape engine: state streams cannot serve relational
  live queries, and ADR 0007's one-engine-serves-three-consumers plan still
  needs the shape path for TanStack DB relational collections.
- If adopted: record the exception in the ADR 0014 §4 table (durable streams
  for append-only surfaces; `state/db` pins TanStack DB <1.0), add
  `@durable-streams/*` exact pins to the dependency ledger, and run the
  read-mode categories of `@durable-streams/server-conformance-tests` against
  the handler in CI.
- Productionizing (auth per D6, LISTEN/NOTIFY instead of 50 ms tail polling,
  SSE keep-alive behind the tunnel, upcast-before-emit per D19) is roughly a
  week on top of this spike; the spike itself took a day.

## Artifacts on this branch

- `packages/durable-streams-spike/` — engine, append fixture, manifest
  (spike-scoped; no existing package touched)
- `tests/integration/durable-streams.test.ts` — T1–T3 + NC1/NC2
- Root `package.json` devDeps: `@durable-streams/client@0.2.7`,
  `@durable-streams/state@0.3.2`, `@standard-schema/spec@1.0.0` (test-side
  consumption only)
