#!/usr/bin/env bash
set -euo pipefail

[[ $(hostname -s) == terminus* ]] || { echo "deploy must run on Terminus" >&2; exit 1; }
[[ $# -eq 1 ]] || { echo "usage: $0 <git-sha>" >&2; exit 2; }
sha=$1
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "invalid git SHA" >&2; exit 2; }

home=/home/rpw/.stellarc
releases=$home/releases
incoming=$releases/.incoming-$sha
release=$releases/$sha
[[ -d $incoming ]] || { echo "incoming release missing" >&2; exit 1; }
orbit_units=()
while read -r unit _; do
  [[ -n $unit ]] && orbit_units+=("$unit")
done < <(systemctl --user list-units --type=service --state=active --plain --no-legend 'stellarc-orbit@*.service')
((${#orbit_units[@]} > 0)) || { echo "no active production Orbit instances found" >&2; exit 1; }
(
  cd "$incoming"
  sha256sum -c manifest.sha256
)
[[ ! -e $release ]] || { echo "immutable release already exists: $release" >&2; exit 1; }
mv "$incoming" "$release"
chmod -R a-w "$release"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$home/backups"
if [[ -L $releases/current ]]; then
  previous=$(readlink -f "$releases/current")
else
  previous=$releases/legacy-$timestamp
  install -d -m 0755 "$previous/bin" "$previous/ui"
  cp -L "$home/bin/stellarc-axis" "$previous/bin/stellarc-axis"
  cp -L "$home/bin/stellarc-orbit" "$previous/bin/stellarc-orbit"
  cp -a /home/rpw/stellarc/ui/dist/. "$previous/ui/"
  ln -s "$previous" "$releases/.current.next"
  mv -Tf "$releases/.current.next" "$releases/current"
fi

backup=$home/backups/stellarc-$timestamp.db
sqlite3 "$home/stellarc.db" ".backup '$backup'"
chmod 600 "$backup"

activate() {
  local target=$1
  rm -f "$releases/.current.next" "$home/bin/.stellarc-axis.next" "$home/bin/.stellarc-orbit.next" /home/rpw/stellarc/ui/.dist.next
  ln -s "$target" "$releases/.current.next"
  mv -Tf "$releases/.current.next" "$releases/current"
  ln -s "$releases/current/bin/stellarc-axis" "$home/bin/.stellarc-axis.next"
  mv -Tf "$home/bin/.stellarc-axis.next" "$home/bin/stellarc-axis"
  ln -s "$releases/current/bin/stellarc-orbit" "$home/bin/.stellarc-orbit.next"
  mv -Tf "$home/bin/.stellarc-orbit.next" "$home/bin/stellarc-orbit"
  if [[ -d /home/rpw/stellarc/ui/dist && ! -L /home/rpw/stellarc/ui/dist ]]; then
    mv /home/rpw/stellarc/ui/dist "/home/rpw/stellarc/ui/dist.pre-managed-$timestamp"
  fi
  ln -s "$releases/current/ui" /home/rpw/stellarc/ui/.dist.next
  mv -Tf /home/rpw/stellarc/ui/.dist.next /home/rpw/stellarc/ui/dist
}

rollback() {
  local code=$?
  trap - ERR
  set +e
  echo "deployment health gate failed; rolling back" >&2
  systemctl --user stop "${orbit_units[@]}" stellarc-axis.service || true
  activate "$previous"
  rm -f "$home/stellarc.db-wal" "$home/stellarc.db-shm"
  cp "$backup" "$home/stellarc.db"
  chmod 600 "$home/stellarc.db"
  systemctl --user start stellarc-axis.service
  systemctl --user start "${orbit_units[@]}"
  exit "$code"
}
trap 'rollback' ERR
activate "$release"
systemctl --user restart stellarc-axis.service
systemctl --user restart "${orbit_units[@]}"
healthy=0
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8799/api/health >/dev/null 2>&1 \
    && systemctl --user is-active --quiet stellarc-axis.service "${orbit_units[@]}"; then
    healthy=1
    break
  fi
  sleep 1
done
[[ $healthy -eq 1 ]]
trap - ERR
printf 'activated %s; database backup %s
' "$release" "$backup"
