# ADR 0013: UI platform — React 19 web UI in a Tauri 2 shell for web + desktop + mobile

Status: **proposed** (2026-10-13). Decides how `stellarc-ui` reaches web, desktop
(Linux/Windows/macOS), and mobile (Android/iOS) without maintaining three UIs.
Confirms the direction already fixed by ADR 0009 §Target platforms; this ADR is
the decision record with current evidence, alternatives scored, and explicit
reconsideration conditions for GPUI.

## Decision

**Keep the React 19 web UI (`apps/stellarc-ui`, stack fixed by ADR 0008) as the
single UI codebase, and ship it everywhere through Tauri 2**: the browser
directly, the existing `desktop/` Tauri shell for Linux/Windows/macOS, and
Tauri 2's iOS/Android targets for mobile.**

Rejected: React Native/Expo with react-native-web (no official Linux desktop
target; full rewrite of the frozen UI) and Dioxus (Rust rewrite, no TS/Effect
reuse, young ecosystem). GPUI, Flutter, Lynx, Electrobun, and Capacitor are
assessed below; none meets web + three desktop OSes + two mobile OSes from one
codebase at lower cost than the chosen path.

## Constraints this must satisfy

1. **One UI, five targets**: web, Linux, Windows, macOS, iOS, Android (ADR 0009).
2. **The frozen surface stays frozen** (ADR 0008/0009): TanStack Router, Base UI
   via shadcn, Tailwind v4, `@tanstack/react-virtual`, CodeMirror, xterm.js,
   dockview — all React-DOM-shaped. A platform that cannot render React-DOM
   components is a rewrite, not a port.
3. **The Effect HttpApi client stays** (ADR 0012): the UI speaks HTTP/WS to the
   Effect backend through generated TS contracts. Any platform that keeps
   TypeScript keeps this for free.
4. Current stack (verified on `dev` @ `fd3fb53`): React 19.2.7, TypeScript 5.8,
   Vite 7.3, Bun 1.4 workspace; `desktop/` already scaffolds Tauri 2
   (`tauri = "2"`, `@tauri-apps/cli ^2`, bundle targets msi/nsis/deb/appimage/dmg).

## The three decision-relevant options

### Option A — React 19 web UI + Tauri 2 shell (chosen)

The UI is a web app; Tauri wraps the identical bundle for desktop and mobile.
- **Web**: shipping (Vite build, Playwright 4-viewport suite, ADR 0009).
- **Desktop**: Tauri 2 stable line (2.12.3, 2026-10-10, MIT/Apache-2.0,
  111.8k★, active daily). `desktop/tauri.conf.json` already targets
  msi/nsis/deb/appimage/dmg. Known tail: Linux WebKitGTK quality — 76 open
  `webkitgtk`-matching issues, 11 IME, 11 accessibility in the tauri tracker
  (searched 2026-10-13). Mitigation: Tauri 3's `tauri-runtime-cef`
  (3.0.0-alpha.5, 2026-10-01) is a Chromium runtime aimed exactly at this hole.
- **Mobile**: Tauri 2's iOS/Android targets are shipping, documented targets
  (official distribute guides for iOS and Android, v2.tauri.app, accessed
  2026-10-13). Fresh proof of health: 2.12.3 (2026-10-10) fixes iOS release
  builds under Xcode 27 (`@_cdecl` entry points stripped). Younger than the
  desktop target; that risk is priced in the staged plan.

### Option B — React Native / Expo + react-native-web (rejected)

- Mobile: excellent — RN 0.87.1 stable, Expo SDK 57, New Architecture default.
- Web: react-native-web 0.21.4 (latest, npm, accessed 2026-10-13) is a
  compatibility layer mapping RN primitives to DOM. Mature but perpetually
  0.x, single primary maintainer, and a second-class web citizen: our TanStack
  Router/Base UI/dockview surface does not run on it.
- Desktop: **no Linux target**. Microsoft maintains react-native-windows and
  react-native-macos as separate forks (both active; releases 2026-06-30 and
  2026-09-30), with their own version matrices. Linux has no official path.
  Two extra platform forks + one compat layer = three UI stacks in practice.
- Verdict: fails constraint 1 (Linux) and constraint 2 (rewrite) simultaneously.

### Option C — Dioxus (rejected)

- Coverage on paper: web (wasm), desktop, iOS, Android from one Rust codebase
  (official 0.7 docs, accessed 2026-10-13; stable 0.7.10, 0.8.0-alpha.1 since
  2026-07-31 — the 0.8 line has been alpha-only for ~2.5 months, a cadence
  signal, crates.io accessed 2026-10-13).
- In practice: desktop/mobile render through platform webviews (inherits the
  same Linux WebKitGTK tail without Tauri's escape hatch), the widget
  ecosystem is young, and the entire frozen UI plus the Effect HttpApi TS
  client would be rewritten in Rust by hand.
- Verdict: pays a full rewrite for renderer parity with Option A minus its
  ecosystem.

## Scoring (1–5, higher is better; migration cost 5 = cheapest)

| Criterion | A: React + Tauri 2 | B: RN/Expo + rnw | C: Dioxus |
|---|---|---|---|
| Target coverage & maturity | 4 (Linux webview tail; mobile young) | 2 (no Linux desktop; web via compat layer) | 2 (targets exist, alpha cadence) |
| Text input + IME + accessibility | 4 (browser engines everywhere; Linux GTK tail; CEF runtime inbound) | 3 (native IME/a11y strong on mobile, weaker via rnw on web) | 2 (AccessKit + webview mix, unproven at our scale) |
| TypeScript / Effect HttpApi reuse | 5 (unchanged contracts) | 2 (client reusable, UI gone) | 1 (nothing reusable) |
| Ecosystem & agent-friendliness | 5 (npm/React/shadcn; best-known to coding agents) | 4 (huge but forked per platform) | 2 (young, Rust-only) |
| Migration cost | 5 (packaging work, not rewrite) | 1 (full frozen-surface rewrite) | 1 (full rewrite, new language) |
| **Total** | **23/25** | **12/25** | **8/25** |

## Alternatives assessed briefly

- **GPUI** (Zed's Rust UI framework): pre-1.0 by its own README ("breaking
  changes between versions", accessed 2026-10-13); the crates.io `gpui` crate
  is stale at 0.2.2 (2025-10-22) because Zed develops it in-tree — there is no
  semver contract to build on. Platform backends in-tree: macOS, Windows,
  Linux; wasm sections exist but no shipped web product, and no mobile backend
  (Zed itself ships macOS/Windows/Linux only, zed.dev/download accessed
  2026-10-13). Fails web and mobile today. Longtail/GPUI Kit (v0.7.3,
  2026-10-12) is compounding fast on IME/a11y/text — the strongest signal on
  the Rust-native side, tracked as WATCH. Reconsideration conditions below.
- **Flutter**: mature on all five targets, but Dart + a full rewrite with zero
  TS/Effect reuse, and a canvas-rendered web target that discards the DOM
  accessibility/IME engine we get for free with Option A. Reject.
- **Lynx**: Apache-2.0, active (15.2k★), web + iOS + Android — but no desktop
  target and React bindings pre-1.0 (`@lynx-js/react` 0.127.0, npm accessed
  2026-10-13). Watch; revisit at bindings 1.0 + a desktop story.
- **Electrobun**: 12.9k★ but beta-first (2.0.3-beta.23) and macOS-centric; no
  mobile. Reject.
- **Capacitor** (8.5.3): would wrap our web UI for iOS/Android much like Tauri,
  but its desktop story is a community Electron platform last released 2023 —
  it cannot cover Linux/Windows desktop, which Tauri already scaffolds for us.
  Reject; Tauri covers the same ground with one shell.

## Recommendation and staged plan

Adopt Option A. The plan is sequencing + verification, not new architecture:

1. **Stage 0 — pin and floor (now).** Keep `desktop/Cargo.toml` honest: either
   pin `tauri = "~2.12"` or consciously keep the `"2"` float with a quarterly
   verification pass (the float silently absorbs every 2.x). Add the a11y
   floor to the Playwright suite (scout proposal 2026-10-13) before more
   surface freezes.
2. **Stage 1 — desktop bring-up.** Produce Linux (deb/appimage), Windows
   (nsis/msi), macOS (dmg) builds from the existing scaffold; manually verify
   CJK IME input and screen-reader landmarks on Linux WebKitGTK specifically —
   that is the weakest engine cell. Record results in the desktop bring-up
   ticket's evidence.
3. **Stage 2 — mobile bring-up.** iOS/Android via Tauri 2 on ≥ 2.12.3 (Xcode 27
   fix). Budget for porting a representative subset of the v1 fork's 21
   Maestro flows forward — `dev` carries only one desktop-smoke flow (scout
   correction, 2026-10-13). Do not assume mobile build health from docs alone;
   the spike must exercise a real device build.
4. **Stage 3 — Tauri 3 / CEF checkpoint.** When `tauri-runtime-cef` ships
   stable, re-run the Linux IME/a11y verification against it; migrating
   becomes the fix for the worst platform cell rather than private-API
   cleanup (updates the NEVR-72 trigger).

**Escape hatch:** if Linux WebKitGTK IME/a11y blockers are demonstrated in
Stage 1 *and* `tauri-runtime-cef` fails to reach stable, re-open this ADR —
that is the one scenario where the web-everywhere bet pays its known cost
without its mitigation.

## Conditions that would justify reconsidering GPUI

All four, not any one:

1. `gpui` ships a semver-stable 1.0 on crates.io, versioned independently of
   the Zed monorepo (today the published crate is 0.2.2 from 2025-10-22 while
   in-tree development races ahead — no contract to depend on).
2. A shipping web (wasm) target in a real product, not cfg stubs — our web
   target is non-negotiable.
3. Mobile backends (iOS, Android) shipping in a real product with IME-critical
   (CJK) users, matching what GPUI Kit's release notes are building toward.
4. Stellarc's primary implementation language is Rust again (ADR 0012 moved
   the backend to TypeScript/Effect), **or** the product grows a rendering
   requirement the DOM genuinely cannot meet (Zed-class editor throughput) —
   until then GPUI's core advantage is orthogonal to our stack.

## Evidence (all primary sources, accessed 2026-10-13 unless noted)

- Repo: `apps/stellarc-ui/package.json` (React 19.2.7, TS 5.8, Vite 7.3);
  `desktop/Cargo.toml` + `desktop/tauri.conf.json` (Tauri 2 scaffold, five
  bundle targets); `docs/adrs/0008-frontend-stack.md`; `docs/adrs/0009-development-workflow.md`
  §Target platforms; `docs/adrs/0012-effect-strangler-kaneo.md`.
- Tauri: https://crates.io/api/v1/crates/tauri (2.12.3, 2026-10-10);
  https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.12.3 (Xcode 27 fix);
  https://v2.tauri.app/start/ (mobile plugins/distribute: iOS, Android);
  https://github.com/tauri-apps/tauri/issues?q=is%3Aissue+is%3Aopen+webkitgtk
  (76 open; IME 11; a11y 11); https://crates.io/api/v1/crates/tauri-runtime-cef
  (3.0.0-alpha.5, 2026-10-01).
- GPUI: https://github.com/zed-industries/zed/tree/main/crates/gpui (README
  pre-1.0; platform sources); https://crates.io/api/v1/crates/gpui (0.2.2,
  2025-10-22); https://zed.dev/download (macOS/Windows/Linux only);
  https://github.com/longbridge/gpui-kit (v0.7.3, 2026-10-12).
- React Native: https://registry.npmjs.org/-/package/react-native/dist-tags
  (0.87.1); https://registry.npmjs.org/-/package/react-native-web/dist-tags
  (0.21.4); https://github.com/microsoft/react-native-windows and
  .../react-native-macos (release dates via GitHub API).
- Dioxus: https://crates.io/api/v1/crates/dioxus (0.7.10 / 0.8.0-alpha.1);
  https://dioxuslabs.com/learn/0.7/getting_started/ (iOS/Android SDK setup).
- Others: https://github.com/flutter/flutter (180.0k★, active);
  https://github.com/lynx-family/lynx + npm `@lynx-js/react` (0.127.0);
  https://github.com/blackboardsh/electrobun (beta);
  https://capacitorjs.com/docs (8.5.3) +
  https://github.com/capacitor-community/electron (last release 2023).

## Known unknowns (stated, not hand-waved)

- **Tauri 2 mobile maturity at our scale**: the targets are shipping and
  documented, but this assessment did not build or run an iOS/Android bundle
  (no toolchains in the scout environment). Stage 2 exists to convert this
  unknown into evidence.
- **react-native-web's long-term trajectory**: maintained (pushed 2026-10-12)
  but 0.x for years with a single primary maintainer; irrelevant to the
  decision beyond scoring Option B.
- **Dioxus 0.8 timeline**: alpha since 2026-07-31, no published stable date.
- **CEF runtime scope**: alpha.5's OSR/flags suggest breadth, but Linux daily-
  driver quality is unproven; treated as a mitigation path, not a dependency.
- **Tauri issue-search counts** (76/11/11) are keyword searches over open
  issues, not a curated defect taxonomy; they size the tail, they do not
  enumerate it.
