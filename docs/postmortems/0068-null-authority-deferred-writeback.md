# 0068 — Asynchronous restore callbacks wrote back Axis `layout: null`

## Summary

The restore fence covered synchronous `fromJSON`/`clear` work but was lowered before Dockview emitted its deferred layout-change callbacks.

## Impact

After Axis authoritatively returned `layout: null`, the UI cleared its panes and then persisted Dockview's empty layout object back to Axis. This destroyed the semantic distinction between explicit clean authority and a client-generated empty model.

## Root cause

`restoringRef` modeled the JavaScript call stack, while Dockview's mutation lifecycle extends beyond that stack.

## Fix

Suspend persistence for every authority application. For adopted Axis state, release the fence on the next animation frame after Dockview's deferred callbacks. Pending-journal recovery remains fenced until its retry settles; pruned layouts deliberately release the fence before saving the corrected state.

## Prevention

External component lifecycle boundaries must be measured, not inferred from synchronous API return. Keep the browser assertion that Axis null remains literal null after same-route replacement.
