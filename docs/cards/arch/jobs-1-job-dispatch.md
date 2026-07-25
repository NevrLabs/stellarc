# JOBS-1 · Job dispatch: NodeRole in Hello + Job frames + orbit JobTable

## Goal
ADR 0011 Phase 1. stellarc-orbit gains a JobRunner role: Axis can dispatch
shell jobs to role-tagged orbits over the existing frame protocol. Same
binary, same transport. This alone unblocks remote compilation offload.

## Read FIRST
- `docs/adrs/0011-jobs-mcp-capabilities-sandboxing.md` — the governing ADR
  (§1 is your spec, verbatim).
- `docs/adrs/0008-axis-orbit-split-rolling-deploy.md` — frame protocol, seq/
  ack, spool semantics. Job output frames follow the SAME spool/ack discipline
  as agent events.
- `crates/proto/src/frames.rs` — AxisFrame/OrbitFrame as merged by ARCH-E.
- `crates/orbit/src/runtime_table.rs` — the pattern JobTable parallels,
  including `reap_idle` (the reaper applies to both tables per ADR 0011).
- `crates/orbit/src/main.rs` — Hello construction, reaper wiring.
- `crates/axis/src/server/orbit_conn.rs` + the fleet route module
  (post-ARCH-B layout) — Axis's dispatch/receive side.

## Build on
Branch from main AFTER ARCH-E and ARCH-F merge (both parents). Confirm the
observer module (ARCH-E) and bridge/{framing,client,child}.rs (ARCH-F) exist
in your base; if not, STOP and signal blocked.

## Deliverables
1. Proto: `NodeRole` bitset/enum (`AgentRuntime`, `JobRunner`) in Hello;
   `AxisFrame::{DispatchJob, CancelJob}`; `OrbitFrame::{JobOutput, JobResult}`.
   DispatchJob carries: job id (Axis-assigned), argv (array — NO shell string
   construction), env allowlist, cwd (within the orbit's job workspace root),
   timeout_secs, max_output_bytes. Serde only, keep proto dep-light.
2. Orbit: `JobTable` paralleling RuntimeTable — spawn via tokio::process with
   argv arrays, stream stdout/stderr as JobOutput frames (chunked, seq'd,
   spooled), JobResult with exit code + truncation flag on max_output_bytes
   breach. CancelJob → SIGTERM, escalate SIGKILL after grace. Reaper: jobs
   exceeding timeout_secs are killed and reported, mirroring reap_idle.
3. Role config: orbit config/flag declares roles (default: AgentRuntime only —
   JobRunner is opt-in). Hello advertises them; Axis's NodeRegistry records
   them; Axis refuses DispatchJob to a node not advertising JobRunner
   (fail closed).
4. Axis: `POST /api/jobs {nodeId, argv, ...}` → job id (non-blocking);
   `GET /api/jobs/:id` (status + tail of output); `DELETE /api/jobs/:id`
   (cancel). Job lifecycle events go into the event log (JobDispatched/
   JobCompleted) so state survives Axis restarts; streamed output is
   view/broadcast, not per-chunk log events (don't flood the log).
5. Integration test (extend the ADR 0008 temp-UDS pattern): dispatch
   `echo hello` to a JobRunner-role orbit → output frame + zero exit;
   dispatch to a non-JobRunner orbit → refused; cancel a `sleep 60` →
   terminated result; Axis restart mid-job → JobResult still lands via spool
   replay.

## Settled decisions — do NOT re-litigate (ADR 0011)
- No separate job-runner binary. No new transport.
- argv arrays only — never shell string interpolation (repo hard rule).
- Jobs are NOT agent sessions: no ACP, no bridge involvement. JobTable is a
  sibling of RuntimeTable, not a tenant of it.
- Capability enforcement / sandboxing is Phase 3/4 — for now jobs run as the
  orbit user with the installation-level trust the orbit already has. Do not
  build a permission model here.
- MCP exposure is Phase 2 — REST only in this card.

## Gates
- `cargo test --workspace` + clippy `-D warnings` + fmt green, including the
  integration test.
- Do NOT start/restart the live stellarc services; temp sockets/dirs only.
- Do not push to main. Green → `blocked: review-required` with: frame shapes,
  role config syntax, and integration-test evidence.
