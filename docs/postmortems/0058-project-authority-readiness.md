# 0058 — Browser probe clicked before project authority loaded

## Summary

After project opens were correctly changed to fail closed while the project query was fetching, the live browser probe still considered the route ready as soon as the Dockview shell existed. Cached session rows could be clicked before Hall had confirmed the project.

## Impact

The probe intermittently failed with the intended operator error, `Project is unavailable; session was not opened`, even though Hall returned the project milliseconds later. This was a harness race, not a workspace persistence failure.

## Root cause

Route readiness and authority readiness were conflated. The shell mounts immediately; the project query completes asynchronously.

## Fix

Expose a testable `data-project-ready` state on the workspace shell and make normal project navigation in the durable probe wait for both the target pathname and authoritative readiness. Deleted-project tests explicitly skip the readiness wait because rejection is the behavior under test.

## Prevention

Browser automation must wait for the domain invariant needed by its next action, not merely for a component selector. Fail-closed loading states need an observable readiness signal for deterministic acceptance tests.
