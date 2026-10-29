# Scout: cross-platform-ui — 2026-10-29

Beat: **cross-platform-ui**. Delta run over [2026-10-28](./2026-10-28-cross-platform-ui.md) (1 day): all 14 radar rows re-verified against primary sources (GitHub REST incl. Actions, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns — dev HEAD #144, the freshly merged tauri lockfile bump, the ADR 0009 amendment, the ghost Mobile workflow, desktop CI shape, and the scout PR stack.

Method: `gh api`, crates.io API, npm registry — primary sources only; the web-search backend is still the unregistered `9router` provider (sixth straight day). GitHub + registries covered every row.

## Headline

1. **Both of yesterday's proposals landed within hours — this beat's two oldest Stellarc-side rows close.** (a) **PR #138 (NEVR-340) merged 10-28 18:27**: dev's `desktop/Cargo.lock` verified at `tauri 2.12.5` — the #16197 panic-fix gap is absorbed, day-7 lockfile rot is over, and the decoupled manual-bump playbook (NEVR-340) is proven for the next exercise. (b) **PR #142 (NEVR-351) merged**: ADR 0009 now reads *"accepted (2026-09-08; amended 2026-10-28 — mobile platform deferred)"*, records the `forge/stl-23` branch deletion and the unreachable head commit verbatim, gates mobile's return on an explicit owner re-charter, and keeps the four Playwright viewport projects as the mobile surrogate; the ghost Mobile workflow (id 361903093) is now `disabled_manually`. NEVR-351 and NEVR-328 (linux-smoke hardening) are both `done`. Nothing is left open from yesterday.

2. **The reference stream is now writing the chapters we actually lack.** NSH: **857★ (+56 in one day, +7%)**, ~15 commits today — the headliner is **rich_editor showing IME compositions inline with steady candidates (#686)**: the exact input-class risk we track on Tauri's IME quartet, solved in the open, in a TSX-runtime shell. Also `Pagination` (#690), text selections held across virtual-list rows (#692), checked menu items (#688), a native tab-list indicator (#687), one bounded image/SVG pipeline with `svg()` (#674), `ErrorBoundary` fallback params (#685), and `testID` parity for Rust components (#561). GPUI Kit: 18,749★ (+38), 13 commits today — **gutter and overview-ruler decorations (#3704)** is the editor-becomes-review-surface widget landing one week after the diff decorations; plus speech widgets (#3725/#3726), a native touch-selection opt-out (#3723), and virtual_list geometry rebuilds (#3719/#3720). Neither changes a verdict (NSH still license-NOASSERTION, GPUI Kit still pre-1.0), but both are compounding at a rate that makes them the default first stop for hard UI questions.

3. **Tauri itself is quiet — and the 2.12.6 queue is now changelog-verified.** 2.12.5 remains crates.io latest (no release since 10-21); trunk has one docs-only commit since the zstd bump. The #16365 v2 train (updated 10-28 12:46) carries the verified 2.12.6 entries: **Linux touch-resize crash fix (#16368)** — every touch event near an undecorated-window border starting another resize drag — **mobile dev-proxy path fix (#16376)**, and the dep train (wry 2.12.4, utils 2.10.3, macros/build 2.7.5). One NEVR-340-style manual lockfile bump when it ships; nothing to do today.

Stellarc CI at dev HEAD **a68abc4** holds the designed O2 shape: `ui-purity`, all four cargo-check triples, `bundle-linux`, `linux-smoke` green; red only the absent-secret `bundle-signed` pair; `maestro-desktop` skipped. One-off blemish: the Foundation workflow failed **at the #138 merge commit itself** (`foundation` job, "Unit and real PostgreSQL integration bridge" step + the informational budget) and is green on both later commits (410f5ad, a68abc4) — same one-off class as the 10-25 linux-smoke flake; no action unless it recurs.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still crates.io latest; trunk quiet (one docs commit 548a369 10-28). **2.12.6 queue changelog-verified via #16365**: Linux touch-resize crash #16368 + mobile dev-proxy #16376 + dep train (wry 2.12.4). **dev lockfile CURRENT at 2.12.5** (#138 merged 10-28 18:27, verified in `desktop/Cargo.lock`). 112,285★ (+36) | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** (current) | Shell absorbed to latest; next action is one NEVR-340-style manual bump when 2.12.6 ships |
| **Tauri 3.0-alpha track** | No new alpha (crate/npm cli α.5, api α.3); #16334 open, untouched since 10-21 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **`tauri-runtime-cef`** | α.6 stands. CEF-titled open PRs **corrected to 6** (5 `fix(cef)` + 1 `bundler/cef`) — no CEF PR has closed since 10-14, so yesterday's "7" overstated by one. WebKitGTK open tail **80 — new high** above the 68↔78 churn band. IME quartet all open, zero movement (#16391 still 0 comments) | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Desktop-input risk list unchanged; NEVR-72 CEF-spike gate unchanged; the 80-tail is worth one glance next run |
| **GPUI Kit** | v0.8.1 stands. 13 commits 10-29: **gutter + overview ruler decorations #3704**, speech waveform/voice display #3725/#3726, native touch-selection opt-out #3723, palette rows named after items #3728, ordered-list numbering past Z #3722, virtual_list geometry rebuilds #3719/#3720, popover focus-on-close #3718, toolbar wrap search #3716. 18,749★ (+38), pushed 10-29 | v0.8.1 2026-10-26 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | The review-surface widget set (diff decorations last week, gutter/ruler now) is arriving in order; trigger stays 1.0 + synced `gpui` crate |
| **NSH / Native Shell** | v0.3.0 stands. **857★ (+56/day)**, ~15 commits 10-29: **rich_editor IME compositions inline with steady candidates #686**, `Pagination` #690, selections across virtual-list rows #692, checked menu items #688, native tab-list indicator #687, bounded image/SVG pipeline + `svg()` #674, `ErrorBoundary` fallback params #685, `testID` for Rust components #561, test-infra fixes. License still NOASSERTION | v0.3.0 2026-10-26 | Other (NOASSERTION — custom) | 2 | **WATCH** (reference, elevated) | The IME-composition work is the open reference for exactly the input class that gates our CEF/WebKitGTK risk; forms + charts + rich-text + IME — never a dep until a real license lands |
| **Lynx** | 4.2.0 stands; trunk pushed 10-29, 15,225★ (+8); bindings `@lynx-js/react` 0.129.0 unchanged | 4.2.0 2026-10-27 | Apache-2.0 | 2 | **WATCH** | Trigger unchanged: bindings 1.0 + a stable, verified desktop story |
| **Stellarc mobile lane** | **RESOLVED**: ADR 0009 amended 10-28 — mobile deferred as of 2026-10, branch deletion recorded, return gated on owner re-charter; ghost Mobile workflow (361903093) `disabled_manually`; NEVR-351 `done` | amended 2026-10-28 | — | 1 | **RESOLVED** (row retires) | The ADR-vs-reality contradiction is closed; reopen only if mobile is re-chartered |
| **Expo / React Native** | expo 58.0.21 (10-28, patch); RN 0.88.1 stands; `next` 0.88.0-rc.6 unchanged | as of 2026-10-29 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names the no-second-stack rule) |
| **react-native-web** | 0.21.4 unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` **8.6.0 (10-28, minor)**; `next` moved **9.0.0-alpha.8 → 9.0.0-beta.0** — the 9 line entered beta | 8.6.0 2026-10-28 | MIT | 4 | **REJECT** | Unchanged verdict (no second stack); re-look only if mobile is re-chartered — by then 9.x will be the line to evaluate |
| **Dioxus** | 0.8.0-alpha.3 (10-16) stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,516★ (+21), pushed 10-29 — steady | active 2026-10-29 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **2.0.6-beta.1 (10-28) + beta.2 (10-29)** — first release cadence after 2.0.5; 12,983★ (+5), pushed 10-29 | 2.0.6-beta.2 2026-10-29 | MIT | 2 | **REJECT** | Still macOS-centric; note the cadence restarted — if a stable 2.0.6 lands with Linux marks, re-read once |
| **@axe-core/playwright** | 4.14.0 stands; `next` = 4.14.1-794589b snapshot (10-27) — pin latest only. **NEVR-150 still `todo`**; no axe consumer in the dev tree | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built |

## Proposals

### 1. Ops (dated trigger, no brief today) — one NEVR-340-style manual lockfile bump when Tauri 2.12.6 ships

The queue is changelog-verified in the #16365 train: the Linux touch-resize crash fix (#16368 — a crash class, every touch near an undecorated-window border starting a resize drag), the mobile dev-proxy path fix (#16376), and the dep train (wry 2.12.4). The playbook exists and is proven: NEVR-340 went brief → PR → merge in one day. Nothing to file until the tag exists.

### 2. Book-keeping — the scout PR debt is now two lost docs deep, and it crosses beats

`docs/scout/2026-10-26-libraries.md` (sole carrier: #130) and `docs/scout/2026-10-28-libraries.md` (sole carrier: #140) are **both absent from dev** — #144 merged yesterday carrying the 10-29 report + INDEX only, and it flipped #140 from MERGEABLE to CONFLICTING. #123 (competitors 10-23) is day 13. The next libraries run should land one docs-only recovery PR carrying both missing reports at their PR-head content (or close #130/#140 with the INDEX rows acknowledged as the record). This run's PR edits `INDEX.md` and therefore conflicts with #130/#123/#140 by construction — noted in the PR body.

### 3. No-action note — one-off Foundation flake at the #138 merge commit

Foundation failed at e2a5409 (`foundation` job, "Unit and real PostgreSQL integration bridge" step, plus the informational budget job) and is green on both later dev commits. Same one-off class as the 10-25 linux-smoke flake, and NEVR-328 already hardened that lane's retry posture. No brief unless it recurs.

## Notable non-findings

- Web-search backend still down (sixth straight day, `9router` unregistered); GitHub + crates.io + npm + Actions covered every row.
- No Tauri 2.12.6, no 3.0-α.6, no Dioxus α.4, no Lynx release, no react-native-web movement, no @axe-core/playwright 4.14.1 (snapshot only), no @lynx-js/react bump.
- Tauri trunk: exactly one docs-only commit since the 10-27 zstd bump — quiet day.
- IME quartet (#16391, #15924, #15436, #11412): all open, zero comment movement; #16391 still 0 comments = still no triage.
- Dependabot: zero PRs ever, re-verified — the flip to `dev` remains the owner's settings action; the manual playbook covers meanwhile.
