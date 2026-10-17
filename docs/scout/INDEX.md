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
| Tauri 2 (chosen shell; 2.12.4 of 10-14 stands, no new release; lockfile @2.12.3; dependabot weekly tick expected ≈10-21 — review the PR for #16197) | ADOPT | 2026-10-16 | cross-platform-ui |
| Tauri 3.0-alpha (no new alpha; core α.5 10-14, npm next unchanged; no selectable-runtime PR upstream) | WATCH | 2026-10-16 | cross-platform-ui |
| tauri-runtime-cef (α.6 10-14 stands; webkitgtk tail 77 open flat — IME 9, a11y 10) | WATCH | 2026-10-16 | cross-platform-ui |
| GPUI Kit (v0.7.3; daily commits — WebView catalog, shell bg/shadow; 17,685★; code Apache-2.0, docs CC BY 4.0) | WATCH | 2026-10-16 | cross-platform-ui |
| Expo / React Native (SDK 58.0.12, RN 0.88.0 — both majors moved, still second stack) | REJECT | 2026-10-16 | cross-platform-ui |
| react-native-web (0.21.4 unchanged; signal only) | REJECT | 2026-10-16 | cross-platform-ui |
| Capacitor (8.5.3; 9.0.0-alpha.8 on next — Tauri mobile covers) | REJECT | 2026-10-16 | cross-platform-ui |
| Dioxus (0.8.0-alpha.2 10-14; trunk daily — 0.8 in flight; stable 0.7.10) | REJECT | 2026-10-16 | cross-platform-ui |
| Flutter (180,233★, steady) | REJECT | 2026-10-16 | cross-platform-ui |
| Lynx 4.1 (web+iOS+Android, bindings 0.127.0 pre-1.0; no desktop story yet) | WATCH | 2026-10-16 | cross-platform-ui |
| Electrobun (beta.26 10-15; macOS-centric) | REJECT | 2026-10-16 | cross-platform-ui |
| @axe-core/playwright (4.14.0 10-15; NEVR-150 brief pins 4.13.0 — build against 4.14.0; row open until built) | ADOPT (pending) | 2026-10-16 | cross-platform-ui |
| effect 4.x (npm quiet: 4.0.5 stands; main carries 8 post-release fixes incl. reactivity #9320 — 4.0.6 forming; repo 17,309★ pushed 10-17) | ADOPT | 2026-10-17 | libraries |
| T02 guard × effect/v4 PRs (guard diffs apps/stellarc-ui vs merge-base(origin/dev) → v4's own 19 UI files fail `foundation` on EVERY v4-based PR; PR #112 red w/ zero UI changes, PR #110 green on dev; brief 10-17) | ADOPT (briefed) | 2026-10-17 | libraries |
| effect `reactivity` + @effect/atom-react (still `@stability unstable` on main 10-16; first reactivity-layer fix #9320 = use-signal, not stability) | WATCH | 2026-10-17 | libraries |
| @a2a-js/sdk 1.3 (A2A protocol; no Stellarc consumer today) | WATCH | 2026-10-15 | libraries |
| @tanstack/trailbase-db-collection (TrailBase integration exists upstream; ADR 0007 rejection stands) | WATCH | 2026-10-15 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156) | ADOPT | 2026-10-15 | libraries |
| effect `eventlog` module (SqlEventJournal; unstable; unchanged 4.0.0→4.0.5) | WATCH | 2026-10-15 | libraries |
| Bun 1.4.3 (`bun check`, FetchSession, idle CPU; brief = NEVR-157 blocked; unchanged; canary daily) | ADOPT | 2026-10-17 | libraries |
| @tanstack/db 0.15.1 (cut on main 10-16 20:23, npm pending — ordered live-query first-window sync publish #2159 + eager preload settle #2173; NEVR-233/PR #112 pins 0.15.0 — fold 0.15.1 before merge) | TRIAL | 2026-10-17 | libraries |
| @tanstack/tauri-db-sqlite-persistence 0.2.35 (claim-loss recovery; repointed to db 0.15.0) | WATCH | 2026-10-16 | libraries |
| ACP (schema v1.26.0 + rust 1.12.0 + npm SDK 1.9.0 all 10-16 — unstable-channel only: client system-prompt schema #2361, next-edit-suggestions removed #2266; bump rides NEVR-129; 2.0.0-alpha.9 accumulating) | ADOPT bump | 2026-10-17 | libraries |
| Zero 1.11.0 (10-16: 250 commits of zero-cache ops hardening + litestream v5 + checkpointer-default — evidence Electric spares us this burden; 1.12 canary open) | WATCH | 2026-10-17 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (NEVR-185 / PR #99 MERGED to effect/v4 @bd997b7 — @modelcontextprotocol/sdk out of v4 tree) | TRIAL | 2026-10-16 | libraries |
| drizzle-orm 1.0 line (npm `rc` tag is rc.4; rc.5-* are suffixed builds, no installable rc.5; bridge stays) | WATCH | 2026-10-17 | libraries |
| jazz-tools (correction: 0.20.19 + 2.0-alpha; not 1.2.0) | REJECT | 2026-10-17 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua (dnd/list virtualization alternative) | WATCH | 2026-10-17 | libraries |
| effect-lens (single-author 0★ repo, no release since 10-02 — not an ecosystem signal; demoted) | REJECT | 2026-10-16 | libraries |
| effect v3 line (3.22.3 10-16 stands; dev pins 3.22.0; fold into next dev dep pass) | ADOPT (v3 patch) | 2026-10-17 | libraries |
| LiveStore 0.5.0 stable (10-15; one post-release merge #1679; Effect-4 cohort 4.0.3 — ADR 0007 fallback, not parallel trial) | WATCH (elevated) | 2026-10-17 | libraries |
| @effect/vitest 4.0.5 (peer vitest >=5 <6; dev+v4 pin vitest 4.1.10 — gated on Vitest 5 major; calendar with hono 5 batch) | WATCH (gated) | 2026-10-17 | libraries |
| effect npm publish skew (RESOLVED 10-15; guard retired — verify core resolves before any effect bump) | ADOPT (resolved) | 2026-10-16 | libraries |
| hono 5.0.0-rc line (rc.1 on `next`; calendar with vite/vitest majors + @effect/vitest vitest-5 gate) | WATCH | 2026-10-17 | libraries |
| TypeScript 7 / tsgo (7.0.2 stable; 7.1-dev dailies; answer via `bun check`) | TRIAL | 2026-10-17 | libraries |
| @sentry/node 11 (11.8.0 10-15; rides NEVR-129) | WATCH | 2026-10-17 | libraries |
| better-auth 1.8 beta line (1.8.0-beta.1 opened 10-16; 1.7.10 latest — watch for the NEVR-129 batch decision) | WATCH | 2026-10-17 | libraries |
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
| lucide-react 1.x (1.58.0 10-16 — fourth release in five days; PR #90's ^1.56 covers) | ADOPT bump | 2026-10-17 | libraries |
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
| T02 frozen-UI guard vs design PRs #90/#91/#92/#108 (owner decision needed; day 4; escalate 10-18; #108's guard failure lists 28 files — **libraries 10-17: guard also fails every effect/v4-based PR via 19 inherited UI files, see libraries row — merge-gate mechanic, not only UI scope**) | ADOPT decision | 2026-10-17 | design |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07) | WATCH (ops) | 2026-10-15 | design |
| shadcn community registries (pmndrs added 10-11; directory growing) | WATCH | 2026-10-14 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) | ADOPT (tooling hygiene) | 2026-10-14 | design |
