# ADR 0038 — Independent Foundation and Scoped Client Convergence

- Status: Accepted
- Date: 2026-07-29
- Adopts: ADR 0020 (minimal safe browser convergence)
- Aligns with: ADR 0033 (Axis/Orbit authority)
- Related: ADR 0008 (Axis–Orbit transport), ADR 0009 (event log)

## Context

Stellarc already has its own Rust Axis/Orbit foundation and Iroh transport. T3 Code is useful as a source of reference patterns, not as Stellarc's runtime, protocol, or architectural base.

ADR 0020 establishes the safe browser convergence available on the current system. The global Axis event sequence and `/api/events` are not a browser replay cursor: retention creates sequence holes, the feed is not organization-scoped, transient frames are absent, and append/apply is not serialized. Treating that log as a contiguous authorized browser stream would therefore be incorrect.

ADR 0033 establishes one writable owner per fact. Orbit owns active execution truth until Axis admits completion. Axis owns configuration and desired state, completed history, and global projections.

## Decision

1. **Keep Stellarc independent.** Stellarc retains its Rust Axis/Orbit implementation and Iroh transport. T3 remains reference patterns only; Stellarc adopts no T3 runtime or wire compatibility.
2. **Preserve the ADR 0033 authority boundary.** Orbit owns an active session or run's execution truth, including its active transcript and runtime state, until Axis admits completion. Axis owns configuration, completed history, and global projections. Axis projections of active work are not writable execution truth.
3. **Use resource-scoped browser convergence, not global event-log replay.** Completion is made durable before its completion notification. On session resubscribe or WebSocket reconnect, the client refetches the authoritative, organization-scoped REST resources it displays. Session transcripts render in existing per-session `message_id` order.
4. **Treat transient delivery as lossy.** Token, reasoning, typing, and tool deltas may be missed across navigation or disconnection. They are presentation hints, not durable truth. The client recovers authoritative durable state by refetching the relevant resource APIs.
5. **Keep compatibility on existing behavior.** Old clients continue using the existing WebSocket frames and REST resources. New clients may add reconnect/resubscribe refetch behavior without requiring new server frames. Old servers remain compatible because convergence depends on existing organization-scoped REST reads and `message_id`, not a new replay protocol.

The global Axis sequence/event log is explicitly rejected for browser replay because it has retention holes, can expose organization-unscoped data, omits transient frames, and lacks a serialized append/apply boundary. It remains an internal persistence/projection mechanism, not a client convergence contract.

## Non-decisions and non-goals

This ADR does not approve schema migrations, durable command receipts, stream splitting, compression, blob transport, offline mutation queues, atomic snapshot/cursor protocols, or other speculative capabilities. Any such work requires a concrete need and a separate decision; no capability is inferred here.

## Consequences

- Browser correctness uses the smallest supportable contract: durable-first completion, refetch on resubscribe/reconnect, and `message_id` ordering.
- A reconnect can lose in-flight presentation deltas, but authoritative durable state converges through scoped resource refetch.
- Axis and Orbit retain the authority split accepted in ADR 0033.
- Stellarc keeps its existing foundation and may borrow implementation ideas from T3 without adopting T3 architecture or compatibility obligations.
