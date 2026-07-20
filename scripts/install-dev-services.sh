#!/usr/bin/env bash
set -Eeuo pipefail

repo=$(git rev-parse --show-toplevel)
[[ $repo == /home/rpw/olympus-dev ]] || {
  printf 'Install refused: run from /home/rpw/olympus-dev, got %s\n' "$repo" >&2
  exit 1
}
source "$repo/scripts/dev-service-provenance.sh"
"$repo/scripts/assert-dev-worktree.sh"

available_bytes=$(python3 -c 'import os; s=os.statvfs("/home/rpw/olympus-dev"); print(s.f_bavail*s.f_frsize)')
minimum_bytes=$((8 * 1024 * 1024 * 1024))
(( available_bytes >= minimum_bytes )) || {
  printf 'Install refused: fewer than 8 GiB are available on the dev filesystem\n' >&2
  exit 1
}

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:/usr/local/bin:/usr/bin:/bin"
export CARGO_HOME=/var/lib/olympus/cargo-home
export CARGO_TARGET_DIR=/var/lib/olympus/cargo-target-dev
export RUSTUP_HOME="$HOME/.rustup"
export SCCACHE_DIR=/var/lib/olympus/sccache

sha=$(git rev-parse HEAD)
(
  cd "$repo/ui"
  bun install --frozen-lockfile
)
cargo build --locked -j2 -p olympus-envoy
"$repo/scripts/assert-dev-worktree.sh"
[[ $(git rev-parse HEAD) == "$sha" ]] || {
  printf 'Install refused: dev HEAD changed while artifacts were being built\n' >&2
  exit 1
}

bin_dir="$HOME/.olympus-dev/bin"
artifact="$bin_dir/olympus-envoy-$sha"
active_binary="$bin_dir/olympus-envoy-dev"
install -d -m 0700 "$bin_dir"
source_binary="$CARGO_TARGET_DIR/debug/olympus-envoy"
source_hash=$(sha256sum "$source_binary" | cut -d' ' -f1)
artifact_candidate=$(mktemp "$bin_dir/.olympus-envoy-$sha.XXXXXX")
install -m 0755 "$source_binary" "$artifact_candidate"
if [[ -e "$artifact" ]]; then
  cmp -s "$artifact_candidate" "$artifact" || {
    rm -f "$artifact_candidate"
    printf 'Install refused: immutable artifact %s already exists with different bytes\n' "$artifact" >&2
    exit 1
  }
  rm -f "$artifact_candidate"
elif ! ln "$artifact_candidate" "$artifact"; then
  if [[ ! -e "$artifact" ]] || ! cmp -s "$artifact_candidate" "$artifact"; then
    rm -f "$artifact_candidate"
    printf 'Install refused: could not atomically publish immutable artifact %s\n' "$artifact" >&2
    exit 1
  fi
  rm -f "$artifact_candidate"
else
  rm -f "$artifact_candidate"
fi
[[ $(sha256sum "$artifact" | cut -d' ' -f1) == "$source_hash" ]] || {
  printf 'Install refused: published Envoy hash does not match the built binary\n' >&2
  exit 1
}

unit_dir="$HOME/.config/systemd/user"
install -d -m 0755 "$unit_dir"
backup_dir="$HOME/.config/olympus-dev/unit-backups/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 "$backup_dir"
units=(olympus-dev-hall.service olympus-dev-envoy.service olympus-dev-ui.service)
declare -A previous_file previous_active previous_enabled
for unit in "${units[@]}"; do
  if [[ -f "$unit_dir/$unit" ]]; then
    install -m 0600 "$unit_dir/$unit" "$backup_dir/$unit"
    previous_file[$unit]=present
  else
    previous_file[$unit]=absent
  fi
  if systemctl --user is-active --quiet "$unit"; then previous_active[$unit]=yes; else previous_active[$unit]=no; fi
  if systemctl --user is-enabled --quiet "$unit"; then previous_enabled[$unit]=yes; else previous_enabled[$unit]=no; fi
done
if [[ -L "$active_binary" ]]; then
  previous_link_present=yes
  previous_link_target=$(readlink "$active_binary")
else
  previous_link_present=no
  previous_link_target=
fi

rollback() {
  local status=$?
  trap - ERR
  set +e
  systemctl --user stop olympus-dev-ui.service olympus-dev-envoy.service olympus-dev-hall.service
  for unit in "${units[@]}"; do
    if [[ ${previous_file[$unit]} == present ]]; then
      install -m 0644 "$backup_dir/$unit" "$unit_dir/$unit"
    else
      rm -f "$unit_dir/$unit"
    fi
  done
  rm -f "$active_binary.rollback"
  if [[ $previous_link_present == yes ]]; then
    ln -s "$previous_link_target" "$active_binary.rollback"
    mv -Tf "$active_binary.rollback" "$active_binary"
  else
    rm -f "$active_binary"
  fi
  systemctl --user daemon-reload
  for unit in "${units[@]}"; do
    if [[ ${previous_enabled[$unit]} == yes ]]; then
      systemctl --user enable "$unit"
    else
      systemctl --user disable "$unit"
    fi
  done
  for unit in "${units[@]}"; do
    if [[ ${previous_active[$unit]} == yes ]]; then systemctl --user start "$unit"; fi
  done
  printf 'Olympus dev cutover failed; restored unit backup %s\n' "$backup_dir" >&2
  exit "$status"
}
trap rollback ERR

rm -f "$active_binary.next"
ln -s "$artifact" "$active_binary.next"
mv -Tf "$active_binary.next" "$active_binary"
for unit in "${units[@]}"; do
  install -m 0644 "$repo/systemd/$unit" "$unit_dir/$unit"
done
systemctl --user daemon-reload
systemctl --user enable "${units[@]}"
systemctl --user stop olympus-dev-ui.service olympus-dev-envoy.service olympus-dev-hall.service
systemctl --user start olympus-dev-hall.service
for _ in {1..90}; do
  if curl -fsS http://127.0.0.1:8799/api/health >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:8799/api/health >/dev/null
systemctl --user start olympus-dev-envoy.service
systemctl --user start olympus-dev-ui.service
for _ in {1..30}; do
  if curl -fsS http://127.0.0.1:5177/ >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:5177/ >/dev/null

for unit in "${units[@]}"; do
  assert_dev_unit_active "$unit"
done
assert_dev_listener_owner olympus-dev-hall.service 8799
assert_dev_listener_owner olympus-dev-ui.service 5177
"$repo/ui/scripts/dev-e2e.sh"
trap - ERR
printf 'Olympus dev services now run branch dev from %s at %s (Envoy sha256 %s; unit backup: %s)\n' "$repo" "${sha:0:12}" "$source_hash" "$backup_dir"
