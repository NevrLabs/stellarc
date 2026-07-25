# 0061 — Shared Cargo target replaced the isolated QA Axis binary

## Summary

The isolated project-workspace Axis service executed `~/.cache/stellarc-cargo-target/debug/stellarc-axis` directly. The shared target is intentionally reused by all worktrees, so a later build from an older branch replaced that path with a binary that did not understand `ProjectLayoutUpdated`.

## Impact

The first clean Axis restart exited during event replay with `unknown variant ProjectLayoutUpdated`. Pre-restart testing stayed green because the long-lived process still held the correct earlier executable in memory.

## Root cause

A shared compilation cache was incorrectly treated as an immutable deployment artifact. Cargo's output path identifies package/profile, not source worktree or commit.

## Fix

Build under the shared target lock, then copy the verified Axis executable to a worktree-specific immutable QA path (`~/.cache/stellarc-qa/t_1a828e33/stellarc-axis`). The QA systemd unit executes that copy rather than the shared target output.

## Prevention

Shared Cargo targets are caches only. Any long-lived service or restart gate must run a copied, version-scoped artifact whose source revision is known. Acceptance must include a process restart after all competing builds have completed.
