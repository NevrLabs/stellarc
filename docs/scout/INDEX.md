# Scout Radar — running index

One row per tracked item. Rings: ADOPT / TRIAL / WATCH / REJECT.
`last-checked` = date the row was verified against a primary source.

| Item | Ring | Last checked | Beat |
|---|---|---|---|
| Linear (stacked PRs, realtime diffs, spend caps; unchanged 10-14) | WATCH | 2026-10-14 | competitors |
| Plane (Agents GA, Propel; self-host 3.3.3; unchanged 10-14) | TRIAL | 2026-10-14 | competitors |
| Multica (v0.6.2 10-13: run-continuity fixes, wakeup drain, daemon autostart) | WATCH | 2026-10-14 | competitors |
| Paseo (plugin registry; 30+ commits 10-13/14 on run continuity) | TRIAL | 2026-10-14 | competitors |
| Cursor (Origin App Marketplace, iOS remote; unchanged 10-14) | WATCH | 2026-10-14 | competitors |
| Copilot coding agent (sandboxing GA, stacked PRs, budgets; platform: push attribution + Actions lockfiles 10-12/14) | ADOPT (pattern) | 2026-10-14 | competitors |
| OpenHands (ACP agents; hold-until-reachable + wake-from-resume on main) | WATCH | 2026-10-14 | competitors |
| Devin (memory/dreaming, inbox, Outposts; unchanged 10-14) | WATCH | 2026-10-14 | competitors |
| Factory Droids (Script approvals, injection hardening, doctor; v0.240.0) | WATCH (promoted from REJECT) | 2026-10-14 | competitors |
| GitHub push attribution (durable authenticated-pusher on commits) | WATCH (steal requirement) | 2026-10-14 | competitors |
| Huly (authz-grant fix #11067; no agent story; next check Jan 2027) | REJECT | 2026-10-14 | competitors |
| Tauri 2 (chosen shell, 2.12.3; Cargo.lock uncommitted — brief posted) | ADOPT | 2026-10-14 | cross-platform-ui |
| Tauri 3.0-alpha (alpha.4; alpha.6 staged via release PR) | WATCH | 2026-10-14 | cross-platform-ui |
| tauri-runtime-cef (Chromium runtime, 3.0-alpha.5; OSR + fullscreen landed) | WATCH | 2026-10-14 | cross-platform-ui |
| GPUI Kit (ex gpui-component, Rust desktop, v0.7.3) | WATCH | 2026-10-14 | cross-platform-ui |
| Expo / React Native (second stack) | REJECT | 2026-10-14 | cross-platform-ui |
| react-native-web (revived; signal only) | REJECT | 2026-10-14 | cross-platform-ui |
| Capacitor 8 | REJECT | 2026-10-14 | cross-platform-ui |
| Dioxus 0.7 | REJECT | 2026-10-14 | cross-platform-ui |
| Flutter | REJECT | 2026-10-14 | cross-platform-ui |
| Lynx 4.1 (web+iOS+Android, bindings pre-1.0) | WATCH | 2026-10-14 | cross-platform-ui |
| Electrobun (beta, macOS-centric) | REJECT | 2026-10-14 | cross-platform-ui |
| @axe-core/playwright (a11y floor; brief posted 10-13, not yet landed) | ADOPT | 2026-10-14 | cross-platform-ui |
| effect 4.x (4.0.5 out 10-15 — npm skew: satellites live, core 404; v4 branch pin 4.0.2; bump gate = core resolves on npm) | ADOPT | 2026-10-15 | libraries |
| effect `reactivity` + @effect/atom-react (core atoms, React hooks; unstable) | WATCH | 2026-10-15 | libraries |
| @a2a-js/sdk 1.3 (A2A protocol; no Stellarc consumer today) | WATCH | 2026-10-15 | libraries |
| @tanstack/trailbase-db-collection (TrailBase integration exists upstream; ADR 0007 rejection stands) | WATCH | 2026-10-15 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156) | ADOPT | 2026-10-15 | libraries |
| effect `eventlog` module (SqlEventJournal; unstable; unchanged 4.0.0→4.0.5) | WATCH | 2026-10-15 | libraries |
| Bun 1.4.3 (`bun check`, FetchSession, idle CPU; brief = NEVR-157 blocked; unchanged) | ADOPT | 2026-10-15 | libraries |
| @tanstack/db 0.14 + electric collection 0.6 (retry stays `loading`, unbound query descriptors; brief posted 10-15) | TRIAL | 2026-10-15 | libraries |
| @tanstack/tauri-db-sqlite-persistence 0.2.34 (claim-loss recovery; desktop offline spike unclaimed) | WATCH | 2026-10-15 | libraries |
| ACP v1.25 schema / SDK 1.8.0 (compaction, notices; rust 1.11.0); bump pending NEVR-129 | ADOPT bump | 2026-10-15 | libraries |
| Zero 1.10 (strongest sync alternative; unchanged) | WATCH | 2026-10-15 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (port = NEVR-185 / PR #99 vs effect/v4; 4.0.5 adds compile-time service checks) | TRIAL | 2026-10-15 | libraries |
| drizzle-orm 1.0 line (npm `rc` tag is rc.4; rc.5-* are suffixed builds, no installable rc.5; bridge stays) | WATCH | 2026-10-15 | libraries |
| jazz-tools (correction: 0.20.19 + 2.0-alpha; not 1.2.0) | REJECT | 2026-10-14 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua (dnd/list virtualization alternative) | WATCH | 2026-10-14 | libraries |
| effect-lens (v4 community libs signal) | WATCH | 2026-10-14 | libraries |
| hono 5.0.0-rc line (rc.1 on `next`; calendar with vite/vitest majors) | WATCH | 2026-10-15 | libraries |
| TypeScript 7 / tsgo (7.0.2 stable; 7.1-dev dailies; answer via `bun check`) | TRIAL | 2026-10-15 | libraries |
| @sentry/node 11 (11.7.0; one major ahead of pin) | WATCH | 2026-10-15 | libraries |
| shadcn chat primitives (PR #91 = NEVR-170; blocked by T02 freeze guard) | ADOPT | 2026-10-14 | design |
| shadcn Typeset (streaming-safe markdown css; rides PR #91) | TRIAL | 2026-10-14 | design |
| @coss registry entry in components.json (AGPL, unused; removal rides PR #92) | REJECT | 2026-10-14 | design |
| @shadcn/react (headless chat primitives; rides PR #91) | TRIAL | 2026-10-14 | design |
| skills/migrate-radix-to-base (shadcn method skill; used by PR #92) | ADOPT | 2026-10-14 | design |
| Radix dep tail + components.json dialect (PR #92 = NEVR-171; blocked by T02) | ADOPT cleanup | 2026-10-14 | design |
| motion 14 (rides PR #90 = NEVR-172; blocked by T02) | ADOPT bump | 2026-10-14 | design |
| lucide-react 1.x (1.57.0 out 10-14; PR #90's ^1.56 covers it) | ADOPT bump | 2026-10-14 | design |
| react-day-picker 10 (rides PR #90) | TRIAL bump | 2026-10-14 | design |
| mermaid 12.2.0 (major; PR #90 bumps ^12.2.0) | TRIAL bump | 2026-10-14 | design |
| tweakcn (npm 13mo stale; one-shot token editor only) | WATCH (demoted) | 2026-10-14 | design |
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
| cmdk (dormant 19mo, in use) | WATCH | 2026-10-14 | design |
| shadcn DESIGN.md workflow skill (seed for post-freeze design-system merge) | TRIAL | 2026-10-14 | design |
| Base UI (house primitive; 1.9.0; float ^1.9 rides PR #90) | ADOPT | 2026-10-14 | design |
| shadcn named styles (8 styles × 3 dialects; `base-nova` = converged choice) | TRIAL | 2026-10-14 | design |
| vaul (superseded by Base UI Drawer; npm dormant since 2024-12) | REJECT | 2026-10-14 | design |
| animate-ui (stale ~9.5 mo) | WATCH | 2026-10-14 | design |
| @dnd-kit (no release since 2024-12; repo alive) | WATCH | 2026-10-14 | design |
| T02 frozen-UI guard vs UI PRs #90/#91/#92 (owner decision needed) | ADOPT decision | 2026-10-14 | design |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07) | WATCH (ops) | 2026-10-14 | design |
| shadcn community registries (pmndrs added 10-11; directory growing) | WATCH | 2026-10-14 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) | ADOPT (tooling hygiene) | 2026-10-14 | design |
