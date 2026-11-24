# Scout: cross-platform-ui — 2026-11-24

Beat: **cross-platform-ui**. Delta run over [2026-11-21](./2026-11-21-cross-platform-ui.md) (3 days). All radar rows re-verified against primary sources (GitHub REST incl. releases, tags, milestones, merged-PR searches, job-level CI; crates.io API; npm registry), plus the Stellarc-side surfaces this beat owns: dev HEAD `1884f601`, effect/v4 HEAD `54e6b372`, `desktop/Cargo.lock` on **both branches and on the open fold/rotation PR heads**, the open lane PRs, the v4→dev merge-PR search, and the new-entrant sweep.

Method: `gh api`, crates.io API, npm registry — primary sources only.

## Headline

1. **THE 11-21 FOLD COLLIDED WITH THE ROTATION: #352 subsumes #343 — one closure owed, zero new code.** The 11-21 brief (fold the desktop quartet onto effect/v4) was executed same-day as **#343 (NEVR-767)** and has sat open for 3 days. The 11-23 rotation **#352 (NEVR-791, "npm + cargo")** touches the same `desktop/Cargo.lock` on the same base — and its head tree-verifies at the **max_stable quartet** (tauri 2.12.7 / runtime-wry 2.12.5 / utils 2.10.4 / wry 0.57.3, read at `origin/chore/deps-2026-11-23` this run). #343's entire diff is one file (`desktop/Cargo.lock` +76/−21), fully inside #352's delta = **strict subset**; per the fold-lane consolidation law it closes superseded before the vehicle merges. Today's one ADOPT brief (proposal 1). dev's lockfile re-verified current at `1884f601`; effect/v4 stays behind on all four at `54e6b372` until #352 lands.

2. **gpui-kit v0.11.0 TAGGED 11-23 12:56Z — first tag past v0.10.0, seven days after it; 27 merged PRs in the window.** Tag substance: #4090 a11y text-run memory reduction on large documents, #4082 report the document length so the iOS keyboard shows, #4063 inline-code text kept between frames (the first-frame family), #4062 a Presence that starts closed reports **Absent, not Running** (status honesty on native ground), #4060 the Linux X11 backend becomes OPTIONAL (the embedding law's third codebase), #4071 single-line inputs drop tabs like newlines, #4078 left-side scrollbars, #4064 resizing skips hidden panels, #4080 lockfile ×8 RustSec advisories — and **#4089 ships a Claude Code plugin**: the design-capability-via-skill channel reaches a component library. 21,270★ (+157).

3. **NSH: v0.6.1 stands, 266 merged PRs in the 3-day window (accelerating), nightly channel alongside.** Lane-relevant best: the Windows IME pair **#3024 report what an input method composes WHILE it composes** + #3026 enable the IME only in the focused field's window; **input-size honesty #2972 pasteMaxSize — pasted files over a limit arrive UNREAD** beside #2968 apps read the files the user pastes or drops; a11y #2995 a toast announces ONCE when it moves parent + #3036 toggle pressed state in a11y queries; #2979 altGraph modifier (AltGr honesty); Taffy 0.16 (#2989/#3058); #2980 build an nshm-only app with the installed nsh (embedding law's fourth codebase); Android selection cluster #3019–3023. 3,333★ (+165).

4. **Rune: THE BURST — 422 merged PRs in the window, 291 on 11-23 alone** (was ~26 per 3 days; per-day sanity-checked 21/23/291/87). Zero tags, day ~34. The burst is a GPU/stability sprint: **#1833 fall back across adapters and report an error when a GPU rejects the last-resort shader**, **#1837 software adapter after repeated device losses with 5-minute forgiveness** (GPU failure classification — the failure-class lane's sibling on the graphics side), #1848 the first window draws without waiting for the desktop portal (startup honesty), #1855 macOS catches event-loop-callback panics and resumes unwind, #1869 modal→modal focus returns to the original opener, #1826 i18n locale messages as a file beside the exe. 7,901★ (+183).

5. **Tauri: no tag past 2.12.7; the 2.13 minor gains its first two substantive riders.** #9380 (menu-item handler builder feat) + #15411 (tao window_target main-thread fix, an 8-month-old PR) both carry milestone=2.13 — the queued tag payload grows to SIX; trunk also merged #16620 (on_menu_event handler leak fix, no milestone) and #16606 (nsis_tauri_utils 0.6.1) plus mobile chores (AGP 9.5.2, cargo-mobile2 0.23.0). 2.13 milestone 12 open / 28 closed. 113,098★ (+64).

6. **Stellarc ops: Desktop red on the absent-secret pair for the 15th consecutive HEAD; #289/#290 open day 8.** Foundation both green at `1884f601` (job-verified: red ONLY bundle-signed macos+windows; ui-purity, cargo-check ×4, bundle-linux, linux-smoke green; maestro skipped). effect/v4 moved to `54e6b372` (NEVR-736 §D D2 law — design lane). #322 (pins-current advisory) + #324 (fold runbook) landed 11-21; **#345 (NEVR-774 keyboard-focus §H1–H5 — this beat's 11-21 fold-lines) open on v4**. No v4→dev merge PR (re-searched, all states). @axe-core/playwright content re-verified at v4 head; dev still lacks apps/web.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | No tag past 2.12.7; 2.13 milestone 12/28 (+2 closed: #9380 feat + #15411 window fix, both milestone=2.13); trunk +11 incl. #16620 menu-event leak fix, #16606 nsis bundler 0.6.1, AGP 9.5.2 / cargo-mobile2 0.23.0 mobile chores. 113,098★ (+64) | 2.12.7 2026-11-18 | MIT / Apache-2.0 | 5 | **ADOPT** (dev current; v4 fold rides #352) | dev lockfile re-verified current; v4 behind until #352; the 2.13 tag-day fold = own brief |
| **GPUI Kit** | **v0.11.0 TAGGED 11-23** — 27 PRs in window; a11y memory (#4090), iOS keyboard (#4082), first-frame text (#4063), status honesty (#4062), X11 optional (#4060), RustSec ×8 (#4080), Claude Code plugin (#4089). 21,270★ (+157) | v0.11.0 2026-11-23 | NOASSERTION | 3 | **WATCH** (elevated) | Reference-read at tag days, never pin; #4062/#4060 are contract datapoints |
| **NSH** | v0.6.1 stands; **266 PRs/3d** + nightly; Windows IME pair #3024/#3026, pasteMaxSize #2972, fs paste/drop #2968, a11y #2995/#3036, altGraph #2979, Taffy 0.16, nshm-only build #2980, Android selection cluster. 3,333★ (+165) | v0.6.1 2026-11-20 | NOASSERTION | 3 | **WATCH** (elevated) | Input-size honesty + IME family growth; license keeps it reference-only |
| **Rune** | **422 merged in window, 291 on 11-23 alone**; GPU failure classification #1833/#1837, portal-less first frame #1848, macOS panic catch #1855, modal focus return #1869, i18n beside exe #1826. Zero tags; day ~34. 7,901★ (+183) | pre-release 2026-11-24 | MIT | 2 | **WATCH** (elevated) | Hyper-accelerating pre-release; GPU-honesty laws for any native client; re-look at first tag |
| **Electrobun** | Beta train RESUMED: 2.0.8-beta.0 (11-21) → beta.3 (11-23) → **beta.5 (11-24)**; zero merged PRs (direct pushes); bodies = compare links only. 13,104★ (flat) | v2.0.8-beta.5 2026-11-24 | MIT | 2 | **WATCH** (gate ½) | Condition 2 (Windows/Linux maturation record) unmet; ADR 0013 unaffected |
| **Zed** (gpui upstream, context) | 1.29.3 stable stands; 1.30.2-pre; gpui crate 0.2.2 stands. 95,598★ (+153) | 1.29.3 2026-11-20 | GPL-3.0 (Zed) / Apache-2.0 (crate) | 4 | **WATCH** (context) | Synced-1.0-crate trigger intact |
| **tauri-runtime-cef** | α.7 stands (crates re-read); #16391 404s again (flap continues, re-probed); #16446 open untouched since 11-02 (re-verified) | α.7 2026-11-06 | MIT / Apache-2.0 | 1 | **WATCH** | Trigger unchanged |
| **Tauri 3.0-alpha** | α.6 stands (crates re-read); 3.0 milestone 11 open/5 closed | α.6 2026-11-06 | MIT / Apache-2.0 | 1 | **WATCH** | Trigger stays 3.0 stable |
| **Lynx** | 4.3.0-rc.1 still newest tag; @lynx-js/react 0.129.4 (npm re-verified). 15,274★ (+6) | 4.2.0 / 4.3.0-rc.1 | Apache-2.0 | 2 | **WATCH** | Trigger unchanged: bindings 1.0 + stable desktop |
| **Expo / React Native** | expo 58.0.26; RN 0.88.1; next 0.89.0-rc.2→**rc.3** — npm re-verified | 58.0.26 2026-11-17 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 no-second-stack rule) |
| **react-native-web** | 0.21.4 stands; canary 0.22.0-canary-20261120 — npm re-verified | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | @capacitor/core 8.6.2 + 9.0.0-rc.0 stand — npm re-verified | 8.6.2 2026-11-12 | MIT | 4 | **REJECT** | Unchanged; re-look only on mobile re-charter |
| **Dioxus** | trunk UNFROZE after 8 days: #6104 FreeBSD/BSD dx support + #6078 clippy (11-21/22); α.3 stands. 39,891★ (+26) | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged; re-look at α.4 |
| **Flutter** | 181,399★ (+77), pushed 11-24 — steady | active 2026-11-24 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| New-entrant sweep | viva 416★ (+13/3d, accelerating) — still the only framework threshold-crosser; FerroUI 331★ (+6); frust 35★ (+1); two NEW >250★ finds are APPS, not frameworks: capcraft-android 364★ (AGPL, off-lane) + ThinkTerm 262★ (agent-native terminal — signal) | 2026-11-24 | — | 1 | **WATCH** (new entrant) | No framework bearing; ThinkTerm noted as signal |
| **Stellarc ops** (this beat's surfaces) | dev `1884f601`; Desktop red ONLY the bundle-signed pair — **15th consecutive HEAD** (job-verified), Foundation both green; #289/#290 day 8; **#352 subsumes #343** (proposal 1); v4 `54e6b372` (D2 law landed); #322/#324 landed 11-21; #345 (keyboard-focus §H) open; no v4→dev PR; axe floor verified at v4 head | 2026-11-24 | — | — | WATCH (ops) | The fold's vehicle is the rotation; the closure + merge-time re-verify are today's actions |

## Proposals

### 1. ADOPT (brief filed) — close #343 as superseded by #352; the quartet fold rides the rotation

The 11-21 brief's vehicle (#343/NEVR-767) is a **strict subset** of the 11-23 rotation #352: same base (effect/v4), same single file (`desktop/Cargo.lock`), and #352's head tree-verifies at the max_stable quartet. One fold, one executor — close #343 superseded BEFORE #352 merges (the 11-21 execution closed its six subsets ten minutes before the vehicle; the law is proven). Merge-time line: re-verify #352's lockfile against crates.io max_stable at merge (refresh-at-merge); if 2.13 tags first, retarget #352's quartet pins ONCE rather than folding twice (the 2.13 minor gets its own brief — bigger bundler/mobile review surface).

### 2. WATCH (fold lines) — IME live composition, paste-size honesty, status honesty, embedding law ×4, GPU failure classification

- **(a) IME live composition on Windows** — NSH #3024 (report what the IME composes while it composes) + #3026 (IME enabled only in the focused field's window). The answer-route family's 4th/5th datapoints (after NSH #1994, gpui-kit #3939/#3965, Rune #740) — the IME bar for any native client surface.
- **(b) Input-size honesty at the paste seam** — NSH #2972 pasteMaxSize (pasted files over a limit arrive UNREAD, never silently truncated) + #2968 (apps read pasted/dropped files through a declared seam). The §F composer acceptance line when apps/web's composer accepts files: a paste over a limit is reported unread, and file access rides a declared capability, not ambient access.
- **(c) Status honesty on native ground** — gpui-kit #4062: a Presence that starts closed reports Absent, not Running. Same law as the §G status family; third codebase after the Multica/Paseo precedents.
- **(d) The embedding law reaches four codebases** — gpui-kit #4060 (Linux X11 backend optional) + NSH #2980 (nshm-only app build) join NSH #2022/#2014: build only what the app reaches. Standing ADR 0015 input.
- **(e) GPU failure classification** — Rune #1833/#1837: fall back across adapters, software adapter after repeated device losses with a forgiveness window, and an ERROR when the last resort rejects. Desktop-GPU sibling of the failure-class lane (NEVR-670) — fold lines for any native client's graphics stack.

### 3. EXECUTE (no new brief) — the standing actions are already filed or owned

#289/#290 (signed packaging opt-in) at day 8 — the 15-HEAD red streak persists; no scout action needed. The 2.13 tag-day fold gets its own brief when the tag lands (standing rule); its queued payload now carries SIX merged riders (#16398/#16506/#16522/#16521 + #9380 + #15411).

**No second ADOPT brief today**: everything else on the lane is either current, pre-registered, or another lane's vehicle.

## Notable non-findings

- No tauri tag past 2.12.7 / runtime-wry 2.12.5 / utils 2.10.4 / wry 0.57.3 (crates.io + releases re-read); no 2.12.8; no 2.13 tag (milestone 12/28); no CEF α.8; no tauri 3.0-α.7.
- No Rune tag (day ~34, burst notwithstanding); no gpui-kit 0.11.1; Zed 1.30 stays pre; no Lynx 4.3.0 stable (but @lynx-js/react moved 0.129.4); no Dioxus α.4 (trunk unfroze with BSD/clippy only).
- Expo/RN/rn-web/Capacitor flat except RN's rc.3 (npm re-verified); no mobile re-charter signal (ADR 0009 stands).
- No v4→dev merge PR (searched, all states); #289/#290 unchanged; Dependabot zero PRs ever (re-probed this run).
