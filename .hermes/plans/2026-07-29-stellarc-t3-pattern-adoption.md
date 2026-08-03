# Stellarc T3 Pattern Adoption Implementation Plan

> **For Hermes:** Execute with subagent-driven development in dependency-ordered waves. Controller owns integration, review, tests, and commits.

**Goal:** Keep Stellarc’s Rust Axis/Orbit foundation and Iroh transport while adopting T3 Code’s proven client synchronization, reconnect, idempotency, migration, and pairing patterns without creating T3 compatibility or speculative blob infrastructure.

**Architecture:** Axis remains the durable product authority; Orbit remains machine execution authority. Browser/Desktop clients bootstrap from an HTTP projection snapshot and subscribe from its sequence over the existing WebSocket path. Axis↔Orbit retains durable spool/ACK/resume. Ordered migrations replace ad-hoc startup schema mutation store-by-store. Existing Better Auth and endpoint enrollment boundaries provide auth; scopes are added only where current operations need them.

**Tech stack:** Rust, Axum, Tokio, SQLite, PostgreSQL, React/TypeScript, Vitest, existing Iroh 1.0.2, existing WebSocket/event-log paths.

---

## Non-goals and gates

- Do not fork T3 Code, import Effect RPC, or claim T3 wire compatibility.
- Do not add `iroh-blobs` until a concrete artifact feature requires verified partial transfer/content identity; current latest line is not production-rated.
- Do not split the one Iroh stream until an acceptance benchmark demonstrates control/terminal/event contention. If triggered, use native QUIC streams rather than a custom multiplexer.
- Do not add blanket wire compression. Keep zstd at rest; rely on HTTP content encoding for snapshots; measure before batching/zstd on Axis↔Orbit.
- Do not promote to production. Implement and validate on isolated worktrees, then development only after controller review.
- Preserve existing installations and data. Unknown/newer migration versions fail closed; migrations must be transactional and restart-safe.

## Wave 0 — Normative boundary and inventory

### Task 0.1: Record the architecture decision

**Files:**
- Create: `docs/adrs/00XX-stellarc-independent-foundation-and-sync.md`

**Acceptance:** ADR states current/proposed/migration path, retains Axis/Orbit + Iroh, adopts snapshot/cursor replay semantics, and records blob/stream splitting as measured gates—not commitments.

**Verify:** ADR references actual `crates/axis/src/node.rs`, `crates/orbit/src/transport.rs`, `crates/proto/src/frames.rs`, client WebSocket code, and event-log sequence APIs.

### Task 0.2: Inventory current reusable seams

**Read only, then amend this plan if paths differ:**
- Axis event sequence and projection APIs
- Browser WebSocket reconnect/subscription path
- SQLite and PostgreSQL schema initialization
- Orbit spool schema initialization
- Current command/idempotency identifiers
- Current auth scopes and endpoint enrollment

**Acceptance:** no new abstraction is proposed where an existing path can be extended.

---

## Wave 1 — Client snapshot plus cursor replay

### Task 1.1: Add a canonical client synchronization contract

**Files likely to change:**
- `crates/axis/src/server/mod.rs`
- `crates/axis/src/server/routes/events.rs` or the existing event WebSocket route
- `crates/axis/src/server/tests.rs`
- existing UI API contract/type files under `ui/src/`

**TDD:**
1. Add a failing server test proving a snapshot response includes one authoritative `sequence` and current compact projections.
2. Implement the smallest response using existing view/projection builders.
3. Add a failing test for `afterSequence` replay followed by an explicit `caught_up` marker.
4. Implement replay from the existing event log, bounded to the captured head, then attach the live tail.
5. Add invalid/ahead/too-old cursor behavior: return/fall back to a fresh snapshot rather than unbounded replay.

**Acceptance:** no snapshot/live race, overlaps are safe to deduplicate by sequence, authorization matches existing resource APIs, and large history is not emitted blindly over WebSocket.

**Verify:** focused Axis tests; `cargo test -p stellarc-axis`; API smoke test against an isolated `STELLARC_HOME`.

### Task 1.2: Persist and consume client snapshots

**Files likely to change:**
- existing UI query/store module under `ui/src/`
- existing WebSocket/reconnect module under `ui/src/`
- focused Vitest files beside those modules

**TDD:**
1. Cached snapshot renders immediately.
2. Reconnect subscribes with cached `sequence`.
3. Replayed overlaps do not duplicate entities/events.
4. `caught_up` transitions connection state to live.
5. Snapshot fallback atomically replaces stale cache.

**Implementation:** reuse current IndexedDB/local persistence if present; otherwise persist only the compact shell snapshot with the browser platform API. Do not add a state-management or storage dependency.

**Verify:** focused Vitest, TypeScript check, production UI build, browser reconnect test with exact route and forced socket transition.

### Task 1.3: Centralize connection supervision

**Files:** existing UI WebSocket connection module and tests only unless inventory proves otherwise.

**Behavior:** one owner for reconnect/backoff/liveness; 1/2/4/8/16-second capped delay; reset after a stable interval; auth/config failures block until state changes; mutations are never automatically replayed merely because the socket disconnected.

**Acceptance:** one timer, one active socket generation, no duplicate subscriptions after foreground/network changes.

---

## Wave 2 — Command receipts and idempotency

### Task 2.1: Inventory mutation IDs before adding schema

Confirm whether current request IDs/event correlation IDs can serve as command IDs. Reuse them if durable and caller-stable. Add no new ID type unless current data cannot express deduplication.

### Task 2.2: Add durable receipts at the shared mutation boundary

**Files likely to change:**
- Axis event-log trait and SQLite/PostgreSQL implementations
- shared command dispatch path
- focused persistence/server tests

**TDD:** same command ID with same body returns the recorded outcome without a second event; same ID with a different body fails closed; crash/restart preserves the receipt.

**Acceptance:** only non-idempotent mutations pass through the receipt seam. Read operations and live-stream subscriptions remain unchanged.

---

## Wave 3 — Ordered migrations

### Task 3.1: Implement the smallest migration runner

**Files likely to change:**
- Create one migration module per store only where needed
- Axis SQLite startup
- Axis PostgreSQL startup
- Orbit spool startup
- migration tests

**Required semantics:** ordered immutable IDs, ledger, transaction per migration, checksum/immutability check, one-writer lock appropriate to backend, restart safety, refusal on unknown/newer schema.

**Do not:** build a generic cross-database framework if two short backend-specific runners are clearer; migrate all stores in one flag day; rewrite Better Auth’s official migration owner.

### Task 3.2: Baseline existing schemas without destructive replay

Fresh databases run migrations from zero. Existing recognized schemas receive a verified baseline only after structural checks. Unknown shapes fail with an actionable error and remain untouched.

### Task 3.3: Move ad-hoc startup patches into migrations

Convert current `PRAGMA table_info`/`ALTER TABLE` and monolithic PostgreSQL upgrade assumptions incrementally. Keep fresh-schema creation and upgrade behavior parity-tested.

### Task 3.4: Orbit spool migrations

Apply the same ordered/restart-safe pattern to the node-local spool while preserving unacknowledged records across upgrade and rollback failure.

**Verify Wave 3:** fresh install, old fixture upgrade, interrupted migration restart, checksum mismatch, newer schema refusal, concurrent startup, SQLite/PostgreSQL parity, Orbit unacked-event preservation.

---

## Wave 4 — Scoped pairing and endpoint authority

### Task 4.1: Reuse current auth/enrollment seams

Map current Better Auth principal, installation token, organization role, and Iroh endpoint allowlist. Do not create a second identity system.

### Task 4.2: Add only required machine/client capabilities

Start with concrete scopes needed by existing routes, likely control, terminal, jobs, and read-only observation. Enrollment persists the endpoint-to-capability grant. Every Axis→Orbit operation checks the enrolled capability at the shared dispatch boundary.

**TDD:** enrolled read-only endpoint cannot open terminal/dispatch job; revoked endpoint fails on new connection; unknown endpoint remains rejected; organization membership does not implicitly grant machine enrollment.

### Task 4.3: Device session UX

Expose session list/revoke and pairing status through existing auth UI/API. Credentials are short-lived/revocable; no secrets in URLs except one-time fragment/bootstrap material where already required.

---

## Wave 5 — Measured transport decision

### Task 5.1: Add a contention acceptance test, not a framework

Run concurrent terminal output, agent event streaming, heartbeat/control request, and bounded job output over the current single Iroh stream. Record control latency and queue growth.

### Task 5.2: Split streams only if the test fails an explicit budget

If contention is proven, use native QUIC streams:
- connection registration/control
- per-agent-session event stream
- per-terminal raw-byte stream
- per-job output stream

A small typed stream preface is sufficient. Remove base64 only on raw-byte streams; preserve JSON compatibility on UDS/control paths.

### Task 5.3: Blob decision gate

No implementation without a named feature carrying real binary artifacts. When triggered, evaluate production-supported `iroh-blobs` versus authenticated HTTP/object storage against measured needs for hash identity, verified ranges, resume, provider discovery, retention, and GC.

---

## Integration and release gates

1. Controller reviews every worker diff against this plan before integration.
2. Merge dependency-ordered waves, never parallel edits to shared files.
3. Run `git diff --check`, formatting, lint, focused tests, full Axis/Orbit tests, TypeScript, UI tests, production build, and React Doctor when UI changes.
4. Run isolated fresh-install and upgrade fixtures before touching development state.
5. Deploy immutable binaries to development only; verify exact public route, login mode, reconnect transition, saved cursor, relative time window where applicable, and viewport.
6. Run adversarial security review for cursor authorization, command ID collision, migration corruption, and endpoint-capability bypass.
7. Production promotion remains a separate explicitly approved task.

## Swarm execution topology

- **Wave A in parallel:** ADR/inventory; backend snapshot/replay; migration runner spike and fixture inventory.
- **Controller gate:** review paths/contracts; integrate ADR and backend only after tests.
- **Wave B in parallel:** UI snapshot cache/reconnect against landed contract; command receipts; migration implementation for the first store.
- **Controller gate:** full tests and commits.
- **Wave C:** remaining stores, scoped endpoint authority, end-to-end QA.
- **Final adversarial reviewer:** no implementation ownership; reviews merged tree for spec/security/data-loss risks.

Each worker uses a dedicated remote worktree/branch from `af20835`, commits its work, and reports commit SHA plus tests. The controller cherry-picks only reviewed commits into the integration worktree.
