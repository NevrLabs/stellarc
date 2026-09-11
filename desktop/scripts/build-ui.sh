#!/usr/bin/env bash
# Build the frozen stellarc-ui bundle with VITE_API_URL baked from
# DESKTOP_API_URL, then record the baked origin in a build manifest so CI can
# prove a release build never falls back to the localhost dev origin.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"

: "${DESKTOP_API_URL:?DESKTOP_API_URL is required for a release desktop build}"

# Bake VITE_API_URL into the frozen UI build. get-ws-url.ts derives the ws://
# origin from the same value, so no separate WS variable is needed.
(cd "$repo/apps/stellarc-ui" && VITE_API_URL="$DESKTOP_API_URL" bun run build)

dist="$repo/apps/stellarc-ui/dist"
mkdir -p "$dist"

# http:// → ws:// and https:// → wss:// with one substitution.
ws_origin="${DESKTOP_API_URL/http/ws}"

# Build manifest: records the baked origin so CI's T03 gate can grep it and
# prove the localhost:1337 fallback is absent from a release build.
cat > "$dist/stellarc-desktop-manifest.json" <<EOF
{
  "vite_api_url": "${DESKTOP_API_URL}",
  "ws_url": "${ws_origin}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Resolve the CSP placeholder in tauri.conf.json so the shipped webview allows
# exactly the API origin (http + ws) and nothing else.
sed -i "s#__STELLARC_API_ORIGIN__#${DESKTOP_API_URL} ${ws_origin}#g" "$here/tauri.conf.json"

echo "baked VITE_API_URL=${DESKTOP_API_URL} into apps/stellarc-ui/dist and desktop/tauri.conf.json"
