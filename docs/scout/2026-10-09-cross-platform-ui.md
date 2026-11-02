# Scout: cross-platform-ui — 2026-10-09

Beat: **cross-platform-ui** (GPUI, Tauri, Expo/RN + react-native-web, Capacitor, Dioxus, Flutter, Lynx, Electrobun; maturity on mobile support, web target, accessibility, IME, ecosystem).
Method: GitHub REST API + raw changelogs + npm registry + crates.io (primary sources only). Web search backend was down again this run (`9router` unregistered) — same as the libraries run; no claim below depends on a secondary source. Grounding: ADR 0009 fixes Stellarc's platform strategy — one React codebase, **Tauri 2** shell, web + desktop (Linux/Windows/macOS) + mobile (Android/iOS), and explicitly **no second UI stack** (Capacitor, Expo, React Native are named). Repo pins: `desktop/Cargo.toml` → `tauri = "2"`, `tauri-plugin-shell = "2"`; `desktop/package.json` → `@tauri-apps/cli ^2`.

## Headline

**The beat's real news is GPUI Kit** — Longbridge's `gpui-component` (16.6k★) has been renamed **`longbridge/gpui-kit`**, ships 75+ components on crates.io with docs.rs, and now has `webview` and `story-web` crates in-tree; pushed today. The Rust-native desktop path is consolidulating into a real framework — still the wrong move for Stellarc today (it would fork the React UI), but it is now the credible post-webview option. Meanwhile **Tauri 3.0 alphas have started** (alpha.1 → alpha.4, 2026-10-01) while Tauri 2.12.2 shipped today, **react-native-web came back from the dead** (two releases in three weeks after a ~1-year gap), and **Lynx 4.1** confirmed web + Android + iOS from one codebase with React-style bindings still pre-1.0.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | The ADR 0009 shell. Steady patch cadence, mobile (iOS/Android) GA since 2.0, `tauri-v2.12.2` published **today**; 35.1M crate downloads; 111.7k★ | 2.12.2 2026-10-09 (repo floats `tauri "2"` / `cli ^2`) | MIT / Apache-2.0 | 5 | **ADOPT** (keep) | No action needed on strategy; the float means 2.12.2 lands on next `desktop:build` — verify once, deliberately (see Proposal 1) |
| **Tauri 3.0-alpha** | Alpha track started; alpha.4 (2026-10-01) removes `macos-private-api` feature — window transparency / `fullScreenEnabled` now always available, no private APIs | 3.0.0-alpha.4 2026-10-01 | MIT / Apache-2.0 | 2 | **WATCH** | Don't chase alphas. The private-API removal is the first user-visible win; revisit when 3.0 stable is near and ADR 0009's desktop shell gets a maintenance pass |
| **GPUI Kit** (ex `gpui-component`) | Longbridge's Rust desktop framework on Zed's GPUI: 75+ components, `kit`/`component`/`shell`/`webview`/`story-web` crates, docs.rs, zh/en docs, CI. Renamed and pushed **today**, 16.6k★ | crates `gpui-kit` line, active daily 2026-10-09 | Apache-2.0 (dual) | 3 | **WATCH** | The strongest "native desktop without webviews" ecosystem. Signals where agent-tooling UIs (Fork, Kiwi) are heading. Irrelevant to Stellarc until a Rust-UI fork would ever beat one-codebase economics — it doesn't today |
| **GPUI** (Zed's crate) | Zed's GPU-accelerated UI framework, monorepo crate | crates.io 0.2.2 (updated 2025-10-22); zed repo pushed 2026-10-09, 91.5k★ | NOASSERTION (Zed's GPL terms for zed; GPUI itself has separate licensing) | 3 | WATCH | Canonical crate lags the monorepo by a year — consuming raw `gpui` means vendoring; GPUI Kit is the practical consumption path |
| **Expo / React Native** | Expo SDK 57 current (57.0.27, 2026-10-06), SDK 58 in canary; RN 0.87.1 stable (2026-08-26), 0.88.0-rc.4; New Architecture only | as of 2026-10-09 | MIT | 5 | **REJECT** | ADR 0009 names it: a second UI stack would fork the pixel-frozen React UI. Healthy and irrelevant in one line |
| **react-native-web** | **Revived**: 0.21.3 (2026-09-25) and 0.21.4 (2026-10-08) after 0.21.2 sat 11 months (2025-10-16); repo description now "Cross-platform React UI packages" | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Stellarc's UI is plain React — RNW adds nothing here. The revival matters only as ecosystem signal: "React everywhere" keeps consolidating, which supports ADR 0009's bet |
| **Capacitor** | Webview shell for mobile, steady cadence | 8.5.3 2026-10-07, 16.8k★ | MIT | 4 | **REJECT** | Tauri 2 already covers iOS/Android from the same webview app; a second shell would double the native surface for zero new capability |
| **Dioxus** | Rust full-stack UI (web/desktop/mobile/native) | 0.7.10 2026-07-30 (last release 2.5+ months); repo pushed 2026-10-03; 3.0M crate downloads, 39.3k★ | Apache-2.0 / MIT | 3 | **REJECT** | Release cadence has slowed while GPUI Kit accelerated; for Rust-desktop the center of gravity moved. Wrong language for our codebase regardless |
| **Flutter** | Dart UI toolkit, daily activity, 179k★ | active 2026-10-09 | BSD-3-Clause | 5 | **REJECT** | Dart = second stack + second language; never reconciles with a TS/React monorepo |
| **Lynx** | Tencent's web-inspired native renderer: **Android, iOS and Web from one codebase** (README), React API via `@lynx-js/react` 0.126.2 (2026-09-24), multithreaded engine | 4.1.0 2026-09-07, 15.2k★, pushed daily | Apache-2.0 | 2 | **WATCH** | The technically interesting mobile-native alternative to RN — but React bindings pre-1.0, no desktop story, and adopting it is exactly the second-stack fork ADR 0009 forbids. Revisit only if mobile webview performance ever becomes the blocking complaint |
| **Electrobun** | "Solution-in-a-box" TS desktop apps: JSC runtime (Cottontail), Zig/ObjC/C++ platform layer, Hutch CLI | v2.0.3-beta.11 (still beta), 12.9k★, pushed 2026-10-07 | MIT | 2 | **REJECT** | Still beta, macOS-centric platform layer, no mobile. Tauri is already integrated and cross-platform; nothing here competes |

## Proposals

### 1. ADOPT — Tauri 2.12 desktop shell verification + Tauri 3 trigger
The repo floats `tauri = "2"` / `@tauri-apps/cli ^2`, so today's 2.12.2 (and every 2.x after) flows into `desktop:build` unattended. One deliberate pass: refresh `desktop/Cargo.lock`, build all three desktop targets, run the existing Maestro desktop flows, record the resolved versions — then leave the float alone. Add a one-line trigger to the radar: "Tauri 3.0 stable → schedule migration spike (private-API removal is the payoff)."
*(Issue brief posted as a separate comment for Talos.)*

### 2. ADOPT — Tauri-mobile bring-up spike for the frozen responsive layer
ADR 0009 already froze the responsive layer into the tested surface (473 Tailwind prefixes, `useIsmobile()` at 768px in 12 sites — Playwright projects cover web viewports), and parked Maestro native-shell flows with "the desktop/mobile packaging tickets". Tauri 2's mobile targets have been GA for two years. A time-boxed spike: `tauri ios init` / `tauri android init` against the existing UI bundle, one dev build per platform, run the 21 existing `.maestro` mobile flows against the Tauri webview (not a browser), and file what breaks. This is the cheapest possible check that the one-codebase promise actually holds on the shells ADR 0009 committed to.
*(Issue brief posted as a separate comment for Talos.)*

### 3. WATCH — GPUI Kit and Lynx rows on the radar
Neither changes anything now; both get a `last-checked` row so the next "should we go native?" debate starts from data. GPUI Kit trigger: 1.0 / synchronized `gpui` crate publishes. Lynx trigger: `@lynx-js/react` 1.0 + a desktop story. Until either fires, ADR 0009 stands.

## Notable non-findings

- Web search provider down again (`9router` unregistered) — second consecutive run. GitHub API + npm + crates.io carried the whole beat; consider that the scout's steady-state method anyway.
- RN "Nova" (the JS-native renderer announced at RN 0.82-era) has no usable public artifact yet — no repo, no npm line to verify. Rumor-grade; excluded.
- Electrobun moved orgs (`nicholasgriffintn/…` → `blackboardsh/electrobun`) — update any old bookmarks; still doesn't change the verdict.
