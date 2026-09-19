#!/usr/bin/env bash
# Build the frozen stellarc-ui bundle with VITE_API_URL baked from
# MOBILE_API_URL, record the baked origin in a build manifest so CI can
# prove a device build never falls back to the localhost dev origin, and
# emit mobile/target/tauri.conf.build.json — a resolved COPY of the Tauri
# config. The source tauri.conf.json keeps its placeholder (mirrors
# desktop/scripts/build-ui.sh, rework D3), so repeat builds with different
# origins are idempotent and a local build never dirties the tree.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"

: "${MOBILE_API_URL:?MOBILE_API_URL is required for a device mobile build}"

# Bake VITE_API_URL into the frozen UI build. get-ws-url.ts derives the ws://
# origin from the same value, so no separate WS variable is needed.
(cd "$repo/apps/stellarc-ui" && VITE_API_URL="$MOBILE_API_URL" bun run build)

dist="$repo/apps/stellarc-ui/dist"
mkdir -p "$dist"

# http:// → ws:// and https:// → wss:// with one substitution.
ws_origin="${MOBILE_API_URL/http/ws}"

# Build manifest: records the baked origin so CI's M03 gate can grep it and
# prove the localhost:1337 fallback is absent from a device build.
cat > "$dist/stellarc-mobile-manifest.json" <<EOF2
{
  "vite_api_url": "${MOBILE_API_URL}",
  "ws_url": "${ws_origin}",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF2

# Resolve the CSP placeholder into a build-time COPY under mobile/target/
# (gitignored). Consumers pass it to the Tauri CLI via -c/--config, which
# merges it over the source conf; the placeholder in the source file is
# never consumed, so the next build with a different origin resolves
# cleanly (idempotent). img-src resolves to the API origin only
# (API-served avatars); style-src 'unsafe-inline' stays literal for the
# frozen bundle's runtime <style> injection (TipTap, input-otp).
mkdir -p "$here/target"
sed "s#__STELLARC_API_ORIGIN__#${MOBILE_API_URL} ${ws_origin}#g; s#__STELLARC_IMG_ORIGIN__#${MOBILE_API_URL}#g" \
	"$here/tauri.conf.json" > "$here/target/tauri.conf.build.json"

echo "baked VITE_API_URL=${MOBILE_API_URL} into apps/stellarc-ui/dist; CSP resolved into mobile/target/tauri.conf.build.json"
