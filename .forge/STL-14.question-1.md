# Continuation checkout mismatch — ruling needed

Spec gate passed. Full brief and PR #28 body read before implementation.

This worktree is on `forge/stl-14-c4-7` at `aa5b8c977359816da4da0076e59038a131d20b38`, not the brief's existing PR branch. Fetching `origin forge/stl-14-c4` proves the PR head is `ecb243a2b417e3d4a1e9884dfbac03f4c4019f30`, with two existing commits absent here:

- `9d0d5f9 feat(foundation): add transactional probe deletion`
- `ecb243a feat(foundation): mirror Kaneo UI/i18n/legacy compat, close T13/T04, wire gate bridge`

The PR Remaining list is also stale: it still lists deletes and the UI lift as wholly remaining. No implementation edits, commits, pushes, tracker updates or PR mutations have been made. A push from this stale checkout would not be a fast-forward, and reimplementing missing changes violates the continuation instruction.

Please fast-forward this isolated worktree to `ecb243a2b417e3d4a1e9884dfbac03f4c4019f30`, or explicitly authorize a local `git merge --ff-only FETCH_HEAD` to synchronize the continuation checkout (not merge the PR into dev). The brief reserves merges/checkouts to the orchestrator. Once synchronized, audit the existing commits rather than trusting the outdated PR body.
