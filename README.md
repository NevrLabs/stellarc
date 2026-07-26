# Stellarc

> Rust-native control plane for AI coding agents.

**Status:** v0, pre-release. Single-binary control plane + React UI.

Stellarc unifies AI coding agent sessions from every host and channel into one
searchable, resumable interface. It is **agent-agnostic**: agents are discovered
per node behind an adapter seam, so Hermes, Claude Code, Codex, Cursor, and
others are all first-class — no agent is privileged in the architecture.

## Architecture (at a glance)

```text
React UI (ui/)
  -> axis    — the control plane: event log, projections, REST + WS API, auth
  -> orbit   — the per-host node daemon: holds agent runtimes, PTYs, jobs
  -> agents  — hermes / claude-code / codex / ... behind one adapter interface
```

One binary, dispatched by role:

| Role | What it is | Runs |
|---|---|---|
| **axis** | central control plane; owns the event log and the API | one per install |
| **orbit** | node daemon; spawns and supervises agent runtimes | one per host |

Axis and orbit speak a versioned frame protocol (`crates/proto`) over iroh, so
nodes need no inbound ports or public address.

See `docs/architecture/architecture.md` for the full model and `docs/adrs/` for
decisions.

## Workspace

```text
crates/axis/     control plane: event log, views, search, REST/WS API, auth
crates/orbit/    node daemon: agent runtimes, PTY, jobs, host observation
crates/proto/    axis <-> orbit frame protocol (versioned, forward-tolerant)
crates/stellarc/ the binary: role dispatch (axis | orbit)
adapters/        per-agent adapters (ACP; claude-agent-acp today)
ui/              Vite + React + TypeScript client
docs/            architecture, ADRs, plans, reviews
```

## Toolchain

Rust for the backend, Bun for the UI.

```bash
make verify        # all gates: Rust (test/clippy/fmt) + UI (typecheck/build/e2e)
make verify-rust   # cargo test --workspace && clippy -D warnings && fmt --check
make verify-ui     # cd ui && typecheck + build + Maestro web e2e
make test          # cargo test --workspace (fast inner loop)
make run           # serve the API locally
```

`make verify` must be green before a PR.

## Why a single binary

Two roles, one artifact: the version that speaks the protocol is the same
version on both ends, so an upgrade can't desynchronize axis from its nodes.
Role is chosen at startup, not at build time.
