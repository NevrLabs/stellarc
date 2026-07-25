# 0060 — Repeated equivalent Dockview events caused a Axis write loop

## Summary

Same-route authority replacement exposed that Dockview can emit repeated layout-change events for a semantically unchanged layout. The persistence writer serialized and coalesced in-flight values but did not remember the last successfully saved semantic value.

## Impact

A restored two-pane workspace generated dozens of identical `project.layout_updated` events per second and kept the writer continuously busy. This polluted the event log, consumed CPU and I/O, and allowed stale writes to race later authority updates.

## Root cause

The writer treated every event as new work. Object identity and ordinary JSON insertion order are not reliable layout identity, so an authority/reload cycle could repeatedly feed equivalent snapshots back into Axis.

## Fix

- Canonicalize layout fingerprints recursively by sorting every object key while preserving array order.
- Track in-flight, pending, and last-successful fingerprints per project.
- Drop duplicate pending/in-flight snapshots and skip a pending snapshot that becomes identical to the last successful save.
- Let the restore path adopt an authoritative Dockview snapshot without writing that programmatic restore back to Axis.
- Preserve latest-value semantics for `A → B → A` while A is in flight.
- Add focused canonicalization, duplicate-save, and obsolete-pending tests.
- Expose layout-writer activity to the browser probe and require a stable idle window before injecting external authority changes.

## Prevention

Persistence queues must deduplicate by semantic state, not event count, reference identity, or incidental JSON key order. Acceptance gates must verify quiescence and event-rate stability—not merely the latest visible value.
