# ADR 0037 — Async Postgres Event Log: Axis Multi-Writer, Orbit Stays Local SQLite

- Status: Accepted
- Date: 2026-07-27
- Amends: ADR 0032 §2 (storage seam — the async decision was left implicit; this
  ADR makes non-blocking a hard requirement, not an implementation detail)
- Relates to: ADR 0008 (orbit transport), ADR 0009 (event log), ADR 0034
  (custodial storage)

## 1. Context

ADR 0032 §2 named the seam ("two impls, rusqlite / tokio-postgres") but not the
concurrency model. Reading the current code makes the gap consequential:

- `log::Log` is `Mutex<Connection>` with **28 sync methods** and **85 call
  sites** across axis.
- `entry.rs` runs `#[tokio::main(flavor = "multi_thread", worker_threads = 4)]`.
- There is exactly **one** `spawn_blocking` in the whole crate.

So today every event append performs blocking SQLite I/O *directly on a tokio
worker thread*, behind a process-global mutex. With 4 workers, four concurrent
appends can stall the entire runtime — including unrelated HTTP handlers and
WebSocket pumps. That is a pre-existing defect, not merely a Postgres concern.

A first Postgres draft used the blocking `postgres` crate behind the same
`Mutex<Client>`. That was **rejected**: it preserves the global write lock, so
it would deliver Postgres's operational cost with none of its concurrency
benefit. Recorded here because it is the tempting shortcut.

## 2. Decision

**Axis uses async Postgres with a connection pool. No global write lock.**

1. **`sqlx` with `PgPool`**, not blocking `postgres` and not a hand-rolled pool.
   Compile-time-checked queries are available, `PgPool` is a real pool, and
   `sqlx` speaks `postgres://` and Unix sockets alike.
2. **All log methods become `async fn`.** The 28 methods and 85 call sites are
   ported; call sites are already inside `async fn` axum handlers, so this
   *removes* blocking from the runtime rather than adding colour.
3. **Orbit keeps its own local SQLite.** Unchanged, deliberately. Orbit nodes
   are crash-isolated edge runtimes that must function when axis is
   unreachable; a network round trip per event would couple them to the control
   plane's availability. Orbit → axis stays event streaming over the existing
   transport, not shared database access.
4. **One database, many writers, many apps.** Postgres becomes the shared
   substrate for stellarc-managed apps, the planned boards, and repo sync — the
   actual motivation for leaving SQLite behind. Each subsystem owns its tables;
   no cross-subsystem writes without an explicit seam.

### 2.1 Concurrency hazards and their fixes (normative)

Two places in the SQLite implementation are only correct *because* of the global
mutex. Both must be fixed in SQL, not by reintroducing a lock. Both fixes were
verified against live PostgreSQL 18.4 before this ADR was written.

**Hazard 1 — `next_message_id` is a lost update.**
`SELECT COALESCE(MAX(message_id) + 1, 0)` followed by a separate `INSERT` lets
two writers read the same max and collide on the primary key. Never read then
write. Derive the id inside the insert:

```sql
INSERT INTO messages(session_id, message_id, ...)
SELECT $1, COALESCE(MAX(message_id) + 1, 0), ...
FROM messages WHERE session_id = $1
```

The second writer blocks on the row lock and re-evaluates. Measured: 20
concurrent writers on one session produced 20 rows, 20 distinct ids, range
0..19, zero failures.

**Hazard 2 — `append_orbit_event` needs per-session serialization.**
It enforces a strict sequence (`seq == watermark + 1`, gaps are an error), which
requires serializing writers *for that session*. A global lock would serialize
*all* sessions and destroy the multi-writer property. Use a per-session
transaction-scoped advisory lock:

```sql
SELECT pg_advisory_xact_lock(hashtext($1))   -- $1 = session identity
```

Released automatically at commit, re-entrant within a transaction, and
independent across keys. Measured: 6 writers on 6 different sessions each
holding their lock 1s completed in **1.1s**, not 6s — genuinely parallel.

`hashtext` collisions are acceptable here: a collision costs two unrelated
sessions brief mutual exclusion, never incorrectness.

### 2.2 Schema translation (normative)

| SQLite | Postgres | Why |
|---|---|---|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL` | — |
| `?N` | `$N` | placeholder syntax |
| `INSERT OR REPLACE` | `ON CONFLICT (pk) DO UPDATE` | — |
| `INSERT OR IGNORE` | `ON CONFLICT DO NOTHING` | — |
| `MAX(a, b)` scalar | `GREATEST(a, b)` | SQLite overloads one name for the aggregate and the scalar; Postgres does not |
| FTS5 virtual table + 3 triggers | one `GENERATED ... STORED` tsvector column + GIN index | Postgres maintains it itself, so the triggers are deleted rather than ported |
| `bm25()` / `snippet()` | `ts_rank` / `ts_headline` | `bm25` was negated to sort ascending; `ts_rank` is already higher-is-better |
| `MATCH` | `@@ websearch_to_tsquery` | `websearch_to_tsquery` never raises on arbitrary user input, unlike `to_tsquery` |
| `WITHOUT ROWID` | (dropped) | storage hint with no equivalent; the PK carries the intent |

Timestamps stay `DOUBLE PRECISION` unix epoch seconds, **not** `timestamptz`:
the event payloads are `f64` end to end, and converting at this layer would
desync every projection. Revisit only with a real migration.

`INTEGER` 0/1 booleans (`archived`, `pinned`) stay `SMALLINT` for the same
reason — the row decoders read integers.

### 2.3 Event payload codec

Payloads are **zstd-compressed JSON** (`zstd::encode_all(serde_json::to_vec(..), 3)`),
stored as `BYTEA`. ADR 0009's JSON-codec marker check carries over unchanged.
Storing raw JSON or `jsonb` instead would silently break every existing reader.

## 3. Consequences

- Blocking I/O leaves the tokio workers — a latency win independent of Postgres.
- Lite keeps SQLite; the seam is where ADR 0032 §2 put it, so lite is unaffected.
- Lite→full remains clean re-setup, not in-place upgrade (ADR 0032 §1).
- The port is ~1,100 lines including `apply_projection` (357 lines, 28
  statements). It is sequenced as: extract the async trait seam → port the
  impl → run the existing suite against both backends. It is not a one-sitting
  change, and a half-ported event log corrupts the source of truth.

## 4. What this ADR does not decide

- **Multi-user / orgs / OIDC.** Postgres is necessary but not sufficient; there
  is no OIDC in the tree today. Separate decision.
- **pgvector use.** The extension is installed; no subsystem consumes it yet.
- **Boards and repo sync schemas.** Named here as motivation only.
