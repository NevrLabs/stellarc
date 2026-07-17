# 0054 — Project workspace probe ignored its custom state path

## Summary

`project_workspace_probe.py` parsed `--state` and used it in verification mode, but generation always wrote the default `/tmp/oly-qa/project-workspace-state.json`.

## Impact

A caller using an isolated or parallel state path successfully ran the expensive browser setup, then could not verify it because the requested artifact did not exist. Parallel probes could also overwrite the same default state file.

## Root cause

The selected CLI path was not passed into `initial_probe`; that function referenced the module constant directly.

## Fix

Pass `args.state` through the generation path and write the resulting state to that exact path.

## Prevention

Every path-like CLI option must be exercised once with a non-default value. Generation and verification must consume the same explicit artifact handle.
