# 0050 — Dev E2E health check drifted from Axis's canonical route

## Summary

The canonical live browser harness checked `GET /health`, while the Axis router defines the unauthenticated health endpoint at `GET /api/health`. An older running Axis binary happened to answer both paths, masking the mismatch until the isolated Axis was restarted from the current build.

## Impact

After a clean Axis restart, `ui/scripts/dev-e2e.sh` failed before Playwright despite Axis being healthy and listening. This made the acceptance harness dependent on stale process state and prevented reliable restart validation.

## Root cause

The harness duplicated the health path rather than matching the route contract in `crates/axis/src/server/mod.rs`. The long-lived dev process retained compatibility behavior that the current binary no longer exposed, so ordinary pre-restart runs did not reveal the drift.

## Fix

Change the live E2E preflight to request `/api/health`, the route covered by the control-plane route contract.

## Prevention

- Restart the isolated Axis before the final browser acceptance gate.
- Treat current-source route contracts, not behavior from a long-lived process, as authoritative.
- Keep health probes on `/api/health` across systemd, harness, and operator tooling.
