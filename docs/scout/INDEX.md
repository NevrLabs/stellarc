# Scout Radar — running index

One row per tracked item. Rings: ADOPT / TRIAL / WATCH / REJECT.
`last-checked` = date the row was verified against a primary source.

| Item | Ring | Last checked | Beat |
|---|---|---|---|
| Linear (Loops, coding sessions, spend caps) | WATCH | 2026-10-13 | competitors |
| Plane (Agents, Propel, credit limits) | TRIAL | 2026-10-13 | competitors |
| Multica (wakeups, deliverables, cost curves) | WATCH | 2026-10-08 | competitors |
| Paseo (plugin registry, usage aggregation) | TRIAL | 2026-10-13 | competitors |
| Cursor (Origin App Marketplace, iOS remote, MCP allowlists) | WATCH | 2026-10-13 (evening) | competitors |
| Copilot coding agent (sandboxing GA, stacked PRs) | ADOPT | 2026-10-13 (evening) | competitors |
| OpenHands (ACP agents, model discovery) | WATCH | 2026-10-13 (evening) | competitors |
| Devin (memory/dreaming, inbox, Outposts, plugin governance) | WATCH | 2026-10-13 (evening) | competitors |
| Factory Droids (Script waits) | REJECT | 2026-10-13 | competitors |
| Huly | REJECT | 2026-10-13 | competitors |
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
| effect 4.x (GA, 4.0.4; port merged to effect/v4 branch, pin 4.0.2) | ADOPT | 2026-10-14 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156) | ADOPT | 2026-10-14 | libraries |
| effect `eventlog` module (SqlEventJournal; unstable; unchanged 4.0.0→4.0.4) | WATCH | 2026-10-14 | libraries |
| Bun 1.4.3 (`bun check`, FetchSession, idle CPU; brief = NEVR-157 blocked) | ADOPT | 2026-10-14 | libraries |
| @tanstack/db 0.13 + electric collection 0.5.9 | TRIAL | 2026-10-13 | libraries |
| @tanstack/tauri-db-sqlite-persistence (desktop offline) | WATCH | 2026-10-13 | libraries |
| ACP v1.25 (session compaction, notices); v2 alpha | ADOPT bump | 2026-10-14 | libraries |
| Zero 1.10 (strongest sync alternative) | WATCH | 2026-10-14 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (drops @modelcontextprotocol/sdk at v4) | TRIAL | 2026-10-14 | libraries |
| drizzle-orm 1.0 line (upstream effect* dist-tags live) | WATCH | 2026-10-14 | libraries |
| jazz-tools (correction: 0.20.19 + 2.0-alpha; not 1.2.0) | REJECT | 2026-10-14 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua (dnd/list virtualization alternative) | WATCH | 2026-10-14 | libraries |
| effect-lens (v4 community libs signal) | WATCH | 2026-10-14 | libraries |
| hono 5.0.0-rc line opened | WATCH | 2026-10-14 | libraries |
| TypeScript 7 / tsgo (answer via `bun check`) | TRIAL | 2026-10-13 | libraries |
| @sentry/node 11 (one major ahead of pin) | WATCH | 2026-10-13 | libraries |
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
