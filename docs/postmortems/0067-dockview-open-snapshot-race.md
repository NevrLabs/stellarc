# 0067 — Pane creation persisted before Dockview settled

## Summary

`openSessionPanel` serialized the layout synchronously immediately after `addPanel`.

## Impact

Dockview could already render and report two panes while `toJSON()` still returned the preceding one-pane model. The browser and Hall then acknowledged the stale snapshot, so a refresh lost the newly opened pane.

## Root cause

The code treated Dockview's visual/API mutation and serializable layout update as one synchronous boundary.

## Fix

Schedule the explicit post-open persistence on the next animation frame. Dockview's own layout-change callback remains active, while the explicit save now observes the settled model.

## Prevention

Third-party workbench mutations must be persisted only after their documented layout/update boundary. Browser QA must compare rendered pane count with the Hall-stored pane count before reload.
