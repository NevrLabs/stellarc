# 0053 — Cached project data could override Hall authority

## Summary

Final adversarial review found three related authority gaps in project workspaces:

1. React Query could expose a cached project layout while its mandatory refetch was still running, and the one-shot restore guard then ignored the fresh Hall response.
2. Membership pruning ran only during initial restore, so a pane stayed open after its session moved to another project.
3. Every project-fetch error—including authoritative 404/403 responses—enabled browser-layout fallback.

## Impact

A stale browser could overwrite a newer Hall layout or an authoritative `layout: null`. Foreign panes could remain visible and be re-persisted after membership changed. Deleted or unauthorized projects could render cached local panes despite Hall rejecting the resource.

## Root cause

The restore state machine conflated cached query success with a completed authoritative fetch, treated restore as one-shot even when the first source was provisional, and classified all query failures as availability failures. Membership reconciliation was coupled to initial layout deserialization instead of the live sessions projection.

## Fix

- Wait until the project refetch is no longer in flight before restoring.
- Keep the layout writer busy until its mutation response has cancelled any older project query and updated that exact query cache.
- Re-run provisional browser fallback when Hall recovers, replacing it with Hall state.
- Use a typed HTTP error; 4xx project responses fail closed, while transport/5xx failures may use the browser copy.
- Gate every click, context-menu open, and drop on a freshly loaded matching project; a stale associated session row cannot open a pane after the project returns 404.
- Freshly verify membership on project entry and continuously prune open panes when authoritative membership changes.
- Extend the live probe with cache-vs-Hall-null, live membership transfer, deleted-project 404, and rejected-open cases.

## Prevention

Every cached restore path must model three states explicitly: authoritative, provisional fallback, and authoritative rejection. One-shot guards may apply only after authoritative state wins. Membership enforcement is a continuous invariant, not a deserialization-time cleanup.
