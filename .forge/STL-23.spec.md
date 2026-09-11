# STL-23 — T9 Tauri 2 mobile shells (Android/iOS) around stellarc-ui

## 1. Scope and premise audit

Package the pixel-frozen `apps/stellarc-ui` web bundle inside **Tauri 2 mobile shells** (Android + iOS) as a second Tauri crate (`mobile/`, sibling to STL-22's `desktop/`), with debug builds that install and pass a Maestro native smoke suite on an Android emulator and an iOS simulator in CI, and a hard guarantee that the web Playwright suite and the frozen UI tree are byte-unchanged. The shells are presentation-only: asset-protocol load of the frozen bundle, `VITE_API_URL` baked at build time (same mechanism as STL-22), no API, no local control plane, no UI source change. Touch parity with the Playwright `mobile`/`mobile-small` projects means **structural landmark parity plus real taps** — not pixel equality across engines (Chromium vs System WebView vs WKWebView); the freeze governs the UI source, which is byte-identical by construction.

Premise audit (code wins; discrepancies reported):

1. **"Maestro mobile flows (v1: .maestro/config.mobile.yaml)" — stale premise.** v1 `/home/rpw/repos/stellarc/.maestro/` has exactly **4** mobile flows (`fleet-fail-closed`, `history`, `projects-fail-closed`, `vault-workbench`) and `config.mobile.yaml` is one `testOutputDir` line. The flows are **web-mode**: they set `url: ${MAESTRO_BASE_URL}/…` and run a **browser window** at `412x915` (v1 `ui/scripts/maestro-test.sh`), with **no `appId`** — v1 never ran Maestro against a native app. They also target the old Axis UI (Fleet/Vault/History landmarks), not the frozen Kaneo-parity surface. **Zero transfer verbatim**; T9 authors new native flows (`appId:` + frozen-surface landmarks) using v1's flow *syntax* as precedent.
2. **"Touch parity with the Playwright mobile projects"** — those projects are 390×844 and 360×640, `hasTouch`, `isMobile` (STL-14 `playwright.config.ts`; ADR 0009 table). Parity is defined as: the same landmark set the mobile projects assert (Sheet sidebar below the 768px `useIsMobile()` boundary, stacked layouts) reachable by real `tapOn` in the native webview. `toHaveScreenshot` baselines stay web-only; Maestro `takeScreenshot` is evidence artifact, never an assertion target (per ADR 0009's two-kinds rule).
3. **"Blocked by #22"** — consistent: STL-22 is `spec: pass`, not implemented; STL-14 (foundation) is still in implement (cycle 22), and this checkout carries docs + `tools/forge` only. Every path below rebinds to merged code at implementation start, as STL-22 §1.6 and STL-20 already ruled. Concretely: `mobile/` mirrors **STL-22's spec'd `desktop/`** patterns (asset protocol, baked `VITE_API_URL`, hardened CSP), not v1's in-process-Axis desktop.
4. **"DoD: ADR 0009"** — already accepted (2026-09-08); cites, nothing new to ratify. ADR 0009 §Target platforms already fixes Tauri 2 for mobile and forbids a second UI stack.
5. **Gate implies CI device capability** — Android emulator needs KVM-class runners; iOS simulator needs Xcode macOS runners. Flagged as **O1** (orchestrator ruling on runner class, like STL-22's O1/O2); CI wiring ships regardless and fails closed with a named message.
6. **Debug-only gate is load-bearing** — Android debug builds sign with the auto-generated debug keystore and iOS simulator builds need no signing team; release signing/store submission are out of scope precisely because the gate says debug.

**OUT of scope, each deferred to its owning ticket:** any UI source change — every frozen screen is owned by its slice (STL-15 identity, STL-16 board/ticket, STL-17 activity/inbox, STL-18 repos, STL-19 graph, STL-20 assets/visibility, STL-21 projects); the desktop shell and anything under `desktop/` (STL-22); rebrand/wordmark/icons final art, including app names/icons shown on the device home screen (STL-30, T7b — placeholder lineage icons ship here); the design-token migration and any unfreezing of the responsive layer (STL-26, T12); backend/sync/schema work of any kind (STL-14 foundation; STL-24 T11; STL-25 T13); release signing, store submission, auto-update, push notifications, camera/geolocation plugins, and deep links (unassigned future work; none exist to defer to a numbered sibling — same ruling as STL-22 §1); reconciliation-gate coordination (STL-21).

## 2. Tables, columns, events

**None.** Zero tables, zero columns, zero event types (`pluginId:type` does not apply, no `schema_version`), no importer rows. The mobile shells are not a data path.

## 3. HTTP API shape

**No new endpoints, no request/response schemas, no error union changes.** The shell *consumes* the existing T0 `GET /health` only, as a best-effort, non-fatal (2 s timeout) readiness log line in the Rust shell at launch — identical contract to STL-22 §3. It never serves HTTP.

## 4. Sync shapes affected

**None.** No collection changes; the frozen UI's electric-db collections behave identically inside the mobile webviews. The shells never touch the shape server.

## 5. File manifest

CREATE (v2 paths under repo root; mirror named per entry — v1 paths are under `/home/rpw/repos/stellarc/`):

- `mobile/Cargo.toml` — mirrors STL-22's spec'd `desktop/Cargo.toml` (v1 precedent, Axis deps dropped): `tauri = "2"`, `tauri-plugin-shell = "2"`, lib `crate-type = ["staticlib", "cdylib", "rlib"]` (staticlib required for iOS).
- `mobile/build.rs` — mirrors v1 `desktop/build.rs`.
- `mobile/src/main.rs` — mirrors v1 `desktop/src/main.rs` (desktop-dev entry; not shipped).
- `mobile/src/lib.rs` — mirrors STL-22's spec'd `desktop/src/lib.rs` **minus** all v1 loopback/Axis supervision state: `tauri::Builder` with asset-protocol window, no window sizing (webview fills the device screen), no local server.
- `mobile/tauri.conf.json` — mirrors STL-22's spec'd `desktop/tauri.conf.json`: `frontendDist: "../apps/stellarc-ui/dist"`, identifier `dev.stellarc.mobile`, `withGlobalTauri: false`, **real CSP identical to the desktop shell's** (self + exactly the baked API origin, http + ws), bundle targets `["apk"]` (Android debug; iOS `.app` produced by `tauri ios build`, not a bundle target).
- `mobile/package.json` — mirrors v1 `desktop/package.json` (self-contained `@tauri-apps/cli ^2`).
- `mobile/scripts/build-ui.sh` — mirrors STL-22's spec'd `desktop/scripts/build-ui.sh`: frozen UI build with `VITE_API_URL` (+ WS derivation) baked from env; build manifest recording the baked URL.
- `mobile/gen/android/**` — **new, no v1 mirror exists** (premise-audit finding 1): generated by `tauri android init`, **committed**; `applicationId dev.stellarc.mobile`, debug-signed.
- `mobile/gen/ios/**` — same: `tauri ios init`, committed; bundle id `dev.stellarc.mobile`, simulator (debug) build, no signing team.
- `mobile/e2e/maestro/config.mobile.yaml` — mirrors v1 `.maestro/config.mobile.yaml` (`testOutputDir`).
- `mobile/e2e/maestro/flows/mobile-sign-in.yaml`, `mobile-sheet-nav.yaml`, `mobile-board.yaml`, `mobile-ticket-nav.yaml` — v1 `.maestro/flows/mobile/*.yaml` **syntax** precedent (`launchApp`, `extendedWaitUntil`, `assertVisible`, `tapOn`, `takeScreenshot`) but native (`appId: dev.stellarc.mobile`, no `url:`) with frozen-surface landmarks: sign-in, Sheet-sidebar open/close below 768px, board columns, ticket open.
- `.github/workflows/mobile.yml` — conventions of v1 `.github/workflows/desktop.yml` (cargo check, tauri-action matrix, artifacts) + v1 `.github/workflows/e2e.yml` (Maestro install/AppArmor steps): Android job (emulator, `tauri android build --debug`, install, Maestro), iOS job (macos runner, `tauri ios build --debug`, simulator boot, install, Maestro).
- `tests/unit/mobile.test.ts` — mirrors STL-22's spec'd `tests/unit/desktop.test.ts`: asserts §7 invariants inside `bun test`.

MODIFY after STL-14/STL-22 merge: root `package.json` (`mobile:build`/`mobile:check` scripts), the repo CI trigger wiring, `README.md` (mobile build line). **Nothing under `apps/stellarc-ui/`, `packages/`, or `desktop/` may be modified — enforced by M02.**

## 6. Pixel-frozen UI surfaces

**Every fork screen must render from the byte-identical bundle at mobile widths (390×844-class and 360×640-class devices)**: sign-in, Sheet sidebar (below the 768px boundary), Kanban/list/backlog stacked layouts, ticket detail + activity thread, inbox, Settings surfaces. The webviews must not inject styles, viewport zoom defaults, scrollbars, or fonts, and must not force desktop mode (Android `setSupportZoom(false)` equivalent via meta/CSP only — no UI change to achieve it). Rendering differences traced to the webview engine are shell bugs or accepted engine variance (structural parity governs), never a reason to touch UI source. The four-viewport Playwright projects and baselines are untouched (M06).

## 7. TEST PLAN

Each case: RED before the code exists, GREEN after, then one-variable sabotage turns it red.

- **M01 Shell config exactness**: `mobile/tauri.conf.json` parses, identifier `dev.stellarc.mobile`, `frontendDist` → frozen UI dist, `withGlobalTauri: false`, APK target present, CSP non-null and equal to the desktop shell's. RED: files absent. Sabotage: `csp: null` (v1's shipped value — must fail).
- **M02 UI-tree purity**: PR diff touches nothing under `apps/stellarc-ui/`, `packages/`, or `desktop/`; CI check. RED: check absent pre-implementation. Sabotage: add one `console.log` to a UI file.
- **M03 Build baking**: `build-ui.sh` manifest records `VITE_API_URL`; grep of the bundle shows the baked absolute URL, never the `localhost:1337` fallback. RED: script absent. Sabotage: unset the env in the script.
- **M04 Rust cross-compiles**: cargo check for `aarch64-linux-android` and `aarch64-apple-ios` (+ `x86_64-apple-ios` for the Intel simulator path if used) in CI. RED: `mobile/` absent. Sabotage: break `lib.rs`.
- **M05 Generated projects committed & consistent**: `gen/android` + `gen/ios` present; `applicationId`/bundle id = `dev.stellarc.mobile`; versions match `tauri.conf.json`. RED: gen absent. Sabotage: change the bundle id in one gen file.
- **M06 Web Playwright suite unchanged**: `bun run e2e` green, zero baseline diffs, `apps/stellarc-ui/e2e/` byte-identical to `dev`. RED: diff-assert sense only. Sabotage: alter one baseline PNG.
- **M07 Android install + launch smoke** (CI): debug APK installs on the emulator, launches, emits the window-created/ready log line, `/health` probe logged non-fatal, exits cleanly on force-stop. RED: no APK. Sabotage: `std::process::exit(1)` in setup.
- **M08 iOS install + launch smoke** (CI): debug `.app` installs on the booted simulator, launches, same assertions as M07. RED: no `.app`. Sabotage: same.
- **M09 Maestro flows parse**: all four flows valid YAML with required steps (`launchApp` with `appId`, ≥1 `extendedWaitUntil`, ≥1 `tapOn`, `takeScreenshot`) — asserted in `bun test` so it REDs without any device. RED: flows absent. Sabotage: delete the `extendedWaitUntil` step.
- **M10 Maestro native smoke runs**: on emulator and simulator, sign-in landmark visible, Sheet sidebar opens and closes via real taps, board landmark visible, ticket navigation completes; screenshots attached to the workflow run. RED: flows/apps absent. Sabotage: point `appId` at a nonexistent app.
- **M11 Touch-parity landmark set**: the native landmark assertions (Sheet trigger, stacked board) are the same set the Playwright `mobile` project asserts, recorded in one shared manifest consumed by both suites — drift between the two fails `bun test`. RED: manifest absent. Sabotage: remove one landmark from the native side.
- **M12 No console, no PII in shell logs**: no `console.*` (no TS added to the app — M02 enforces); Rust shell logs structured startup lines only (`service.name=stellarc-mobile`), never tokens, credential URLs, or PII. RED: harness absent. Sabotage: log the baked `VITE_API_URL` including credentials.

**Reconciliation queries owned: 0 of 14.** No tables → owns none, blocks none (#1–#3 STL-15; #4–#6 STL-16; #7 STL-19; #8 STL-17; #9/#11/#12 STL-20; #10 STL-18; #13/#14 + final gate STL-21 — same split as STL-22 §7).

**Observability (ADR 0010):** no new service methods, endpoints, DB calls, or event paths → zero new spans, by construction. The reviewer's named audit item: **verify absence** — no un-instrumented TS path smuggled in (M02), no PII in shell logs (M12).

## 8. Suggested vertical build order

1. Rebind to merged STL-14/STL-22 code; resolve **O1** (runner class for emulator/simulator) with the orchestrator; pin `@tauri-apps/cli ^2`, Rust mobile targets, Android SDK/NDK, Xcode.
2. M01/M03/M09 RED → `mobile/` crate skeleton + conf + build script + flow stubs GREEN, all device-free (cheapest guards first: M02 purity check wired into CI at the same step).
3. `tauri android init`/`tauri ios init` → M05 gen-project checks; M04 cross-compile in CI.
4. **Thinnest end-to-end path first:** one emulator, debug APK, install → launch log assert (M07), then one Maestro flow (sign-in) on it — before any iOS work.
5. Mirror to iOS simulator (M08 + the same flow); then the remaining three flows and M11 shared landmark manifest.
6. M06 Playwright-unchanged proof, M12 log audit, full gates in a clean worktree at HEAD; adversarial review (different family). The orchestrator alone merges, commits, updates the tracker.
