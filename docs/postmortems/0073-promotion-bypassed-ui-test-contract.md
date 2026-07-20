# 0073 — Production promotion bypassed the UI package test contract

**Date:** 2026-07-20
**Severity:** Medium
**Status:** Resolved on `dev`

## Impact

`scripts/promote-production.sh` invoked `bun test --run` directly. That selects
Bun's built-in test runner rather than the repository's `package.json` `test`
script. Repository-level test setup and any additional fail-closed checks chained
to the package script could therefore be skipped during production promotion.
The new Vite environment-identity check would not have run, allowing future
ambient configuration regressions to bypass the release gate.

## Root cause

The promotion script encoded a test-runner command instead of treating the
package script as the UI test authority.

## Resolution

Promotion now runs `bun run test`. The package script runs Vitest with the
repository configuration and then the Vite environment check that proves serve
mode exposes explicit `dev` while production build mode clears a poisoned
ambient dev marker.

## Prevention

Deployment and CI entry points invoke project-owned package scripts. Runner
selection and chained checks remain defined in one place: `ui/package.json`.
