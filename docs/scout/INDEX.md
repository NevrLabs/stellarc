# Scout Radar — running index

One row per tracked item. Rings: ADOPT / TRIAL / WATCH / REJECT.
`last-checked` = date the row was verified against a primary source.

| Item | Ring | Last checked | Beat |
|---|---|---|---|
| Linear (stacked PRs, realtime diffs, spend caps; unchanged 10-15) | WATCH | 2026-10-15 | competitors |
| Plane (Agents GA, Propel; self-host 3.3.3; unchanged 10-15) | TRIAL | 2026-10-15 | competitors |
| Multica (v0.6.2 10-13; main 10-15: WS revocation on member removal MUL-8014, batch-claim recovery MUL-7658) | WATCH | 2026-10-15 | competitors |
| Paseo (v0.11.3/v0.11.4 10-15: Hoplite first sponsor + opt-in provider; question-card UX at ACP seam) | TRIAL | 2026-10-15 | competitors |
| Cursor (Origin App Marketplace, iOS remote; unchanged 10-15) | WATCH | 2026-10-15 | competitors |
| Copilot coding agent (agentic autofix GA + HydraFusion Max 10-15; platform: push attribution + Actions lockfiles 10-12/14) | ADOPT (pattern) | 2026-10-15 | competitors |
| OpenHands (ACP agents; hold-until-reachable on main; no release since v1.27.1 10-12) | WATCH | 2026-10-15 | competitors |
| Devin (Oct 14: interrupt keeps partial reply, session-link chips, Review-manager role, SARIF export) | WATCH | 2026-10-15 | competitors |
| Factory Droids (v0.242.0 10-15: resume-by-id, spec continuation, self-kill refusal, timeout retries) | WATCH | 2026-10-15 | competitors |
| GitHub push attribution (durable authenticated-pusher on commits) | WATCH (steal requirement) | 2026-10-14 | competitors |
| NEVR-198 scoped permission pipeline (landed dev 10-15 @681e418; row open until verified on a release) | ADOPT (landed) | 2026-10-15 | competitors |
| Huly (no commits in window; no agent story; next check Jan 2027) | REJECT | 2026-10-15 | competitors |
| Tauri 2 (chosen shell; 2.12.4 out 10-14 — IPC/asset empty-path panic fix; Cargo.lock committed @2.12.3 + weekly dependabot via NEVR-191/PR #98; await dependabot 2.12.4 PR, review for #16197) | ADOPT | 2026-10-15 | cross-platform-ui |
| Tauri 3.0-alpha (core alpha.5 10-14, dep-sync only; npm next: cli α.5, api α.3) | WATCH | 2026-10-15 | cross-platform-ui |
| tauri-runtime-cef (α.6 10-14: OSR IME/input/composition app-provided #16225, session-restore fix, CEF 154.5; webkitgtk tail 77 open) | WATCH | 2026-10-15 | cross-platform-ui |
| GPUI Kit (ex gpui-component, Rust desktop, v0.7.3; code Apache-2.0, docs CC BY 4.0) | WATCH | 2026-10-15 | cross-platform-ui |
| Expo / React Native (SDK 57.0.29; RN 0.87.1; second stack) | REJECT | 2026-10-15 | cross-platform-ui |
| react-native-web (0.21.4; signal only) | REJECT | 2026-10-15 | cross-platform-ui |
| Capacitor (8.5.3; 9.0.0-alpha.8 on next — Tauri mobile covers) | REJECT | 2026-10-15 | cross-platform-ui |
| Dioxus (0.8.0-alpha.2 10-14, first movement since Jul; stable 0.7.10) | REJECT | 2026-10-15 | cross-platform-ui |
| Flutter | REJECT | 2026-10-15 | cross-platform-ui |
| Lynx 4.1 (web+iOS+Android, bindings 0.127.0 pre-1.0) | WATCH | 2026-10-15 | cross-platform-ui |
| Electrobun (beta .25, macOS-centric) | REJECT | 2026-10-15 | cross-platform-ui |
| @axe-core/playwright (4.13.0; NEVR-150 filed+todo — row open until built) | ADOPT (pending) | 2026-10-15 | cross-platform-ui |
| effect 4.x (4.0.5 fully on npm — core published 10-15 01:27 UTC, skew resolved, NEVR-156 gate GREEN; v4 branch pins 4.0.2; bump straight to 4.0.5) | ADOPT | 2026-10-16 | libraries |
| effect `reactivity` + @effect/atom-react (still `@stability unstable` in shipped 4.0.5, verified in tarball; 280 react-query call sites on dev) | WATCH | 2026-10-16 | libraries |
| @a2a-js/sdk 1.3 (A2A protocol; no Stellarc consumer today) | WATCH | 2026-10-15 | libraries |
| @tanstack/trailbase-db-collection (TrailBase integration exists upstream; ADR 0007 rejection stands) | WATCH | 2026-10-15 | libraries |
| @effect/sql-drizzle (removed upstream in v4) | REJECT | 2026-10-13 | libraries |
| packages/drizzle-effect (owned v4 bridge; on effect/v4; tests = NEVR-156) | ADOPT | 2026-10-15 | libraries |
| effect `eventlog` module (SqlEventJournal; unstable; unchanged 4.0.0→4.0.5) | WATCH | 2026-10-15 | libraries |
| Bun 1.4.3 (`bun check`, FetchSession, idle CPU; brief = NEVR-157 blocked; unchanged; canary daily) | ADOPT | 2026-10-16 | libraries |
| @tanstack/db 0.15 + electric collection 0.6.1 (0.15: windowed-include lazy load + BREAKING findOne/setWindow window rules — setWindow({limit}) on findOne throws; NEVR-211's 0.14 pin was already 3h stale at merge; 0 call sites affected today; brief 10-16) | TRIAL | 2026-10-16 | libraries |
| @tanstack/tauri-db-sqlite-persistence 0.2.35 (claim-loss recovery; repointed to db 0.15.0) | WATCH | 2026-10-16 | libraries |
| ACP v1.25 schema / SDK 1.8.0 (rust 1.11.0; repo pushed 10-16; bump pending NEVR-129) | ADOPT bump | 2026-10-16 | libraries |
| Zero 1.10.0 (rocicorp/mono 3,411★ pushed 10-15; unchanged) | WATCH | 2026-10-16 | libraries |
| effect v4 core layout (ai/sql/graphql/rpc in core; v3-only umbrellas dead) | ADOPT hygiene | 2026-10-14 | libraries |
| effect/ai McpServer (NEVR-185 / PR #99 MERGED to effect/v4 @bd997b7 — @modelcontextprotocol/sdk out of v4 tree) | TRIAL | 2026-10-16 | libraries |
| drizzle-orm 1.0 line (npm `rc` tag is rc.4; rc.5-* are suffixed builds, no installable rc.5; bridge stays) | WATCH | 2026-10-15 | libraries |
| jazz-tools (correction: 0.20.19 + 2.0-alpha; not 1.2.0) | REJECT | 2026-10-14 | libraries |
| pragmatic-drag-and-drop 4.0 (major velocity warning) | WATCH | 2026-10-14 | libraries |
| virtua (dnd/list virtualization alternative) | WATCH | 2026-10-14 | libraries |
| effect-lens (single-author 0★ repo, no release since 10-02 — not an ecosystem signal; demoted) | REJECT | 2026-10-16 | libraries |
| effect v3 line (3.22.3 10-16: LayerMap idle-TTL preload, Reloadable.auto scope-close hang, finalizer-on-interrupt — dev pins 3.22.0; fold into next dev dep pass) | ADOPT (v3 patch) | 2026-10-16 | libraries |
| LiveStore 0.5.0 stable (10-15; Effect-4 cohort aligned 4.0.3 — strongest Effect-native alternative sync runtime; ADR 0007 fallback, not parallel trial) | WATCH (elevated) | 2026-10-16 | libraries |
| @effect/vitest 4.0.5 (peer vitest >=5 <6; dev+v4 pin vitest 4.1.10 — gated on Vitest 5 major; calendar with hono 5 batch) | WATCH (gated) | 2026-10-16 | libraries |
| effect npm publish skew (RESOLVED: core 4.0.5 on npm 24 min after satellites; guard retired — verify core resolves before any effect bump) | ADOPT (resolved) | 2026-10-16 | libraries |
| hono 5.0.0-rc line (rc.1 on `next`; calendar with vite/vitest majors + @effect/vitest vitest-5 gate) | WATCH | 2026-10-16 | libraries |
| TypeScript 7 / tsgo (7.0.2 stable; 7.1-dev dailies; answer via `bun check`) | TRIAL | 2026-10-15 | libraries |
| @sentry/node 11 (11.8.0 10-15; rides NEVR-129) | WATCH | 2026-10-16 | libraries |
| shadcn chat primitives (PR #91 = NEVR-170; blocked by T02 freeze guard) | ADOPT | 2026-10-14 | design |
| shadcn AI elements (22 patterns, 3 dialects; trace/code-block/message installable; port rule: strip icon-placeholder import) | ADOPT (post-freeze, proposal) | 2026-10-15 | design |
| `ui-typecheck-budget` red on PRs + dev (continue-on-error; count 429 = budget 429; informational, not a blocker) | REJECT (as blocker) | 2026-10-15 | design |
| Base UI npm name: `@base-ui/react` is live (1.9.0); `@base-ui-components/react` is stale pre-rename (1.0.0-rc.0) | ADOPT (correction recorded) | 2026-10-15 | design |
| `@shadcn/react` 0.3.1 (superseded by registry-native AI elements for our use) | WATCH → REJECT-track | 2026-10-15 | design |
| T02 decision aging (brief with Talos since 10-14; day 3; escalate at day 5 ≈ 10-18) | WATCH | 2026-10-15 | design |
| shadcn Typeset (streaming-safe markdown css; rides PR #91) | TRIAL | 2026-10-14 | design |
| @coss registry entry in components.json (AGPL, unused; removal rides PR #92) | REJECT | 2026-10-14 | design |
| @shadcn/react (headless chat primitives; rides PR #91) | TRIAL | 2026-10-14 | design |
| skills/migrate-radix-to-base (shadcn method skill; used by PR #92) | ADOPT | 2026-10-14 | design |
| Radix dep tail + components.json dialect (PR #92 = NEVR-171; blocked by T02) | ADOPT cleanup | 2026-10-14 | design |
| motion 14 (rides PR #90 = NEVR-172; blocked by T02) | ADOPT bump | 2026-10-14 | design |
| lucide-react 1.x (1.57.0 out 10-14; PR #90's ^1.56 covers it) | ADOPT bump | 2026-10-14 | design |
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
| cmdk (dormant 19mo, in use) | WATCH | 2026-10-14 | design |
| shadcn DESIGN.md workflow skill (seed for post-freeze design-system merge) | TRIAL | 2026-10-14 | design |
| Base UI (`@base-ui/react` 1.9.0; toast/popover focus fixes 10-15; PR #90's ^1.9 stands) | ADOPT | 2026-10-15 | design |
| shadcn named styles (8 styles × 3 dialects; `base-nova` = converged choice) | TRIAL | 2026-10-15 | design |
| shadcn repo velocity 10-14/15: AI elements #12307, zod-4 #12298, Figma kit; CLI 4.21.5 unchanged | ADOPT (tooling hygiene) | 2026-10-15 | design |
| vaul (superseded by Base UI Drawer; npm dormant since 2024-12) | REJECT | 2026-10-14 | design |
| animate-ui (stale ~9.5 mo) | WATCH | 2026-10-14 | design |
| @dnd-kit (no release since 2024-12; repo alive) | WATCH | 2026-10-14 | design |
| T02 frozen-UI guard vs UI PRs #90/#91/#92 (owner decision needed) | ADOPT decision | 2026-10-14 | design |
| desktop bundle-signed red on dev (APPLE_CERTIFICATE secrets missing, T07) | WATCH (ops) | 2026-10-15 | design |
| shadcn community registries (pmndrs added 10-11; directory growing) | WATCH | 2026-10-14 | design |
| shadcn CLI 4.21.5 (undici + MCP SDK security bumps, 10-14) | ADOPT (tooling hygiene) | 2026-10-14 | design |
