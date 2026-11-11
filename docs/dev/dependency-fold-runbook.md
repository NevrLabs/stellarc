# Dependency-fold runbook

How to land a single-dependency pin bump (a "fold") on `dev` without
collateral lockfile churn. Proven on the Cargo/wry line; the npm pin form
is the same law.

## The two laws

Both bought with a real collision (2026-11-10, case file below).

1. **One fold, one executor.** Before starting a fold, check open PRs and
   recent merges for a same-target fold — search the PR list for the crate
   name. If one exists: stop, and verify the landed state instead.
   Precedent: NEVR-574/#233 vs NEVR-489/#234 — two folds of the same
   subtree merged 13 minutes apart.
2. **The base is re-verified at merge time.** After any merge lands while a
   fold PR is open, rebase or re-diff against the *current* dev HEAD and
   confirm the change set is still minimal against that head, not the
   branch point. Reviewers check this too — it is a review checklist item,
   not just an author's. Precedent: #234 was authored against a pre-#233
   base (`8e4a6ff`); merged as-is, it re-pointed 9 `windows-sys` entries
   (0.60.2/0.52.0 → 0.61.2) that #233 had deliberately left alone.

Folds are never self-merged: PRs wait for Talos. The 11-10 loser was
squash-merged by its builder before any review (NEVR-576 defect 2) — that
is half of how the collision reached `dev`.

## Playbook (Cargo form — from NEVR-536)

1. **Dry-run first.** `cargo update -p <crate> --precise <ver>` in
   `desktop/`, then read the Added/Removed/Changed report. Expect only the
   target crate's subtree. Anything else `cargo update` dragged in (e.g.
   `windows-sys`) gets hand-minimized back before commit.
2. **Manifest untouched** when the bump is semver-compatible — a fold
   changes `desktop/Cargo.lock` only; a manifest edit is a different kind
   of PR.
3. **Same-day.** Fold, verify, PR, review, merge in one day. Aged folds
   are how law 2 gets violated.
4. **CI in the known-good shape** before asking for merge.

Clean executions: #217 (wry 0.57.0→0.57.1, NEVR-536) and #233
(wry 0.57.1→0.57.2, NEVR-574). The npm form is the same law
(NEVR-524/549/561 lineage); #223 executed it as a four-pin `apps/web`
fold (NEVR-549).

## Case file: the 11-10 collision

- 08:20:49Z — #233 (NEVR-574, the clean minimized fold) merges: `da7726f`.
- 08:33:48Z — #234 (NEVR-489) merges: `af3a8d4`. Its head `4604c22`
  parents to `8e4a6ff`, the base *before* #233, so its `cargo update`
  resolved against a pre-fold tree. As merged it re-pointed exactly 9
  `windows-sys` dependency entries 0.60.2/0.52.0 → 0.61.2 (+9/−9, across
  dirs-sys, muda, socket2, tray-icon, window-vibrancy, winreg, os_pipe,
  quinn-udp, winapi-util — the NEVR-576 review verdict).
- NEVR-576 catches it; #236 reverts at 09:22:43Z. The unminimized state
  rode `dev` 49 minutes (08:33:48 → 09:22:43). The revert restored #233's
  lockfile byte-for-byte: `git diff da7726f ed01ff1 -- desktop/Cargo.lock`
  is empty.

`dev` deliberately carries multiple `windows-sys` versions today
(0.45/0.52/0.60/0.61). Unifying them is not a fold and not a side-effect
of one (NEVR-576 closing note) — if ever done, it needs its own deps PR
with its own justification.
