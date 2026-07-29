# ADR 0038 — Independent Foundation with Snapshot and Cursor Replay

- Status: Accepted
- Date: 2026-07-29
- Relates to: ADR 0005 (Axis authority), ADR 0008 (Axis–Orbit transport), ADR 0009 (event log), ADR 0020 (client projections), ADR 0037 (event-log backends)

## Context

Stellarc is not adopting T3 Code as a runtime or protocol. It already has the durable seams needed to adopt the useful synchronization pattern:

- Axis owns the append-only product event log and derived projections. `crates/axis/src/event_log.rs` exposes backend-neutral append, `read_from`, and projection reads; `crates/axis/src/server/routes/events.rs` already pages events strictly after a sequence.
- Axis broadcasts best-effort live deltas through `crates/axis/src/server/ws.rs`. The browser connection supervisor in `ui/src/api.ts` reconnects with capped exponential backoff, but `ui/src/hooks/queries.ts` can only invalidate queries after `ws.reconnected`; frames missed while disconnected are not replayed.
- Orbit owns machine execution and a local transactional outbox in `crates/orbit/src/spool.rs`. `crates/proto/src/frames.rs` defines per-session sequence, ACK, and resume frames; `crates/orbit/src/transport.rs` carries them over one bidirectional Iroh QUIC stream. This durable Axis–Orbit path is separate from browser synchronization.
- Axis SQLite currently creates its schema and applies `PRAGMA table_info`/`ALTER TABLE` patches in `crates/axis/src/log.rs`; PostgreSQL initializes from `crates/axis/src/schema_pg.sql` through `crates/axis/src/log_pg.rs`; auth SQLite initializes in `crates/axis/src/auth_store.rs`; Orbit creates its spool schema in `crates/orbit/src/spool.rs`.
- Axis request correlation uses connection-local `reqId` allocation in `crates/axis/src/server/orbit_conn.rs`; Orbit event deduplication uses durable `(sessionId, seq)` identities; jobs use `(jobId, attemptEpoch)`. None is yet a caller-stable, durable command receipt for general client mutations.
- Human API authority is resolved through the existing auth mode and principal/membership paths in `crates/axis/src/auth_mode.rs`, `crates/axis/src/auth_store.rs`, and `crates/axis/src/server/mod.rs`. Machine admission is the Iroh public-key allowlist in `crates/axis/src/enroll.rs`, populated by short-lived, single-use enrollment routes in `crates/axis/src/server/routes/enroll.rs` and represented by `crates/axis/src/node.rs`. Enrollment grants admission, not operation scopes.

## Decision

### 1. Authority and ownership boundaries

- **Axis owns durable product truth:** the global event sequence, event retention, compact client projections, authorization of those projections and events, and validation of client cursors.
- **Orbit owns machine execution truth:** active runtimes, terminal/job execution, and the local unacknowledged execution-event spool. Orbit does not become a browser synchronization source.
- **The client owns only a cache:** one compact snapshot and its last fully applied Axis sequence. Cached state never authorizes an operation and may be atomically replaced by Axis.
- **The HTTP snapshot endpoint owns bootstrap and recovery.** It returns compact authorized projections plus one `sequence` captured from the same authoritative boundary.
- **The existing `/ws` path owns ordered catch-up and live notification.** A subscription supplies `afterSequence`; Axis replays authorized events after that cursor through a captured head, emits an explicit `caught_up` marker, then delivers the live tail.
- **The existing event-log backend seam owns replay reads.** SQLite and PostgreSQL implementations provide identical sequence semantics; route and UI code must not inspect backend-specific storage.
- **The existing client connection module (`ui/src/api.ts`) owns socket generation, reconnect, backoff, liveness, and subscription cursor.** Query hooks consume frames and update/invalidate projections; they do not create independent reconnect loops.
- **Existing auth and enrollment remain the identity boundaries.** Snapshot/replay uses the same human authorization as resource APIs. Axis–Orbit operations continue to require enrolled Iroh identity; operation capabilities, if introduced, are persisted with that enrollment and checked at the shared dispatch boundary.

### 2. Client synchronization contract

1. A client may render its cached compact snapshot immediately.
2. It fetches an authorized snapshot containing `sequence = S` and atomically stores the snapshot with `S`.
3. It subscribes over the existing WebSocket with `afterSequence = S`.
4. Axis captures a replay head `H`, emits events `S < seq <= H` in ascending order, then emits `caught_up { sequence: H }` before forwarding live events.
5. The client applies events monotonically by Axis sequence and ignores overlaps it has already applied.
6. An invalid, ahead-of-head, unauthorized, or no-longer-retained cursor does not trigger unbounded replay. Axis directs the client to obtain a fresh snapshot, which atomically replaces the cache.
7. Disconnect never causes automatic replay of mutations. A mutation is retried only under a separate durable command-receipt contract.

The snapshot sequence and its projections must describe one logical boundary. Reading projections and then independently sampling a later head is forbidden because it creates an unrecoverable snapshot/live gap.

### 3. Migration path

1. Extend `EventLog` and both existing backends only as needed to expose an atomic snapshot/head boundary and bounded replay; reuse `read_from` and existing projection readers.
2. Add the compact authorized snapshot route and tests. Do not expose the full event history as the snapshot.
3. Extend `crates/axis/src/server/ws.rs` and the existing TypeScript frame types with `afterSequence`, replay/fallback, and `caught_up`; preserve current session subscription filtering.
4. Extend `ui/src/api.ts` as the single connection supervisor and use browser-native persistence for the compact cache unless an existing installed persistence seam is found. Update query hooks to consume replay without duplicate entities.
5. Replace ad-hoc schema mutation store-by-store with ordered, transactional, restart-safe migrations. Preserve existing recognized installations by verified baselining; unknown or newer schemas fail closed. Better Auth/auth ownership is not rewritten by a generic migration framework.
6. Add durable command receipts later at the shared mutation boundary only after inventory proves current IDs cannot satisfy caller-stable deduplication. Connection-local `reqId` is not promoted to that role.

## Reusable seam inventory

| Need | Reuse / extend | Boundary that must not move |
|---|---|---|
| Global cursor and replay | `EventLog::read_from` in `crates/axis/src/event_log.rs`; `/api/events` paging in `crates/axis/src/server/routes/events.rs` | Axis assigns the sequence and enforces retention/auth |
| Compact projections | Existing `EventLog` projection reads and `crates/axis/src/views/` | Clients do not rebuild authoritative product state from an unbounded log |
| Live delivery and filtering | `AppState.deltas` and subscription handling in `crates/axis/src/server/ws.rs` | Broadcast is a live tail, not durable storage |
| Browser reconnect | `connectWs` in `ui/src/api.ts`; consumption in `ui/src/hooks/queries.ts` | One socket owner and one reconnect timer |
| Axis–Orbit resume | `Ack`/`ResumeFrom` and sequenced `OrbitFrame` in `crates/proto/src/frames.rs`; `EventSpool` in `crates/orbit/src/spool.rs` | Per-session Orbit sequence is not the global client cursor |
| Remote transport | Single Iroh stream in `crates/orbit/src/transport.rs` | No stream split without measured contention |
| SQLite/PostgreSQL storage | `EventLog` backend dispatch, `log.rs`, `log_pg.rs`, `schema_pg.sql` | Identical externally visible sequence/projection semantics |
| Machine admission | Enrollment token + Iroh allowlist in `enroll.rs`, enrollment routes, and `node.rs` | Organization membership does not imply machine enrollment |
| Human authorization | Existing auth mode, principal, membership, and route middleware | Snapshot/replay cannot bypass resource authorization |
| Existing idempotency identities | Orbit `(sessionId, seq)`, jobs `(jobId, attemptEpoch)`, enrollment token/node binding | `reqId` remains connection-local correlation, not a durable command ID |

No new synchronization framework, event bus, state-management library, storage dependency, identity system, or transport abstraction is approved by this ADR.

## Non-goals and measured gates

- No T3 wire compatibility, Effect RPC, T3 fork, or replacement of Stellarc’s Rust Axis/Orbit foundation.
- No replacement of Iroh or the durable Axis–Orbit ACK/resume protocol.
- No `iroh-blobs` until a named binary-artifact feature requires content identity, verified ranges, or partial resume and the chosen release is production-supported.
- No split of the current Iroh stream until a repeatable contention test shows terminal/event/job traffic violates an explicit control-latency or queue-growth budget. If required, use native QUIC streams, not a custom multiplexer.
- No blanket wire compression. HTTP content encoding may compress snapshots; Axis–Orbit batching/compression requires measurement. Existing zstd-at-rest encoding remains unchanged.
- No generalized offline mutation queue. Durable receipts are a separate decision and apply only to concrete non-idempotent mutations.
- No production promotion or destructive data migration under this decision. Development rollout requires isolated fresh-install and upgrade verification.

## Consequences

Reconnect becomes deterministic: snapshot establishes a boundary, replay closes the gap, and live delivery begins only after an explicit marker. Existing authority, storage, transport, and connection seams are extended rather than duplicated. The cost is a stricter atomic snapshot boundary and explicit cursor-retention behavior across both event-log backends; those are required correctness constraints, not optional optimizations.
