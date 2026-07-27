# Intentionally empty

Tauri requires `frontendDist` to point at an existing directory and validates
it at compile time inside `generate_context!`. Stellarc Desktop does not use
it: the window is pointed at the local Axis HTTP server, which serves the real
UI from the `ui-dist` resource (see ADR 0036 / ADR 0035).

This directory exists only to satisfy that check. Leave it empty.
