# 0057 — Layout-idle and membership-verification races

## Summary

Final race review found two asynchronous completion gaps:

1. The project restore effect used `writer.isBusy(projectId)` as a guard, but the revision signal was emitted inside the save callback before the writer cleared its busy flag. The effect could wake, observe the writer still busy, return, and never run again.
2. Session association awaited a sessions refetch but ignored whether that refetch succeeded or actually returned the new project membership before opening the pane.

## Impact

A Axis response arriving while a layout save drained could leave project restore stalled until another unrelated render. A failed post-association refetch could open a pane without a verified authoritative membership projection, violating the fail-closed workspace invariant.

## Root cause

Queue completion and mutation completion were treated as the same event even though the queue clears `inFlight` after the saver promise resolves. The association path treated awaiting a query as equivalent to validating its result.

## Fix

- Add an explicit writer `onIdle(projectId)` callback fired only after `inFlight` becomes false; use that callback to trigger restore reconsideration.
- Require the refetched sessions payload to contain the exact `sessionId/projectId` association before opening a new pane.
- Keep project-switch epoch checking after the refetch.
- Add focused writer-idle coverage.

## Prevention

Async state machines must signal transitions after the guarded state has changed, not immediately before. Query completion is not proof of an invariant; validate the returned projection explicitly before causing UI side effects.
