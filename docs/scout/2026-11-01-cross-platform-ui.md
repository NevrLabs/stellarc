# Scout: cross-platform-ui — 2026-11-01

Beat: **cross-platform-ui**. Delta run over [2026-10-31](./2026-10-31-cross-platform-ui.md) (1 day; that report is on dev via #154). All 14 radar rows re-verified against primary sources (GitHub REST incl. job-level CI, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns: dev HEAD, CI shape at HEAD, `desktop/Cargo.lock`, NEVR-150, and scout PR hygiene.

Method: `gh api`, crates.io API, npm registry — primary sources only.

## Headline

1. **Tauri 2.12.6 is now a fully-merged queue waiting on nothing but its tag.** All nine fixes in the #16365 train are **merged on trunk** (verified one by one): #16368 Linux touch-resize 10-22, #16376 mobile dev-proxy 10-22, #16436 dev-server asset paths 10-31, #16060 NSIS/MSI CI-service 10-21, #16362/#16361 NSIS Farsi/Hebrew 10-22/10-21, #14712 iOS ExportOptions 10-21, #15773 iOS signing from pbxproj 10-21, #16381 `onScaleChanged` PhysicalSize 10-23. The release vehicle #16365 itself is open and untouched since 10-31 02:11; trunk has exactly one commit since 10-28 (#16436, 10-31 02:03) and zero on 11-01 through ~11:30Z. crates.io still `2.12.5` (2026-10-21) and our `desktop/Cargo.lock` still pins 2.12.5 — **current**, nothing to do today. The same-day NEVR-340-style bump trigger is armed; because every fix is already on trunk, the tag could land any day.

2. **The CEF open set grew to 9 — genuine growth this time, not a counting correction.** New: **#16441 (created 2026-11-01), `fix(cef)`: drop libEGL and libGLESv2 DLLs from Windows bundling** — the first new CEF PR since #16431 (10-29). Set now = 7 `fix(cef)` + 1 `fix(bundler)` + 1 `feat(cef)`. WebKitGTK open tail **73, flat** (the 68↔78 band holds). IME quartet frozen: all open, zero comment movement, #16391 still **0 comments** after 13 days.

3. **GPUI Kit: day 3 of zero main-branch commits — but the repo is demonstrably not abandoned.** Last main commit is still #3730 (10-29 10:12, speech/terminal privacy disclaimer). Meanwhile the events stream shows PR activity today (10:09–10:54Z) and `pushed_at` = 11-01 00:52 — the pause is a main-branch lull while work continues in PRs, and stars keep climbing (18,842, +26). The "re-think the elevated tag" trigger stays day-7; unfired at day 3.

4. **Stellarc side is exactly where the 10-31 report left it, re-proven at the new HEAD.** dev advanced 8 commits since 10-31 02:42 — **all scout docs merges (#154–#158), zero application code**. CI at HEAD `1e2260d` verified job-level this run: Foundation green; desktop = bundle-linux / linux-smoke / ui-purity / all four cargo-check triples green, maestro-desktop skipped, red only the absent-secret `bundle-signed` pair — the designed O2 shape holds. NEVR-150 (axe a11y floor) still `todo`; no dependabot branch in the open PR list (still zero dependabot PRs ever).

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still crates.io latest (no release since 10-21). Trunk: exactly one commit since 10-28 (#16436, 10-31 02:03), none on 11-01 through ~11:30Z. **All nine 2.12.6 queue PRs merged** (verified individually — see headline 1); vehicle #16365 open, untouched since 10-31 02:11 — **the tag is the only remaining step**. dev lockfile re-verified CURRENT at 2.12.5 | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** (current) | Same-day NEVR-340-style manual lockfile bump the day 2.12.6 tags — queue covers bundler, iOS, dev-server, Linux touch: all surfaces we exercise |
| **Tauri 3.0-alpha track** | No new alpha — crates α.5, npm cli `next` α.5, api `next` α.3 all re-verified; #16334 (v3 vehicle) open, untouched since 10-21 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable; the v2 tag is the live event |
| **`tauri-runtime-cef`** | α.6 stands (10-14). CEF-titled open PRs **9 = 7 `fix(cef)` + 1 `fix(bundler)` + 1 `feat(cef)`; new this run: #16441 (11-01) drops libEGL/libGLESv2 DLLs from Windows bundling** — first new CEF PR since #16431 (10-29). WebKitGTK open tail **73 flat**. IME quartet frozen (#16391 0 comments, day 13) | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Desktop-input risk list unchanged; NEVR-72/NEVR-377 gates unchanged; #16441 is bundler hygiene on the alpha runtime, not on our wry path |
| **GPUI Kit** | v0.8.1 stands. **Zero main commits since 10-29 10:12 = day 3** — but PR events today (10:09–10:54Z) and `pushed_at` 11-01 00:52: the pause is main-branch only, work continues in PRs. 18,842★ (+26) still climbing. `gpui` crate 0.2.2 (pre-1.0, updated 10-30) | v0.8.1 2026-10-26 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Trigger stays 1.0 + synced `gpui` crate; re-think the elevated tag if the main pause passes a week (day 7) |
| **NSH / Native Shell** | v0.3.0 stands. **Zero commits after the 10-31 01:01 batch** (the five already covered: #717/#740/#732/#737/#736). 911★ (+11 — cooled band, +6→+11/day vs the first wave's +56/+37). License still NOASSERTION | v0.3.0 2026-10-26 | Other (NOASSERTION — custom) | 2 | **WATCH** (reference, elevated) | IME-composition (#686) and cross-platform testing references stand; never a dep until a real license lands |
| **Lynx** | 4.2.0 stands; trunk pushed 11-01 10:15 (active), 15,227★; bindings `@lynx-js/react` 0.129.1 (10-30) re-verified | 4.2.0 2026-10-27 | Apache-2.0 | 2 | **WATCH** | Trigger unchanged: bindings 1.0 + a stable, verified desktop story |
| **Stellarc mobile lane** | Retired row: ADR 0009 amended 10-28, mobile deferred, return gated on owner re-charter. No re-charter signal this run | amended 2026-10-28 | — | 1 | **RESOLVED** (retired) | Reopen only on re-charter |
| **Expo / React Native** | expo 58.0.22 (10-31, patch); RN 0.88.1 + `next` 0.88.0-rc.6 stand — nightlies only | as of 2026-11-01 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names the no-second-stack rule) |
| **react-native-web** | 0.21.4 unchanged, re-verified | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` 8.6.0 stands; `next` 9.0.0-beta.0 (10-28) stands — the 9 line stays in beta | 8.6.0 2026-10-28 | MIT | 4 | **REJECT** | Unchanged; re-look only if mobile is re-chartered |
| **Dioxus** | 0.8.0-alpha.3 (10-16) stands; stable 0.7.10; no α.4 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,888★ (+123), pushed 10-31 22:32 — steady | active 2026-10-31 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | **2.0.6-beta.9 (10-30) still newest — nothing on 11-01** (repo pushed 10-30 13:51). 12,992★ (+2). Body re-scan of all 8 releases: **zero Linux mentions** | 2.0.6-beta.9 2026-10-30 | MIT | 2 | **REJECT** | Cadence cooled with us; re-read once only if a stable 2.0.6 lands with Linux marks |
| **@axe-core/playwright** | 4.14.0 stands; `next`/`rc` are snapshots only (10-27/10-30). **NEVR-150 still `todo`**; no axe consumer in the dev tree | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built — descope steer in proposal 2 |
| **Stellarc CI at dev HEAD** (ops row) | **Designed O2 shape holds, job-level verified at `1e2260d` (11-01 01:58)**: Foundation success; desktop = bundle-linux, linux-smoke, ui-purity, 4× cargo-check green; red only the absent-secret `bundle-signed` pair; maestro-desktop skipped. dev's 8 new commits since 10-31 02:42 are all scout docs merges | observed 2026-11-01 | — | 4 | **WATCH** (ops) | Unchanged; #147 merge remains the owner call |

## Proposals

### 1. Ops (dated trigger, no brief until the tag) — Tauri 2.12.6 bump

The delta vs 10-31 is qualitative: the queue stopped being open work — all nine fixes are merged on trunk, and #16365 is a version-bump vehicle waiting to ride. The trigger is unchanged mechanically (bump the day it tags, NEVR-340 playbook: brief → PR → merge in one day) but the expected latency dropped to "any day now". Because the queue touches bundler, iOS, dev-server and the Linux touch path — all surfaces we exercise — same-day stays the right call over waiting for the next lockfile-rot pass. No brief today: nothing exists to bump yet (crates.io still 2.12.5; our lockfile current).

### 2. Steer (existing issue, no new brief) — descope NEVR-150 to an axe smoke-floor

The axe row has been ADOPT-pending since 10-15 with NEVR-150 sitting `todo` — the a11y floor keeps losing to the T02-frozen UI lane it isn't actually part of. Concrete steer for when it's picked up: scope the first cut to **serious/critical violations only on 3 core routes** (login/board/run-transcript), asserting zero known violations, with the full rule set deferred to a follow-up. The suite targets the built app in a Playwright viewport — it adds a devDependency and test wiring, not UI-source edits, so it should not ride the T02 `ui-purity` freeze; verify that when filing.

### 3. No-action notes

- **GPUI Kit's day-3 pause reframed**: main is quiet but the PR stream ran today — reads as integration lull, not abandonment. Verdict unchanged; day-7 re-think trigger armed.
- **CEF #16441** is Windows-bundler hygiene on the alpha CEF runtime — irrelevant to our wry path today, relevant only to the shape of the eventual CEF lane.
- **NSH star velocity settled** into a cooled band (+6→+11/day) while commit quality stays high — consistent with attention settling, not stalling.
- **New-entrant sweep** (`cross-platform gui`, created >2026-09-01, >300★): only NSH again — the roster is not missing an entrant.

## Notable non-findings

- No Tauri 2.12.6 tag, no trunk commits on 11-01 through ~11:30Z, no 3.0-α.7 / cli α.6, no `tauri-runtime-cef` α.7, no Dioxus α.4, no Lynx release, no react-native-web movement, no @axe-core/playwright 4.14.1 stable (snapshots only), no RN/Capacitor movement of any kind, one expo patch.
- IME quartet (#16391, #15924, #15436, #11412): all open, zero comment movement; #16391 still 0 comments.
- WebKitGTK open tail 73 — flat; churn band holds.
- Dependabot: still zero PRs ever (open list has no dependabot branch); the flip to `dev` remains the owner's settings action.
- NEVR-150 untouched; #147 (NEVR-378 launch-smoke fix) still open — owner call, unchanged.
