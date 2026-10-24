# Scout: cross-platform-ui — 2026-10-24

Beat: **cross-platform-ui**. Delta run over [2026-10-17](./2026-10-17-cross-platform-ui.md) (7 days): all 12 radar rows re-verified against primary sources (GitHub REST, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns (T02 guard aftermath, dependabot cadence, desktop CI shape, open-PR stack).

Method: `gh api`, crates.io API, npm registry — primary sources only. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

Three real findings in a week that most upstream rows spent standing still:

1. **Dependabot is broken, and the root cause is verified: the repo's default branch is `main`, frozen at 2026-08-03 (the legacy pre-v2 shape), while `.github/dependabot.yml` exists only on `dev`.** Dependabot version updates read their config from the default branch, so the weekly cargo tick configured in NEVR-191/PR #98 has never fired — zero dependabot-authored PRs in repo history (verified via `author:app/dependabot`). The ≈10-21 first tick never came and never will until the default branch flips to `dev`. One owner action in repo settings fixes it; brief filed this run.
2. **Tauri 2.12.5 shipped 10-21 and our `desktop/Cargo.lock` is now two patch releases behind — still pinning 2.12.3, which predates the #16197 fix** (IPC/asset-protocol handler panic on empty-path URIs like `ipc:foo`, fixed in 2.12.4). 2.12.5 itself is NSIS installer fixes (downgrade-blocking over MSI installs, misspelled language string) plus internal dep bumps. Trunk is alive again after last week's zero-commit anomaly: 41 commits since 10-15. `desktop/Cargo.toml` requires `tauri = "2"`, so the fix is a lockfile-only bump — exactly what dependabot would deliver within a week of the default-branch flip.
3. **GPUI Kit shipped v0.8.0 (10-19) and it's bigger than the component cadence suggested**: an installable JavaScript shell runtime (`gpui-shell`), cross-platform `gpui-webview` (macOS/Windows/Linux X11/XWayland), and a public rendering boundary for external editors (`editor_host`, keyed BlockNode leaf geometry with the host keeping its own document model/undo). The IME/a11y sprint landed in-release: DataTable exposed to assistive technology (#3667), accessible names on script-API controls (#3665), software-keyboard config (`input_action`/`autocorrect`/`autocapitalize`, #3557), password-field semantics (#3555). 18,568★ (+723 in a week), pushed today. Still a WATCH — Rust, second stack, ADR 0009 — but `editor_host` and their keyboard/a11y API shapes are free design references for our transcript-editor and NEVR-150 work.

Also verified, explicitly non-findings: desktop CI on dev (run 40050240268, 2026-10-24 01:32 UTC) shows the same designed O2 fail-closed shape as 10-17 — `bundle-signed` mac+win red (secrets absent), `ui-purity`/`bundle-linux`/`linux-smoke`/all four `cargo-check` triples green, `maestro-desktop` skipped. And the WebKitGTK keyword tail reads **78 open** (was 68; was 77 before that) with IME 2 / a11y 0 sub-counts unchanged — the same search-index churn band called out on 10-16/10-17; treat the wobble as noise, not engineering.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | **2.12.5 (10-21)**: NSIS downgrade-block fix + language-string rename; 2.12.4 (10-14) carries **#16197 IPC/asset empty-path panic fix** + mobile-plugin late-resolve abort fix. Trunk: 41 commits since 10-15 (was zero). 112,153★. Our lockfile pins **2.12.3** = missing the panic fix; `Cargo.toml` req `"2"` → lockfile-only bump | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** | The bump path runs through the dependabot fix (headline #1); deliver 2.12.5, absorb the panic fix |
| **Tauri 3.0-alpha track** | No new alpha; crate α.5 (10-14) stands, npm `next` unchanged (cli α.5 / api α.3) | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable; nothing new to evaluate |
| **`tauri-runtime-cef`** | α.6 stands (crates.io updated 10-14). WebKitGTK keyword tail **78 open** (68→78, churn band; IME 2 / a11y 0 sub-counts unchanged) | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged; gates before the NEVR-72 CEF spike: selectable runtime, beta quality, WebKitGTK tail staying hot |
| **GPUI Kit** (ex gpui-component) | **v0.8.0 (10-19)**: `gpui-shell` JS app runtime, `gpui-webview` (mac/Win/Linux X11-XWayland), `editor_host` external-editor rendering boundary, syntect highlighting option, software-keyboard config, DataTable/controls a11y. 18,568★ (+723), pushed 10-24 | v0.8.0 2026-10-19 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Second UI stack in a language we don't use — but `editor_host`'s keyed-leaf-geometry boundary and their keyboard/a11y API shapes are direct design references for our transcript editor, mobile input, and NEVR-150 floor. Trigger stays 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` **0.129.0 (10-23)**, still pre-1.0 bindings; 15,203★, pushed 10-23; no desktop story | bindings 0.129.0 2026-10-23 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | Expo SDK **58.0.19 (10-23)** patch; RN 0.88.0 latest (10-15), 0.89 nightlies rolling | as of 2026-10-24 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 (2026-10-08) unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 unchanged on latest; 9.0.0-alpha.8 on `next`; 8.5.4 nightlies rolling | 8.5.3 / 9.0.0-alpha.8 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground |
| **Dioxus** | No α.4; 0.8.0-alpha.3 (10-16) stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged — Rust stack; doesn't touch the React single-codebase decision |
| **Flutter** | 180,353★ (+108), pushed 10-24 — steady | active 2026-10-24 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **2.0.4 stable (10-18)** — first new stable since 09-29; 2.0.5-beta.5 (10-23) rolling; macOS-centric | 2.0.4 2026-10-18 | MIT | 2 | **REJECT** | Unchanged verdict; recorded so the stable-line restart is on the radar |
| **`@axe-core/playwright`** | 4.14.0 stable stands (10-15); `rc`/`next` channels rolling 4.14.1 snapshots — pin `latest` only, never a snapshot channel. NEVR-150 still `todo`; no `axe` in the repo | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built against 4.14.0 |

## Proposals

### 1. ADOPT — flip the default branch to `dev` and let dependabot deliver Tauri 2.12.5

Ready-to-file brief posted on the scout issue (NEVR-310). Essence: repo settings → default branch `main` → `dev`. `main` is frozen at 2026-08-03 on the legacy pre-v2 shape; every active PR targets `dev`; dependabot reads config only from the default branch, so `.github/dependabot.yml` (landed 10-14, PR #98) is invisible to it and zero dependabot PRs exist in repo history. The flip (an owner settings action, zero code) restarts the weekly cargo tick; its first PR should be `desktop/Cargo.lock` → tauri 2.12.5, which absorbs the #16197 IPC/asset panic fix — review it, don't rubber-stamp (the NEVR-191 intent). If the flip waits, the interim is a one-line manual lockfile bump.

### 2. WATCH — GPUI Kit v0.8.0 as a design-reference stream, not an adoption candidate

Three shapes in v0.8.0 are worth reading even though we will not adopt the stack: (a) `editor_host` — a host keeps its own document model/selection/undo and renders through a BlockNode tree with keyed leaf geometry, which is exactly the seam a foreign transcript/editor surface needs; (b) software-keyboard config (`input_action`/`autocorrect`/`autocapitalize` + password identification) — the checklist our mobile-input work will eventually face under Tauri; (c) DataTable-to-assistive-technology exposure — the same class of problem as our virtualized transcript list under NEVR-150. No action beyond the radar row; re-read when we spec the transcript editor.

### 3. Book-keeping — T02 aftermath and the aging PR stack

- **PR #120 (T02 guard fix) is merged (10-17 07:26)** — verified. The frozen design stack **#90/#91/#92/#108 is NOT proven red under the fixed guard**: their visible check failures date to 10-13…10-15 runs, before the merge. They need a re-run/rebase to re-evaluate; the T02 row retires once that happens.
- **PR #87 (ADR 0013) is on day 11 with mergeable UNKNOWN** — still the oldest open scout PR, still pure consolidation of an already-made decision. Owner look requested; every week of staleness raises the rebase cost.
- Desktop CI red on dev remains the designed O2 fail-closed signing gate (run 40050240268 verified by job matrix); `maestro-desktop` still skipped while secrets are absent.

## Notable non-findings

- No web-search backend registered this run; GitHub + crates.io + npm covered all 12 rows plus the Stellarc-side surfaces.
- Tauri 3.0-alpha, tauri-runtime-cef, Expo, react-native-web, Capacitor, Dioxus, Flutter: all moved at or near zero; verdicts and triggers unchanged, `last-checked` advanced.
- The WebKitGTK tail wobble (68→78) and the 2.12.5 cargo-audit output (unmaintained transitive crates fxhash/paste/rustybuzz/ttf-parser warnings) were read and dismissed — the audit block is Tauri's own release hygiene, not an advisory against the release.
