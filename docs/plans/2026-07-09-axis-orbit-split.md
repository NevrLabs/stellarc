# Plan: Axis/Orbit split & rolling deploy (ADR 0008)

Date: 2026-07-09 · Source: ADR 0008 + wayfinder map #1 (tickets #2–#10)
Execution: swarm-ready — each milestone is one worker session, gated, committed.
Evidence baseline: `docs/wayfinder/resume-semantics.md`,
`docs/wayfinder/resume-semantics-claude-codex.md`.

**Standing rules for every milestone:** `make verify` (or `verify-rust` where
UI untouched) green before DONE; no unrelated refactors; event log stays sole
source of truth; anyhow errors rendered `{e:#}` (postmortem 0001); new
user-facing strings in every locale file if UI touched; update the Status
Ledger at the bottom on completion.

---

## Milestone S1 — `crates/proto` extraction

**Goal:** the shared wire-type crate exists; the monolith builds against it.
No behavior change.

- Create `crates/proto`: move `AgentEvent`, `AgentCommand`, `RuntimeSpec`,
  `AcpFraming` + add the ADR §1 frame enums (`AxisFrame`, `OrbitFrame` with
  hello/heartbeat/bye/ensure_runtime/prompt/steer/cancel/stop/
  respond_permission/drain/probe/resp/event/runtimes/ack/resume_from).
  Serde derives only; deps: serde, serde_json. camelCase wire naming to match
  the existing node protocol.
- Exact `protocolVersion: u32 = 1` const with no compatibility negotiation;
  `BuildVersion {semver, gitHash, builtAt}`
  struct (populated via `env!("CARGO_PKG_VERSION")` + build script git hash).
- Round-trip serde tests for every frame; unknown-field tolerance tests
  (`#[serde(default)]` discipline).
- Workspace member added; `stellarc-axis` re-imports moved types from
  proto (pub use shims fine).

**Gates:** `make verify-rust`. No wire behavior change (existing node.rs tests
still pass unmodified).

## Milestone S2 — orbit library extraction

**Goal:** orbit-side code lives in `crates/orbit` as a lib; monolith links it.

- Move `bridge/` (hermes.rs, acp.rs, mod.rs runtime traits), `adapter/`,
  `server/agents.rs` (discovery) into `crates/orbit`; split `bridge_mgr.rs`:
  runtimes HashMap + factory → orbit `RuntimeTable`; session bookkeeping,
  spaces, log-append stay axis-side.
- Orbit lib exposes: `RuntimeTable` (ensure/send/stop per session, capability
  flags from initialize responses per ADR §3), `discover_agents()`.
- Capability flags: parse `loadSession` + `sessionCapabilities.resume` from
  each adapter's initialize response into `resumable: bool` on the runtime
  entry (per #10 — capability-driven, never harness-name matching).
- MockAgentRuntime stays axis-side behind the factory trait, now typed via
  proto.

**Gates:** `make verify` (full — server tests exercise the moved code through
the monolith). Zero functional diff intended; diff review confirms moves not
edits.

## Milestone S3 — orbit binary + axis session-RPC (UDS)

**Goal:** both binaries exist and a real orbit drives sessions over UDS.
Monolith still works (cutover is S6).

- `crates/orbit/src/main.rs`: connect to Axis UDS, hello (protocolVersion +
  BuildVersion + discovered agents + runtimes table), heartbeat loop, frame
  dispatch → RuntimeTable, event stream → `event` frames with per-session
  `seq`.
- Axis: extend UDS handler (node.rs) with session frames; `RemoteRuntime`
  implementing the existing factory seam so `ensure_runtime`/post_message
  route to the orbit connection when the session's node is remote; `probe`
  frame handler.
- Registration rejects unparseable protocolVersion (fail closed); Nodes view
  + `/api/nodes` expose BuildVersion.
- Integration test: temp axis + real orbit child over temp socket → create
  session (MockAgentRuntime on the orbit side for CI cheapness) → prompt →
  events land in axis's log ordered by seq.

**Gates:** `make verify-rust` + the new integration test; manual: orbit binary
against dev axis drives one real hermes session end-to-end.

## Milestone S4 — spool + reconnect replay

**Goal:** ADR §2 — orbits buffer through Axis downtime; exactly-once seq
replay.

- Orbit: per-session JSONL spool (append before send), truncation at `ack`
  watermark, 512 MB cap + `SPOOL_OVERFLOW` marker event.
- Axis: applied-seq watermark derived from event log on boot; `resume_from`
  per session in the reconnect handshake; duplicate-seq drop gate at apply.
- Reconcile: sessions running-in-log but unclaimed by any orbit → detached
  (lazily resumable).
- Tests: kill axis mid-stream (integration test with real orbit child),
  restart, assert no gaps/dups in log by seq; spool truncation after ack;
  overflow marker.

**Gates:** `make verify-rust` + kill/restart integration test green 3× in a
row (flake check).

## Milestone S5 — drain state machine + triggers

**Goal:** ADR §3 handover + §4 triggers — the operational core.

- Events: `SessionRuntimeMoved`, `TriggerCreated/Fired/Exhausted/Cancelled`,
  `NodeGateResult`; view projections for runtime location + trigger state.
- Drain: `POST /api/nodes/{id}/drain {toNode?}` → per-session state machine
  (quiesce → bounded turn wait 10 min → resume on target with provenance
  verification → mode re-apply/reconcile → flip → release queued prompts →
  reap). `resumable` gate with degraded path (turn boundary → runtime-less).
  Parallelism 4. Every failure → session stays put, drain pauses, surfaced.
- Triggers: API (`POST/GET/DELETE /api/triggers`, one-shot default, TTL 24 h,
  recurring requires maxFires), tokio scheduler over the trigger view, firing
  = existing post-message path, boot catch-up fire-or-expire.
- Tests: handover with MockAgentRuntime pair (happy, mid-turn timeout,
  provenance mismatch, target death); trigger persistence across simulated
  restart (log replay re-arms); runaway guardrails.

**Gates:** `make verify`; manual: drain a real orbit holding one live hermes
session to a second orbit — session continues (send a prompt post-flip, reply
arrives).

## Milestone S6 — cutover + deploy tooling

**Goal:** monolith retired; systemd + Makefile deploy paths; the self-hosted
loop demonstrated.

- Units: `stellarc-axis.service`, `stellarc-orbit@.service`
  (`Restart=on-failure`, PATH per postmortem 0001, spool dir per instance).
  Binaries `~/.stellarc/bin/*-<gitHash>` + symlink flip.
- `make deploy-orbit` (build → flip → start @N → poll gate via API → drain
  old → assert empty+exited) and `make deploy-axis` (arm trigger → flip →
  restart → trigger verifies). Both scripts exit non-zero on any gate failure
  with nothing moved.
- Delete monolith bin target + in-process local-orbit registration; local
  node becomes `stellarc-orbit@1` over UDS. Update AGENTS.md (commands, map),
  ARCHITECTURE/ADR index, harness docs.
- **Acceptance (the ADR's two stories, run for real):**
  1. Session A on orbit@1 edits a comment string in orbit, `make
     deploy-orbit` → session A continues on orbit@2 and prints the new
     orbit's BuildVersion.
  2. Session B arms `make deploy-axis`; axis restarts; B's trigger turn fires
     and reports `/health` + re-attached nodes.

**Gates:** `make verify`; both acceptance stories pass on terminus; postmortem
0001's CLI table re-verified against the new units.

## Milestone S7 (parallel, anytime after S3) — iroh remote transport

**Goal:** ADR §1 remote leg. Independent of S4–S6.

- `iroh` endpoint in axis alongside UDS; node-id allowlist
  (`~/.stellarc/axis.toml`), reject at accept (fail closed). Orbit config
  `axis = "uds:…" | "iroh:<node-id>"`. Same frames, same codec.
- Test: two processes, iroh loopback, full hello/session/event round-trip;
  allowlist rejection test.

**Gates:** `make verify-rust` + iroh integration test. Real Talos enrollment
is a follow-up op task, not a gate.

---

## Milestone S8 (parallel, anytime — Axis+UI only) — session-scoped streaming & typing presence

**Goal:** per-session WS subscriptions + ephemeral typing indicators; groundwork
for future multi-user shared sessions (identity itself is out of scope).

- WS inbound gains frames: `subscribe {sessionIds}` / `unsubscribe` — Axis
  filters broadcast frames per connection (unsubscribed connections still get
  session-list-level frames, not message/delta streams). Default on connect:
  firehose (backward compatible).
- WS connect accepts `?name=` display name (falls back to `anon-<n>`); no auth
  change — attribution only, real identity comes with shared sessions later.
- Typing presence: inbound `typing {sessionId}` (client debounces ~3 s) →
  broadcast `UserTyping {sessionId, who, expiresAt}` to that session's
  subscribers. Ephemeral: NEVER event-logged, no replay, TTL-expired
  client-side. UI: "«name» is typing…" row in chat view (Discord-style).
- User messages already fan out live via MessageAppended; agent streaming
  already per-session via text_delta sessionId — this milestone only scopes
  delivery and adds presence.
- Tests: subscription filtering (two WS clients, one subscribed — only it gets
  deltas); typing frame round-trip + TTL expiry; locale files for new UI
  strings.

**Gates:** `make verify`; manual: two browser tabs on one session — typing in
tab A shows indicator in tab B; a third tab on a different session sees
nothing.

---

## Sequencing

S1 → S2 → S3 → S4 → S5 → S6, with S7 branching off after S3. S8 is
Axis+UI-only and can run parallel to any of S2–S7 (touches ws.rs + UI, no
orbit surface). One worker per milestone; no parallelism within S1–S6 (each
rewires what the previous moved).

## Status Ledger

| Milestone | Status | Worker | Commit |
|---|---|---|---|
| S1 proto | DONE | Terminus (subagent) | see git log (feat(proto)) |
| S2 orbit lib | DONE | Terminus (subagent, committed by Terminus) | feat(orbit) |
| S3 binaries+RPC | DONE | glm52 worker (committed by Terminus) | feat(axis): UDS session dispatch + RemoteRuntime |
| S4 spool/replay | TODO | — | — |
| S5 drain+triggers | TODO | — | — |
| S6 cutover | DONE | glm52 worker | feat(axis): S6 cutover — retire monolith, systemd units, deploy scripts |
| S7 iroh | DONE | glm52 (Zephyr) | feat(axis): iroh remote transport |
| S8 streaming+typing | DONE | Zephyr (glm52) | feat(ws): session-scoped subs + typing presence |
