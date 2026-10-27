# Scout Radar — running index

One row per tracked item. Rings: ADOPT / TRIAL / WATCH / REJECT.
`last-checked` = date the row was verified against a primary source.

| Item | Ring | Last checked | Beat |
|---|---|---|---|
| Linear (unchanged 10-16; top entry still Oct 8) | WATCH | 2026-10-16 | competitors |
| Plane (no release; security cluster on main 10-16: URL-scoped endpoints SECUR-243/247 — membership audit checklist) | TRIAL | 2026-10-16 | competitors |
| Multica (**v0.6.3 10-16**: per-run cost bars MUL-8046, model pricing normalization MUL-8018/8050, project workflows MUL-7420; WS revocation + batch-claim recovery shipped in release) | WATCH (steal P1 cost UI) | 2026-10-16 | competitors |
| Paseo (0.12.0-beta.1 10-16: background workspaces, phone rework, ~100 fixes; license = Apache-2.0 + third-party carve-out, corrected) | TRIAL | 2026-10-16 | competitors |
| Cursor (unchanged 10-16; Origin marketplace top) | WATCH | 2026-10-16 | competitors |
| Copilot coding agent (quiet 10-16; Universe Oct 28–29 = next wave) | WATCH (pattern) | 2026-10-16 | competitors |
| OpenHands (**org move All-Hands-AI → OpenHands**; no release; fix-links updated) | WATCH | 2026-10-16 | competitors |
| Devin (unchanged 10-16; Oct 14 release stands) | WATCH | 2026-10-16 | competitors |
| Factory Droids (v0.243.0 10-16: kill-guard calibration — pattern kills + `rm -f` un-refused; range-reads for huge files) | WATCH | 2026-10-16 | competitors |
| GitHub push attribution (durable authenticated-pusher on commits) | WATCH (steal requirement) | 2026-10-14 | competitors |
| NEVR-198 scoped permission pipeline (landed dev 10-15 @681e418; no Stellarc release/tag yet — row open until verified on a release) | ADOPT (landed) | 2026-10-16 | competitors |
| Scout P1 cost/token UI (**delivered as PR #118** NEVR-243, opened 10-16, open/mergeable — green on cargo/bundle-linux/linux-smoke, red only on the T02 policy gates + O2 signing; rides the T02 decision) | ADOPT (delivered, gated) | 2026-10-24 | competitors |
| Huly (no commits in window; no agent story; next check Jan 2027) | REJECT | 2026-10-16 | competitors |
| Tauri 2 (chosen shell; 2.12.5 10-21 still latest; trunk active again (+2 dep commits 10-26: jsonschema #16378, minisign #16382); **#16365 v2 release-train PR open & updated 10-26 — 2.12.6 queues api onScaleChanged PhysicalSize #16381, mobile dev-proxy URL #16376, Linux touch-resize #16368 (closes #16276)**; 112,195★; **lockfile still 2.12.3 — #16197 panic fix unabsorbed, day 5**; bump rides the dependabot repair below) | ADOPT | 2026-10-26 | cross-platform-ui |
| Tauri 3.0-alpha (α.5 10-14 stands, npm next unchanged; #16334 v3 version-update PR open since 10-19, updated 10-21, unstable — the **v2** train #16365 is the one moving) | WATCH | 2026-10-26 | cross-platform-ui |
| tauri-runtime-cef (α.6 stands; same **7 open fix(cef) PRs** as 10-25; webkitgtk tail 69 open flat — churn band 68↔78; **IME: #16391 still open, 0 comments = no triage**; basis clarified: `ime in:title` = 4 open across all three platforms — macOS #15924, Windows #16391 + #15436 WebView2/CJK, Linux #11412; a11y 0) | WATCH | 2026-10-26 | cross-platform-ui |
| GPUI Kit (v0.8.0 10-19 stands; **10-26 = 7 commits, all text/text-selection/diff depth** — per-frame selection snapshots #3686, word/line drag-selection #3681, TextView image resolver #3694, truncated-diff hunks #3688; 18,627★, pushed 10-26 — design-reference stream for transcript editor + NEVR-150, not an adoption candidate; org also ships NSH, row below) | WATCH (elevated) | 2026-10-26 | cross-platform-ui |
| NSH / Native Shell (longbridge/nsh; Rust native-UI + TSX screens on iOS/Android/macOS/Win/Linux/web/GPUI, platform-native views; **signed sandboxed run-time-delivered TSX modules + llms.txt = agent-authored-UI reference**; created 10-14, **677★ (+57 in a day)**, 10 commits 10-26 incl. text-engine hit testing #424 + host-prop springs/timings #470, v0.2.0 10-22; license NOASSERTION = reference-only) | WATCH (reference) | 2026-10-26 | cross-platform-ui |
| Expo / React Native (SDK 58.0.19, RN 0.88.0 + `next` 0.88.0-rc.6, 0.89 nightlies rolling — patches only, still second stack) | REJECT | 2026-10-26 | cross-platform-ui |
| react-native-web (0.21.4 unchanged; signal only) | REJECT | 2026-10-26 | cross-platform-ui |
| Capacitor (@capacitor/core 8.5.3; 9.0.0-alpha.8 on next; 8.5.4 nightlies — bare `capacitor` npm pkg is a stale 0.5.6 legacy trap, always query the @capacitor/* scope; Tauri mobile covers) | REJECT | 2026-10-26 | cross-platform-ui |
| Dioxus (0.8.0-alpha.3 10-16 stands, no α.4; stable 0.7.10) | REJECT | 2026-10-26 | cross-platform-ui |
| Flutter (180,380★, steady) | REJECT | 2026-10-26 | cross-platform-ui |
| Lynx 4.1.2 (10-24 = primjs 4.1.1 dep-sync; 15,210★; bindings `@lynx-js/react` 0.129.0 pre-1.0; desktop runtimes exist in Explorer (Win/mac/Harmony) but dev macOS-recommended, Win/Linux unverified — trigger stays bindings 1.0 + stable desktop) | WATCH | 2026-10-26 | cross-platform-ui |
| Electrobun (blackboardsh/electrobun — old nicbarker path 404s; 12,962★; **v2.0.5 stable 10-26** — the β.2→β.5 train landed; macOS-centric) | REJECT | 2026-10-26 | cross-platform-ui |
| @axe-core/playwright (4.14.0 10-15 stands; rc/next carry 4.14.1 snapshots — pin latest only; NEVR-150 still todo, no axe in dev tree (verified 10-26); row open until built) | ADOPT (pending) | 2026-10-26 | cross-platform-ui |
| Dependabot cargo updates (NEVR-191/PR #98 — **STILL BROKEN 10-26, day 5: default branch `main` re-verified, zero dependabot PRs ever**; flip to `dev` = owner settings action; NEVR-310 (scout issue) closed done but the brief's owner action not taken; first PR should carry tauri 2.12.5/#16197 — and 2.12.6 (#16365 train) now queues a Linux touch fix + mobile dev-proxy fix) | ADOPT (briefed) | 2026-10-26 | cross-platform-ui |
| effect 4.x (4.0.6 stands, **no 4.0.7 yet** — but the fold content is all on main: #9855 HttpClientError redaction + #9829 browser OtlpProxy merged 10-23, **#9961 McpServer `_tag` leak (10-26) + #8509 MCP control notifications (10-27)** — v4 runs effect/ai McpServer in production at `packages/kaneo/src/mcp/http.ts`; also #9989 SSE BOM, #9998 HttpApi 101; 17,400★, main@d84f5185; v4 pins 4.0.2 — fold to ≥4.0.7 when it ships; v4→dev drift 129/30) | ADOPT | 2026-10-27 | libraries |
| @effect/opentelemetry 4.0.6 (satellites 4.0.6 cohort re-verified 10-27; v4 pins 4.0.2 — folds with the effect ≥4.0.7 pass, ADR 0010 substrate) | ADOPT (fold) | 2026-10-27 | libraries |
| T02 guard × effect/v4 PRs (RESOLVED: fix PR #120 merged to dev 734a548 and v4 95bb553 — guard measures PRs against their base-branch head; v4-based PRs get honest CI; row retires) | ADOPT (landed) | 2026-10-24 | libraries |
| effect `reactivity` + @effect/atom-react (atom-react 4.0.6, no publish since 10-22; stability flag last read 10-23 = `unstable`; zero atom-react consumers in v4 tree) | WATCH | 2026-10-27 | libraries |
| @a2a-js/sdk 1.3.0 (A2A protocol; unchanged since 09-29, no Stellarc consumer today) | WATCH | 2026-10-27 | libraries |
| @tanstack/trailbase-db-collection 0.1.123 (stands, 10-21; ADR 0007 rejection stands) | WATCH | 2026-10-27 | libraries |
| @tanstack/react-charts + @tanstack/charts 1.1.0 (GA'd quietly 10-03→10-09; stands; repo pushed 10-23 — first candidate surface = NEVR-243 telemetry growing axes; decision vs recharts 3 deferred) | WATCH | 2026-10-27 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156; upstream drizzle effect/dist-tag channels quiet since Feb 2026 — bridge-replacement risk low; recheck on 1.0 GA) | ADOPT | 2026-10-27 | libraries |
| effect `eventlog` module (#9470 replay-reuse in 4.0.6 + #9880 encrypted event-log server Docker image (10-26 line); no new eventlog commits in the 10-27 window; still `@stability unstable`) | WATCH | 2026-10-27 | libraries |
| Bun 1.4.4 (stands, 10-22; repo pushed 10-27; NEVR-157 brief current — `bun fmt` Prettier-compatible formatter, pnpm-like peers, ~3× warm Linux installs, security fixes) | ADOPT | 2026-10-27 | libraries |
| @tanstack/db 0.15.2 + electric-db-collection 0.6.3 (both stand on npm 10-21; **0.16 brewing on main: BREAKING #2232 grouping/includes/pooling opt-in, new @tanstack/preact-db #2235, electric visibility-listener cleanup #2257, SSR #2229**; v4 pins 0.15.0/0.6.1, dev pins 0.8.7/0.4.7 — fold to 0.15.x before the v4→dev merge; do NOT ride 0.16) | TRIAL | 2026-10-27 | libraries |
| @tanstack/tauri-db-sqlite-persistence 0.2.37 (stands, 10-21 cohort; tracks db 0.15.x) | WATCH | 2026-10-27 | libraries |
| ACP (SDK **2.0.2 stands** — and 10-26 shipped **MCP-over-ACP as unstable features**: #311 caller/provider, #313 HTTP bridge, #314 serve MCP SDK servers over MCP-over-ACP; our 2 call sites = runner.ts:297 ClientSideConnection + fake-acp-agent.ts:63 AgentSideConnection, dev+v4 pin frozen 1.7.0; migration brief = NEVR-309, strengthened — on 1.7.0 we get none of MCP-over-ACP, the exact direction of the ADR 0019 lane) | ADOPT (briefed) | 2026-10-27 | libraries |
| Zero 1.11.3 (stands; **1.12.0-canary.8 published 10-27**; repo = rocicorp/mono, pushed 10-27, 3,424★ — the maintenance cadence Electric lacks; named fallback #1 in the Electric brief) | WATCH | 2026-10-27 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (NEVR-185 / PR #99 MERGED to effect/v4 @bd997b7 — @modelcontextprotocol/sdk out of v4 tree) | TRIAL | 2026-10-16 | libraries |
| drizzle-orm 1.0 line (rc.5 stands, 10-21; latest still 0.45.4; GA watch live; on GA: bridge-rebase decision — upstream effect channels quiet since Feb) | WATCH | 2026-10-27 | libraries |
| jazz-tools (0.20.19 unchanged since 07-03 + 2.0-alpha; no consumer) | REJECT | 2026-10-27 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua 0.53.6 (stands, 10-21; dnd/list virtualization alternative) | WATCH | 2026-10-27 | libraries |
| effect-lens (single-author 0★ repo, no release since 10-02 — not an ecosystem signal; demoted) | REJECT | 2026-10-16 | libraries |
| effect v3 line (3.22.4 stands; dev pins 3.22.0 — fold needs the serialized-Cause `failure`→`error` grep first) | ADOPT (v3 patch) | 2026-10-27 | libraries |
| LiveStore 0.5.0 stable (stands; repo pushed 10-26, 3,742★ — ADR 0007 fallback #2) | WATCH (elevated) | 2026-10-27 | libraries |
| @effect/vitest 4.0.6 (peer vitest >=5 <6; vitest 5.0.5 + 5.1.0-beta.1 of 10-19 — batch with hono 5 / TS 7.1, unchanged) | WATCH (gated) | 2026-10-27 | libraries |
| effect npm publish skew (RESOLVED 10-15; guard retired — verify core resolves before any effect bump) | ADOPT (resolved) | 2026-10-16 | libraries |
| hono 5.0.0-rc line (4.13.14 latest 10-25; next = 5.0.0-rc.1; dev pins 4.12.31; calendar with vite/vitest majors + TS 7.1) | WATCH | 2026-10-27 | libraries |
| TypeScript 7 / tsgo (7.0.2 stable; 7.1.0-beta of 10-20 + dev dailies through 10-26; answer via `bun check` when NEVR-157 unblocks) | TRIAL | 2026-10-27 | libraries |
| @sentry/node 11 (11.9.0 stands, 10-23; rides NEVR-129) | WATCH | 2026-10-27 | libraries |
| better-auth (1.7.14 of 10-26; 1.8.0-beta.2 of 10-22; dev pins 1.6.25 while release-1.6 carries 1.6.33 — even the pinned line has unabsorbed patches; batch decision with NEVR-129) | WATCH | 2026-10-27 | libraries |
| shadcn chat primitives (PR #91 = NEVR-170; open; red = T02 policy gate only — re-verified in job logs 10-24) | ADOPT | 2026-10-24 | design |
| shadcn AI elements (22 patterns, 3 dialects; **delivered in-tree as PR #108 = NEVR-223**, opened 10-15; open — red = T02 policy gate only, re-verified 10-24) | ADOPT (delivered, T02-gated) | 2026-10-24 | design |
| shadcn-ui/chatbot-template (official, MIT, 1,180★, pushed 10-15; parts-based composition = validates our `to*ElementProps` seam; steal sources-part + question-card shapes at live-data wiring — in flight as PR #115) | WATCH (reference) | 2026-10-24 | design |
| `@shadcn/typeset` (NOT on npm — registry-only install; never `bun add`) | TRIAL (clarified) | 2026-10-16 | design |
| `@shadcn/react` 0.3.1 (registry-native elements delivered in #108; remaining showcase is the chatbot template) | REJECT | 2026-10-16 | design |
| `ui-typecheck-budget` red on PRs + dev (continue-on-error; count 429 = budget 429; informational, not a blocker) | REJECT (as blocker) | 2026-10-15 | design |
| Base UI (`@base-ui/react` **1.9.0 (10-09) stands**; one real fix since: 10-23 batched animation lookups for elements closing together #5987; 10-26 = dep/infra day (react 19.3.1, vite 8.3.3 security); 1.10 still unshipped ≈ early Nov; **Listbox PR #5115 still open** (updated 10-16, re-verified 10-26) = cmdk-successor trigger) | ADOPT | 2026-10-26 | design |
| shadcn Typeset (streaming-safe markdown css; rides PR #91; registry-only, not on npm) | TRIAL | 2026-10-16 | design |
| @coss registry entry in components.json (AGPL, unused; removal rides PR #92) | REJECT | 2026-10-14 | design |
| skills/migrate-radix-to-base (shadcn method skill; used by PR #92) | ADOPT | 2026-10-14 | design |
| Radix dep tail + components.json dialect (PR #92 = NEVR-171; open — red = T02 policy gate only, re-verified 10-24) | ADOPT cleanup | 2026-10-24 | design |
| motion 14 (**14.6.0 10-22** — 14.4/14.5/14.6 inside a week; PR #90's ^14.2 covers; floor now 4 minors behind) | ADOPT bump | 2026-10-24 | design |
| lucide-react 1.x (1.61.0 stands; PR #90's ^1.56 covers — ui still pins ^0.577 until #90 merges) | ADOPT bump | 2026-10-27 | libraries |
| electric-sql (**DECIDE-NOW 10-27**: 21 days zero commits (pushed 10-06), no release of any kind since 09-09; Nabil372 7-PR sweep #4836–4842 STILL unmerged/unreviewed; #4843 permanent-stall open, 0 comments; **backlog corrected: 106 open PRs, not 8 — the 10-26 number was a page-truncated read**; escalation brief posted on NEVR-335 — Talos decides whether to file) | WATCH (escalated → brief) | 2026-10-27 | libraries |
| react-day-picker 10 (rides PR #90) | TRIAL bump | 2026-10-14 | design |
| mermaid 12.2.0 (major; PR #90 bumps ^12.2.0) | TRIAL bump | 2026-10-14 | design |
| tweakcn (**repo = jnsahaj/tweakcn**, 10,473★, pushed 09-03 — alive; npm 1.0.0 hit 1yr stale 2026-10-23; use the web app, not the CLI) | WATCH (demoted) | 2026-10-24 | design |
| streamdown (streaming markdown; 2.7.1 10-19 = first release in 7 weeks; dormant-adjacent but alive) | WATCH | 2026-10-24 | design |
| vercel/ai elements registry (folded into shadcn registry) | WATCH | 2026-10-14 | design |
| prompt-kit (ibelick; 3,133★, pushed 09-28 — alive but slow; superseded by AI elements #108) | WATCH | 2026-10-24 | design |
| @assistant-ui/react | REJECT | 2026-10-14 | design |
| CopilotKit | REJECT | 2026-10-13 | design |
| @llm-ui/react (dormant) | REJECT | 2026-10-14 | design |
| recharts 3 via shadcn charts | WATCH | 2026-10-14 | design |
| pragmatic-drag-and-drop (design-lane view; dnd-kit stays) | WATCH | 2026-10-14 | design |
| shadcn-admin (satnaing, reference; 15,885★, pushed 09-10) | WATCH | 2026-10-24 | design |
| HeroUI | REJECT | 2026-10-13 | design |
| cmdk (dormant 19mo — 1.1.1 dates 2025-03; in use; successor trigger = Base UI Listbox #5115, still open, re-verified 10-26) | WATCH | 2026-10-26 | design |
| shadcn DESIGN.md workflow skill (seed for post-freeze design-system merge) | TRIAL | 2026-10-14 | design |
| shadcn named styles (8 styles × 3 dialects; `base-nova` = converged choice) | TRIAL | 2026-10-15 | design |
| shadcn repo velocity 10-24/26: **dep-bumps + template updates only — no new blocks/styles/registries**; CLI 4.22.1 (10-18) stands; `r/index.json` 65 items unchanged; 126,578★ | ADOPT (tooling hygiene) | 2026-10-26 | design |
| vaul (superseded by Base UI Drawer; npm dormant since 2024-12) | REJECT | 2026-10-14 | design |
| animate-ui (stale ~9.5 mo) | WATCH | 2026-10-14 | design |
| @dnd-kit (no release since 2024-12; repo alive) | WATCH | 2026-10-14 | design |
| T02 frozen-UI guard vs design lane (**CORRECTED 10-24: it is a whole-tree policy freeze** — desktop.yml:24 `ui-purity` + desktop.test.ts:95 fail ANY PR touching `apps/stellarc-ui`; SIX PRs gated: #90/#91/#92/#108 + #115/#118; re-runs stay red BY DESIGN until the owner lifts/budgets the freeze — this is Talos's decision, not a rebase; @shadcn/lint trial = the contract-governed middle path; **10-25 (cross-platform-ui run): the #127/#128 trial pair are the first design-lane PRs through the fixed guard — new `ui-design-contracts` job passes clean on #127 / fails on #128's deliberate violations; both red on T02 gates by design (foundation flags #127's 3 frozen-file edits) — the lint is mechanically proven, the freeze call is still Talos's**; **10-26 (design run): pair unchanged since 10-24, `ui-design-contracts` still trial-branch-only — but the option set grows: onsystem (below) adds a diff-scoped + MCP in-editor layer to the same decision**) | WATCH (policy, escalated) | 2026-10-26 | design |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07; re-verified 10-26 at dev HEAD b32c053 run 40173716961 — same fail-closed shape; **NEW: linux-smoke red there = first observed — app died pre-window; same runner image (20261021.618) + WebKitGTK 2.52.6 as the green 10-24 run, docs-only delta, green again on PR #130 10-26 → one-off flake**; **triage correction 10-26: script already cats the full app log on FAIL — the red run's captured log was empty (app died pre-output); hardening brief filed 10-26 = one bounded retry + empty-log marker**) | WATCH (ops) | 2026-10-26 | cross-platform-ui |
| shadcn community registries (pmndrs added 10-11; +5 additions 10-19..23; directory growing) | WATCH | 2026-10-24 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) — superseded by 4.22.1 row above | ADOPT (tooling hygiene) | 2026-10-14 | design |
| **@shadcn/lint** (official agent-first design-system linter; 6 rules with agent-readable remediation: no-restyle / no-raw-colors / no-arbitrary-values / no-inline-styles / no-unknown-classes / require-static-classes; ESLint + Oxlint, Tailwind v4, React/Vue/Svelte; **0.2.3 10-19**, repo 09-02, MIT, 3,263★; constraint: we lint with Biome → dedicated Oxlint/ESLint pass scoped to apps/stellarc-ui, devDependency + 1 CI step, no runtime deps; TRIAL brief filed 10-24 = T02 relief path) | ADOPT (TRIAL briefed) | 2026-10-24 | design |
| solid-glass (deeplethe; "design system for AI applications — material, physical, tactile"; 2,250★, pushed 10-22, quiet since; aesthetic reference for agent-UI surfaces, not a dependency) | WATCH (reference) | 2026-10-26 | design |
| hextaui (preetsuthar17; shadcn/ui components + AI blocks **built on Base UI**; **10-26: commercial pivot — Minilytics + Dodo paywall, priced Pro paths, Claude Code plugin marketplace**; 143★; still validates PR #92's Radix→Base direction, but reference value narrows to the free tier) | WATCH (narrowed) | 2026-10-26 | design |
| keyline-icons (**2.2.0 10-25: +55 icons drawn against "the Linear and Attio gaps"** + transport glyphs; 1,600+ MIT icons × 8 variants, one 24×24 grid; 181★; only if lucide gaps agent/tool glyphs) | WATCH | 2026-10-26 | design |
| affectui (flohoeller; handcrafted components + illustrations + motion for AI products, one-file copy-paste; 287★ (+58 in 2 days), pushed 10-26; freemium "sync free items" cadence) | WATCH | 2026-10-26 | design |
| shadscan (TheOrcDev; deterministic UI audits for shadcn apps in terminal/CI — owned-components vs registry drift; 557★, pushed 10-14, re-verified 10-26; TRIAL candidate after the @shadcn/lint trial — pairs with @shadcn/registry programmatic pulls) | WATCH | 2026-10-26 | design |
| loora (lassejlv; canvas design tool your agent can edit; AGPL-3.0 — license-disqualified, concept-only) | REJECT (license) | 2026-10-24 | design |
| @radix-ui/colors (3.0.0 dates 2023-10-02 — three years stale; dark-palette path = Tailwind v4 tokens + tweakcn, not a palette package) | REJECT | 2026-10-24 | design |
| onsystem (dgesteves; keeps coding agents on your design system — catches raw palette colors/native elements/missing APIs; **MCP server (in-editor, "at every edit") + GH Action @v0 (diff-scoped, PR-changed lines only)**; zero-config for shadcn apps; npm 0.10.0 10-23, 10 releases in 3 wks, 73★, MIT, single-author; complements @shadcn/lint — diff+MCP where lint is tree+CI; trial brief filed 10-26 as the T02 decision's third option) | ADOPT (TRIAL briefed) | 2026-10-26 | design |
| signoff-ui (dgesteves; React components for **multi-file diff review + tool approvals that return a result the agent receives**; shadcn-registry distribution, keyboard-driven; badges ACP + AG-UI + AI SDK/Elements; npm 0.10.2 10-25, 31★, MIT; the result channel is what AI elements lack and PR #115 hand-builds — steal the pattern, trial the kit post-freeze) | WATCH (steal) | 2026-10-26 | design |
| hermes-workspace (outsourc-e; web workspace for Hermes Agent — chat/terminal/memory/skills/inspector + swarm control plane w/ byte-verified review gates; v2.3.0, 6,760★, MIT, pushed 10-26; closest OSS reference for our surface set — layout/IA mine, never a dep: Hermes-only, we are agent-agnostic) | WATCH (reference, elevated) | 2026-10-26 | design |
| @shadcn/registry (official registry client extracted from the CLI — programmatic fetch/resolve/install of registry items; 0.1.0 → **0.2.0 10-16** in 2 wks, ships from shadcn-ui/ui packages/registry; the install path for the post-freeze design-system merge, pairs with shadscan drift audits) | WATCH | 2026-10-26 | design |
| AG-UI / @ag-ui/core 1.0.3 (**proper libraries row 10-27**: open event protocol, ~16 standard event types + middleware layer; @ag-ui/client ships HttpAgent/SSE/WebSocket transports; @ag-ui/react has ZERO npm publishes — the React layer lives in CopilotKit proper; repo 16,831★, MIT, pushed 10-26. ACP already covers agent↔client updates for us — steal the event taxonomy for our transcript DTO, re-evaluate only at a public agent-events API) | WATCH (reference) | 2026-10-27 | libraries |
