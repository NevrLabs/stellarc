# STL-22 review-1 — VERDICT: REWORK

PR #32 (cc665d1, forge/stl-22-c1 → dev), 23 files, +706/−1. Adversarial review of the diff; all local runs executed in `.forge/worktrees/stl-22-c1` (clean tree, HEAD = cc665d1).

## Per-item audit

### 1. SPEC COMPLIANCE

| Spec item | Verdict |
|---|---|
| `desktop/Cargo.toml` mirrors v1, Axis deps dropped | implemented — v1 reqwest upgraded to rustls-tls+blocking for the health probe (justified, implements §3) |
| `desktop/package.json` + `bun.lock` (cli ^2, self-contained) | implemented — lock pins 2.11.4 |
| `desktop/build.rs`, `src/main.rs` | implemented — byte-equivalent to v1 shape |
| `src/lib.rs` minus loopback/Axis, `WebviewUrl::App`, 1440×900, min 360×640 | implemented |
| `tauri.conf.json`: frontendDist ../apps/stellarc-ui/dist, 5 targets, real CSP | implemented (placeholder-resolved at build time) |
| `icons/*` v1 lineage | implemented — all 8 byte-identical to v1 (cmp) |
| `build-ui.sh` / `launch-smoke.sh` | implemented (defects D3/D4 below) |
| maestro `config.yaml` + `desktop-smoke.yaml` | implemented; landmark regex `.*(Welcome back\|Sign In\|Continue with).*` grounded — frozen.spec.ts:117 asserts button "Sign In" exact |
| `.github/workflows/desktop.yml` signed 3-OS matrix + Linux smoke | **broken** — D1/D2 |
| `tests/unit/desktop.test.ts` (T0 harness) | implemented — vitest, consistent with foundation.test.ts |
| MODIFY root `package.json` (desktop:build/check), CI trigger, README line | implemented; CI trigger via self-triggering desktop.yml instead of editing ci.yml (acceptable reading of "add the desktop job or trigger"; rationale commented in-file) |
| Nothing under `apps/stellarc-ui/` or `packages/` modified | verified — `git diff origin/dev...HEAD -- apps/stellarc-ui packages` empty |

Scope creep: none. All 23 diff files map to manifest entries.

### 2. TESTS THAT CANNOT FAIL — sabotages replayed (vitest, this machine)

| Sabotage | Result |
|---|---|
| none (green baseline) | `Tests 5 passed (5)` |
| T10: `csp: null` | RED — `2 failed` (T01 + T10) |
| T01: drop `"dmg"` | RED — `1 failed` (T01) |
| T06: delete `extendedWaitUntil` | RED — `1 failed` (T06) |
| T02: append `console.log` to tracked `src/fetchers/get-api-url.ts` | RED — `1 failed` (T02) |
| T03 guard: `env -u DESKTOP_API_URL bash build-ui.sh` | exit 1, named message `DESKTOP_API_URL is required for a release desktop build` |

Note: T02 via `git diff HEAD` cannot see **untracked** files in apps/stellarc-ui — CI variant uses `base...HEAD` which does catch them; acceptable.
Every test names a code change that turns it red. No decorative tests.

### 3. MIGRATIONS — none in diff. Clean.

### 4. DOCTRINE — no SQL, no events, no tokens/hex, no control-plane model calls. Shell logs are structured key=value with no PII; probe URL is the bare API origin. Clean.

### 5. WORKER DEBRIS — none. Clean tree, no debug logs, no commented-out code.

### 6. SCREENSHOTS — no UI surface changed; §6/T09 is a freeze, and the four-viewport Playwright suite ran green locally with zero baseline diffs (`24 passed` desktop/tablet/mobile/mobile-small, `60 skipped`, 1.3m). Maestro `takeScreenshot` path never executed in CI (D2).

### 7. SPANS (ADR 0010) — zero new spans by construction; verified: no TS added to the app, no service functions, no `console.*` outside the test file. Clean.

### 8. GATES RE-RUN (local, PR worktree) —
`bun run lint` ✅ · `bun run typecheck` ✅ · `bun test` (gates + 43 unit/integration) ✅ · `bun run build` ✅ · `bun run e2e` ✅ 24 passed / 0 failed.
**CI on the PR: RED.** `ui-purity` ✅; all four `cargo-check` legs ❌ (`error: could not find Cargo.toml`); `bundle`/`linux-smoke`/`maestro-desktop` skipped. Inherited and NOT this PR's fault: `foundation` (postgresql-15 apt package gone on runner) and `ui-typecheck-budget` also fail on `dev` HEAD.

## DEFECTS

1. **[BLOCKER] `.github/workflows/desktop.yml:79` — cargo-check runs from repo root; no root Cargo.toml exists** (crate is `desktop/`). All four T04 legs fail `could not find Cargo.toml`; the T04 gate has never been green. Fix: add `working-directory: desktop` to the "cargo check (desktop, all targets)" step (the `ensure frontendDist exists` step stays root-relative; `desktop:check` in package.json already uses `--manifest-path` correctly).
2. **[BLOCKER] T05/T06/T07/T08 have zero evidence runs.** `bundle` → `linux-smoke` → `maestro-desktop` were all skipped downstream of D1; the tauri-action wiring, fail-closed secret steps, SHA256SUMS, xvfb smoke, and Maestro flow have never executed anywhere. Fix: after D1, push and require one green `Desktop` workflow run covering all jobs before merge.
3. **[MEDIUM] `desktop/scripts/build-ui.sh:35` — `sed -i` mutates `desktop/tauri.conf.json` in place: not idempotent.** A second build with a different `DESKTOP_API_URL` bakes the new VITE_API_URL but leaves the CSP pinned to the first origin (placeholder already consumed), and dirties the tree after a local `desktop:build`. Fix: resolve the placeholder into a build-time copy (or re-emit from a pristine template), never the source file.
4. **[MINOR] `desktop/scripts/launch-smoke.sh:42-58` — SIGTERM is sent to the `xvfb-run` wrapper pid; the app process can survive orphaned while the script still passes.** Fix: track/assert on the actual binary's pid (or `pgrep -f` the app) when asserting clean exit.
5. **[MINOR] `desktop/e2e/maestro/config.yaml` — `testOutputDir` likely never applies**: the workflow invokes `maestro test desktop/e2e/maestro/flows/...` from repo root, and Maestro resolves `.maestro/config.yaml` from CWD, not from the flow's directory. Fix: pass `--config` / run from `desktop/e2e/maestro`, or move config to `.maestro/`.

Verdict: REWORK — D1 is a one-line fix but the PR's own gates are red and its core claim ("builds, signs, and launches in CI") is unexecuted. Everything else is merge-quality.
