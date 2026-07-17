# 0059 — Fresh authority and membership could be ignored after first restore

## Summary

Final adversarial review found that the workspace treated its first successful project and session projections as permanently authoritative:

- A same-route project refetch that returned a changed layout, `layout: null`, 403, or 404 was ignored unless the previous source had been browser fallback.
- A failed sessions refetch could be mistaken for successful verification because TanStack retained stale `data`.
- Open and persistence paths did not suspend while membership verification was pending or failed.

## Impact

A stale browser could keep deleted or unauthorized panes visible, overwrite a remotely cleared layout, open a session that had moved to another project, or persist that foreign pane back into the old project layout.

## Root cause

The restore guard tracked only whether a project had ever been restored, not which authoritative value had been applied. Membership verification tested data presence instead of refetch success and was not modeled as a live gate for interactions and persistence.

## Fix

- Track a source-qualified authority signature (`hall`, `fallback`, or `rejected`) per project and reapply every changed settled authority result.
- Clear existing panes before applying changed authority; authoritative null and 4xx therefore establish a clean workspace.
- Refresh browser fallback storage from every successful Hall layout and remove it on 4xx.
- Require an error-free fresh sessions result before marking membership authoritative.
- Suspend restore, opens, dynamic pruning writes, and layout persistence while membership authority is pending or failed.
- Validate the exact session/project pair after association before opening.

## Prevention

Authority is versioned state, not a one-time boolean. Cached query data must never count as proof that a fresh refetch succeeded. Every side effect that can expose or persist project content must depend on the current project and membership authority epochs.
