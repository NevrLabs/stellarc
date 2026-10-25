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
| Tauri 2 (chosen shell; 2.12.5 10-21 still latest; trunk quiet (+1 lockfile-only commit since 10-24); 112,170★; **lockfile still 2.12.3 — #16197 panic fix unabsorbed, day 4**; bump rides the dependabot repair below) | ADOPT | 2026-10-25 | cross-platform-ui |
| Tauri 3.0-alpha (α.5 10-14 stands, npm next unchanged; **#16334 v3 version-update PR open since 10-19 = α.6 train queued, carries a tauri-runtime-cef bump**) | WATCH | 2026-10-25 | cross-platform-ui |
| tauri-runtime-cef (α.6 stands; **CEF hardening in core — 7 open fix(cef) PRs**; webkitgtk tail 69 open — churn band 68↔78; **IME 2→3: new #16391 Windows IME caret bug 10-24**; a11y 0) | WATCH | 2026-10-25 | cross-platform-ui |
| GPUI Kit (v0.8.0 10-19 stands; 10-24 commits = a11y follow-through #3665/#3667/#3673; 18,598★ +30, pushed 10-25 — design-reference stream for transcript editor + NEVR-150, not an adoption candidate; org also now ships NSH, row below) | WATCH (elevated) | 2026-10-25 | cross-platform-ui |
| NSH / Native Shell (longbridge/nsh; Rust native-UI + TSX screens on iOS/Android/macOS/Win/Linux/web/GPUI, platform-native views; **signed sandboxed run-time-delivered TSX modules + llms.txt = agent-authored-UI reference**; created 10-14, 620★ in 11 days, v0.2.0 10-22; license NOASSERTION = reference-only) | WATCH (reference) | 2026-10-25 | cross-platform-ui |
| Expo / React Native (SDK 58.0.19, RN 0.88.0, 0.89 nightlies rolling — patches only, still second stack) | REJECT | 2026-10-25 | cross-platform-ui |
| react-native-web (0.21.4 unchanged; signal only) | REJECT | 2026-10-25 | cross-platform-ui |
| Capacitor (8.5.3; 9.0.0-alpha.8 on next; 8.5.4 nightlies rolling — Tauri mobile covers) | REJECT | 2026-10-25 | cross-platform-ui |
| Dioxus (0.8.0-alpha.3 10-16 stands, no α.4; stable 0.7.10) | REJECT | 2026-10-25 | cross-platform-ui |
| Flutter (180,364★, steady) | REJECT | 2026-10-25 | cross-platform-ui |
| Lynx 4.1 (15,209★, pushed 10-25; bindings 0.129.0 pre-1.0; desktop runtimes exist in Explorer (Win/mac/Harmony) but dev macOS-recommended, Win/Linux unverified — trigger stays bindings 1.0 + stable desktop) | WATCH | 2026-10-25 | cross-platform-ui |
| Electrobun (**repo moved: blackboardsh/electrobun — old nicbarker path 404s**; 12,957★; 2.0.4 stable 10-18, 2.0.5-beta train β.2→β.5 in 3 days; macOS-centric) | REJECT | 2026-10-25 | cross-platform-ui |
| @axe-core/playwright (4.14.0 10-15 stands; rc/next carry 4.14.1 snapshots — pin latest only; NEVR-150 still todo, no axe in dev tree (verified 10-25); row open until built) | ADOPT (pending) | 2026-10-25 | cross-platform-ui |
| Dependabot cargo updates (NEVR-191/PR #98 — **STILL BROKEN 10-25: default branch `main` re-verified, zero dependabot PRs ever**; flip to `dev` = owner settings action; first PR should carry tauri 2.12.5/#16197; NEVR-310 brief posted 10-24 awaits owner action) | ADOPT (briefed) | 2026-10-25 | cross-platform-ui |
| effect 4.x (**4.0.6 shipped 10-22**: 4 atom/reactivity fixes #9607/#9313/#9190 + `skipInitialRun` #9522, EventLog replay perf #9470, internal-import blocking #9326; main hot — #9855 HttpClientError redaction + #9829 browser OtlpProxy queued for 4.0.7; 17,367★; v4 pins 4.0.2 → fold before v4→dev merge) | ADOPT | 2026-10-24 | libraries |
| @effect/opentelemetry 4.0.6 (v4 pins 4.0.2; folds with the effect 4.0.6 pass — ADR 0010 substrate) | ADOPT (fold) | 2026-10-24 | libraries |
| T02 guard × effect/v4 PRs (RESOLVED: fix PR #120 merged to dev 734a548 and v4 95bb553 — guard measures PRs against their base-branch head; v4-based PRs get honest CI; row retires) | ADOPT (landed) | 2026-10-24 | libraries |
| effect `reactivity` + @effect/atom-react (still `@stability unstable` on main 10-23 `Atom.ts:11`; 4.0.6 carried 4 atom fixes + `skipInitialRun` — active use upstream, not graduated; zero atom-react consumers in v4 tree) | WATCH | 2026-10-24 | libraries |
| @a2a-js/sdk 1.3.0 (A2A protocol; unchanged, no Stellarc consumer today) | WATCH | 2026-10-24 | libraries |
| @tanstack/trailbase-db-collection 0.1.123 (TrailBase integration exists upstream; ADR 0007 rejection stands) | WATCH | 2026-10-24 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156; upstream drizzle now carries `effect`/`drizzle-effect` dist-tag channels — check bridge overlap after 1.0 GA) | ADOPT | 2026-10-24 | libraries |
| effect `eventlog` module (#9470 in 4.0.6 reuses decoded conflict payloads in remote replay — first perf pass; still `@stability unstable`) | WATCH | 2026-10-24 | libraries |
| Bun 1.4.4 (10-22: `bun fmt` Prettier-compatible built-in formatter — Biome here, so not a swap; pnpm-like peers, ~3× warm Linux installs, security fixes; brief = NEVR-157 still blocked, content refreshed 10-24) | ADOPT | 2026-10-24 | libraries |
| @tanstack/db 0.15.2 + electric-db-collection 0.6.3 (0.15.1 10-18 = ordered-window correctness set #2159/#2154/#2173; 0.15.2 10-21 = persisted-write visibility #2208 + SerializationError #2207; PR #112 merged into effect/v4 pinning 0.15.0/0.6.1 — fold pass before v4→dev merge) | TRIAL | 2026-10-24 | libraries |
| @tanstack/tauri-db-sqlite-persistence 0.2.37 (claim-loss recovery cohort; tracks db 0.15.x) | WATCH | 2026-10-24 | libraries |
| ACP (SDK **2.0.0 GA 10-19, 2.0.2 current — BREAKING**: legacy connection classes removed → agent()/client() apps; our 2 call sites = runner.ts:297 ClientSideConnection + fake-acp-agent.ts:63 AgentSideConnection; protocol default stays v1, unstable behind /unstable; 1.x frozen at 1.9.0; SDK repo = agentclientprotocol/typescript-sdk; schema v1.26.0 + 2.0.0-alpha.9 unchanged; migration brief filed 10-24 as NEVR-309 — NEVR-129 cancelled, folds into NEVR-258 if that unblocks first) | ADOPT (briefed) | 2026-10-24 | libraries |
| Zero 1.11.3 (stable patches continue; 1.12 canary.7 — ops hardening evidence for ADR 0007's Electric choice) | WATCH | 2026-10-24 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (NEVR-185 / PR #99 MERGED to effect/v4 @bd997b7 — @modelcontextprotocol/sdk out of v4 tree) | TRIAL | 2026-10-16 | libraries |
| drizzle-orm 1.0 line (**rc.5 installable 10-21**, `rc` tag moved off rc.4; latest still 0.45.4 — GA watch live; on GA: bridge-rebase decision + upstream `effect` channel check) | WATCH | 2026-10-24 | libraries |
| jazz-tools (0.20.19 + 2.0-alpha; unchanged, no consumer) | REJECT | 2026-10-24 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua 0.53.6 (dnd/list virtualization alternative; routine) | WATCH | 2026-10-24 | libraries |
| effect-lens (single-author 0★ repo, no release since 10-02 — not an ecosystem signal; demoted) | REJECT | 2026-10-16 | libraries |
| effect v3 line (**3.22.4 10-22**: `Cause.Fail` serializes under `error` not `failure` — grep serialized-cause consumers before folding; dev pins 3.22.0) | ADOPT (v3 patch) | 2026-10-24 | libraries |
| LiveStore 0.5.0 stable (0.5.0-dev.1 tag open; repo pushed 10-19; snapshots daily — ADR 0007 fallback, not parallel trial) | WATCH (elevated) | 2026-10-24 | libraries |
| @effect/vitest 4.0.6 (peer vitest >=5 <6; vitest 5.0.5 stable + 5.1.0-beta.1 opened 10-19 — batch with hono 5 / TS 7.1) | WATCH (gated) | 2026-10-24 | libraries |
| effect npm publish skew (RESOLVED 10-15; guard retired — verify core resolves before any effect bump) | ADOPT (resolved) | 2026-10-16 | libraries |
| hono 5.0.0-rc line (rc.1 on `next` unchanged; 4.13.13 latest; calendar with vite/vitest majors + TS 7.1) | WATCH | 2026-10-24 | libraries |
| TypeScript 7 / tsgo (7.0.2 stable; **7.1.0-beta on npm 10-20**; answer via `bun check` when NEVR-157 unblocks) | TRIAL | 2026-10-24 | libraries |
| @sentry/node 11 (11.9.0 10-23; rides NEVR-129) | WATCH | 2026-10-24 | libraries |
| better-auth 1.8 beta line (1.7.12 latest; 1.8.0-beta.2 10-22 — watch for the NEVR-129 batch decision) | WATCH | 2026-10-24 | libraries |
| shadcn chat primitives (PR #91 = NEVR-170; open; red = T02 policy gate only — re-verified in job logs 10-24) | ADOPT | 2026-10-24 | design |
| shadcn AI elements (22 patterns, 3 dialects; **delivered in-tree as PR #108 = NEVR-223**, opened 10-15; open — red = T02 policy gate only, re-verified 10-24) | ADOPT (delivered, T02-gated) | 2026-10-24 | design |
| shadcn-ui/chatbot-template (official, MIT, 1,180★, pushed 10-15; parts-based composition = validates our `to*ElementProps` seam; steal sources-part + question-card shapes at live-data wiring — in flight as PR #115) | WATCH (reference) | 2026-10-24 | design |
| `@shadcn/typeset` (NOT on npm — registry-only install; never `bun add`) | TRIAL (clarified) | 2026-10-16 | design |
| `@shadcn/react` 0.3.1 (registry-native elements delivered in #108; remaining showcase is the chatbot template) | REJECT | 2026-10-16 | design |
| `ui-typecheck-budget` red on PRs + dev (continue-on-error; count 429 = budget 429; informational, not a blocker) | REJECT (as blocker) | 2026-10-15 | design |
| Base UI (`@base-ui/react` **1.9.0 (10-09) unchanged**; master 10-19..23 = hardening batch: IME composition dismissal #5978, popups Positioner/hover-intent #5961, portal timing #5963, dialog outside-press crash #6057, drawer iOS-27 keyboard #5897 — monthly cadence → 1.10 ≈ early Nov; **Listbox PR #5115 still open** (updated 10-16) = cmdk-successor trigger) | ADOPT | 2026-10-24 | design |
| shadcn Typeset (streaming-safe markdown css; rides PR #91; registry-only, not on npm) | TRIAL | 2026-10-16 | design |
| @coss registry entry in components.json (AGPL, unused; removal rides PR #92) | REJECT | 2026-10-14 | design |
| skills/migrate-radix-to-base (shadcn method skill; used by PR #92) | ADOPT | 2026-10-14 | design |
| Radix dep tail + components.json dialect (PR #92 = NEVR-171; open — red = T02 policy gate only, re-verified 10-24) | ADOPT cleanup | 2026-10-24 | design |
| motion 14 (**14.6.0 10-22** — 14.4/14.5/14.6 inside a week; PR #90's ^14.2 covers; floor now 4 minors behind) | ADOPT bump | 2026-10-24 | design |
| lucide-react 1.x (1.61.0 10-21 — fifth release in 8 days; PR #90's ^1.56 covers) | ADOPT bump | 2026-10-24 | libraries |
| electric-sql repo maintenance (ZERO commits since 10-06 — longest quiet since tracking began; client 1.5.28 dates 09-09; if next run agrees, raise as ADR 0007 substrate risk) | WATCH (flag) | 2026-10-24 | libraries |
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
| cmdk (dormant 19mo — 1.1.1 dates 2025-03; in use; successor trigger = Base UI Listbox #5115, still open 10-16) | WATCH | 2026-10-24 | design |
| shadcn DESIGN.md workflow skill (seed for post-freeze design-system merge) | TRIAL | 2026-10-14 | design |
| shadcn named styles (8 styles × 3 dialects; `base-nova` = converged choice) | TRIAL | 2026-10-15 | design |
| shadcn repo velocity 10-18/24: CLI **4.22.1 (10-18, `add --all` style-availability fix #12360)**; week = 5 community-registry additions + Next.js Oct security fix #12433; 126,422★ | ADOPT (tooling hygiene) | 2026-10-24 | design |
| vaul (superseded by Base UI Drawer; npm dormant since 2024-12) | REJECT | 2026-10-14 | design |
| animate-ui (stale ~9.5 mo) | WATCH | 2026-10-14 | design |
| @dnd-kit (no release since 2024-12; repo alive) | WATCH | 2026-10-14 | design |
| T02 frozen-UI guard vs design lane (**CORRECTED 10-24: it is a whole-tree policy freeze** — desktop.yml:24 `ui-purity` + desktop.test.ts:95 fail ANY PR touching `apps/stellarc-ui`; SIX PRs gated: #90/#91/#92/#108 + #115/#118; re-runs stay red BY DESIGN until the owner lifts/budgets the freeze — this is Talos's decision, not a rebase; @shadcn/lint trial = the contract-governed middle path; **10-25 (cross-platform-ui run): the #127/#128 trial pair are the first design-lane PRs through the fixed guard — new `ui-design-contracts` job passes clean on #127 / fails on #128's deliberate violations; both red on T02 gates by design (foundation flags #127's 3 frozen-file edits) — the lint is mechanically proven, the freeze call is still Talos's**) | WATCH (policy, escalated) | 2026-10-25 | design |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07; re-verified 10-25 at dev HEAD 3fc3f12 — runs 40098595286/40098595328 of 10-24 13:32 show the same fail-closed shape) | WATCH (ops) | 2026-10-25 | cross-platform-ui |
| shadcn community registries (pmndrs added 10-11; +5 additions 10-19..23; directory growing) | WATCH | 2026-10-24 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) — superseded by 4.22.1 row above | ADOPT (tooling hygiene) | 2026-10-14 | design |
| **@shadcn/lint** (official agent-first design-system linter; 6 rules with agent-readable remediation: no-restyle / no-raw-colors / no-arbitrary-values / no-inline-styles / no-unknown-classes / require-static-classes; ESLint + Oxlint, Tailwind v4, React/Vue/Svelte; **0.2.3 10-19**, repo 09-02, MIT, 3,263★; constraint: we lint with Biome → dedicated Oxlint/ESLint pass scoped to apps/stellarc-ui, devDependency + 1 CI step, no runtime deps; TRIAL brief filed 10-24 = T02 relief path) | ADOPT (TRIAL briefed) | 2026-10-24 | design |
| solid-glass (deeplethe; "design system for AI applications — material, physical, tactile"; 2,194★, pushed 10-22; aesthetic reference for agent-UI surfaces, not a dependency) | WATCH (reference) | 2026-10-24 | design |
| hextaui (preetsuthar17; shadcn/ui components + AI blocks **built on Base UI**, with loading/error/empty states; 143★, pushed 10-23; convergent validation of PR #92's Radix→Base direction) | WATCH | 2026-10-24 | design |
| keyline-icons (1,568 MIT icons × 8 variants on one 24×24 grid, "built for shadcn/ui"; 178★, pushed 10-20; only if lucide gaps agent/tool glyphs) | WATCH | 2026-10-24 | design |
| affectui (flohoeller; handcrafted components + illustrations + motion for AI products, one-file copy-paste; 229★, pushed 10-24) | WATCH | 2026-10-24 | design |
| shadscan (TheOrcDev; deterministic UI audits for shadcn apps in terminal/CI — owned-components vs registry drift; 557★, pushed 10-14; TRIAL candidate after the @shadcn/lint trial — same "what may agents change" question at file level) | WATCH | 2026-10-24 | design |
| loora (lassejlv; canvas design tool your agent can edit; AGPL-3.0 — license-disqualified, concept-only) | REJECT (license) | 2026-10-24 | design |
| @radix-ui/colors (3.0.0 dates 2023-10-02 — three years stale; dark-palette path = Tailwind v4 tokens + tweakcn, not a palette package) | REJECT | 2026-10-24 | design |
