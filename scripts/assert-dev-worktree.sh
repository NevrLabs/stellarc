#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf 'Stellarc dev worktree check failed: %s\n' "$*" >&2
  exit 1
}

repo=${STELLARC_DEV_WORKTREE:-/home/rpw/stellarc-dev}
main_repo=${STELLARC_MAIN_WORKTREE:-/home/rpw/stellarc}

[[ $(hostname) == fxcompute-01 ]] || fail "run this on fxcompute-01"
[[ -d "$repo/.git" || -f "$repo/.git" ]] || fail "$repo is not a Git worktree"
[[ $(realpath "$(git -C "$repo" rev-parse --show-toplevel)") == $(realpath "$repo") ]] || fail "$repo is not the expected worktree root"
[[ $(git -C "$repo" branch --show-current) == dev ]] || fail "$repo is not on dev"
git -C "$repo" diff --quiet || fail "$repo has unstaged tracked changes"
git -C "$repo" diff --cached --quiet || fail "$repo has staged changes"
[[ -z $(git -C "$repo" ls-files --others --exclude-standard) ]] || fail "$repo has untracked files"
[[ -d "$main_repo/.git" ]] || fail "$main_repo is not the main Git worktree"
[[ $(realpath "$(git -C "$main_repo" rev-parse --show-toplevel)") == $(realpath "$main_repo") ]] || fail "$main_repo is not the expected worktree root"
[[ $(git -C "$main_repo" branch --show-current) == main ]] || fail "$main_repo is not on main"
git -C "$main_repo" diff --quiet || fail "$main_repo has unstaged tracked changes"
git -C "$main_repo" diff --cached --quiet || fail "$main_repo has staged changes"
[[ -z $(git -C "$main_repo" ls-files --others --exclude-standard) ]] || fail "$main_repo has untracked files"

dev_common_dir=$(realpath "$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)")
main_common_dir=$(realpath "$(git -C "$main_repo" rev-parse --path-format=absolute --git-common-dir)")
[[ $dev_common_dir == "$main_common_dir" ]] || fail "$repo is not linked to the authoritative repository"
