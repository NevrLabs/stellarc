# Scout: cross-platform-ui — 2026-10-15

Beat: **cross-platform-ui**. Delta run over [2026-10-14](./2026-10-14-cross-platform-ui.md) (1 day): all 12 radar rows re-verified against primary sources (GitHub REST, crates.io, npm registry).

Method: `gh api`, crates.io API, npm registry — primary sources only. Web search backend was not needed this run; every claim below resolves to a release page, registry entry, or repo API response. Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

The Tauri 3 machine moved — and yesterday's ADOPT brief landed:

1. **CEF alpha.6 shipped with the big one: OSR IME.** `tauri-runtime-cef` 3.0.0-alpha.6 (2026-10-14, crates.io) adds "CEF windowless browsers with an application-provided render handler and native window event callback. Applications provide painting, input, **IME**, cursor handling and composition" ([#16225](https://github.com/tauri-apps/tauri/pull/16225)). Yesterday's alpha.5 OSR entry was render-pipeline only; alpha.6 hands the app the input/IME path. Also in: child-process API-version propagation (#16241), a nasty session-restore fix (Chromium reopening the previous run's tabs in foreign Chrome windows after a crash — `session.restore_on_startup` now pins New Tab), macOS overlay-titlebar mouse-event fix (#16275), unsupported-CEF-version error instead of crash (#16240), and a CEF binary bump to 154.5.0. The Linux payoff sharpened again: open `webkitgtk`-keyword issues in the tauri repo rose **76 → 77** (IME 9, a11y 10 — both flat).
2. **Tauri 2.12.4 shipped the same day** (2026-10-14, `tauri` + `tauri-utils` 2.10.2 + `tauri-runtime-wry` 2.12.2; `@tauri-apps/api` 2.12.4; CLI stable 2.12.3). Bug-fix only, but two of three fixes are ours: **panic in IPC/asset-protocol handlers on empty-path URIs** (#16197) — our shell loads the frozen UI over the asset protocol, so that's our surface — and **mobile plugin late-response panic → dropped** (#16146), which matters the day Tauri mobile ships for us. Plus a clearer iOS dev-server error (#16286). The lockfile path works as designed: dependabot hasn't opened a 2.12.4 PR yet (weekly cadence), and no dependabot cargo PR exists yet.
3. **NEVR-191 landed** (PR #98, merged): `desktop/Cargo.lock` is committed (pinned **tauri 2.12.3**, verified in the lockfile), `.github/dependabot.yml` adds a weekly cargo entry for `/desktop`. Yesterday's reproducibility gap is closed end-to-end — the float `tauri = "2"` now resolves to a recorded, reviewable pin, and the first patch (2.12.4) arrives as a reviewable dependabot PR rather than a silent re-resolve. ADOPT row closed.
4. **Tauri core 3.0.0-alpha.5** (2026-10-14) is dependency-sync only (tauri-utils/runtime/macros/build alpha.4) — pure release-train mechanics confirming alpha.6-cef's dependency stack. npm dist-tags confirm the train: `@tauri-apps/cli` `next` = 3.0.0-alpha.5, `@tauri-apps/api` `next` = 3.0.0-alpha.3. Trigger stays 3.0 stable.

Also verified, explicitly not a finding: today's `desktop.yml` reds (runs 38691760555, 06:10, 05:40 UTC) are still the designed O2 fail-closed signing gates — both `bundle-signed` legs red with the workflow's own T07 error, all four `cargo-check` triples green, `bundle-linux`/`linux-smoke`/`ui-purity` green. Known tradeoff, unchanged.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.4 out 2026-10-14: IPC/asset-protocol empty-path panic fix (#16197), mobile-plugin late-response panic→drop (#16146), iOS dev-server error msg (#16286). Lockfile committed at 2.12.3; dependabot weekly cargo live; no 2.12.4 PR yet (expected on the weekly tick) | 2.12.4 2026-10-14 (lockfile pins 2.12.3; 111,907★) | MIT / Apache-2.0 | 5 | **ADOPT** | The empty-path IPC panic is exactly our asset-protocol loading path. NEVR-191 closed the reproducibility loop; 2.12.4 rides the weekly dependabot PR — verify it applies clean, nothing else to do |
| **`tauri-runtime-cef`** (Tauri 3 CEF runtime) | **alpha.6** (2026-10-14): OSR with app-provided render handler + **IME/input/composition** (#16225), child API-version propagation (#16241), Chromium session-restore zombie-window fix, macOS overlay-titlebar mouse fix (#16275), CEF 154.5.0 | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 (tauri repo) | 2 | **WATCH** | The IME half of the Linux problem now has a code path in-tree. WebKitGTK tail 77 open (+1). Still alpha: trigger stays beta-with-selectable-runtime for the NEVR-72 spike brief |
| **Tauri 3.0-alpha track** | Core alpha.5 (2026-10-14) is dep-sync only; CLI npm `next` 3.0.0-alpha.5, api `next` 3.0.0-alpha.3 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Unchanged; trigger stays 3.0 stable |
| **GPUI Kit** (ex gpui-component) | No release since v0.7.3 (2026-10-12); 17,482★ (+200), pushed 2026-10-15. License clarified from primary source: Apache-2.0 code (LICENSE-APACHE) + CC BY 4.0 docs prose | v0.7.3 2026-10-12 | Apache-2.0 (+CC BY 4.0 docs) | 3 | **WATCH** | Unchanged — second UI stack in a language we don't use. Trigger: 1.0 + synchronized `gpui` crate |
| **Lynx** | `@lynx-js/react` 0.127.0 (2026-10-10) unchanged; repo 15,180★, pushed today | 4.1.0 / bindings 0.127.0 2026-10-10 | Apache-2.0 | 2 | **WATCH** | Unchanged: trigger remains bindings 1.0 + a desktop story |
| **Expo / React Native** | Expo SDK 57.0.29 (2026-10-14); RN 0.87.1 stable since 2026-08-26 — unchanged | as of 2026-10-15 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 (2026-10-08) unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | 8.5.3 (2026-10-07) stable unchanged; **9.0.0-alpha.8** now on npm `next` — major in flight | 8.5.3 / 9.0.0-alpha.8 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers the same ground; the 9 alpha doesn't change that |
| **Dioxus** | **0.8.0-alpha.2** (2026-10-14) — first 0.8 movement since July; stable still 0.7.10 | 0.8.0-alpha.2 2026-10-14 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged — 0.8 resuming does not touch our React single-codebase decision |
| **Flutter** | 180,197★, pushed today — steady | active 2026-10-15 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | Beta advanced 2.0.3-beta.24 → **2.0.3-beta.25** (2026-10-14); latest stable 2.0.2 (2026-09-29); repo pushed today | 2.0.3-beta.25 | MIT | 2 | **REJECT** | Unchanged |
| **`@axe-core/playwright`** | Still 4.13.0 (2026-08-11); rc channel 4.14.1 rolling. **NEVR-150 filed and todo** (created 10-13, scope verified: one dep + one spec) — brief landed, not yet built | 4.13.0 2026-08-11 | MPL-2.0 | 5 | **ADOPT** (pending) | Row stays open until NEVR-150 is built — still no `axe` in `apps/stellarc-ui/package.json` |

## Proposals

### 1. ADOPT — nothing new to file; keep one row open
Yesterday's ADOPT proposals both landed or were filed: NEVR-191 (Cargo.lock + dependabot) is **merged** (PR #98), NEVR-150 (a11y floor) is **filed and todo**. No new ADOPT emerged today. The only actionable note: when the weekly dependabot PR bumps the lockfile 2.12.3 → 2.12.4, treat it as a real review — #16197 fixes a panic on our exact IPC/asset-protocol path — not a rubber stamp. (No new issue brief for Talos this run.)

### 2. WATCH — CEF alpha.6 completes the OSR input half; NEVR-72 trigger unchanged
Alpha.6's app-provided IME/composition handler (#16225) is the piece yesterday's run said was missing. The remaining gates before the NEVR-72 spike brief adds "evaluate CEF on Linux": selectable runtime (today CEF is compile-time/feature-gated, not a runtime choice), beta-quality, and the wry WebKitGTK tail staying hot (77 open, +1). No action now; radar row updated.

### 3. Correction / book-keeping — GPUI Kit license + a run-environment trap
- GPUI Kit's GitHub license field reads NOASSERTION; the repo's own license section (primary source) says **Apache-2.0 for code**, CC BY 4.0 for docs prose. Radar corrected — Apache-2.0 was right for code, now with the docs caveat recorded.
- The repo layout moved under us this week (`ui/` → `apps/stellarc-ui`, `build.yml`/`e2e.yml` → `ci.yml`): yesterday's non-finding about `desktop.yml` checkout warnings still holds (8 `actions/checkout@v4` uses across ci.yml + desktop.yml) — cosmetic, Node-20 deprecation, still not worth a brief.

## Notable non-findings

- Web search backend not needed this run (GitHub + crates.io + npm covered all 12 rows).
- Desktop CI reds remain the designed O2 fail-closed signing gates (verified in run 38691760555: T07 error by name, all cargo-check legs green) — but maestro-desktop (T06) still has no green path while the secrets are absent.
- Open-PR stack is healthy: #90/#91/#92 (design-beat UI PRs) and #93 (NEVR-179 memory) still open — T02 freeze guard is the known blocker, owner decision pending, nothing for this beat.
