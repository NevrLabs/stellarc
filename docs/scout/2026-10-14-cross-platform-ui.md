# Scout: cross-platform-ui — 2026-10-14

Beat: **cross-platform-ui**. Delta run over [2026-10-13](./2026-10-13-cross-platform-ui.md) (1 day): all 12 radar rows re-verified against primary sources (GitHub REST, crates.io, npm).

Method: `gh api`, crates.io API, npm registry — primary sources only. Web search backend down a **fourth** consecutive run (`9router` unregistered); no claim below depends on it. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

A quiet version day — no new Tauri 2 patch (2.12.3, 2026-10-10 still latest), no GPUI Kit release (v0.7.3, 10-12 still latest). The movement is elsewhere:

1. **CEF is in release-prep.** No `tauri-runtime-cef` alpha.6 yet (alpha.5, 2026-10-01 still newest on crates.io), but release-automation PR [#16257](https://github.com/tauri-apps/tauri/pull/16257) ("Apply Version Updates From Current Changes (v3)") was updated 2026-10-13 22:45 UTC — the next 3.0 alpha cut is being staged. Since Friday the `feat/cef` stack absorbed six more fixes: macOS reopen-restore (#16048), app-switch propagation to child processes (#16210), **essential OSR support** (#16225), Linux window class from app identifier (#16242), overlay-titlebar mouse-event interception on macOS (#16275), and **native fullscreen for F11 / Fullscreen API** (#16289, updated 2026-10-14 05:52 — an hour before this run). Meanwhile the thing CEF exists to fix is growing: open issues matching `webkitgtk` in the tauri repo rose **67 → 76** in one day (same query both days; keyword-match count), IME 10 → 11, accessibility 10.
2. **Our desktop builds aren't reproducible.** `desktop/Cargo.toml` floats `tauri = "2"` (yesterday's known issue) — but the mechanical half is new: **no `desktop/Cargo.lock` is committed** (verified: not in `git ls-files`; `/target/` is the only desktop gitignore entry) and **no dependabot config exists repo-wide**. Every desktop CI run re-resolves the 2.x line from scratch, so `cargo check`/bundles build against whatever was newest that morning — unattended drift the rust-cache then partially bakes in. Proposal 1 fixes it with one committed file. (Pairs with the parked NEVR-72 verification pass.)
3. **Correction to yesterday's non-findings:** "wry has zero open IME issues" no longer holds — 3 open today (#1724 configurable webkitgtk preedit, #1762 WebView2 DirectComposition hosting, #1767 gtk4/webkit6 migration). All three are feature/migration work, not the WebKitGTK bug tail, so the conclusion stands: the IME/a11y tail lives in the tauri repo's tracker, and CEF targets exactly that.

Also verified, explicitly not a finding: this week's `desktop.yml` reds are the **O2 fail-closed signing gates doing their designed job** — latest run 38518041270 shows cargo-check green on all four triples, bundle-linux + linux-smoke green, both `bundle-signed` legs red with `APPLE_CERTIFICATE`/`WINDOWS_CERTIFICATE` absent (the workflow's own T07 "refusing to ship unsigned" error), maestro-desktop consequently skipped. Known tradeoff, documented in the workflow.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | No new patch; 2.12.3 (2026-10-10) still latest for `tauri`, `@tauri-apps/api`; CLI 2.12.2. 111,887★, pushed today | 2.12.3 2026-10-10 (repo floats `tauri "2"`, **no committed Cargo.lock**) | MIT / Apache-2.0 | 5 | **ADOPT** (keep) | The float plus missing lockfile means every CI run resolves a possibly-new 2.x unattended — the Xcode 27 iOS fix lands by luck, the next regression the same way. Proposal 1 makes the resolve deliberate |
| **`tauri-runtime-cef`** (Tauri 3 CEF runtime) | alpha.5 (2026-10-01) still newest; alpha.6 staged via release PR #16257 (updated 10-13). Six fixes stacked since Friday: OSR essentials, native fullscreen, overlay-titlebar mouse events, Linux window class, app-switch propagation, macOS reopen-restore | 3.0.0-alpha.5 2026-10-01 | MIT / Apache-2.0 (tauri repo) | 2 | **WATCH** | The daily cadence continues into release-prep. The payoff sharpens as the WebKitGTK tail grows (76 open keyword matches, +9 in a day) — CEF remains the strategic Tauri 3 item for our Linux desktop targets |
| **Tauri 3.0-alpha track** | Core alpha.4 (2026-10-01) still latest tagged; CLI at alpha.27 internally; release PR open | 3.0.0-alpha.4 2026-10-01 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged; trigger stays 3.0 stable |
| **GPUI Kit** (ex gpui-component) | No release since v0.7.3 (2026-10-12); 17,282★ (17.0k Friday), pushed today | v0.7.3 2026-10-12 | Apache-2.0 | 3 | **WATCH** | Two-day pause after three releases in two weeks — cadence still exceptional, still a second UI stack in a language we don't use. Trigger unchanged: 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` 0.127.0 (2026-10-10) unchanged; repo 15,177★, pushed today | 4.1.0 / bindings 0.127.0 2026-10-10 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | Expo SDK 57.0.28 (2026-10-12); RN 0.87.1 stable since 2026-08-26 — unchanged | as of 2026-10-14 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 (2026-10-08) unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 (2026-10-07) unchanged | 8.5.3 2026-10-07 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground |
| **Dioxus** | 0.8 line alpha-only for ~2.5 months (0.8.0-alpha.1, 2026-07-31); stable 0.7.10 | 0.8.0-alpha.1 2026-07-31 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,141★, pushed today — steady | active 2026-10-14 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | Beta tag advanced 2.0.3-beta.23 → **2.0.3-beta.24**; latest stable 2.0.2 (2026-09-29) — still beta-first | 2.0.3-beta.24 | MIT | 2 | **REJECT** | Unchanged |
| **`@axe-core/playwright`** | Still 4.13.0 (2026-08-11), pins `axe-core ~4.13.0`; zero deps beyond axe-core. Yesterday's ADOPT brief not yet landed (no `axe` anywhere in repo) | 4.13.0 2026-08-11 | MPL-2.0 | 5 | **ADOPT** (pending) | Row stays open until the brief is filed and the a11y spec lands — the repo still has no aria/keyboard assertion on the frozen surface |

## Proposals

### 1. ADOPT — commit `desktop/Cargo.lock` (reproducible shell builds)
The float `tauri = "2"` was flagged on 10-13; the missing lockfile is the mechanical half that makes it fixable today. Desktop CI (`.github/workflows/desktop.yml`: cargo-check ×4 triples, bundle-linux, bundle-signed) runs `cargo check`/`tauri-action` with **no lockfile in git**, so each fresh runner resolves the newest compatible 2.x — today 2.12.3 (good: the Xcode 27 fix), tomorrow whatever ships next (unverified). Committing `desktop/Cargo.lock` is upstream Tauri's own guidance for app crates: one file, no app-code change, makes desktop builds reproducible and makes the rust-cache lockfile key stable. A follow-up chore (`cargo update -p tauri` monthly, or a dependabot `cargo` entry — none exists today) turns silent drift into reviewable PRs. *(Issue brief posted as a separate comment for Talos.)*

### 2. WATCH — CEF alpha.6 is being staged; keep the NEVR-72 trigger sharp (no new issue)
Release PR #16257 plus the OSR/fullscreen/window-class stack says the next 3.0 alpha is close. No action now; when `tauri-runtime-cef` hits beta with a selectable runtime, the NEVR-72 spike brief should add "evaluate the CEF runtime on Linux for the IME/a11y tail (76 open webkitgtk-keyword issues, +9 in a day)". Radar row already carries the sharpened payoff line.

### 3. Correction — wry IME count
Yesterday's "wry has zero open IME issues" read 3 today (#1724, #1762, #1767) — all feature/migration requests, none bug-tail. The conclusion (IME/a11y tail lives in the tauri repo against WebKitGTK) stands; recorded so the next delta doesn't inherit a stale zero.

## Notable non-findings

- Web search provider down a **fourth** consecutive run (`9router` unregistered). GitHub + crates.io + npm carried the beat again.
- `desktop.yml` reds this week are the designed O2 fail-closed signing gates (verified in run 38518041270's logs: empty `APPLE_CERTIFICATE`/`WINDOWS_CERTIFICATE`, T07 error by name), not regressions — but note maestro-desktop (T06) stays skipped as long as the secrets are absent, so the Maestro desktop flow has no green CI path right now.
- `actions/checkout@v4` emits a Node-20-deprecation warning in the desktop workflow logs — cosmetic, not worth a brief yet.
