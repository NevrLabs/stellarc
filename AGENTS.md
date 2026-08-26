# Agent Map — Stellarc v2

**Read first:** `docs/v2-charter.md` (doctrine D1–D20) and `docs/adrs/`
(founding ADRs 0001–0006). `CONTEXT.md` is the glossary + decision log.

## Hard rules (from doctrine — violations are design bugs)

- The CP is **inert**: never calls models, never runs agent loops (D4).
- Append-only event log is the sole truth; views are projections; the log is
  never rewritten (D10). Events are `pluginId:type` namespaced.
- Everything is a plugin — including first-party features (D5). No privileged
  code outside the kernel (D6).
- Node reports are claims (D14). Cross-node actions require CP authorization.
- Every action logs an actor — no anonymous agent actions (D12).
- Workflow graphs are data, run by the engine; custom steps only in the
  isolate runner (D20).

## Workspace

- `apps/control` — Bun/TS CP: kernel (loader, capability check, event log,
  authn/z, transit) + first-party plugins.
- `apps/web` — web UI.
- `crates/arclet` — Rust node daemon: adapters, workspace mgmt, journal, iroh.
- `crates/tunnel` — standalone capability-scoped harness tunnel over iroh.
- `templates/` — seed templates (agent/project/workflow), ADR 0005.

## Verify

`bun test` + `bun run typecheck` (TS) · `cargo test --workspace` +
`cargo clippy --all-targets -- -D warnings` + `cargo fmt --check` (Rust).
