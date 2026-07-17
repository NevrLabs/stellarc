# 0064 — Layout serialization ended at the React mount boundary

## Summary

Each `SessionsView` mount created its own latest-value writer even though project layout ordering must span route and StrictMode remounts.

## Impact

An old component's teardown save could complete after a newer component's save and roll Hall back. Its completion callback could also replace the shared query cache with the stale response.

## Root cause

The queue lifetime matched a presentation component rather than the project persistence domain.

## Fix

Use one module-scoped per-project writer for the browser runtime. Components subscribe to lifecycle-safe save/error/idle events. Cache updates carry monotonically ordered completion revisions so an older completion cannot replace a newer one.

## Prevention

Concurrency-control objects must live at least as long as the resources they serialize. Component-local queues are invalid for durable resources that survive component remounts.
