# ARCH-E · Move Hermes state.db ingestion behind the Orbit seam

## Goal
Axis currently polls `~/.hermes/state.db` directly (`sync.rs`, ~870 loc +
`state_db_reader.rs` + `import.rs`) — a host-filesystem coupling that
contradicts the Axis/Orbit layering (ADR 0008) and blocks observing Hermes
channels on remote nodes. Move state.db observation into the orbit as a "host
observation" adapter; the orbit forwards normalized events over the existing
proto frames + spool; Axis becomes pure log + views + API.

## Read FIRST (all of them — this is the big move)
- `docs/adrs/0008-axis-orbit-split-rolling-deploy.md` — wire protocol, spool,
  seq/ack semantics. Your transport ALREADY EXISTS; reuse it, don't invent.
- `crates/axis/src/sync.rs` — the poll: adaptive backoff,
  reconcile-on-new-rows, the `source != 'stellarc'` exclusion filter
  (load-bearing: the bridge is the single writer for stellarc sessions —
  preserve this or you resurrect the phantom-duplicate-session bug).
- `crates/axis/src/import.rs` + `state_db_reader.rs` — cold-boot
  import vs live tail. Note the circularity warning: the state.db poll IS the
  log's ingester; it cannot consume its own output.
- `crates/proto/src/frames.rs` — OrbitFrame::event, seq assignment, ack.
- `crates/orbit/src/main.rs` + `transport.rs` + spool code.
- `crates/axis/src/server/orbit_conn.rs` — Axis's receive side.

## Build on
Branch from main after ARCH-B and ARCH-D merge (both are parents).

## Deliverables
1. Orbit gains an `observer` module: opens state.db READ-ONLY
   (`SQLITE_OPEN_READ_ONLY` — hard rule), ports the adaptive poll + the
   stellarc-source exclusion + the knows_session tail logic from Axis's sync.rs.
   Emits normalized observation events as OrbitFrames with per-session seq,
   through the SAME spool/ack machinery live agent events use.
2. Proto: extend frames minimally if needed (e.g. an `observed` event family or
   a field distinguishing observed-channel events from managed-runtime events).
   Keep proto serde-only.
3. Axis: a receive-side ingester that applies observed frames to the event log
   idempotently (dedupe key: session hermes_id + message_id — mirror what
   sync.rs does today). Axis's direct state.db poll is then feature-flagged OFF
   by default (`disable_axis_statedb_poll` semantics: negative-polarity flag,
   new path on by default, flag rolls back to legacy — operator convention).
   Do NOT delete sync.rs in this card.
4. Cold-boot import: STAYS in Axis for now (it reads a local state.db once for
   history backfill) — moving backfill over the wire is out of scope. State
   this boundary in your summary.
5. Integration test: temp state.db fixture + real orbit against a temp Axis
   over a temp UDS socket (the ADR 0008 test pattern already exists — extend
   it): insert rows into the fixture → assert they land in Axis's log exactly
   once, ordered; kill Axis, insert more rows, restart Axis → spool replay
   delivers exactly once.

## Settled decisions — do NOT re-litigate
- state.db is READ-ONLY to everything Stellarc. Any write to Hermes is a patch,
  never direct.
- The event log remains Axis's sole source of truth; the orbit holds no truth,
  only a spool.
- Transport is the existing UDS/iroh frame connection. No new transports, no
  HTTP polling.
- The `source != 'stellarc'` single-writer filter is settled and must survive
  the move.
- Negative-polarity rollback flag, new path default-on.

## Gates
- `cargo test --workspace` + clippy `-D warnings` + fmt green, including the
  new integration test.
- Do NOT run against the live `~/.hermes/state.db` or `~/.stellarc/` — fixtures
  and temp dirs only. Do NOT start/restart stellarc services.
- Do not push to main. Green → `blocked: review-required` with: the frame
  additions, the flag name, the boundary statement (what stayed in Axis), and
  the integration-test evidence.
