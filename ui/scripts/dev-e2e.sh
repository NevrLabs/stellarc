#!/usr/bin/env bash
# Nightly from Terminus:
# ssh fxcompute-01 'cd /home/rpw/stellarc && ui/scripts/dev-e2e.sh'
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UI="$ROOT/ui"
CREDS="${STELLARC_DEV_CREDENTIALS:-$HOME/.config/stellarc-dev/admin-credentials}"
export STELLARC_DEV_BASE_URL="${STELLARC_DEV_BASE_URL:-http://127.0.0.1:5177}"

[[ -r "$CREDS" ]] || { echo "ERROR: unreadable credentials: $CREDS" >&2; exit 1; }
while IFS='=' read -r key value; do
  case "$key" in
    username) export STELLARC_DEV_USERNAME="$value" ;;
    password) export STELLARC_DEV_PASSWORD="$value" ;;
  esac
done < "$CREDS"
[[ -n "${STELLARC_DEV_USERNAME:-}" && -n "${STELLARC_DEV_PASSWORD:-}" ]] || {
  echo "ERROR: credentials must contain username= and password=" >&2
  exit 1
}

curl -fsS "$STELLARC_DEV_BASE_URL/" >/dev/null || {
  echo "ERROR: dev UI unavailable at $STELLARC_DEV_BASE_URL" >&2
  exit 1
}
curl -fsS "${STELLARC_DEV_AXIS_URL:-http://127.0.0.1:8799}/api/health" >/dev/null || {
  echo "ERROR: dev Axis unavailable" >&2
  exit 1
}

cd "$UI"
rm -rf test-results/dev-e2e
[[ -x node_modules/.bin/playwright ]] || {
  echo "ERROR: local Playwright CLI is missing; install UI dependencies first" >&2
  exit 1
}
exec timeout --signal=TERM --kill-after=10s 9m node_modules/.bin/playwright test e2e/dev.spec.ts \
  --workers=1 --reporter=line --output=test-results/dev-e2e
