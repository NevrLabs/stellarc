#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${STELLARC_HOME:-"$HOME/.stellarc"}
mkdir -p "$HOME_DIR/bin"
chmod 700 "$HOME_DIR"
if [[ ! -f "$HOME_DIR/auth.env" ]]; then
  umask 077
  printf 'BETTER_AUTH_SECRET=%s\nBETTER_AUTH_URL=%s\n' "$(python3 -c 'import secrets; print(secrets.token_hex(32))')" "${BETTER_AUTH_URL:-http://localhost}" > "$HOME_DIR/auth.env"
fi
set -a; source "$HOME_DIR/auth.env"; set +a
export STELLARC_HOME="$HOME_DIR"
cd "$ROOT/apps/auth"
bun install --frozen-lockfile
bun run migrate
bun test
bun run build
install -m 0755 dist/stellarc-auth "$HOME_DIR/bin/stellarc-auth"
install -m 0644 "$ROOT/systemd/stellarc-auth.service" "$HOME/.config/systemd/user/stellarc-auth.service"
systemctl --user daemon-reload
systemctl --user enable --now stellarc-auth.service
