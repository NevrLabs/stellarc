# ADR 0008 — Axis/Orbit process split with rolling deploy

Status: accepted · Date: 2026-07-09
Wayfinder map: [#1](https://github.com/nevrlabs/stellarc/issues/1) (tickets #2–#10 hold decision detail)
Evidence: `docs/wayfinder/resume-semantics.md`, `docs/wayfinder/resume-semantics-claude-codex.md`

## Context

Stellarc ships as one binary (`stellarc-axis`) that embeds the "local
orbit" in-process: the same process owns the redb event log, views, search,
REST/WS API, UI hosting, **and** the ACP child processes (`hermes acp`,
claude-code-acp, codex-acp) that hold live agent sessions. Consequences:

- Restarting the control plane kills every agent runtime. A session that is
  itself developing Stellarc cannot survive — let alone observe — a deploy of
  the thing it is building.
- There is no way to roll out a new runtime-holder without dropping sessions.
- ADR 0002 §2.1 already drew the layer boundary (host facts and runtimes are
  Layer 2/orbit concerns); ADR 0005 §3 and ADR 0007 kept the boundary "so
  multi-node is additive" — but no orbit binary exists and the UDS node
  protocol carries only hello/heartbeat/bye.

Empirical grounding (tickets #2, #10): all three supported harnesses implement
cross-process session resume backed by on-disk state — hermes (~2.5 s flat,
lockless, silent-new-session hazard), claude-code-acp (verified 1.8 s
cross-process resume), codex-acp (source-verified; fails closed on unknown
ids). Hermes persists completed turns only (in-flight turn output dies with
the child) and resets mode on resume; model choice persists.

## Decision

Split into two independently-deployable binaries:

- **Stellarc Axis** (`crates/axis`, bin `stellarc-axis`) — the control plane:
  event log (sole source of truth), views, search, import/sync, REST/WS, UI,
  auth, NodeRegistry + listeners, trigger scheduler.
- **Stellarc Orbit** (`crates/orbit`, bin `stellarc-orbit`) — the runtime
  holder: agent discovery, the runtime table, ACP bridge + children, setup
  adapter materialization, session spaces I/O.
- **`crates/proto`** — the only shared crate: wire frame types, AgentEvent/
  AgentCommand, RuntimeSpec. Serde only, no heavy deps. Axis and Orbit depend
  on proto, never on each other.

There is **no in-process orbit in production**. Axis's tests keep the
MockAgentRuntime seam behind the existing factory trait; one integration test
boots a real orbit against a temp axis over a temp socket.

### 1. Wire protocol (#3)

JSON-lines frames (one compact JSON object per line), multiplexed over one
persistent connection per orbit. Transport: **UDS** locally
(`~/.stellarc/control.sock`), **iroh** for remote orbits (QUIC, e2e-encrypted,
keyed by node id; Axis rejects node ids not on its allowlist — fail closed).

Frame families:
- Axis→Orbit: `ensure_runtime`, `prompt`, `steer`, `cancel`, `stop`,
  `respond_permission`, `drain`, `probe` — each with Axis-assigned `reqId`;
  orbit replies `resp {reqId, ok|error}`.
- Orbit→Axis: `event {sessionId, turnId, seq, payload}` — `seq` is a
  per-session monotonic counter assigned by the orbit (the ordering/idempotency
  key); `runtimes {[{sessionId, hermesId, state, resumable, lastSeq}]}` in
  hello and on change.
- Axis→Orbit: `ack {sessionId, seq}` (spool truncation watermark),
  `resume_from {sessionId, seq}` (replay cursor at reconnect),
  `heartbeat_ack`, and `re_register`. Axis acknowledges every known-node
  heartbeat and requests a fresh hello when the authenticated connection is
  alive but its registry entry is missing. Orbit also re-sends hello after
  three consecutive unacknowledged heartbeats.

Hello carries **two version fields with distinct jobs**:
- `protocolVersion: u32` — frame-schema compat gate. Unparseable version →
  registration rejected (fail closed). Changes rarely.
- `version: {semver, gitHash, builtAt}` — orbit **build identity**. This is
  what drain/evict decisions key on and what the Nodes UI shows. Protocol
  version does not solve "which orbit is outdated"; build version does.

The current Axis↔Orbit frame set is protocol version 1. Stellarc is pre-release,
so Axis requires an exact version match; there is no partial feature negotiation
or rolling wire compatibility. `heartbeat_ack`, `re_register`, node fencing, and
durable jobs are unconditional after a successful hello.

### 2. Orbit autonomy across Axis downtime (#5)

Orbits buffer through Axis restarts — sessions stay fully live:
- Every outbound `event` is appended to a per-session disk spool
  (`~/.stellarc/orbit/<id>/spool/<sessionId>.jsonl`) and sent when connected.
  Spools truncate at Axis's ack watermark; 512 MB/session cap with a
  `SPOOL_OVERFLOW` marker event on breach.
- Reconnect: orbit hello carries its runtimes table (+ lastSeq); Axis answers
  `resume_from` per session; orbit replays spool > seq, then streams live.
  Seq gate makes replay exactly-once and ordered; Axis derives its applied
  watermark from the event log itself on boot.
- A restarted Axis relearns who holds what **from the orbits** (the runtimes
  table), then reconciles against its log: sessions the log says are running
  that no orbit claims → marked detached, lazily resumable.

### 3. Drain and handover (#4, amended by #10)

Axis orchestrates; handover is **resume-then-flip**, not kill-then-resume
(research: resume is lockless; nothing arbitrates writers, so Axis enforces
single-prompter).

Per session (E1 → E2): quiesce (prompts queue in Axis) → turn boundary
(bounded, `drain_turn_timeout` 10 min, then cancel; in-flight turn recorded
lost — its streamed chunks already live in Axis's log even though the harness
store drops them) → `ensure_runtime` on E2 with resume id → **verify
provenance** (returned session id must match; hermes silently creates new
sessions on unknown ids) → re-apply mode / reconcile from resume response →
flip (`SessionRuntimeMoved` event) → release queued prompts → reap E1's child.

- Handover requires the runtime's **`resumable` capability flag** (from the
  adapter's initialize response: `loadSession` + `sessionCapabilities.resume`)
  — capability-driven, never harness-name-driven. All three current harnesses
  pass. Non-resumable → degraded drain: turn boundary → stop → session
  runtime-less; lazy revival on next prompt.
- Node drain = registry status Draining (no new sessions) + handover of every
  held session (parallel, bounded 4); complete when the orbit's runtime table
  is empty. Runtime location is **event-logged** (`SessionRuntimeMoved`), not
  registry-only — Axis restarts mid-drain must not forget locations.
- Every failure fails closed to "session stays where it was": E2 death,
  resume failure, provenance mismatch → abort, surface, drain pauses.
- Budget ~5 s/session (2.5 s resume + spawn/init).

### 4. Triggers — Axis-initiated turns (#8)

Minimal, event-logged trigger object; Axis gains a scheduler, **not** an
executor (the session's agent already has bash):
- `POST /api/triggers {sessionId, prompt, fireAt|intervalSecs, maxFires=1,
  ttlSecs}`; `GET`/`DELETE`. Defaults fail closed: one-shot, TTL 24 h;
  recurring requires explicit `maxFires`.
- Firing = the existing post-message path (lazy ensure_runtime revives the
  session if needed). State events: TriggerCreated/Fired/Exhausted/Cancelled —
  triggers survive Axis restarts; a one-shot whose fireAt passed during
  downtime fires once on boot (fire-or-expire, never a burst).

### 5. Deploy choreography (#7)

systemd user units: `stellarc-axis.service`, `stellarc-orbit@.service`
(templated; `%i` = node-id suffix, own spool dir; `Restart=on-failure` so a
drained orbit that exits 0 stays down). Binaries at
`~/.stellarc/bin/stellarc-{axis,orbit}-<gitHash>` with a symlink as the deploy;
unit PATH includes `~/.local/bin` (postmortem 0001).

**Orbit rolling deploy** (Session A story): build → symlink flip →
`systemctl --user start stellarc-orbit@2` → Axis health-gates E2 (hello +
protocolVersion parses + `probe` round-trip returning agent discovery; result
event-logged) → `POST /api/nodes/orbit-1/drain {toNode: orbit-2}` → E1 empties
and exits. Session A hands over mid-drain and continues on E2. Gate failure →
drain never starts; nothing moved.

**Axis deploy** (Session B story): no rolling pair (one redb writer). Arm
one-shot trigger ("Axis restarted — verify and report") → symlink flip →
`systemctl --user restart stellarc-axis`. Orbits buffer; hello/runtimes
re-attach; spools drain; trigger fires the verification turn into Session B.
Rollback = flip symlink back.

Axis owns the drain state machine; the deploy *sequence* is scripted outside
Axis (`make deploy-orbit`, `make deploy-axis`, agent-callable bash) using
Axis's primitives. Axis exposes primitives, not a pipeline.

### 6. Migration (green tree at every step) (#6)

1. Extract `crates/proto` (types only; monolith builds against it).
2. Extract orbit-side modules into `crates/orbit` as a lib the monolith still
   links.
3. Add UDS session-RPC to axis + orbit `main.rs` — both binaries exist; the
   monolith still works.
4. Cutover: units for axis + orbit@, delete the monolith and in-process
   registration. `stellarc-axis` retires here.

`make verify` gates each step.

## Consequences

- Sessions survive and observe Axis deploys; orbits roll without dropping
  sessions. Stellarc can develop Stellarc.
- New machinery to own: spool files + seq bookkeeping, drain state machine,
  trigger scheduler, iroh endpoint + allowlist. Each is bounded and
  independently testable; all frames stay jq/socat-debuggable.
- The event log gains event kinds: `SessionRuntimeMoved`, Trigger*, gate
  results. Views project runtime location; Nodes UI shows build versions.
- Two binaries to version and deploy instead of one; the symlink-flip scheme
  and build-version-in-hello keep that manageable.
- Hermes-specific hazards are contained at the orbit edge (provenance check,
  mode re-apply) behind capability flags — no harness names in Axis logic.
- Open refinements (do not block build): re-run claude probe after
  `claude /login` (replay fidelity, mid-turn); runtime-verify codex-acp when
  the CLI lands on a node.
