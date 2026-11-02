# Scout: cross-platform-ui — 2026-10-16

Beat: **cross-platform-ui**. Delta run over [2026-10-15](./2026-10-15-cross-platform-ui.md) (1 day): all 12 radar rows re-verified against primary sources (GitHub REST, crates.io, npm registry).

Method: `gh api`, crates.io API, npm registry — primary sources only. The web-search backend was unavailable this run (no registered provider); registries + GitHub covered all rows, nothing required a search engine. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

A quiet day for the beat — no Tauri release of any kind — with one actionable version refresh and two major-version signals that don't move any verdict:

1. **`@axe-core/playwright` 4.14.0 shipped (2026-10-15)** — the first stable since 4.13.0 (2026-08-11), i.e. the version NEVR-150's brief pins. The brief (filed 10-13) says "add `@axe-core/playwright` 4.13.0"; whoever builds it should pin **4.14.0** instead. Nothing else about the brief changes: scope was re-verified today — still no `axe` in `apps/stellarc-ui/package.json` or `desktop/package.json`, `@playwright/test` peer still satisfied. rc channel is rolling 4.14.1 snapshots; stable 4.14.0 is the right pin.
2. **No Tauri movement.** crates.io: `tauri` max_stable 2.12.4 (10-14), `tauri-runtime-cef` newest 3.0.0-alpha.6 (10-14). npm dist-tags unchanged (`cli` latest 2.12.3 / `next` 3.0.0-alpha.5; `api` latest 2.12.4 / `next` 3.0.0-alpha.3). Trunk since 10-15 is chores and docs only (vitest 5.0.4, serde 1.0.229, rand 0.10.3, bundler docs, a CLI target-validation skip). The dependabot 2.12.4 lockfile PR has **not** arrived — correct per the weekly cadence configured in `.github/dependabot.yml` (entry added 10-14 via NEVR-191; first tick expected ≈ 10-21). No selectable-runtime PR exists in tauri (search: one closed false positive) — the NEVR-72 trigger is unchanged.
3. **Both React Native majors moved, verdict unchanged.** RN 0.88.0 (2026-10-15) and Expo SDK 58.0.12 (2026-10-16) are live on npm. ADR 0009 already rejects the second stack; a new RN major doesn't reopen that. Recorded so the radar shows we saw it, not that we're deciding anything.

Also verified, explicitly not a finding: today's `desktop.yml` red on dev (run 38836392270, 2026-10-16 01:40 UTC) is still the designed O2 fail-closed signing gate — `bundle-signed` mac+windows red, all four `cargo-check` triples green, `bundle-linux`/`linux-smoke`/`ui-purity` green, `maestro-desktop` skipped. Same shape as yesterday.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | No new release (2.12.4 of 10-14 stands; `Cargo.lock` pins 2.12.3). Trunk quiet. Dependabot weekly cargo entry live since 10-14 — no PR yet, first tick ≈ 10-21 | 2.12.4 2026-10-14 (111,907★) | MIT / Apache-2.0 | 5 | **ADOPT** | Nothing to do today. When the dependabot PR lands, review it for real — #16197 fixes a panic on our asset-protocol IPC path |
| **`tauri-runtime-cef`** (Tauri 3 CEF runtime) | No α.7; newest α.6 (10-14) stands. WebKitGTK keyword tail **77 open, flat** (IME 9, a11y 10 — both flat) | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged; gates before the NEVR-72 spike adds CEF-on-Linux: selectable runtime, beta quality, WebKitGTK tail staying hot |
| **Tauri 3.0-alpha track** | No new core alpha (α.5 of 10-14 stands); npm `next` tags unchanged | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **GPUI Kit** (ex gpui-component) | No release since v0.7.3 (10-12) but daily commits: WebView + WebViewState added to the component catalog (#3532), shell Background/shadow (#3534), horizontal wheel-scroll strips (#3518). 17,685★ (+203) | v0.7.3 2026-10-12 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** | Unchanged — second UI stack in a language we don't use. Their new WebView component is their story, not ours. Trigger: 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` 0.127.0 (10-10) unchanged; repo 15,188★, pushed today | 4.1.0 / bindings 0.127.0 2026-10-10 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | **RN 0.88.0 (2026-10-15)** and **Expo SDK 58.0.12 (2026-10-16)** — both majors moved since yesterday (0.87.1 / 57.0.29) | as of 2026-10-16 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it). Major churn confirms the ecosystem moves fast — exactly why one React codebase + Tauri was right |
| **react-native-web** | 0.21.4 (2026-10-08) unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 (10-07) unchanged; 9.0.0-alpha.8 still on `next` | 8.5.3 / 9.0.0-alpha.8 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground |
| **Dioxus** | 0.8.0-alpha.2 (10-14) stands; trunk active daily (fragment-sibling placement fix #5924, wasm tracing replacement, release-alpha agent skill). Stable 0.7.10 | 0.8.0-alpha.2 2026-10-14 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged — 0.8 velocity is real but doesn't touch our React single-codebase decision |
| **Flutter** | 180,233★, pushed today — steady | active 2026-10-16 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | Beta advanced 2.0.3-beta.25 → **2.0.3-beta.26** (2026-10-15); latest stable 2.0.2 (2026-09-29); repo (blackboardsh/electrobun, 12,920★) pushed 10-15 | 2.0.3-beta.26 | MIT | 2 | **REJECT** | Unchanged |
| **`@axe-core/playwright`** | **4.14.0 (2026-10-15)** — first stable since 4.13.0; NEVR-150 filed+todo with a 4.13.0 pin that is now one minor stale. Still no `axe` in the repo | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Build NEVR-150 against **4.14.0**, not 4.13.0 — same scope, one-line amendment to the brief. Row open until built |

## Proposals

### 1. ADOPT — one amendment, no new brief: pin axe 4.14.0 in NEVR-150

NEVR-150 (a11y floor, filed 10-13, todo) pins `@axe-core/playwright` 4.13.0; 4.14.0 shipped the day after filing. Amendment for whoever builds it: install `@axe-core/playwright@4.14.0` (dragging `axe-core ~4.14`), everything else in the brief unchanged — routes, spec name, MPL-2.0, peer `playwright-core >= 1.0.0` against our `@playwright/test` 1.62.0. No new issue needed; this note is the whole deliverable. (No other ADOPT emerged today — Tauri 2 is in "await the weekly dependabot tick" mode, expected ≈ 10-21.)

### 2. WATCH — nothing moved on the two Tauri 3 gates

CEF stays at α.6, core at α.5, and the WebKitGTK tail is flat at 77 (IME 9 / a11y 10). No selectable-runtime PR exists upstream. NEVR-72's triggers (3.0 stable; beta-with-selectable-runtime for the CEF spike) are all still ahead of us. No action.

### 3. Book-keeping — ADR 0013 PR is aging; majors seen and dismissed

- **PR #87 (scout(ui-platform): ADR 0013) has been open since 10-13 with mergeable UNKNOWN** — three days. It formalizes exactly the decision this beat tracks (React 19 + Tauri 2 shell). dev already contains ADR 0009's platform section, so this is consolidation, not urgency — but it's the oldest open scout PR and worth an owner look.
- Expo SDK 58 / RN 0.88 recorded and dismissed (above). Radar `last-checked` advanced on all cross-platform-ui rows.

## Notable non-findings

- Web-search backend unavailable this run (`9router` provider not registered); GitHub + crates.io + npm sufficed for all 12 rows.
- Desktop CI reds remain the designed O2 fail-closed signing gates (verified run 38836392270 by job matrix) — `maestro-desktop` still skipped while secrets are absent.
- Open-PR stack unchanged for this beat: #90/#91/#92 (design-beat UI PRs, T02 freeze guard), #93, #108, #110, #112 — none touch the shell or platform choice.
