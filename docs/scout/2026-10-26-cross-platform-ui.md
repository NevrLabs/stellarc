# Scout: cross-platform-ui — 2026-10-26

Beat: **cross-platform-ui**. Delta run over [2026-10-25](./2026-10-25-cross-platform-ui.md) (1 day): all 13 radar rows re-verified against primary sources (GitHub REST incl. Actions logs, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns (dependabot flip, desktop CI at current dev HEAD, open-PR stack).

Method: `gh api`, crates.io API, npm registry — primary sources only; no web-search backend registered this run (same as 10-24/10-25). Grounding unchanged: ADR 0009 §Target platforms — one React codebase, **Tauri 2** shell, web + desktop + mobile, no second UI stack.

## Headline

Three findings, one of them on our own CI:

1. **linux-smoke went red at dev HEAD — first observed red — and the evidence says flake, not regression.** At b32c053 (run 40173716961, 10-25 07:41) the smoke job failed with `FAIL: app pid 3141 died before creating a window` under `xvfb-run`. The green run 15h earlier (3fc3f12, run 40098595286, 10-24 13:38: `PASS: window-created + health-probe logged`) used the **same runner image (20261021.618) and installed the same libwebkit2gtk-4.1 2.52.6**, and the only commit between them is yesterday's docs-only scout merge. Decisive third point: **linux-smoke passed again today on PR #130's checks** (job 121352641753, 10-26 01:22). Verdict: one-off flake, most likely an Xvfb/app-startup race. *Corrected in triage (Talos, 10-26):* the first draft of this headline claimed the script never tails the app log on FAIL — wrong. `desktop/scripts/launch-smoke.sh` already `cat`s the **entire** captured app log on the pid-death FAIL path (and `tail -8` on the never-appeared path); the red run printed nothing after the pid-death line because the captured log was **empty** — the app died before emitting any output. Likewise the runner image and libwebkit2gtk versions were already in the job log (Runner Image group + apt install lines). The classification work was real (three log pulls, hand-diffing environment) but the gap is narrower than first stated: what's missing is a one-bounded-retry for the startup race and an explicit "app log was empty (N bytes)" marker so pre-output death is visible as such. Retry brief filed this run (proposal 1).

2. **Electrobun v2.0.5 went stable today** (10-26 01:18), closing the β.2→β.5 train we tracked landing within 3 days. Release notes are changelog-link-only. Verdict stays REJECT (macOS-centric, second stack); the row moves to "stable line current".

3. **The Tauri v2 patch train is moving again: #16365 ("Apply Version Updates From Current Changes") is open and was updated this morning** — merging it releases the next 2.12.x set. Trunk since 2.12.5: two dep bumps merged today (jsonschema 0.60 #16378, minisign 0.10 #16382) plus a real fix trio — `fix(api)` onScaleChanged returns PhysicalSize #16381, `fix(mobile)` preserve original URL on mobile dev proxy #16376, `fix(linux)` touch resize drag only on TouchBegin #16368 (closes #16276). Nothing urgent for us, but the Linux touch fix and the mobile dev-proxy fix are both in our shell's lane. Our pickup is unchanged and still blocked: `desktop/Cargo.lock` pins tauri 2.12.3 (day 5) and the dependabot repair has not happened — default branch re-verified `main` today, zero dependabot-authored PRs in repo history.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still latest; trunk active again (+2 dep commits today). **#16365 v2 release-train PR open, updated 10-26** — 2.12.6 queues api onScaleChanged PhysicalSize #16381, mobile dev-proxy URL #16376, **Linux touch-resize #16368**. 112,195★ (+25). `desktop/Cargo.lock` verified **still pins 2.12.3** — #16197 panic fix unabsorbed, day 5 | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** | Pickup path unchanged: dependabot flip (still pending, day 5) or a one-line manual bump; 2.12.6 will be worth folding when it lands for the Linux touch + mobile dev-proxy fixes |
| **Tauri 3.0-alpha track** | No new alpha; crate α.5 + npm `next` α.5 stand. #16334 v3 version-update PR still open (updated 10-21, unstable) — the v2 train (#16365) is the one moving | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **`tauri-runtime-cef`** | α.6 stands. CEF hardening in core unchanged: same **7 open `fix(cef)` PRs**. WebKitGTK keyword tail **69 open** (flat, inside churn band 68↔78). IME: #16391 still open, **0 comments — no triage movement**; `ime in:title` shows 4 open across all three desktop platforms (macOS #15924, Windows #16391 + #15436 WebView2/CJK, Linux #11412) | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | IME bug class spans all three platforms we ship — keep the desktop-input risk list; NEVR-72 CEF-spike gate unchanged |
| **GPUI Kit** | v0.8.0 stands; **7 commits today, all text/text-selection/diff depth**: per-frame selection snapshots #3686, word/line drag-selection #3681, list/blockquote style overrides #3687, TextView image-source resolver #3694, truncated-diff hunks #3688, caller-owned focus handle #3684. 18,627★ (+29), pushed today | v0.8.0 2026-10-19 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | The text-editing polish sprint is exactly our transcript-editor reference stream; trigger stays 1.0 + synced `gpui` crate |
| **NSH / Native Shell** | 677★ (**+57 in one day**), 10 commits today: text-engine hit testing #424, springs/timings as component props #470, theme tokens read on first render #478, macOS unclipped-overflow text #476, Android input centering #480. v0.2.0 stands; license still NOASSERTION | v0.2.0 2026-10-22 | Other (NOASSERTION — custom) | 1 | **WATCH** (reference) | Velocity confirms the reference-stream call: text hit-testing + host-configured capabilities are the shapes to mine for agent-authored UI |
| **Lynx** | 4.1.2 tagged 10-24 = primjs 4.1.1 dep-sync across Android/iOS/Harmony. Bindings `@lynx-js/react` 0.129.0 unchanged (10-23). 15,210★, pushed today | 4.1.2 2026-10-24 | Apache-2.0 | 2 | **WATCH** | Trigger stays bindings 1.0 + a stable, verified desktop story |
| **Expo / React Native** | Expo SDK 58.0.19 unchanged; RN 0.88.0 latest (10-15), `next` 0.88.0-rc.6, 0.89-nightly rolling (today's build exists) | as of 2026-10-26 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core`/`cli` 8.5.3 latest, `next` 9.0.0-alpha.8, nightly 8.5.4 (10-23) — unchanged. Note: the bare `capacitor` npm package is a stale 0.5.6 legacy artifact — always query the `@capacitor/*` scope | 8.5.3 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers |
| **Dioxus** | 0.8.0-alpha.3 stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,380★ (+16), pushed 10-25 — steady | active 2026-10-25 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **v2.0.5 stable released today** (10-26 01:18) — the 2.0.5-β.2→β.5 train landed. 12,962★ (+5), pushed today. Notes are changelog-link-only | 2.0.5 2026-10-26 | MIT | 2 | **REJECT** | Verdict unchanged (macOS-centric); row now on a current stable line |
| **`@axe-core/playwright`** | 4.14.0 stands; `rc`/`next` carry 4.14.1 snapshots. NEVR-150 re-verified `todo` — no `axe` consumer in the tree | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built |

## Proposals

### 1. ADOPT — harden linux-smoke: one bounded launch retry + empty-log legibility (brief below)

*Premise corrected in triage (Talos, 10-26):* the original proposal asked for "print the last ~50 lines of the app log on FAIL" — the script already does strictly more (`cat "$log"` of the whole file on every pre-window FAIL path, `tail -8` on the never-appeared path), and the runner-image/WebKitGTK echo is likewise already in the job log. The red run showed nothing after the pid-death line because the captured log was **empty** — the app died before emitting output. What survives triage: retry the launch once after a short backoff (the observed failure was a one-off startup race), and make the empty-log case self-describing (print the log's byte count / a marker before the cat) so "died pre-output" is distinguishable from "log not shown". Ready-to-file brief posted on this run's issue for Talos.

### 2. Ops — Tauri 2.12.5 pickup: day 5, still one owner action

Nothing changed: default branch re-verified `main` today; zero dependabot PRs in history; NEVR-310 (the 10-24 scout issue) is closed `done` as a run, but the dependabot brief's owner action has not been taken. New context only: the 2.12.6 train (#16365) is queued with a Linux touch fix and a mobile dev-proxy fix in our lane, so the manual-bump option now buys slightly more than #16197 alone.

### 3. Book-keeping — PR stack state

- **#123 (scout competitors, 10-23) is `dirty`/conflicting** — still not rebased; it rots further with every scout merge (INDEX.md). Needs a rebase before the next competitors run.
- **#130 (scout libraries, today) is open and unstable** — red only on the known pair (bundle-signed O2 secrets + ui-typecheck-budget informational). It also edits `docs/scout/INDEX.md`, so **this run's PR conflicts with it**; whichever merges first, the other rebases — noted in the PR body.
- #87 day 13 (oldest open scout PR, owner look requested); #115/#118 stacked on `agent/nevr-223`, mergeable, red only on T02/O2/informational; #127/#128 T02-gated by design.

## Notable non-findings

- No web-search backend registered this run (same 9router error as 10-24/10-25); GitHub + crates.io + npm + Actions logs covered every row.
- WebKitGTK tail flat at 69 (inside the documented churn band); the 7 open `fix(cef)` PRs are the same seven as yesterday — CEF hardening steady, no new entrants.
- Desktop CI otherwise in the designed O2 shape at dev HEAD b32c053: `bundle-signed` mac+win red on absent secrets (T07), `ui-purity`/`bundle-linux`/all four `cargo-check` triples green, `maestro-desktop` skipped, `ui-typecheck-budget` red-informational. The linux-smoke red was the only deviation, and it did not reproduce today.
- GPUI Kit's GitHub license field reads NOASSERTION (multi-license repo layout) — the Apache-2.0 (code) / CC BY 4.0 (docs) characterization from prior runs still holds; no change.
