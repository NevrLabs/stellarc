# 0062 — Live E2E used an ambient `bunx` runner

## Summary

The live-dev Playwright harness invoked `bunx playwright` even though Playwright is a pinned UI development dependency.

## Impact

On fxcompute the ambient Bun runner failed while compiling the test and reported `No tests found`; non-login SSH also lacked the user-local Node path, so the gate could fail before collection. The same checked-in test listed correctly through the local Playwright CLI.

## Root cause

The harness bypassed the repository's dependency boundary and delegated CLI resolution to the host environment.

## Fix

Add the standard user-local binary directories to `PATH`, execute `ui/node_modules/.bin/playwright` directly, and fail with an actionable message when UI dependencies have not been installed.

## Prevention

Repository gates must execute version-pinned local tools. Ambient package runners are appropriate for installation/bootstrap only, not deterministic acceptance tests.
