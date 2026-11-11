#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# ponytail: one shared gate lock; serialize these small fixtures, not parallel ports.
exec 9>"$HOME/.cache/stellarc-authgw-gate.lock"
if ! flock -w 180 9; then printf '75\n' > launcher.exit; exit 75; fi
set +e
unshare -Urn bash -c 'set -e; ip link set lo up; exec python3 run.py' 9>&- > runner.log 2>&1
rc=$?
printf '%s\n' "$rc" > launcher.exit
exit "$rc"
