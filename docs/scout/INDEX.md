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
| Scout P1 cost/token UI (harness-reported only; runner.ts:128 + store.ts:296 already persist; UI shows none — brief filed 10-16) | ADOPT (briefed) | 2026-10-16 | competitors |
| Huly (no commits in window; no agent story; next check Jan 2027) | REJECT | 2026-10-16 | competitors |
| Tauri 2 (chosen shell; 2.12.4 of 10-14 stands, ZERO trunk commits since 10-15; lockfile @2.12.3; dependabot weekly tick expected ≈10-21 — review the PR for #16197) | ADOPT | 2026-10-17 | cross-platform-ui |
| Tauri 3.0-alpha (no new alpha; core α.5 10-14, npm next unchanged; no selectable-runtime PR upstream) | WATCH | 2026-10-17 | cross-platform-ui |
| tauri-runtime-cef (α.6 10-14 stands; webkitgtk tail 68 open — down from 77 but only 2 closures verifiable since Oct 1, mostly search-index churn; IME/a11y sub-counts same caveat) | WATCH | 2026-10-17 | cross-platform-ui |
| GPUI Kit (v0.7.3; IME/a11y/mobile-input sprint on trunk #3557/#3554-3562/#3556 + Native Shell #3571; 17,845★; code Apache-2.0, docs CC BY 4.0 — pattern signal for our axe floor + Linux IME) | WATCH | 2026-10-17 | cross-platform-ui |
| Expo / React Native (SDK 58.0.14, RN 0.88.0 — patches only, still second stack) | REJECT | 2026-10-17 | cross-platform-ui |
| react-native-web (0.21.4 unchanged; signal only) | REJECT | 2026-10-17 | cross-platform-ui |
| Capacitor (8.5.3; 9.0.0-alpha.8 on next — Tauri mobile covers) | REJECT | 2026-10-17 | cross-platform-ui |
| Dioxus (0.8.0-alpha.3 10-16 — second alpha in 2 days; stable 0.7.10) | REJECT | 2026-10-17 | cross-platform-ui |
| Flutter (180,245★, steady) | REJECT | 2026-10-17 | cross-platform-ui |
| Lynx 4.1 (web+iOS+Android, bindings 0.128.0 10-16 pre-1.0; no desktop story yet) | WATCH | 2026-10-17 | cross-platform-ui |
| Electrobun (beta.27 10-16, daily cadence; macOS-centric) | REJECT | 2026-10-17 | cross-platform-ui |
| @axe-core/playwright (4.14.0 10-15 stands; NEVR-150 brief already amended to 4.14.0 on 10-16 — build against that; row open until built) | ADOPT (pending) | 2026-10-17 | cross-platform-ui |
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
| ACP (SDK **2.0.0 GA 10-19, 2.0.2 current — BREAKING**: legacy connection classes removed → agent()/client() apps; our 2 call sites = runner.ts:297 ClientSideConnection + fake-acp-agent.ts:63 AgentSideConnection; protocol default stays v1, unstable behind /unstable; 1.x frozen at 1.9.0; SDK repo = agentclientprotocol/typescript-sdk; schema v1.26.0 + 2.0.0-alpha.9 unchanged; migration brief filed 10-24, rides NEVR-129) | ADOPT (briefed) | 2026-10-24 | libraries |
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
| shadcn chat primitives (PR #91 = NEVR-170; blocked by T02 freeze guard; unchanged 10-16) | ADOPT | 2026-10-16 | design |
| shadcn AI elements (22 patterns, 3 dialects; **delivered in-tree as PR #108 = NEVR-223**, opened 10-15; row open until merged) | ADOPT (delivered, T02-gated) | 2026-10-16 | design |
| shadcn-ui/chatbot-template (official, MIT, 1,148★; parts-based composition = validates our `to*ElementProps` seam; steal sources-part + question-card shapes at live-data wiring) | WATCH (reference) | 2026-10-16 | design |
| `@shadcn/typeset` (NOT on npm — registry-only install; never `bun add`) | TRIAL (clarified) | 2026-10-16 | design |
| `@shadcn/react` 0.3.1 (registry-native elements delivered in #108; remaining showcase is the chatbot template) | REJECT | 2026-10-16 | design |
| `ui-typecheck-budget` red on PRs + dev (continue-on-error; count 429 = budget 429; informational, not a blocker) | REJECT (as blocker) | 2026-10-15 | design |
| Base UI (`@base-ui/react` 1.9.0; IME/portal/popups PRs active; **Listbox PR #5115 = cmdk-successor trigger**, re-evaluate command palette when merged+released) | ADOPT | 2026-10-16 | design |
| shadcn Typeset (streaming-safe markdown css; rides PR #91; registry-only, not on npm) | TRIAL | 2026-10-16 | design |
| @coss registry entry in components.json (AGPL, unused; removal rides PR #92) | REJECT | 2026-10-14 | design |
| skills/migrate-radix-to-base (shadcn method skill; used by PR #92) | ADOPT | 2026-10-14 | design |
| Radix dep tail + components.json dialect (PR #92 = NEVR-171; blocked by T02) | ADOPT cleanup | 2026-10-14 | design |
| motion 14 (14.3.0 10-15: stagger grid/edges/random, scaleZ; PR #90's ^14.2 covers; blocked by T02) | ADOPT bump | 2026-10-16 | design |
| lucide-react 1.x (1.61.0 10-21 — fifth release in 8 days; PR #90's ^1.56 covers) | ADOPT bump | 2026-10-24 | libraries |
| electric-sql repo maintenance (ZERO commits since 10-06 — longest quiet since tracking began; client 1.5.28 dates 09-09; if next run agrees, raise as ADR 0007 substrate risk) | WATCH (flag) | 2026-10-24 | libraries |
| react-day-picker 10 (rides PR #90) | TRIAL bump | 2026-10-14 | design |
| mermaid 12.2.0 (major; PR #90 bumps ^12.2.0) | TRIAL bump | 2026-10-14 | design |
| tweakcn (npm 13mo stale; one-shot token editor only) | WATCH (demoted) | 2026-10-15 | design |
| streamdown (streaming markdown) | WATCH | 2026-10-14 | design |
| vercel/ai elements registry (folded into shadcn registry) | WATCH | 2026-10-14 | design |
| prompt-kit (ibelick) | WATCH | 2026-10-14 | design |
| @assistant-ui/react | REJECT | 2026-10-14 | design |
| CopilotKit | REJECT | 2026-10-13 | design |
| @llm-ui/react (dormant) | REJECT | 2026-10-14 | design |
| recharts 3 via shadcn charts | WATCH | 2026-10-14 | design |
| pragmatic-drag-and-drop (design-lane view; dnd-kit stays) | WATCH | 2026-10-14 | design |
| shadcn-admin (satnaing, reference) | WATCH | 2026-10-14 | design |
| HeroUI | REJECT | 2026-10-13 | design |
| cmdk (dormant since 03-25; in use; successor trigger = Base UI Listbox #5115, active) | WATCH | 2026-10-17 | design |
| shadcn DESIGN.md workflow skill (seed for post-freeze design-system merge) | TRIAL | 2026-10-14 | design |
| shadcn named styles (8 styles × 3 dialects; `base-nova` = converged choice) | TRIAL | 2026-10-15 | design |
| shadcn repo velocity 10-14/15: AI elements #12307, zod-4 #12298, Figma kit; CLI 4.21.5 unchanged | ADOPT (tooling hygiene) | 2026-10-15 | design |
| vaul (superseded by Base UI Drawer; npm dormant since 2024-12) | REJECT | 2026-10-14 | design |
| animate-ui (stale ~9.5 mo) | WATCH | 2026-10-14 | design |
| @dnd-kit (no release since 2024-12; repo alive) | WATCH | 2026-10-14 | design |
| T02 frozen-UI guard vs design PRs #90/#91/#92/#108 (owner decision needed; day 4; escalate 10-18; #108's guard failure lists 28 files — **fix PR #120 = NEVR-247 verified `foundation` GREEN on 10-17** (head 0497ae7, zero UI files on branch) — merge to unblock the stack; libraries 10-17 detail stands) | ADOPT decision | 2026-10-17 | cross-platform-ui |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07) | WATCH (ops) | 2026-10-15 | design |
| shadcn community registries (pmndrs added 10-11; directory growing) | WATCH | 2026-10-14 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) | ADOPT (tooling hygiene) | 2026-10-14 | design |
