#!/usr/bin/env bash
# Build the UI and stage it where the Tauri bundler can pick it up as a
# resource. Axis serves these files at runtime (STELLARC_UI_DIST), so they are
# shipped as a resource directory rather than as Tauri's frontendDist — the
# window loads from axis's origin, not from the asset protocol.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
repo="$(cd "$here/.." && pwd)"

(cd "$repo/ui" && bun run build)

rm -rf "$here/ui-dist"
cp -r "$repo/ui/dist" "$here/ui-dist"

# Tauri still wants a frontendDist path to exist even though we never load from
# it. Keep it minimal and obviously inert.
mkdir -p "$here/placeholder"
cat > "$here/placeholder/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Stellarc</title>
<!-- Unused. The window loads the UI from the bundled Axis; see src/lib.rs. -->
HTML

echo "staged $(find "$here/ui-dist" -type f | wc -l) UI files"
