# Stellarc Development and Production Environment Split

**Date:** 2026-07-15
**Status:** Approved

## Purpose

Make `fxcompute-01` the authoritative Stellarc development host while keeping Terminus as the production runtime. Eliminate active `fxbuilder` naming, expose the isolated development plane at `https://stellarc-dev.entelechia.cloud`, prohibit builds on Terminus, and shorten edit/build/test/deploy cycles.

## Invariants

1. `fxcompute-01` is the canonical VM hostname, SSH name, Stellarc node ID, and development host.
2. `/home/rpw/stellarc` on `fxcompute-01` is the authoritative live repository and retains all Git refs, reflogs, uncommitted changes, untracked files, and linked worktrees.
3. Terminus runs production Stellarc but never runs Cargo, rustc, a linker, Bun, npm, or Vite for Stellarc.
4. Development and production do not share databases, tokens, signing keys, Iroh identities, workspaces, or Orbit spools.
5. Only clean, committed `main` builds whose `HEAD` equals `origin/main` may be promoted to production.
6. Production remains unchanged until an explicit promotion; creating the development environment does not redeploy production.
7. External development ingress is published only after Cloudflare Access and application authentication are verified.

## Canonical Names

| Concern | Canonical value |
|---|---|
| FxCluster VM | `fxcompute-01` |
| Linux hostname | `fxcompute-01` |
| SSH host | `fxcompute-01` |
| Stellarc fleet node ID | `fxcompute-01` |
| Job CLI default node | `fxcompute-01` |
| Production job runner | `stellarc-prod-job-runner.service` |
| Development Axis | `stellarc-dev-axis.service` |
| Development Orbit | `stellarc-dev-orbit.service` |
| Development UI | `stellarc-dev-ui.service` |

`fxbuilder` remains temporarily as an SSH compatibility alias only. Active services, CLI defaults, logs, UI labels, and operational documentation use `fxcompute-01`.

## Architecture

### fxcompute-01: development and build authority

- `/home/rpw/stellarc`: live source and all linked worktrees.
- `/home/rpw/.stellarc-dev`: isolated Axis database, authentication data, installation token, capability key, Iroh key, session spaces, and development binaries.
- `/srv/stellarc-dev/jobs`: isolated development job workspaces and artifacts.
- `stellarc-dev-axis.service`: development control plane.
- `stellarc-dev-orbit.service`: local development agent runtime and JobRunner.
- `stellarc-dev-ui.service`: Vite development server with HMR and API/WebSocket proxying to the development Axis.
- `stellarc-prod-job-runner.service`: production Axis JobRunner, using a separate production job root.
- Persistent Cargo, Bun, npm, and compiler caches.

### Terminus: production runtime and edge

- `/home/rpw/.stellarc`: existing production state and identity.
- `stellarc-axis.service`: production Axis.
- `stellarc-orbit@1.service`: production runtime node `terminus`.
- Immutable promoted release bundles and an atomic `current` symlink.
- Existing Cloudflare connector for both production ingress and relayed development ingress.
- No Stellarc compiler or frontend build processes.

### Development ingress

```text
Browser
  -> Cloudflare Access
  -> existing Terminus Cloudflare tunnel
  -> Terminus 127.0.0.1:8800
  -> reverse SSH transport
  -> fxcompute-01 development frontend
  -> development Axis API/WebSocket endpoints
```

The reverse SSH service is renamed for `fxcompute-01` and retains the existing SSH transport while adding the development frontend reverse forward. A separate Cloudflare tunnel is unnecessary.

## Repository Migration

The Terminus repository is not reproducible from GitHub alone: it contains local commits, modified and untracked files, reflogs, and linked worktrees. Migration therefore preserves the complete repository at the same absolute path.

1. Pre-copy `/home/rpw/stellarc` from Terminus to the same path on `fxcompute-01` while work may continue.
2. Detect active writers and builds.
3. Establish a short source-write freeze.
4. Perform a final checksummed synchronization with deletions disabled until validation succeeds.
5. Validate Git object integrity, refs, worktree registrations, branch heads, status counts, and representative file hashes.
6. Retain a timestamped read-only Terminus snapshot for rollback.
7. Mark fxcompute-01 as source authority in the runbook and shell login notice; Terminus's old source is not used for development.

The first migration does not require the dirty tree to be cleaned or committed. The clean-main rule applies to later production promotion.

## Isolated Development State

Development starts fresh. It does not copy or read production Stellarc or Hermes state.

- `STELLARC_HOME=/home/rpw/.stellarc-dev`
- Development bind address and allowed origin are distinct.
- Development Axis creates new auth, installation token, capability signing key, Iroh key, database, and search state.
- Development Orbit uses its own state/spool and job root.
- Production and development Orbits may both advertise node ID `fxcompute-01` because they connect to different Axiss.
- Mutating development data must not alter any file under Terminus `/home/rpw/.stellarc`.

## Development-Speed Improvements

### Frontend

- Install pinned Bun and Node 22/npm.
- Run Vite continuously with HMR.
- Proxy API, WebSocket, and terminal traffic to the local development Axis.
- Keep dependencies and caches local and persistent.

### Rust

- Use the installed `mold` linker through host-local Cargo configuration.
- Install and configure `sccache` with a bounded persistent cache.
- Use separate target directories for development and production jobs to prevent target-directory lock contention.
- Install `cargo-nextest` for test execution and `cargo-watch` for development restart-on-change.
- Keep builds and runtime services in bounded systemd slices so concurrent compilers cannot exhaust the 12 GiB VM.

### Agent execution

Install the runtime dependencies required by Stellarc's Hermes, Claude, and Codex adapters. Development sessions execute on the local Orbit with `/home/rpw/stellarc` as their working directory. Zephyr and Terminus orchestrate work against `fxcompute-01`; they do not edit or compile the production host checkout.

### Measurement

Record cold build, warm build, representative test, and frontend startup times before and after optimization. Keep an optimization only when measured results improve or it removes target-lock contention.

## Production Promotion

A single command on fxcompute-01 performs promotion. It must fail closed unless:

1. Branch is `main`.
2. Index and worktree are clean.
3. Remote refs were freshly fetched.
4. `HEAD` equals `origin/main`.
5. Required Rust and UI checks pass.
6. Release binaries and UI build complete successfully.

Promotion produces an immutable bundle:

```text
release/<git-sha>/
  stellarc-axis
  stellarc-orbit
  ui/
  manifest.json
```

The manifest records Git SHA, build time, toolchain versions, and SHA-256 checksums. Terminus verifies checksums after transfer. Activation uses an atomic symlink. Before restart, the deployer creates a consistent SQLite backup. Health, authentication, fleet registration, and external checks gate success. Failed activation restores the previous symlink; if startup performed an incompatible database migration, rollback restores the pre-deploy database while services are stopped.

## Security

- Clone or create a Cloudflare Access application and allow policy for `stellarc-dev.entelechia.cloud` before adding public ingress.
- Keep Stellarc application authentication enabled behind Access.
- Bind development services to loopback only.
- Keep Cloudflare credentials on Terminus.
- Use separate service environment files with mode `0600`; do not place secrets in unit files or Git.
- Retain the tunnel catch-all `http_status:404` rule.

## Failure Handling

- Repository validation failure: keep Terminus authoritative and remove no source.
- Development service failure: leave production untouched and do not publish ingress.
- Reverse-forward failure: systemd restarts the transport; production ingress remains unaffected.
- Cloudflare Access verification failure: do not publish the development hostname.
- Node rename failure: retain the compatibility alias and old service until a canary job succeeds on `fxcompute-01`.
- Promotion failure before activation: leave current production release untouched.
- Promotion failure after activation: atomically restore the prior release and run health checks.

## Acceptance Criteria

1. `stellarc-dev.entelechia.cloud` redirects unauthenticated requests to Cloudflare Access.
2. Development login works and exposes fresh isolated state.
3. Development and production token hashes, capability keys, Iroh keys, databases, and workspaces differ.
4. Development mutations do not change production database files.
5. Active fleet and job surfaces use `fxcompute-01`; no active surface uses `fxbuilder`.
6. Frontend edits trigger HMR.
7. Rust edits trigger incremental rebuild and Axis reconnection.
8. Before/after performance measurements are recorded.
9. A production canary job executes on `fxcompute-01`.
10. Process monitoring proves no compiler or frontend build process runs on Terminus.
11. Invalid release bundles fail before activation.
12. Rollback restores the previous release and healthy service state.

## Operations Documentation

The repository must contain a concise runbook that declares:

- fxcompute-01 as development and source authority;
- Terminus as production runtime;
- canonical service and node names;
- development startup, recovery, and log commands;
- promotion and rollback commands;
- the hard invariant that Terminus never builds Stellarc.
