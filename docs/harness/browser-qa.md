# Browser QA toolkit (fxcompute-01 dev environment)

Visual verification is MANDATORY for UI-touching work. A green
typecheck/build/unit run is not visual evidence.

## Live dev stack
- UI: http://127.0.0.1:5177 (stellarc-dev-ui.service — NEVER bind :5177 yourself)
- Axis: http://127.0.0.1:8799 (stellarc-dev-axis.service)
- Login: read ~/.config/stellarc-dev/admin-credentials at runtime (username=/password= lines). Never commit or echo it.

## Playwright (preferred — the live gate)
    cd ui && bash scripts/dev-e2e.sh
Runs e2e/dev.spec.ts against the live dev stack: login, session open,
resize-drag chaining, highlight doctrine, PANE FILL GEOMETRY, theme toggle.
Extend this spec when you add UI behavior. Chromium + headless_shell live in
~/.cache/ms-playwright (system libs installed 2026-07-16).

## Raw CDP probes (screenshots, geometry, synthetic drag)
Start a debugging browser (survives session exit):
    systemd-run --user --unit=oly-qa-chrome --collect \
      ~/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell \
      --no-sandbox --disable-gpu --headless=new --remote-debugging-port=9666 \
      --user-data-dir=/tmp/oly-qa/profile --window-size=1440,900 about:blank
Ready-made probe scripts (screenshot, login, geometry chain, HTML5 drag,
sash drag) live in `ui/scripts/qa`. Their durable dependency environment is
`~/.cache/stellarc-qa-venv` (override with `STELLARC_QA_VENV`):

    python3 -m venv ~/.cache/stellarc-qa-venv
    ~/.cache/stellarc-qa-venv/bin/pip install websockets

Do not place the venv under `/tmp`; fxcompute reboots erase it. Browser profiles,
screenshots, and disposable state may remain under `/tmp/oly-qa`.

The Vite dev build exposes `window.__stellarcQa.refetchProject(projectId)` for
deterministic same-route authority tests. It is guarded by `import.meta.env.DEV`
and is not present in production bundles. Prefer this seam over synthetic focus
events; production intentionally disables focus refetching.

When an isolated Axis must survive a restart, never execute the shared Cargo
target directly. Build under `~/.cache/stellarc-cargo.lock`, copy the resulting
binary to a worktree/revision-scoped path under `~/.cache/stellarc-qa/`, and run
that copy. Another worktree can replace `stellarc-cargo-target/debug/stellarc-axis`
at any time.

## Evidence bar for review-required
- Screenshots of the changed surface, BOTH themes, from the LIVE dev UI.
- For layout work: a geometry probe printout (element heights vs container).
- State honestly what was NOT visually verified.
