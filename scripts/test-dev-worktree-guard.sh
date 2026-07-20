#!/usr/bin/env bash
set -euo pipefail

[[ $(hostname) == fxcompute-01 ]] || {
  printf 'Guard test refused: run on fxcompute-01\n' >&2
  exit 1
}

root=$(mktemp -d "${TMPDIR:-/tmp}/olympus-worktree-guard.XXXXXX")
trap 'rm -rf "$root"' EXIT

create_repo() {
  local path=$1 branch=$2
  git init -q "$path"
  git -C "$path" config user.name "Olympus guard test"
  git -C "$path" config user.email "guard-test@invalid"
  git -C "$path" commit -q --allow-empty -m init
  git -C "$path" branch -M "$branch"
}

create_repo "$root/main" main
git -C "$root/main" worktree add -q -b dev "$root/dev"
OLYMPUS_MAIN_WORKTREE="$root/main" OLYMPUS_DEV_WORKTREE="$root/dev" \
  "$(dirname "$0")/assert-dev-worktree.sh"

create_repo "$root/unrelated-main" main
create_repo "$root/unrelated-dev" dev
if OLYMPUS_MAIN_WORKTREE="$root/unrelated-main" OLYMPUS_DEV_WORKTREE="$root/unrelated-dev" \
  "$(dirname "$0")/assert-dev-worktree.sh" >/dev/null 2>&1; then
  printf 'Guard test failed: unrelated repositories were accepted\n' >&2
  exit 1
fi

printf 'Olympus dev worktree guard tests passed\n'