#!/usr/bin/env bash
# Nightly from Terminus:
# ssh fxcompute-01 'cd /home/rpw/olympus-dev && ui/scripts/dev-e2e.sh'
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.bun/bin:$PATH"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
UI="$ROOT/ui"
CREDS="${OLYMPUS_DEV_CREDENTIALS:-$HOME/.config/olympus-dev/admin-credentials}"
export OLYMPUS_DEV_BASE_URL="${OLYMPUS_DEV_BASE_URL:-http://127.0.0.1:5177}"
export OLYMPUS_EVIDENCE_DIR="$HOME/.cache/olympus-qa/sidebar-evidence"

[[ -r "$CREDS" ]] || { echo "ERROR: unreadable credentials: $CREDS" >&2; exit 1; }
while IFS='=' read -r key value; do
  case "$key" in
    username) export OLYMPUS_DEV_USERNAME="$value" ;;
    password) export OLYMPUS_DEV_PASSWORD="$value" ;;
  esac
done < "$CREDS"
[[ -n "${OLYMPUS_DEV_USERNAME:-}" && -n "${OLYMPUS_DEV_PASSWORD:-}" ]] || {
  echo "ERROR: credentials must contain username= and password=" >&2
  exit 1
}

curl -fsS "$OLYMPUS_DEV_BASE_URL/" >/dev/null || {
  echo "ERROR: dev UI unavailable at $OLYMPUS_DEV_BASE_URL" >&2
  exit 1
}
curl -fsS "${OLYMPUS_DEV_HALL_URL:-http://127.0.0.1:8799}/api/health" >/dev/null || {
  echo "ERROR: dev Hall unavailable" >&2
  exit 1
}

cd "$UI"
rm -rf test-results/dev-e2e
install -d -m 0700 "$OLYMPUS_EVIDENCE_DIR"
rm -f -- \
  "$OLYMPUS_EVIDENCE_DIR/sidebar-full-obsidian.png" \
  "$OLYMPUS_EVIDENCE_DIR/sidebar-compact-obsidian.png" \
  "$OLYMPUS_EVIDENCE_DIR/sidebar-hidden-obsidian.png" \
  "$OLYMPUS_EVIDENCE_DIR/sidebar-full-daybreak.png" \
  "$OLYMPUS_EVIDENCE_DIR/sidebar-mobile-drawer.png"
[[ -x node_modules/.bin/playwright ]] || {
  echo "ERROR: local Playwright CLI is missing; install UI dependencies first" >&2
  exit 1
}
exec timeout --signal=TERM --kill-after=10s 9m node_modules/.bin/playwright test e2e/dev.spec.ts \
  --workers=1 --reporter=line --output=test-results/dev-e2e
