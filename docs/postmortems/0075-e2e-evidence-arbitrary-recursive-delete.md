# 0075 — E2E evidence cleanup accepted an arbitrary recursive-delete target

## Status

Resolved before merge or development cutover. No data was deleted.

## Incident

The live browser runner inherited `OLYMPUS_EVIDENCE_DIR` from its caller and passed it directly to `rm -rf`. The transactional service installer invokes that runner while rollback is armed, so an accidental value such as `/home/rpw` could have deleted operator data before the browser gate began.

## Impact

The defect was not activated, but the normal development cutover path contained a direct arbitrary recursive-delete primitive. Service rollback could not recover deleted files.

## Root cause

Screenshot output was treated as a configurable directory while cleanup treated the entire directory as disposable. The code did not separate a caller-controlled destination from a script-owned cleanup boundary.

## Correction

The runner now owns one fixed evidence directory under `$HOME/.cache/olympus-qa/sidebar-evidence`. Cleanup is non-recursive and removes only the five known screenshot filenames before recreating them. Caller-provided `OLYMPUS_EVIDENCE_DIR` values are ignored.

## Prevention

- Never pass an environment-controlled path to recursive deletion.
- Prefer deleting an explicit file allowlist when artifact names are known.
- Service cutover review must treat pre-verification cleanup as part of the rollback threat model; rollback only restores managed state, not arbitrary filesystem deletion.
