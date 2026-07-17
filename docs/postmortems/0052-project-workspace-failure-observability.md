# 0052 — Project workspace persistence and move failures were not observable

## Summary

Project layout saves and sidebar drag-to-project associations could fail without any visible error. In addition, an incompatible Dockview payload could leave partially restored panels after `fromJSON` threw instead of returning to a clean workspace.

## Impact

An operator could arrange a workspace, refresh later, and discover that Hall never received the layout. A failed drag could look successful while membership remained unchanged. Corrupt or version-incompatible state could leave a partial layout rather than failing closed.

## Root cause

`LatestProjectLayoutWriter` intentionally caught rejected saves to keep its queue alive, but exposed no error callback. The sidebar launched its async drop handler with `void` and did not catch failures. The restore catch path marked the layout for replacement without explicitly removing any panels Dockview created before throwing.

## Fix

- Add a per-project layout-save error callback and show the error only in the affected project workspace; clear it after a later successful save.
- Catch drag-to-project failures in the sidebar and render an alert.
- Remove any partially restored panels before persisting a clean replacement layout.
- Add focused regressions for writer failures and failed project drops.

## Prevention

Every background mutation must have three explicit outcomes: durable success, visible failure, and a tested recovery path. Fail-closed restore paths must actively establish the clean state rather than assuming a parser rollback is atomic.
