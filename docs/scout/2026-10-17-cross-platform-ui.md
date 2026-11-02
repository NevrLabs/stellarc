# Scout: cross-platform-ui — 2026-10-17

Beat: **cross-platform-ui**. Delta run over [2026-10-16](./2026-10-16-cross-platform-ui.md) (1 day): all 12 radar rows re-verified against primary sources (GitHub REST, crates.io, npm registry), plus the Stellarc-side surfaces this beat owns (T02 guard fix, desktop CI shape, dependabot cadence).

Method: `gh api`, crates.io API, npm registry — primary sources only. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

No Tauri release, no Tauri trunk movement at all — but the day's real finding is Stellarc-side: **the T02 frozen-UI guard fix is verified working**.

1. **PR #120 (NEVR-247) — T02 guard measures PRs against their base-branch head — has its `foundation` check GREEN** (head `0497ae7`, checked 10-17). This is the fix for the merge-gate mechanic that has been reddening every effect/v4-based PR (19 inherited UI files) and freezing the design stack #90/#91/#92/#108. All four cargo-check triples, `bundle-linux`, `linux-smoke`, and `ui-purity` are green on it; `ui-typecheck-budget` red is the known informational budget check (count = budget); `bundle-signed` mac+win red is the designed O2 fail-closed signing gate (`APPLE_CERTIFICATE` secrets absent, T07), unchanged. **Merging #120 is the single highest-leverage unblock available right now** — it re-opens the whole frozen UI stack without a single application-code change on our side.
2. **GPUI Kit is sprinting exactly the axes we care about** (IME assistance, screen-reader semantics, Android input behavior — #3557, #3554/3555/3562, #3556, plus a "Native Shell" nav push #3571). v0.7.3 unreleased but daily commits, 17,845★ (+160). It stays a WATCH (Rust second stack, ADR 0009), but it's the strongest external validation that input-method + a11y work is where desktop shells differentiate — the same bet as our NEVR-150 axe floor.
3. **Everything else moved only at the margins**: Dioxus cut 0.8.0-alpha.3 one day after alpha.2, Electrobun beta.27, Lynx bindings 0.128.0, Expo 58.0.14. All REJECT/WATCH verdicts unchanged; the second-stack decision (ADR 0009) is untouched by any of them.

Also verified, explicitly not a finding: today's `desktop.yml` red on dev (run 38991518891, 2026-10-17 01:35 UTC) — same designed O2 fail-closed shape as yesterday: `bundle-signed` mac+windows red, all four `cargo-check` triples + `bundle-linux` + `linux-smoke` + `ui-purity` green, `maestro-desktop` skipped. And the WebKitGTK keyword tail reads **68 open today vs 77 yesterday** — but only 2 issues verifiably closed since Oct 1, so most of that delta is search-index churn, not engineering. Recorded as 68 with that caveat; IME/a11y sub-counts (2/0 by today's index) moved more than closures explain and shouldn't be read as real progress.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | Zero trunk commits since 10-15; no release (2.12.4 of 10-14 stands; `Cargo.lock` pins 2.12.3). No dependabot PR yet — correct, first weekly tick expected ≈ 10-21. When it lands, review for #16197 (asset-protocol IPC panic) | 2.12.4 2026-10-14 (111,960★) | MIT / Apache-2.0 | 5 | **ADOPT** | Nothing to do today; the beat's Stellarc-side action is PR #120, not upstream |
| **Tauri 3.0-alpha track** | No new core alpha (α.5 of 10-14 stands); npm `next` tags unchanged (cli α.5 / api α.3) | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **`tauri-runtime-cef`** | α.6 stands. WebKitGTK tail **68 open** (was 77; only 2 closures verifiable since Oct 1 — treat the drop as mostly index churn). IME 2 / a11y 0 by today's index — same churn caveat | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged; gates before the NEVR-72 CEF spike: selectable runtime, beta quality, WebKitGTK tail staying hot |
| **GPUI Kit** (ex gpui-component) | No release since v0.7.3 (10-12) but an IME/a11y/mobile-input sprint on trunk: keyboard-assist per input (#3557), masked-input password semantics for screen readers (#3555), named clear/toggle buttons (#3554/#3562), Android back-button text retention (#3556), diff row-height hints (#3563), list visible-range callback (#3549), Native Shell nav (#3571). 17,845★ (+160), pushed today | v0.7.3 2026-10-12 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** | Second UI stack in a language we don't use — but their investment in IME + screen-reader semantics is external validation of our NEVR-150 axe floor and our Linux-IME concern. Trigger: 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` **0.128.0 (10-16)**, still pre-1.0 bindings; repo 15,190★ pushed today; 80 open desktop-labeled issues but no desktop story shipped | 4.1.0 / bindings 0.128.0 2026-10-16 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | Expo SDK **58.0.14 (10-16)** patch; RN 0.88.0 unchanged, 0.89 nightlies rolling | as of 2026-10-17 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 (2026-10-08) unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 unchanged on latest; 9.0.0-alpha.8 on `next`; 8.5.4 nightlies rolling | 8.5.3 / 9.0.0-alpha.8 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground |
| **Dioxus** | **0.8.0-alpha.3 (10-16)** — second alpha in two days; 0.8 release velocity is real. Stable 0.7.10; 39,422★, trunk daily | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged — Rust stack; doesn't touch the React single-codebase decision |
| **Flutter** | 180,245★ (+12), pushed today — steady | active 2026-10-17 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **2.0.3-beta.27 (10-16)** — daily beta cadence; latest stable 2.0.2 (09-29); macOS-centric | 2.0.3-beta.27 2026-10-16 | MIT | 2 | **REJECT** | Unchanged |
| **`@axe-core/playwright`** | 4.14.0 stable stands (10-15); `rc`/`next` channels rolling 4.14.1 snapshots. Still no `axe` in the repo; NEVR-150's brief was already amended to 4.14.0 on 10-16 (NEVR-235 triage) — build against that | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built |

## Proposals

### 1. ADOPT — merge PR #120 (NEVR-247): the T02 guard fix is verified green

No new brief needed — this is an owner merge decision on an existing issue. Evidence: PR #120 head `0497ae7` runs the `foundation` check **green** with zero UI files touched on its branch — the exact scenario that failed before (every effect/v4-based PR inherited 19 red UI files; see the libraries 10-17 row). Merging it re-opens the frozen stack #90/#91/#92/#108 for re-evaluation and stops the guard from reddening unrelated v4 PRs. Secondary effect: the design-beat row's day-4 escalation (10-18) likely dissolves if this lands first.

### 2. WATCH — GPUI Kit's IME/a11y sprint as a pattern signal

Not an adoption candidate (Rust, second stack) but worth keeping eyes on: a well-resourced desktop-shell project is spending its week on keyboard-assist APIs, screen-reader semantics for inputs, and Android back-button behavior — the exact long-tail our Linux WebKitGTK concern and NEVR-150 axe floor live in. If they publish their input-assist API shape, it's a free design reference for our own IME handling on desktop. No action beyond the radar row.

### 3. Book-keeping — ADR 0013 PR aging, four majors seen and dismissed

- **PR #87 (scout(ui-platform): ADR 0013) is on day 4 with mergeable UNKNOWN** — still the oldest open scout PR, still pure consolidation of an already-made decision. Worth an owner look; a stale mergeable state costs a rebase the longer it sits.
- Dioxus α.3, Electrobun beta.27, Lynx 0.128.0, Expo 58.0.14 recorded and dismissed (above). Radar `last-checked` advanced on all cross-platform-ui rows; the T02 row now carries the PR #120 green-check verification.

## Notable non-findings

- No web-search backend registered this run (same as 10-16); GitHub + crates.io + npm covered all 12 rows.
- Desktop CI red on dev remains the designed O2 fail-closed signing gate (verified run 38991518891 by job matrix); `maestro-desktop` still skipped while secrets are absent.
- No dependabot PR on Stellarc yet — the weekly cargo tick configured 10-14 (NEVR-191) is expected ≈ 10-21; when the Tauri 2.12.4 lockfile PR arrives, review it for #16197 rather than rubber-stamping.
- Open-PR stack for this beat: #120 (the guard fix itself), #87 (ADR 0013); the frozen design stack #90/#91/#92/#108 awaits #120.
