# Scout: cross-platform-ui — 2026-11-06

Beat: **cross-platform-ui**. Delta run over [2026-11-05](./2026-11-05-cross-platform-ui.md) (1 day; that report is on dev, file re-verified there this run). All radar rows re-verified against primary sources (GitHub REST incl. PR merge state and job-level CI, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns: dev HEAD `7389d95`, CI shape at HEAD (job-level), `desktop/Cargo.lock` currency, NEVR-150, scout PR hygiene, Dependabot.

Method: `gh api`, crates.io API, npm registry — primary sources only.

## Headline

1. **The Tauri 2.12.6 queue grew 14 → 18 fixes in ~24h, now macOS/bundler-edge heavy.** Four new merged fixes since 11-05 07:00Z: **#16462 fix(core): don't bring the app to the front on macOS restart** (fix #16458), **#16464 fix(core): apply `dataStoreIdentifier` from the window config** (fix #16461 — the WKWebView data-store mapping was config-silent), **#16336 fix(bundler): rpm bundling fails for SemVer pre-release versions** (since rpm 0.30), and **#16427 fix: treat an empty new window URL as `about:blank`** (runtime-wry per commit subject). Plus three dep chores (#16466 eslint-plugin-security 4.2.1, #16400 `@rollup/plugin-terser`, #16401 `@rollup/plugin-typescript`). crates.io still **2.12.5 (10-21)** — no tag; wry trunk has **zero commits since the 0.57.1 tag (10-23)**, so the wry 0.57.0→0.57.1 fold still rides the 2.12.6 bump as pure hygiene. The pre-filed execute-on-tag brief stands, re-scoped to 18 fixes (proposal 1).

2. **The CEF PR set rotated without changing count: #16294 closed unmerged, #16467 opened 26 minutes later as its rework.** #16294 (CEF window dragging/resizing on Linux) closed **unmerged** 11-05 11:20Z; at 11:46Z **#16467 "fex(cef): request the WM for move/resize operations on Linux"** opened — same fix, reworked to mediate move/resize through the window manager. Net: 10 open CEF-titled PRs, and the Linux window-management cluster is the active front of the CEF alpha. wry open PRs hold at **60**; **#16391** (Tauri-repo Windows IME bug — composition/candidate UI loses caret positioning when switching between windows of the same app) is 0 comments, **day 19**; #16446 (per-webview event queue, our transcript path) 0 comments, day 20.

3. **GPUI Kit shipped an editor-grade batch past yesterday's cutoff — the text work is the signal.** 11-05 08:00–19:20Z trunk: **#3813 select right-aligned and centered table cell text where it is drawn** + **#3812 highlight the table body row under the pointer** (selection geometry computed at the draw site), **#3814 open a scrollable menu on its checked item** (stateful menu re-entry), #3815 locale-following search placeholder, #3816 Escape clears search, #3692 search empty state, the nesting/perf bounds trio (#3808, #3817, #3807 `materialize_node` frame shrink), and #3810 proxy URLs out of the default `process.env`. **19,486★ (+286)**. New ecosystem datapoint: **khromov/gpuix-svelte (418★, MIT, pushed 11-06)** — Svelte bindings for GPUI, a third dialect after remorses/gpuix (React, 2,877★). Breadth compounds; trigger stays 1.0 + synced `gpui` crate.

4. **NSH: v0.4.0 stands, no v0.5 — and the star curve keeps steepening: 1,654★ (+337 in one day).** Third consecutive acceleration (+87 → +281 → +337); created 10-14 → ~1.6k stars in 3.5 weeks; pushed 11-06 07:02Z. License still **NOASSERTION** — reference-only rule unchanged. Nothing new to mine this run (the v0.4.0 design set — IME stillness, notifications/badge, TUI backend — was carried into the NEVR-72/NEVR-377 reference notes on 11-05); the row is trajectory-watch until v0.5 or a license lands.

5. **Stellarc side: O2 holds, and the scout hygiene loop visibly closed this week.** dev HEAD **7389d95** (scout libraries 11-06, #199) — CI job-verified: ui-purity, bundle-linux, linux-smoke, all four cargo-check triples green; red only the absent-secret `bundle-signed` pair; maestro-desktop skipped; Foundation green (ui-typecheck-budget red inside a green run = informational, unchanged). `desktop/Cargo.lock`: tauri 2.12.5 / tauri-runtime-wry 2.12.3 / wry 0.57.0. **#183's missing payload landed**: `2026-11-04-libraries.md` is on dev via #199 — the stuck-PR escalation clock is clear. And the 11-05 competitors ADOPT brief became **PR #198 (NEVR-498, onboarding from recorded agent activity)** same-day — the brief→PR pipeline is proven end-to-end. #147 (NEVR-378 supersession) still open, owner call; NEVR-150 still `todo`; Dependabot still zero PRs ever.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | crates.io 2.12.5 (10-21) stands; GH releases re-verified. **2.12.6 queue now 18 fixes** — new: core #16462 (no app-to-front on macOS restart), core #16464 (`dataStoreIdentifier` from window config), bundler #16336 (rpm SemVer pre-release), runtime-wry #16427 (empty new-window URL → about:blank); +3 dep chores; carried 14 from 11-05. **wry 0.57.1 vs lockfile 0.57.0** still the fold; wry trunk idle since the 0.57.1 tag. 112,553★ (+38), pushed 11-06 | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** (current) | Execute the pre-filed NEVR-340-style brief the day 2.12.6 tags; the queue has refreshed daily for three straight runs |
| **Tauri 3.0-alpha track** | α.5 re-verified on crates.io and npm cli `next`; #16334 (v3 vehicle) open, 0 comments, untouched since 10-21 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable; the v2 2.12.6 tag remains the live event |
| **`tauri-runtime-cef`** | α.6 stands. CEF-titled open PRs **10 — rotated**: #16294 (Linux drag/resize) closed **unmerged** 11-05 11:20Z → #16467 (WM-mediated move/resize, same fix reworked) opened 11:46Z. wry open PRs **60** unchanged; IME quartet frozen; #16391 (Windows IME caret loss on same-app window switch) 0 comments, day 19; #16446 0 comments, day 20 | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Linux window-management is the CEF alpha's active front; NEVR-72/NEVR-377 gates unchanged |
| **GPUI Kit** | v0.9.0 stands. Trunk 11-05: #3813 table-cell text selected where drawn + #3812 row hover, #3814 menu opens on checked item, #3815 locale-following placeholder, #3816/#3692 search polish, nesting/perf bounds #3808/#3817/#3807, #3810 proxy URLs out of env; carried: #3801 CVE bump + script-bridge hardening #3802-#3805. 19,486★ (+286); gpuix 2,877★; NEW third dialect khromov/gpuix-svelte 418★ MIT | v0.9.0 2026-11-02 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Selection-at-draw-site and stateful menu re-entry are transferable UI laws for apps/web surfaces; trigger stays 1.0 + synced `gpui` crate |
| **NSH / Native Shell** | v0.4.0 stands (no v0.5); **1,654★ (+337/day — third consecutive acceleration)**; pushed 11-06; license still NOASSERTION | v0.4.0 2026-11-04 | Other (NOASSERTION — custom) | 2 | **WATCH** (reference, elevated) | v0.4.0 design set carried 11-05; trajectory-watch until v0.5 or a real license |
| **Lynx** | 4.2.0 stands (10-27); 15,243★, pushed 11-06; `@lynx-js/react` 0.129.1 (10-30) re-verified | 4.2.0 2026-10-27 | Apache-2.0 | 2 | **WATCH** | Trigger unchanged: bindings 1.0 + a stable, verified desktop story |
| **Expo / React Native** | expo 58.0.23 stands, npm dist-tags re-verified | 58.0.23 2026-11-03 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names the no-second-stack rule) |
| **react-native-web** | 0.21.4 unchanged, npm re-verified | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` 8.6.0 stands; `next` 9.0.0-beta.0 stands — the 9 line stays in beta | 8.6.0 2026-10-28 | MIT | 4 | **REJECT** | Unchanged; re-look only if mobile is re-chartered |
| **Dioxus** | 0.8.0-alpha.3 (10-16) stands — no α.4; stable 0.7.10; 39,630★, pushed 11-05 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 181,068★, pushed 11-06 — steady | active 2026-11-06 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | v2.0.6 (11-04) stands; re-read trigger retired 11-05 (stable without Linux marks) | 2.0.6 2026-11-04 | MIT | 2 | **REJECT** | Re-look only on an explicit platform announcement |
| **@axe-core/playwright** | 4.14.0 stands (`next`/`rc` are sha snapshots). **NEVR-150 still `todo`** (re-checked via platform CLI); no axe consumer in the tree | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built — the 11-03 descope steer (axe smoke-floor) stands |
| **Stellarc CI at dev HEAD** (ops row) | Designed O2 shape holds at 7389d95, job-verified: Foundation green; ui-purity, bundle-linux, linux-smoke, 4× cargo-check green; red only the absent-secret `bundle-signed` pair; maestro-desktop skipped | observed 2026-11-06 | — | 4 | **WATCH** (ops) | Unchanged; #147 supersession is the open owner call |
| **Scout PR hygiene** (this lane) | **#183 carry RESOLVED** — `2026-11-04-libraries.md` on dev via #199; the 11-05 onboarding brief → **PR #198 (NEVR-498)** same-day; no stuck scout PRs remain | 2026-11-06 | — | 4 | **RESOLVED** (clean) | Brief→PR pipeline proven end-to-end this week |

## Proposals

### 1. ADOPT (pre-filed, execute-on-tag) — Tauri 2.12.6 + wry 0.57.1, queue now 18 fixes

The queue has refreshed daily for three straight runs (14 → 18 since 11-05), so the pre-filed brief from 11-05 is re-scoped rather than re-derived: full NEVR-340 playbook (brief → PR → merge, one day) on `desktop/`, lockfile-only, `cargo update` for the tauri tree + wry 0.57.0→0.57.1 (Android-only content, `^0.57.0`-compatible, zero desktop risk), `make verify` green. Ready-to-file Multica issue brief attached in the run comment for Talos.

### 2. Hygiene (owner calls, no brief) — #147 supersession + NEVR-150 re-anchor

Both carried from 11-05, both still open: (a) **#147 / NEVR-378** targets the launch-smoke flake NEVR-470 fixed deterministically on 11-05 — close as superseded or state what it adds; (b) **NEVR-150** (axe a11y smoke floor) is still `todo` with the 11-03 descope steer attached — worth an explicit re-triage now that apps/web is the only frontend post-ADR 0014.

### 3. Reference carry (no brief) — GPUI Kit's re-entry and selection laws

Two transferable UI laws from GPUI Kit's 11-05 batch belong in `docs/design/agent-view-contracts.md` when apps/web menus/tables land there: (a) **#3814 — a scrollable menu re-opens at its checked item** (stateful re-entry; same law family as Section F's tapped-line-stays-put, NEVR-481); (b) **#3813 — text in custom-rendered cells is selected where it is drawn** (selection geometry at the draw site, the rule that keeps selection honest in virtualized tables). No dep, no code — acceptance-line material only.

## Notable non-findings

- No Tauri 2.12.6 tag (crates.io 2.12.5, releases re-verified); no Tauri 3.0-α.6; no `tauri-runtime-cef` α.7; no Dioxus α.4; no Lynx release; no Expo, react-native-web, or Capacitor movement of any kind; no NSH v0.5; no Electrobun movement.
- wry trunk: zero commits since the 0.57.1 tag (10-23).
- #16446 (per-webview event queue on our transcript path) still open, 0 comments, day 20.
- No mobile re-charter signal; the lane stays retired.
- New-entrant sweep (`cross-platform gui` + `desktop app framework`, created >2026-10-01, >300★): only NSH itself again (1,654★); FerroUI (wieslawsoltes, 224★, created 10-05) is sub-threshold; the framework query surfaces nothing above 8★. The roster is not missing an entrant.
- Dependabot: still zero PRs ever.
