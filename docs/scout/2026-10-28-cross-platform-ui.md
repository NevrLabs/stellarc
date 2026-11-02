# Scout: cross-platform-ui — 2026-10-28

Beat: **cross-platform-ui**. Delta run over [2026-10-27](./2026-10-27-cross-platform-ui.md) (1 day): all 14 radar rows re-verified against primary sources (GitHub REST incl. Actions, crates.io API, npm registry), plus the Stellarc-side surfaces this beat owns (desktop CI at current dev HEAD #139, the tauri lockfile pin, dependabot, the PR stack — and what happened to the mobile lane this beat asked about yesterday).

Method: `gh api`, crates.io API, npm registry — primary sources only; the web-search backend is still the unregistered `9router` provider (fifth straight day). GitHub + registries covered every row.

## Headline

1. **The mobile lane question answered itself — by deletion.** Yesterday's proposal 2 asked Talos to pick: land the `forge/stl-23` mobile skeleton behind skip-gates, or archive it in writing. Nobody wrote the decision down, but the branch is **gone** (`gh api .../branches/forge/stl-23` → 404; commit a3a4977 no longer fetchable; verified **not** in dev history). The Mobile workflow (id 361903093) is still *registered* at `.github/workflows/mobile.yml`, but **no branch carries the file** — a ghost workflow whose only ever run stays the red 2026-09-19 one. Meanwhile `docs/adrs/0009-development-workflow.md` still promises **web + desktop + mobile (Android/iOS) from one React codebase** with Maestro mobile flows "when those stages land". So the end state is the worst of the two options offered: archived silently, with the ADR still contradicting reality. Proposal 1 (brief filed) is the docs-only fix: record the slip in ADR 0009's platform notes — or re-charter mobile with intent. Either is fine; the silent version is the only bad one, and it's where we are.

2. **Yesterday's Tauri bump brief was picked up same-day and is now green, waiting on merge.** NEVR-340 was filed, went `in_review`, and is **PR #138** (opened 10-27 08:11): lockfile-only bump tauri 2.12.3 → 2.12.5. Verified in the Actions logs: all four cargo-check triples green on 2.12.5, `bundle-linux` green, `linux-smoke` green, `ui-purity` green — red only on the intended absent-secret `bundle-signed` pair and the informational `ui-typecheck-budget`. dev's `desktop/Cargo.lock` still pins **2.12.3 — day 7** (#16197 panic fix unabsorbed), so the remaining move is a review/merge, nothing else. Upstream, 2.12.5 is still crates.io latest (no commits to trunk today; the #16365 v2 train last moved 10-27 02:27 and still queues the zstd vulnerability fix + Linux touch + mobile dev-proxy fixes as 2.12.6). Merging #138 now loses nothing — 2.12.6 will be one small follow-up bump when it ships.

3. **The reference stream keeps sprinting — NSH is compounding.** NSH: **801★ (+53 in one day, +7%)**, ~30 commits since 10-27, and the base kit is filling in exactly the slots a tracker UI needs: `DatePicker`/`Calendar`/`TimeField` (#598), `Combobox` (#585), app-styled `Scrollbar` (#579), plot `colorScale` for categorical marks (#592), reverse scales (#587), pie labels on leader lines (#595), animated re-draws (#594), per-element typed refs (#593), editor row scroll-into-view (#604), plus web-runtime keyboard/test-infra fixes. GPUI Kit: 18,711★ (+35), 10 commits 10-27→28 — activatable submenu rows (#3714), app-resolved icon paths (#3633), theme-configured cursor blinking (#3713), editor popups painting above dialogs (#3700), a selectable-text paint fix (#3699), a **shutdown deadlock fix during layout cleanup** (#3697), and diff line decorations with interactive gutter markers (#3703). Neither changes a verdict — NSH is still license-NOASSERTION, GPUI Kit still pre-1.0 — but NSH is now writing the forms-and-widgets chapter on top of the a11y/rich-text/charts chapters it shipped Monday.

One good Stellarc data point on top: desktop CI at dev HEAD **#139** (8c4b419, push 10-27 13:33) holds the designed O2 shape — `ui-purity`, all four cargo-check triples, `bundle-linux`, `linux-smoke` green; red only on the absent-secret `bundle-signed` pair; `maestro-desktop` skipped as designed.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | 2.12.5 still crates.io latest (10-21). Trunk **quiet today** — last commit is still the zstd vulnerability bump 7e39750 (10-27 02:16); #16365 v2 train open, last updated 10-27 02:27, 0 comments. 112,249★ (+31). Lockfile **day 7 at 2.12.3** — but the fix is in flight: **PR #138 (NEVR-340) green on all cargo triples + smokes**, awaiting merge | 2.12.5 2026-10-21 | MIT / Apache-2.0 | 5 | **ADOPT** | The pickup case got stronger all week: panic fix unabsorbed 7 days, zstd vuln fix queued in 2.12.6. Remaining action = merge #138; follow-up bump when 2.12.6 ships |
| **Tauri 3.0-alpha track** | No new alpha (crate α.5 10-14; npm `next` cli = α.5, api = α.3). #16334 open, untouched since 10-21 | 3.0.0-alpha.5 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Trigger stays 3.0 stable |
| **`tauri-runtime-cef`** | α.6 stands. **Same 7 open CEF-tinged PRs** (6 strict `fix(cef)` + 1 bundler/cef — re-paged all 176 open PRs to confirm the set unchanged). WebKitGTK tail **69 open, flat**. IME quartet all still open with zero comment movement — #16391 (0 comments, no triage), #15924, #15436, #11412 | 3.0.0-alpha.6 2026-10-14 | MIT / Apache-2.0 | 2 | **WATCH** | Desktop-input risk list unchanged; NEVR-72 CEF-spike gate unchanged |
| **GPUI Kit** | v0.8.1 stands. 10 commits 10-27→28: submenu rows activatable #3714, app-resolved icon paths #3633, cursor blinking via theme #3713, editor popups above dialogs #3700, selectable-text paint fix #3699, **text shutdown-deadlock fix #3697**, reference-style Markdown images #3683, diff line decorations + interactive gutter markers #3703. 18,711★ (+35), pushed 10-28 | v0.8.1 2026-10-26 | Apache-2.0 (code) / CC BY 4.0 (docs) | 3 | **WATCH** (elevated) | Still the transcript-editor reference stream; the diff-decoration + gutter-marker work lands one widget closer to a review surface. Trigger stays 1.0 + synced `gpui` crate |
| **NSH / Native Shell** | v0.3.0 stands. **801★ (+53/day)**, ~30 commits since 10-27: `DatePicker`/`Calendar`/`TimeField` #598, `Combobox` #585, app-styled `Scrollbar` #579, plot `colorScale` #592 + reverse scales #587 + pie leader-line labels #595 + animated re-draw #594, typed per-element refs #593, editor scroll-into-view #604, web keyboard/test-infra fixes. License still NOASSERTION | v0.3.0 2026-10-26 | Other (NOASSERTION — custom) | 2 | **WATCH** (reference, elevated) | The forms-and-widgets layer arrived on top of a11y/rich-text/charts — now the densest single reference mine for Stellarc's TSX-runtime questions across every UI category we'd need; never a dep until a real license lands |
| **Lynx** | 4.2.0 **release object published 10-27 15:44** (tag was 10-26) — notes carry PrimJS 4.2.1 related-deps bumps only; the feature list is as reported Monday (DevTool gestures, Clay desktop synthetic input). Bindings `@lynx-js/react` 0.129.0 unchanged (10-23). 15,217★, pushed 10-28 | 4.2.0 2026-10-27 | Apache-2.0 | 2 | **WATCH** | Release notes confirm the desktop work is DevTool-facing; trigger unchanged: bindings 1.0 + a stable, verified desktop story |
| **Stellarc mobile lane** (was forge/stl-23) | **Branch deleted** (404), commit a3a4977 unreachable, verified not in dev history. Mobile workflow id 361903093 still registered but no branch carries `mobile.yml` — ghost workflow. **ADR 0009 still promises Android/iOS** from one React codebase + Maestro mobile flows | deleted by 2026-10-28 | — | 1 | **WATCH** (ADR drift) | Yesterday's land-or-archive question resolved as archive-by-deletion with no decision recorded; ADR 0009 now contradicts reality — proposal 1 files the docs fix |
| **Expo / React Native** | expo 58.0.20 (10-27), RN 0.88.1 (10-27) — patch bumps only; `next` 0.88.0-rc.6 unchanged | as of 2026-10-28 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 names it) |
| **react-native-web** | 0.21.4 unchanged | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` 8.5.3; `next` 9.0.0-alpha.8 — unchanged | 8.5.3 2026-10-07 | MIT | 4 | **REJECT** | Unchanged — Tauri mobile covers (if mobile ever returns) |
| **Dioxus** | 0.8.0-alpha.3 (10-16) stands; stable 0.7.10 | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 180,495★ (+112), pushed 10-28 — steady | active 2026-10-28 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| **Electrobun** | v2.0.5 stable (10-26) stands; 12,978★ (+7), last pushed 10-26 | 2.0.5 2026-10-26 | MIT | 2 | **REJECT** | Unchanged (macOS-centric) |
| **@axe-core/playwright** | 4.14.0 stands; `next` moved to a **new snapshot hash** 4.14.1-794589b (10-27) — snapshot only, pin latest only. NEVR-150 still todo; **no axe consumer anywhere in `apps/` `packages/` `desktop/`** (grep re-verified 10-28) | 4.14.0 2026-10-15 | MPL-2.0 | 5 | **ADOPT** (pending) | Row open until NEVR-150 is built |

## Proposals

### 1. ADOPT — record the mobile slip in ADR 0009, and retire the ghost Mobile workflow (brief below)

Docs-only. ADR 0009 (`docs/adrs/0009-development-workflow.md`) promises Android/iOS from the one React codebase with Maestro mobile flows; as of today there is no mobile code, no branch, and no lane — only a registered workflow whose file exists on no branch. Either the ADR's platform notes record the slip (mobile deferred, responsive web layer still under test as the mobile surrogate — which the ADR already built: 4 Playwright viewport projects incl. two touch-mobile ones), or mobile is re-chartered with intent. The brief below writes the slip version; if Talos wants mobile back instead, the same ticket becomes the re-charter. One extra line in the brief retires the ghost workflow so a future "why is there a Mobile workflow with no file" question never has to be asked.

### 2. Ops — merge PR #138 (NEVR-340, the tauri 2.12.3 → 2.12.5 lockfile bump)

No new brief — the issue exists and is `in_review`. The PR is lockfile-only, green on every meaningful check (4× cargo-check, bundle-linux, linux-smoke, ui-purity), red only on the absent-secret `bundle-signed` pair and the informational typecheck budget. Day 7 of dev pinning 2.12.3 while carrying the #16197 panic-fix gap; the zstd vuln fix queued for 2.12.6 makes the follow-up cadence worth starting now.

### 3. Book-keeping — PR stack state

- **#140 (scout libraries 10-28, today's earlier run) is MERGEABLE** — but it does **not** recover `docs/scout/2026-10-26-libraries.md`; **#130 remains the only carrier of that doc and is CONFLICTING — day 8**. The next libraries run should recover the doc or close #130 with the INDEX rows acknowledged as the record.
- **#123 (scout competitors 10-23) still CONFLICTING — day 12** of rot against every scout merge.
- #138 green awaiting merge (proposal 2); #134 MERGEABLE; #115/#118 MERGEABLE, red only on known gates; #87 day 15.
- This run's PR edits `INDEX.md` and therefore conflicts with #130/#123/#140 by construction — noted in the PR body.

## Notable non-findings

- Web-search backend still down (5/5 `9router` provider errors — fifth straight day); GitHub + crates.io + npm + Actions logs covered every row.
- Tauri trunk had **zero commits today** (since 00:00 UTC 10-28) — first quiet day after three heavy ones; nothing to chase.
- WebKitGTK tail flat at 69; the 7 CEF-tinged PRs are the same seven (confirmed by paging all 176 open PRs); all four IME issues open with zero comment movement.
- Lynx 4.2.0's formal release notes add nothing beyond Monday's tag read — PrimJS 4.2.1 dependency bumps only.
- No new Tauri alpha, no Dioxus α.4, no Capacitor movement, no react-native-web movement, no Electrobun release.
