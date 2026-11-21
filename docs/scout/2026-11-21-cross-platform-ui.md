# Scout: cross-platform-ui — 2026-11-21

Beat: **cross-platform-ui**. Delta run over [2026-11-20](./2026-11-20-cross-platform-ui.md) (~24h). All radar rows re-verified against primary sources (GitHub REST incl. releases, tags, milestones, PR timestamps, job-level CI; crates.io API; npm registry), plus the Stellarc-side surfaces this beat owns: dev HEAD `8ef35aa9`, effect/v4 HEAD `e70393fc` (**unfrozen** — first movement in 6 days), `desktop/Cargo.lock` currency on **both** branches, the open lane PRs, the v4→dev merge-PR search, Dependabot, and the new-entrant sweep.

Method: `gh api`, crates.io API, npm registry — primary sources only.

## Headline

1. **THE LANE'S ONE ACTION EXECUTED: #308 merged 11-21 05:20Z — dev is current on the desktop quartet, and the fold direction flipped onto effect/v4.** Tree-verified at dev HEAD `8ef35aa9`: `desktop/Cargo.lock` pins tauri 2.12.7 / runtime-wry 2.12.5 / utils 2.10.4 / wry 0.57.3 = crates.io max_stable on all four (head-read this run). Two sibling merges landed in the same minute-burst: **#280** (NEVR-657 desktop checked seam writes — the update-honesty bundle's green-open half, to dev) and **#275** (the one-gate ui-typecheck-budget fix, base effect/v4), both 05:18Z. effect/v4 then UNFROZE at 05:21Z to `e70393fc` (NEVR-676 #294, the 2026-11-16 npm+cargo rotation; its cargo half moved v4's wry 0.57.1→0.57.2 but predates the 11-18 cohort) after 6 days at `9505c63d`. Consequence: **effect/v4's desktop/Cargo.lock now sits behind dev on ALL FOUR crates** (2.12.5/2.12.3/2.10.2/0.57.2, remote-verified at e70393fc) — the v4→dev merge must not carry an older lockfile back over dev's. Today's one ADOPT brief (proposal 1).

2. **Tauri: no tag past 2.12.7 — 2.13 endgame day 3 (14 open / 26 closed, +1 closed), trunk +3 with one substantive 2.13 rider.** #16556 `perf(core): reduce allocations on the event emit path`, plus icns 0.2 / phf 0.14 dep chores. The queued-four (#16398/#16506/#16522/#16521) are all merged on trunk, riding the next tag — which reads as the 2.13 minor. 113,034★ (+24), pushed 11-21 04:34Z. The next tag-day fold is the 2.13 minor — own brief, bigger bundler/mobile review surface (standing line).

3. **NSH: v0.6.1 stands as the newest tag — but ~95 PRs merged in the 28h behind it, and a nightly channel ships beside the tags.** Lane-relevant best: **#2722 fail sign-in at once where no link can bring the callback back** (OAuth callback-reachability honesty — OpenHands #19744's self-hosted OAuth law on native ground, second vendor), **#2681 a list's grown content is sent BEFORE the scroll that follows its end** (content-before-scroll ordering — §F family), **#2733 nshm resolves with versions, a lock and a shared installation** (package-grade dependency management — the ADR 0015 app-registry reference), #2711 a11y state words spoken in the user's language, #2720 formulas copy as their source, #2700/#2732 notifications NSH did not show pass to a native handler (handoff honesty), #2723 a cancelled fetch closes its connection. New surface modules: `push` (iOS remote notifications, #2729) and camera capture (#2692); #2699 embeds and signs iOS app extensions. 3,168★ (+45); license still NOASSERTION → reference-only.

4. **Rune day ~31: a focus-management cluster patterned on OpenCode Desktop, and untrusted math now renders sandboxed.** #1296 one keyboard focus ring "as OpenCode Desktop draws it", #1298/#1302 a control disabled while focused hands focus on (also when rebuilt, also mid-region), #1304 a roving group is one Tab stop, #1300 tooltips held open / keyboard-focus-opened at OpenCode's 600 ms, #1297 a field's ring only when keys put focus there — a coherent keyboard-focus law set from a codebase that keeps citing agent-tool UIs. Plus **#1294 sandboxed display math for latex/math fences** (untrusted content rendered inside a sandbox) and #1307 local-file video opening restricted on macOS/Windows. Zero tags; 7,718★ (+86); MIT; re-look at first tag or ~day 60.

5. **gpui-kit: quiet day 1** — zero merges since #4059 (11-20 06:45Z, confirmed by pushed_at); v0.10.0 stands; 21,113★ (+62). Zed shipped **1.29.3 stable** (11-20 16:10Z — prompt caching for reusable OpenAI system instructions on GPT-6.2+, Text Finder stale-results fix) with 1.30.2-pre beside it; gpui crate 0.2.2 stands; 95,445★ (+82), pushed 11-21.

6. **Stellarc ops: Foundation BOTH jobs green at dev HEAD — the enforced type budget holds; the bundle-signed pair is red on absent secrets for the 14th consecutive HEAD, and its fix (#289/#290, open since 11-16) is the desktop lane's post-#308 action.** #338 (NEVR-309 ACP 2.x permission-flow parity, test-only) opened on effect/v4. No v4→dev merge PR (re-searched, all states); Dependabot zero PRs ever; @axe-core/playwright 4.14.0 + `apps/web/e2e/a11y.spec.ts` verified at e70393fc (@playwright/test moved 1.65.0→1.65.1 in the rotation).

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **Tauri 2** (chosen shell) | #308 merged — **dev lockfile = max_stable quartet** (tree-verified); no tag past 2.12.7; 2.13 milestone **14 open/26 closed** (endgame day 3); trunk +3: #16556 event-emit allocation reduction + 2 dep chores; queued-four merged on trunk, riding next tag. 113,034★ (+24), pushed 11-21 04:34Z | 2.12.7 2026-11-18 | MIT / Apache-2.0 | 5 | **ADOPT** (dev current; v4 fold = proposal 1) | effect/v4 behind on all four (2.12.5/2.12.3/2.10.2/0.57.2 at e70393fc); next tag-day fold = the 2.13 minor |
| **NSH** (longbridge/nsh) | v0.6.1 newest tag; **~95 PRs merged post-tag + nightly channel**; #2722 OAuth callback-reachability honesty, #2681 content-before-scroll, #2733 nshm versions+lock+shared install, #2711 localized a11y state words, #2720 copy fidelity, #2700/#2732 notification handoff, #2723 fetch cancellation, `push`+camera modules, #2699 signed iOS app extensions. 3,168★ (+45) | v0.6.1 2026-11-20 | NOASSERTION | 3 | **WATCH** (elevated) | #2722 = 2nd vendor for the OAuth-callback law; #2681 = §F fold; #2733 = ADR 0015 reference; license keeps it reference-only |
| **Rune** (anomalyco/rune) | Focus cluster after OpenCode Desktop (#1296/#1298/#1302/#1304/#1300/#1297), #1294 sandboxed latex/math, #1307 local-file video restriction, #1291 SMIL icon animation, ~26 new merges. Zero tags; 7,718★ (+86) | pre-release 2026-11-21 | MIT | 2 | **WATCH** (elevated) | Keyboard-focus law set for any native client; sandboxed-untrusted-render is the agent-output answer; day ~31/90 |
| **GPUI Kit** (longbridge/gpui-kit) | Quiet day 1 (zero merges since #4059 11-20 06:45Z); v0.10.0 stands; 21,113★ (+62) | v0.10.0 2026-11-16 | NOASSERTION | 3 | **WATCH** | Reference-read at tag days, never pin |
| **Electrobun** (blackboardsh/electrobun) | Post-2.0.7: 3 direct commits, all DOCS (managed-hosting migration, Dash directory publishing, npm propagation); zero merged PRs. 13,104★ (+11) | v2.0.7 2026-11-20 | MIT | 2 | **WATCH** (gate ½) | Condition 2 (Windows/Linux maturation record) unmet; docs signal a hosted-services push, not platform substance; ADR 0013 unaffected |
| **Zed** (gpui upstream, context row) | **1.29.3 stable** 11-20 16:10Z (prompt-caching GPT-6.2+, Text Finder fix); 1.30.2-pre; gpui crate 0.2.2. 95,445★ (+82), pushed 11-21 | 1.29.3 2026-11-20 | GPL-3.0 (Zed) / Apache-2.0 (crate) | 4 | **WATCH** (context) | Synced-1.0-crate trigger intact |
| **tauri-runtime-cef** (context) | α.7 stands (crates re-read); #16391 404s again (flap continues); #16446 open, untouched since 11-02 | α.7 2026-11-06 | MIT / Apache-2.0 | 1 | **WATCH** | IME substance lives in the answer routes; trigger unchanged |
| **Tauri 3.0-alpha** | α.6 stands (crates prerelease line re-read); 3.0 milestone 11 open/5 closed | α.6 2026-11-06 | MIT / Apache-2.0 | 1 | **WATCH** | Trigger stays 3.0 stable |
| **Lynx** | 4.3.0-rc.1 still newest tag; `@lynx-js/react` 0.129.3; 15,268★ (+3), pushed 11-21 | 4.2.0 / 4.3.0-rc.1 | Apache-2.0 | 2 | **WATCH** | Trigger unchanged: bindings 1.0 + stable desktop |
| **Expo / React Native** | expo 58.0.26; RN 0.88.1 + 0.89.0-rc.2 — npm re-verified | 58.0.26 2026-11-17 | MIT | 5 | **REJECT** | Unchanged (ADR 0009 no-second-stack rule) |
| **react-native-web** | 0.21.4 unchanged — npm re-verified | 0.21.4 2026-10-08 | MIT | 3 | **REJECT** (signal) | Unchanged |
| **Capacitor** | `@capacitor/core` 8.6.2 + 9.0.0-rc.0 — npm re-verified | 8.6.2 2026-11-12 | MIT | 4 | **REJECT** | Unchanged; re-look only on mobile re-charter |
| **Dioxus** | 0.8.0-alpha.3 stands; trunk frozen since 11-13 (day 8). 39,865★ (+6) | 0.8.0-alpha.3 2026-10-16 | Apache-2.0 / MIT | 3 | **REJECT** | Unchanged |
| **Flutter** | 181,322★ (+16), pushed 11-21 — steady | active 2026-11-21 | BSD-3-Clause | 5 | **REJECT** | Unchanged |
| New-entrant sweep | `viva` 403★ (+6, pushed 11-21) — still the only framework threshold-crosser; FerroUI 325★ (+10, pushed 11-21); frust 34★ | 2026-11-21 | — | 1 | **WATCH** (new entrant) | No bearing on our stack; re-look at 1k★ or first release |
| **Stellarc ops** (this beat's surfaces) | dev `8ef35aa9` = #308; **Foundation both green incl. the enforced type budget** (job-verified), desktop red only the absent-secret `bundle-signed` pair (**14th consecutive HEAD**), maestro skipped; effect/v4 UNFROZE `e70393fc` (#294); #275/#280 merged 05:18Z; #286 open day 7; #289/#290 open since 11-16; #338 opened (NEVR-309 parity); no v4→dev PR (re-searched); Dependabot zero ever; a11y floor verified at e70393fc | 2026-11-21 | — | — | WATCH (ops) | Post-#308 the desktop action is the packaging pair (#289/#290), already filed; the v4 quartet fold is today's brief |

## Proposals

### 1. ADOPT (brief filed) — fold the desktop quartet onto effect/v4; one current lockfile before the v4→dev merge

dev is current (max_stable on all four, tree-verified); effect/v4 is behind on all four (remote-verified at `e70393fc` — #294's cargo half moved wry to 0.57.2 but not the 11-18 cohort). The v4→dev merge must not carry an older `desktop/Cargo.lock` back over dev's. Ready-to-file brief posted on the issue. NEVR-536 playbook: one fold, one executor, re-verify the base at merge time (the #234 collision lesson); if 2.13 tags first, retarget once rather than folding twice (standing rule).

### 2. WATCH (fold lines) — OAuth callback reachability, content-before-scroll, package-grade nshm, keyboard-focus law set, sandboxed math

- **(a) OAuth callback reachability** — NSH #2722: sign-in fails at once where no link can bring the callback back. Second vendor after OpenHands #19744 (the callback must be the URL the browser can reach). Native-desktop datapoint for the pre-registered MCP-lane OAuth law.
- **(b) Content before scroll** — NSH #2681: a list's grown content is sent before the scroll that follows its end. Ordering law for the §F family / the reading-position row: content changes paint before any scroll they trigger, never after.
- **(c) Package-grade nshm** — NSH #2733: versions + lock + shared installation for nsh components. The ADR 0015 app-registry reference gains its dependency-management half (our registry installs at boot; theirs resolves with a lock).
- **(d) Keyboard-focus law set** — Rune #1296/#1298/#1302/#1304: one focus ring, drawn only for keyboard focus; a control disabled while focused hands focus on; a roving group is one Tab stop. Acceptance lines for any native client surface (the ADR 0013/0015 clients story).
- **(e) Sandboxed untrusted render** — Rune #1294: latex/math fences render inside a sandbox. The agent-output rendering answer for any rich/math surface (apps/web renders agent markdown; no math renderer pinned today — the line applies when one is).

### 3. EXECUTE (no new brief) — the desktop lane's post-#308 action is already filed

#289/#290 (signed packaging as an explicit operator action) close the 14-HEAD red `bundle-signed` pair; open since 11-16, no scout action needed. The 2.13 tag-day fold gets its own brief when the tag lands (standing rule).

**No second ADOPT brief today**: everything else on the lane is either current, pre-registered, or another lane's vehicle.

## Notable non-findings

- No tauri tag past 2.12.7 / runtime-wry 2.12.5 / utils 2.10.4 / wry 0.57.3 (crates.io head-read); no 2.13 tag (milestone 14/26); no CEF α.8; no tauri 3.0-α.7.
- No gpui-kit 0.10.1 (quiet day 1); no Rune tag (~day 31); Zed 1.30 stays pre; no Lynx 4.3.0 stable; no Dioxus α.4 (trunk frozen day 8); expo/RN/rn-web/Capacitor flat (npm re-verified).
- No v4→dev merge PR (searched, all states); effect/v4 moved for the first time in 6 days but carries no apps/web-affecting scout action; Dependabot zero PRs ever (re-verified).
- No mobile re-charter signal; the lane stays retired (ADR 0009).
- Electrobun's post-stable window is docs-only — condition 2 of the re-look gate still unmet.
