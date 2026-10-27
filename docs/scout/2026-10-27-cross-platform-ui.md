# Scout: cross-platform-ui — 2026-10-27

Beat: **cross-platform-ui**. Delta run over [2026-10-26](./2026-10-26-cross-platform-ui.md) (1 day): all 14 radar rows re-verified against primary sources (GitHub REST incl. Actions logs, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns (desktop CI at current dev HEAD, the tauri pin, dependabot, the PR stack — and a mobile lane this beat had never looked at until today).

Method: `gh api`, crates.io API, npm registry — primary sources only; the web-search backend is still the unregistered `9router` provider (5 queries, 5 errors — fourth straight day). GitHub + registries covered every row.

## Headline

1. **Stellarc has a mobile CI lane — on a branch, red, and five weeks stale.** `gh workflow list` shows a **Mobile** workflow (id 361903093); it does not exist on `dev` (`.github/workflows` there = `ci.yml` + `desktop.yml` only). It lives on `forge/stl-23` (a3a4977 "feat(mobile): Tauri 2 mobile shell skeleton, flows, landmark manifest, CI"). Its only run (35427326418, 2026-09-19) failed all three mobile cargo-check triples (x86_64-apple-ios, aarch64-apple-ios, aarch64-linux-android) plus `mobile-tests`; `ios-smoke`/`android-smoke` skipped. Nothing since — the branch is untouched 5+ weeks. ADR 0009 promises web + desktop + **mobile**; today desktop has a green lane and mobile has a September prototype nobody landed. Proposal 2 asks Talos to pick: land behind skip-gates (the T07 `bundle-signed` pattern) or archive with the decision written down. Either is fine; silent rot is the only bad outcome.

2. **The Tauri pickup case turned security-flavored.** Trunk merged `chore(deps): update vulnerable Zstandard dependencies` this morning (7e39750, 10-27 02:16) — it now sits in the open #16365 v2 release-train PR (updated 10-27 02:27), so the queued 2.12.6 carries a dependency-vulnerability fix on top of the Linux touch-resize fix #16368, the mobile dev-proxy fix #16376, and onScaleChanged PhysicalSize #16381. Meanwhile `desktop/Cargo.lock` verified **still pins tauri 2.12.3 — day 6** — with the #16197 panic fix unabsorbed, and dependabot is still dead (default branch re-verified `main` today; zero dependabot-authored PRs in repo history). New brief this run (proposal 1): stop bundling the bump with the dependabot repair — one manual lockfile bump, decoupled.

3. **The reference stream is on a hot streak — NSH especially.** Three same-day movers: **NSH v0.3.0** (10-26 12:51; 748★, +71 in a day; RichEditor — a ProseMirror-style rich text editor #494; a plot kit — Pie/Arc #501, Bar with band scales/stacks/groups; Slider #510; a WGSL Shader view #517; `Accessible::accessibility_elements_hidden`; iOS VoiceOver increment/decrement actions; CSS properties as typed native styling). **GPUI Kit v0.8.1** (10-26; repo renamed gpui-component → **gpui-kit**, redirect live; source-breaking changes explicitly deferred out of the release; input wrap-reuse during live resize #3691). **Lynx 4.2.0** (tagged 10-26 03:34; DevTool touch-scroll gesture state machine, synthetic gestures on the "Clay" desktop runtime, lightweight SDK event bridge, root causes preserved in native errors). None changes a verdict — licenses and stacks still say reference-only — but NSH is now writing the a11y + text-editing chapters of the agent-authored-UI story this scout flagged on 10-26.

One good Stellarc data point on top: at dev HEAD (#136, 10-27 01:42) the desktop workflow is fully in its designed shape — **linux-smoke green** (second green since the 10-25 flake; it did not recur), ui-purity green, all four cargo-check triples green, bundle-linux green, bundle-signed mac+win red only on the absent T07 secrets, maestro-desktop skipped. And the 10-26 hardening brief was picked up within a day: **NEVR-328 is open PR #132, MERGEABLE**.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still latest. Trunk since 10-26: perf inline `parse_json`/`parse_json5` #16402 + **`update vulnerable Zstandard dependencies` 7e39750 (10-27)** — both queue behind #16365 (v2 train, open, updated 10-27 02:27). 112,218★ (+23). Lockfile verified **still 2.12.3, day 6** (#16197 panic fix unabsorbed) | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** | The 2.12.6 pickup is no longer just hygiene — it queues a vuln fix + Linux touch + mobile dev-proxy fixes. Manual-bump brief filed this run, decoupled from the dead dependabot path |
| **Tauri 3.0-alpha track** | No new alpha (crate α.5 10-14; npm `next` = 3.0.0-alpha.5). #16334 still open, last updated 10-21 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **`tauri-runtime-cef`** | α.6 stands. Same **7 open `fix(cef)` PRs**. WebKitGTK keyword tail **69 open** (flat, in churn band). IME quartet all still open — #16391 (0 comments, no triage), #15924, #15436, #11412 | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Desktop-input risk list unchanged; NEVR-72 CEF-spike gate unchanged |
| **GPUI Kit** | **Repo renamed: gpui-component → gpui-kit** (GitHub redirect live). **v0.8.1 released 10-26** — "Defer source-breaking changes from v0.8.1" (f07fa6a) then Bump v0.8.1 (99576db); input: reuse measured wraps during live resize #3691. 18,676★ (+49), pushed 10-27 | v0.8.1 2026-10-26 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Rename + a patch release that deliberately defers source breaks = entering maintenance cadence; still the transcript-editor reference stream; trigger stays 1.0 + synced `gpui` crate |
| **NSH / Native Shell** | **v0.3.0 (10-26 12:51), 748★ (+71/day)**. ~30 commits since 10-26: **RichEditor — ProseMirror-style rich text editor #494**, plot kit (Pie/Arc #501, Bar with band scales, stacks, grouped), Slider #510, **WGSL Shader view #517**, `Accessible::accessibility_elements_hidden`, iOS VoiceOver increment/decrement actions, CSS properties as typed native styling, incremental dev web-runtime builds #429. License still NOASSERTION | v0.3.0 2026-10-26 | Other (NOASSERTION — custom) | 2 | **WATCH** (reference, elevated) | Now covers the a11y + rich-text + charts chapters of agent-authored UI — the densest single reference mine for Stellarc's TSX-runtime questions; never a dep until a real license lands |
| **Lynx** | **4.2.0 tagged 10-26 03:34** (was 4.1.2): DevTool touch-scroll gesture state machine, synthetic gestures on Clay desktop, lightweight SDK event bridge, live callback contexts preserved in ElementTemplate, root causes preserved in native errors. Bindings `@lynx-js/react` 0.129.0 unchanged (10-23, pre-1.0). 15,215★ (+5), pushed 10-27 | 4.2.0 2026-10-26 | Apache-2.0 | 2 | **WATCH** | Desktop work continues (Clay) but DevTool-oriented; trigger unchanged: bindings 1.0 + a stable, verified desktop story |
| **Stellarc mobile lane** (forge/stl-23) | Tauri 2 mobile shell skeleton + flows + landmark manifest + **mobile.yml CI** (a3a4977). Only run 2026-09-19: all 3 mobile cargo-check triples + `mobile-tests` **failure**; ios/android-smoke skipped. No run since; branch untouched 5+ weeks; no mobile lane on `dev` | a3a4977, run 2026-09-19 | — | 1 | **WATCH** (decision) | ADR 0009's mobile promise currently lives in a red September prototype; land behind skip-gates or archive — proposal 2 |
| **Expo / React Native** | Expo SDK 58.0.19; RN 0.88.0 latest, `next` 0.88.0-rc.6 — all unchanged | as of 2026-10-27 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 unchanged; repo pushed 10-22 | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` 8.5.3; `next` 9.0.0-alpha.8 — unchanged | 8.5.3 2026-10-07 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers |
| **Dioxus** | 0.8.0-alpha.3 (10-16) stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,383★ (+3), pushed 10-27 — steady | active 2026-10-27 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | v2.0.5 stable (10-26) stands as latest; 12,971★ (+9), pushed 10-26 | 2.0.5 2026-10-26 | MIT | 2 | **REJECT** | Unchanged (macOS-centric) |
| **@axe-core/playwright** | 4.14.0 stands (`next` = 4.14.1-55245d5 snapshot). NEVR-150 re-verified `todo`; **no axe consumer anywhere in `apps/` `packages/` `desktop/`** (grep 10-27) | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built |

## Proposals

### 1. ADOPT — manual Tauri lockfile bump, decoupled from the dependabot repair (brief below)

Six days pinned at 2.12.3 while trunk queued a dependency-vulnerability update into the 2.12.6 train. The dependabot flip is an owner settings action that has not moved in 6 days; the bump itself is one lockfile edit a Builder can do today (scout doesn't touch code). Ready-to-file brief posted in this run's issue comment.

### 2. Ops — decide the mobile lane: land behind skip-gates, or archive (forge/stl-23)

See headline 1. Not a dependency decision — roadmap hygiene. If mobile stays in ADR 0009's promise set, the skeleton should land on dev with its smokes behind T07-style skip-gates so it stops rotting invisibly; if it slips, archive the branch and write the slip into ADR 0009's platform notes. Talos picks the end state; this scout asks that it be picked.

### 3. Book-keeping — PR stack state

- **#130 (scout libraries 10-26) is now CONFLICTING and its unique payload (`docs/scout/2026-10-26-libraries.md`) still isn't on dev** — #136 (the 10-27 libraries run) merged without it. The next libraries run should either rebase #130 to recover the doc or close it and re-file the doc; the INDEX rows already carry its content.
- **#123 (scout competitors 10-23) still CONFLICTING** — day 4 of rot against every scout merge.
- #132 (NEVR-328 smoke hardening) open + MERGEABLE, picked up a day after the brief; #134/#135 (NEVR-332 onsystem trial) open, #134 MERGEABLE. #87 day 14; #115/#118 mergeable, red only on known gates.
- This run's PR edits `INDEX.md` and therefore conflicts with #130/#123 by construction — noted in the PR body.

## Notable non-findings

- Web-search backend still down (5/5 `9router` provider errors — fourth straight day); GitHub + crates.io + npm + Actions logs covered every row.
- WebKitGTK tail flat at 69 (in the documented churn band); the 7 open `fix(cef)` PRs are the same seven; all four IME issues open with zero comment movement, including the Windows TSF freeze.
- Desktop CI otherwise in the designed O2 shape at dev HEAD #136: only reds are the intended absent-secret `bundle-signed` pair; `maestro-desktop` skipped as designed.
- Lynx 4.2.0's "Clay" desktop work is DevTool-facing; still no stable desktop story to verify against — trigger unchanged.
