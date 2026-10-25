# Scout: cross-platform-ui — 2026-10-25

Beat: **cross-platform-ui**. Delta run over [2026-10-24](./2026-10-24-cross-platform-ui.md) (1 day): all 12 existing radar rows re-verified against primary sources (GitHub REST, crates.io API, npm registry), one new row added (NSH), plus the Stellarc-side surfaces this beat owns (dependabot flip, desktop CI at current dev HEAD, T02 trial-pair state, open-PR stack).

Method: `gh api`, crates.io API, npm registry — primary sources only; no web-search backend registered this run (same as 10-24). Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

A one-day delta, but three real findings:

1. **Electrobun moved orgs, and the old path is dead.** `nicbarker/electrobun` returns 404; the repo lives at **`blackboardsh/electrobun`** — 12,957★, MIT, created 2024-02-28, pushed 10-24, with release history exactly continuous with what we track (v2.0.4 stable 10-18; 2.0.5-beta.2 10-21, β.3/β.4 10-22, β.5 10-23 — a fast beta train). The author's Electrobun apps moved with it (`blackboardsh/audio-tts`), so this reads as an author-account/org rename, not a fork or a hostile event. Verdict stays REJECT (macOS-centric, second stack), but the radar row's canonical URL changes today, and any future check that uses the old path will silently fail.

2. **New entrant in this beat's exact lane: Longbridge NSH (`longbridge/nsh`).** From the GPUI Kit org: a Rust native-UI framework where apps are written in Rust, **TSX**, or both — rendered with each platform's own views (UIKit, Android views, AppKit), HTML on the web, and GPUI inside GPUI apps — sharing one reactive engine, flexbox/grid layout, system text, input and accessibility. It is **11 days old** (repo created 10-14), already 620★, v0.2.0 (10-22), pushed today, and its license reads **NOASSERTION** (custom) — so adoption is blocked by policy regardless of merit. The reason it earns a radar row is its module model: **TSX screens delivered at run time as signed packages, run in a sandbox whose capabilities the host configures, with model-readable documentation (`nsh.dev/llms.txt`) explicitly aimed at AI-generated UI.** That is the same shape as the agent-authored UI surfaces Stellarc will eventually have to spec — reference material, not a dependency.

3. **Tauri: a new Windows IME bug in our exact risk area, and the v3/CEF train is visibly queued.** #16391 (created 10-24, open): Windows IME composition/candidate UI loses caret positioning when switching between windows of the same application — the IME sub-count ticks 2→3. Our Windows desktop shell plus CJK input in the transcript composer sit exactly on this bug class; nothing actionable until upstream triages it, but it goes on the row. Meanwhile the v3 line is stacking: **#16334, the "Apply Version Updates From Current Changes (v3)" release PR (open since 10-19), bumps tauri-cli, tauri-bundler, tauri-runtime-wry and tauri-runtime-cef**, and trunk holds a stack of seven open `fix(cef)` PRs (Linux window dragging/resizing #16294, focus restore #16352, window class #16242, custom protocol authorities #15749, relaunch panic #15423, app switches #16210, bundler filenames #16338). CEF is being hardened *inside core* — precisely what our NEVR-72 WebKitGTK escape-hatch gate watches.

Also verified, explicitly non-findings: desktop CI at current dev HEAD (3fc3f12; runs 40098595286/40098595328, 10-24 13:32) shows the same designed O2 shape — `bundle-signed` mac+win red on absent secrets, `ui-purity`/`bundle-linux`/`linux-smoke`/all four `cargo-check` triples green, `maestro-desktop` skipped, `ui-typecheck-budget` red-informational. And the dependabot repair has not happened: default branch is still `main` (re-verified today), zero dependabot-authored PRs in repo history, so NEVR-310's brief (posted 10-24) still awaits the owner — the Tauri 2.12.5 lockfile pickup is now 4 days old and still rides that one settings action.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still latest; trunk +1 commit since 10-24 (tokio lockfile-only, #16392); 112,170★ (+17). `desktop/Cargo.lock` verified **still pins 2.12.3** — the #16197 IPC/asset empty-path panic fix remains unabsorbed, day 4 | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** | Unchanged delivery path: dependabot flip (NEVR-310) → first PR is the lockfile bump, or a one-line manual bump in the interim |
| **Tauri 3.0-alpha track** | No new alpha; crate α.5 + npm `next` α.5 stand. **#16334 v3 version-update PR open since 10-19 — the α.6 train is queued and carries a tauri-runtime-cef bump** | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable; the queued train is the next checkpoint |
| **`tauri-runtime-cef`** | α.6 stands; **CEF hardening is happening in core** — 7 open `fix(cef)` PRs (drag/resize, focus, window class, protocol authorities, relaunch panic…). WebKitGTK keyword tail **69 open** (78→69; churn band 68↔78). **IME 2→3: new #16391** (Windows caret positioning, 10-24); a11y 0 | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | The NEVR-72 CEF-spike gate watches exactly this; a Windows-IME bug class belongs on our desktop-input risk list |
| **GPUI Kit** (ex gpui-component) | v0.8.0 stands; 10-24 commits on main are the release's a11y follow-through (button accessible names #3665, DataTable structure/cells #3667, sparse Markdown table rows #3673, a11y snapshot tests). 18,598★ (+30), pushed 10-25 | v0.8.0 2026-10-19 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Same verdict and trigger (1.0 + synced `gpui` crate); the org is now shipping NSH too (row below) |
| **NSH / Native Shell** (longbridge/nsh) — **NEW** | Rust native-UI framework, TSX screens, platform-native views on iOS/Android/macOS/Win/Linux + web + GPUI; signed, sandboxed, run-time-delivered TSX modules ("UI generated by AI"); `llms.txt` model docs. Created 10-14, 620★ in 11 days, v0.2.0, pushed 10-25 | v0.2.0 2026-10-22 | Other (NOASSERTION — custom) | 1 | **WATCH** (reference) | Not a dependency (age + license), but its agent-authored-UI model — signed packages, host-configured sandbox, model-readable docs — is the reference for our future agent-extension surfaces |
| **Lynx** | 15,209★ (+6), pushed 10-25; bindings 0.129.0 unchanged. README nuance: desktop runtimes exist (Lynx Explorer bundles Windows/macOS/Harmony environments; custom renderer spans mobile+desktop) but dev is macOS-recommended, Windows/Linux "not yet verified", bindings pre-1.0 | bindings 0.129.0 2026-10-23 | Apache-2.0 | 2 | **WATCH** | Trigger stays bindings 1.0 + a stable desktop story |
| **Expo / React Native** | Expo SDK 58.0.19 unchanged; RN 0.88.0 latest, 0.89-nightly rolling (10-25 build exists) | as of 2026-10-25 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 latest / 9.0.0-alpha.8 on `next` / 8.5.4-nightly 10-23 | 8.5.3 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers |
| **Dioxus** | 0.8.0-alpha.3 stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,364★ (+11), pushed 10-25 — steady | active 2026-10-25 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **Repo moved: `blackboardsh/electrobun`** (old `nicbarker` path 404s). 12,957★, pushed 10-24; v2.0.4 stable stands, 2.0.5-beta train β.2→β.5 inside 3 days | 2.0.4 / 2.0.5-beta.5 | MIT | 2 | **REJECT** | Verdict unchanged; row URL corrected so the next check doesn't silently fail |
| **`@axe-core/playwright`** | 4.14.0 stands; `rc`/`next` carry 4.14.1 snapshots — pin `latest` only. NEVR-150 still `todo`: no `axe` anywhere in the dev tree (verified by tree grep + code search this run) | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built against 4.14.0 |

## Proposals

### 1. WATCH — NSH as an agent-authored-UI reference stream

Radar row added. No dependency, no trial — 11 days old, custom license, v0.2. But when Stellarc eventually specs agent-generated or extension surfaces (the ADR 0011 BYO-agent lane will want them), mine NSH's three shapes before designing our own: (a) TSX modules delivered at run time as **signed packages**; (b) a **host-configured per-module sandbox** (capabilities, not blanket trust); (c) **`llms.txt`** — model-readable documentation built for the generation loop. Re-read at each pass; promote out of reference-only only if the license resolves to a standard OSS grant and the project reaches a stable line.

### 2. Ops — Tauri 2.12.5 pickup: day 4, still blocked on one owner action

NEVR-310's brief (posted on the 10-24 scout issue) is not re-filed — nothing about it changed except another day of age. Default branch re-verified `main` today; zero dependabot PRs in history. The choice stays the owner's: flip the default branch and let dependabot deliver the `desktop/Cargo.lock` bump (absorbing #16197), or take the one-line manual bump now. The only new fact is that trunk is quiet (one lockfile-only commit since 10-24), so 2.12.5 remains the right target.

### 3. Book-keeping — the T02 trial pair is mechanically proven; two PRs need rebases

- **PR #127/#128 (NEVR-315, @shadcn/lint trial pair, opened 10-24) answer the 10-24 open question — these are the first design-lane PRs to run against the fixed T02 guard** (#90 last ran 10-13, #108 10-15, both pre-fix; verified via check-run dates), and **the trial works mechanically**: the new `ui-design-contracts` job (added to `ci.yml`, Oxlint + `@shadcn/lint` against `design-contract-budget.json`) passes on #127's clean tree and fails on #128's deliberate violations. Both PRs are red on the T02 gates **by design** — `foundation`'s desktop.test.ts correctly flags #127's three frozen-file edits (`package.json`, `.oxlintrc.json`, `design-contract-budget.json`), and `ui-purity` fails any `apps/stellarc-ui` touch. The lint is proven; the freeze decision remains Talos's.
- **PR #123 (scout competitors, 10-23) is now CONFLICTING** — yesterday's scout merges moved `docs/scout/INDEX.md` under it. It needs a rebase onto dev before the next competitors run, or it rots. (#83 and #93 also read CONFLICTING; the five forge drafts stay as-is.)
- **PR #87 (ADR 0013) is on day 12**, still mergeable, still the oldest open scout PR — owner look still requested.
- #115/#118 unchanged: stacked on `agent/nevr-223`, mergeable, red only on the T02 gates + O2 signing + the informational typecheck budget.

## Notable non-findings

- No web-search backend registered this run (same as 10-24); GitHub + crates.io + npm covered all rows plus the Stellarc-side surfaces.
- Expo/RN, react-native-web, Capacitor, Dioxus, Flutter, @axe-core/playwright: all at or near zero movement; verdicts and triggers unchanged, `last-checked` advanced.
- The WebKitGTK tail wobble (78→69) sits inside the documented churn band (68↔78); treat as search-index noise. The IME 2→3 delta is the one real signal in that tail (#16391).
- GPUI Kit's 10-24 commits are v0.8.0's a11y follow-through landing on main — cadence, not a new release.
