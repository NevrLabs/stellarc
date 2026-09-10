# STL-22 — T8 Tauri 2 desktop shell (Linux/Windows/macOS) around stellarc-ui

## 1. Scope and premise audit

Package the pixel-frozen `apps/stellarc-ui` web bundle inside a **Tauri 2** desktop shell that builds, signs, and launches on Linux, Windows, and macOS in CI, with Maestro smoke flows for the shell and a hard guarantee that the web Playwright suite (code and baselines) is byte-unchanged. The shell is presentation-only: it loads the frozen bundle over Tauri's asset protocol, points the UI at a build-time-baked `VITE_API_URL` (the stellarc-api deployment), adds no API, no local control plane, and no UI code. Deliverable = `desktop/` crate + Maestro suite + `.github/workflows/desktop.yml` signed three-OS matrix, all mirroring the v1 repo's precedents.

Premise audit (code wins; discrepancies reported):

1. **"v1 precedent: 21 flows"** — stale. v1 `/home/rpw/repos/stellarc/.maestro/flows/` holds **20** flow files (14 `mock/`, 4 `mobile/`, 1 `live/`, 1 `prod/`) plus **four** configs (`config.yaml`, `config.live.yaml`, `config.mobile.yaml`, `config.prod.yaml` — each one `testOutputDir` line). None of the v1 flows transfer verbatim: they target the old Axis UI (Sessions/Vault landmarks). T8 authors **new** desktop flows for the frozen Kaneo-parity surface.
2. **v1's window-origin trick is inapplicable.** v1 `desktop/src/lib.rs` bundles an in-process Axis and loads the window from `http://127.0.0.1:<port>` because v1's UI used a same-origin-empty `BASE`. The frozen fork UI does not: `apps/web/src/fetchers/get-api-url.ts` resolves `import.meta.env.VITE_API_URL || "http://localhost:1337"`, and `get-ws-url.ts` derives WS the same way. v2 therefore loads via **asset protocol** with `VITE_API_URL` baked into the frozen build (`desktop/scripts/build-ui.sh`), CSP allowing exactly the API origin. No second UI stack, per ADR 0009.
3. **"DoD: ADR 0009"** — already accepted (2026-09-08); this spec cites it, nothing new to ratify. ADR 0009 §Target platforms already fixes Tauri 2 as the shell for desktop *and* later mobile.
4. **Maestro desktop drivers exist for macOS and Windows only; there is no first-class Linux desktop driver.** The "app launches on all three OS" gate is honored on Linux via a WebKitGTK launch smoke (xvfb, window-created assertion) in the same workflow. If the orchestrator requires literal Maestro on Linux, that needs an explicit ruling — flagged as open item O1.
5. **Signing secrets are an orchestrator dependency** (Windows cert, Apple certificates/notarization) — open item O2; CI wiring ships regardless and fails closed with a named message when secrets are absent.
6. **Blocked by #16 (STL-16)** — currently `triage: blocked`; no implement start before its merge. This checkout contains docs + `tools/forge` only (T0–T4 code lives on the STL-14 branch); every path below rebinds to merged code at implementation start, as STL-20's spec already ruled.

**OUT of scope:** any UI source change, however small — every frozen screen is owned by the slice that built it (STL-15 identity screens, STL-16 board/ticket screens, STL-17 activity/inbox, STL-18 repo screens, STL-19 graph surfaces, STL-20 asset/visibility surfaces, STL-21 projects); branding/icons final art (STL-30, T7b — this slice ships v1-lineage placeholder icons); mobile packaging via Tauri iOS/Android (unassigned future ticket per ADR 0009); auto-update channel, tray, deep links, native notifications, file dialogs (unassigned; none exist to defer to a numbered sibling); any bundled/local API process (v1's in-process Axis model is explicitly not v2 — rejected, not deferred); reconciliation-gate coordination (STL-21).

## 2. Tables, columns, events

**None.** This slice touches zero database tables, zero columns, emits **zero** event types (no `pluginId:type`, no `schema_version` applies), and adds no importer rows. The desktop shell is not a data path.

## 3. HTTP API shape

**No new endpoints, no request/response schemas, no error union changes.** The shell *consumes* the existing T0 `GET /health` only, as a launch-time readiness log line in the Rust shell (best-effort, non-fatal, 2 s timeout); it never serves HTTP. Any endpoint work belongs to the owning slice.

## 4. Sync shapes affected

**None.** No collection changes; the frozen UI's electric-db collections behave identically inside the webview. The shell never touches the shape server itself.

## 5. File manifest

CREATE (each mirrors the named v1 file at `/home/rpw/repos/stellarc/` unless another mirror is named; v2 paths under repo root):

- `desktop/Cargo.toml` — v1 `desktop/Cargo.toml` (tauri 2, `tauri-plugin-shell`; drop all Axis crate deps).
- `desktop/package.json` + `desktop/bun.lock` — v1 `desktop/package.json` (`@tauri-apps/cli ^2` self-contained, per ADR 0009's citation).
- `desktop/build.rs` — v1 `desktop/build.rs`.
- `desktop/src/main.rs` — v1 `desktop/src/main.rs`.
- `desktop/src/lib.rs` — v1 `desktop/src/lib.rs` **minus** `free_loopback_port`, Axis supervision, and the `axis_endpoint` state; window loads `WebviewUrl::App("index.html")`, default 1440×900, min 360×640 (matches ADR 0009's smallest promised layout).
- `desktop/tauri.conf.json` — v1 `desktop/tauri.conf.json` with `frontendDist: "../apps/stellarc-ui/dist"`, bundle targets `["msi","nsis","deb","appimage","dmg"]`, and a **real CSP** (v1 shipped `csp: null` — not copied; see T10).
- `desktop/icons/*` — v1 `desktop/icons/` (placeholder lineage; rebrand is STL-30).
- `desktop/scripts/build-ui.sh` — v1 `desktop/scripts/stage-ui.sh` reinterpreted: runs the frozen UI build with `VITE_API_URL` (and WS derivation) baked from `DESKTOP_API_URL` env, no `ui-dist` resource staging, no inert placeholder.
- `desktop/scripts/launch-smoke.sh` — conventions of v1 `stage-ui.sh`; xvfb-run the Linux bundle, assert the window-created log line and clean startup, kill.
- `desktop/e2e/maestro/config.yaml` — v1 `.maestro/config.yaml` (`testOutputDir`).
- `desktop/e2e/maestro/flows/desktop-smoke.yaml` — v1 `.maestro/flows/prod/smoke.yaml` shape: `launchApp` → landmark visible (frozen sign-in/board shell per fixture) → screenshot.
- `.github/workflows/desktop.yml` — v1 `.github/workflows/desktop.yml` (cargo-check job, tauri-action matrix, artifact globs) extended with signing steps and the Linux launch smoke.
- `tests/unit/desktop.test.ts` — T0 `tests/unit/foundation.test.ts` harness (asserts §7 invariants inside `bun test`).

MODIFY after STL-14/STL-16 merge: root `package.json` (add `desktop:build`/`desktop:check` scripts calling into `desktop/`), the repo CI workflow (add the desktop job or trigger), `README.md` (desktop build line). Nothing under `apps/stellarc-ui/` or `packages/` may be modified — enforced by T02.

## 6. Pixel-frozen UI surfaces

**Every fork screen must render identically inside the desktop webview at 1440×900**, because the bundle is byte-identical: sign-in, org switcher, sidebar + board list, Kanban/list/backlog, ticket detail + activity thread, inbox, Settings (Members/Teams/Roles/API keys/Visibility), repos. The webview must not inject styles, zoom defaults, scrollbars, or fonts. The four-viewport Playwright projects and their baselines are untouched (T09). Any rendering difference inside the shell is a bug in the shell (CSP/zoom/webview-version), never a UI change.

## 7. TEST PLAN

Each case: RED before the code exists, GREEN after, then one-variable sabotage turns it red.

- **T01 Shell config exactness**: `tauri.conf.json` parses, identifier `dev.stellarc.desktop`, all five bundle targets, icons present, `frontendDist` points at the frozen UI dist, `desktop/package.json` pins `@tauri-apps/cli ^2`. RED: files absent. Sabotage: drop `"dmg"` from targets.
- **T02 UI-tree purity**: no file under `apps/stellarc-ui/` or `packages/` differs from `dev` in the PR diff (check runs in CI). RED: check absent → gate cannot pass pre-implementation. Sabotage: add one `console.log` to a UI file.
- **T03 Build baking**: `build-ui.sh` emits a build manifest recording `VITE_API_URL`; grep of the built bundle shows the baked absolute URL, never the `localhost:1337` fallback in a release build. RED: script absent. Sabotage: unset the env in the script.
- **T04 Rust compiles on all three OS**: cargo check `-p stellarc-desktop --all-targets` on `x86_64-pc-windows-msvc`, `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin` (+`x86_64-apple-darwin`) in CI. RED: `desktop/` absent. Sabotage: break `lib.rs`.
- **T05 Linux launch smoke** (CI): xvfb + bundled AppImage/deb binary starts, emits the window-created log line, `/health` probe logged (non-fatal), exits cleanly on SIGTERM. RED: no binary. Sabotage: `std::process::exit(1)` in setup.
- **T06 Maestro desktop smoke**: flows parse (YAML, required steps `launchApp`, `extendedWaitUntil` landmark, `takeScreenshot`) and run on macOS + Windows runners against the signed bundle. RED: flows absent. Sabotage: delete the `extendedWaitUntil` step.
- **T07 Signed builds**: Windows artifact signed with repo cert secret, macOS signed + notarized, Linux ships `.deb`/`.AppImage` + `SHA256SUMS`; workflow verifies checksums and fails closed with a named error when secrets are missing (O2). RED: workflow absent. Sabotage: remove the sign step.
- **T08 Three-OS matrix completeness**: workflow jobs cover ubuntu/windows/macos with correct target triples and artifact globs for every bundle target. RED: workflow absent. Sabotage: remove macOS from the matrix.
- **T09 Web Playwright suite unchanged**: `bun run e2e` green on the built web bundle with **zero** baseline diffs, and `apps/stellarc-ui/e2e/` byte-identical to `dev`. RED pre-shell only in the diff-assert sense (suite cannot have changed). Sabotage: alter one baseline PNG.
- **T10 CSP/security**: CSP allows `self` + exactly the configured API origin (http + ws) and nothing else; `csp: null` rejected by T01's schema check; no remote code, no shell `eval`. RED: conf absent. Sabotage: set `csp: null` (v1's value — must fail).

**Reconciliation queries owned: 0 of 14.** This slice adds no tables, so it owns none and blocks none (#1–#3 STL-15; #4–#6 STL-16; #7 STL-19; #8 STL-17; #9/#11/#12 STL-20; #10 STL-18; #13/#14 + final gate STL-21).

**Observability (ADR 0010):** no new service methods, HTTP endpoints, DB calls, or event paths exist in this slice → zero new spans, by construction. The Rust shell logs structured startup lines (stderr, `service.name=stellarc-desktop`), never tokens, URLs with credentials, or PII; no `console.*` can appear because no TS is added to the app (T02 enforces). The reviewer's named audit item: **verify absence** — no un-instrumented TS path smuggled in, no PII in shell logs.

## 8. Suggested vertical build order

1. Rebind to merged STL-14/STL-16 code; resolve O1 (Linux Maestro ruling) and O2 (signing secrets) with the orchestrator; pin `@tauri-apps/cli ^2` and Rust toolchain.
2. T01/T03/T10 RED → `desktop/` skeleton + conf + build script GREEN; T02 purity check wired into CI first (cheapest guard, protects the freeze from step one).
3. T04 cargo check on the Windows job (v1 precedent), then full matrix build + artifacts (T08).
4. T05 Linux launch smoke — thinnest launch proof, no signing needed.
5. T06 Maestro flows + macOS/Windows runner wiring.
6. T07 signing; T09 Playwright-unchanged proof; full gates in a clean worktree at HEAD; adversarial review (different family). The orchestrator alone merges, commits, updates the tracker.
