#!/usr/bin/env bash
# Build the frozen stellarc-ui bundle with VITE_API_URL baked from
# DESKTOP_API_URL, record the baked origin in a build manifest so CI can
# prove a release build never falls back to the localhost dev origin, and
# emit desktop/target/tauri.conf.build.json — a resolved COPY of the Tauri
# config. The source tauri.conf.json keeps its placeholder (rework D3), so
# repeat builds with different origins are idempotent and a local
# desktop:build never dirties the tree.
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

# Resolve the CSP placeholder into a build-time COPY under desktop/target/
# (gitignored, mirroring v1's /target/ line). Consumers pass it to the Tauri
# CLI via -c/--config, which merges it over the source conf; the placeholder
# in the source file is never consumed, so the next build with a different
# origin resolves cleanly (idempotent).
mkdir -p "$here/target"
# Rework defects 1-2: also resolve the img-src origin placeholder so
# API-served avatars (absolute VITE_API_URL <img src>) render inside the
# shell; style-src 'unsafe-inline' is already literal in the source conf
# for the frozen bundle's runtime <style> injection (TipTap, input-otp).
# Rework defects 1-2: also resolve the img-src origin placeholder so
# API-served avatars (absolute VITE_API_URL <img src>) render inside the
# shell; style-src 'unsafe-inline' is already literal in the source conf
# for the frozen bundle's runtime <style> injection (TipTap, input-otp).
sed "s#__STELLARC_API_ORIGIN__#${DESKTOP_API_URL} ${ws_origin}#g; s#__STELLARC_IMG_ORIGIN__#${DESKTOP_API_URL}#g" \
	"$here/tauri.conf.json" > "$here/target/tauri.conf.build.json"

echo "baked VITE_API_URL=${DESKTOP_API_URL} into apps/stellarc-ui/dist; CSP resolved into desktop/target/tauri.conf.build.json"
