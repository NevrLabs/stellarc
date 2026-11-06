# Scout: libraries — 2026-10-09

Beat: **libraries** (Effect ecosystem, Bun, React/TanStack/Vite/Tailwind, local-first, editors, DnD, AI SDKs).
Method: npm registry metadata + tarball inspection (primary), GitHub Releases/API for maintenance signals. Web search backend was down; every row below was verified against npm or GitHub directly. Versions compared against the repo's pins (`package.json`, `apps/stellarc-ui/package.json`).

## Headline

**Effect 4.0 went GA on 2026-10-01** (4.0.2 on 2026-10-07) — the event ADR 0012 has been waiting for — **but `@effect/sql-drizzle` has no 4.x release**, and Stellarc's native kernel uses it (`packages/kaneo/src/kernel.ts:15`). Everything else in the Effect surface Stellarc touches (`@effect/platform-bun`, `@effect/sql-pg`, `@effect/opentelemetry`, `@effect/vitest`) is already published at 4.0.2.

## Findings

| Name | What | Version / date | License | Maturity | Verdict | Why it matters for Stellarc |
|---|---|---|---|---|---|---|
| **effect** | Core GA: platform/rpc/cluster/sql/ai/cli/schema merged into one `effect` package, one shared version. Fiber runtime rewritten (lower memory, faster), STM (`Effect.tx`), Schema v4, HttpApi streaming/SSE, MIGRATION.md published | 4.0.0 2026-10-01, 4.0.2 2026-10-07 (repo pins 3.22.0; last 3.x = 3.22.2) | MIT | 5 | **ADOPT (gated)** | ADR 0012's target runtime. Fewer packages, smaller bundles, one version to track. Gate: sql-drizzle below |
| **@effect/sql-drizzle** | Drizzle bridge used by `kernel.ts` — **still 0.51.0, peers `effect ^3.22.0`, `drizzle-orm <0.50`; no 4.x on npm; `effect@4`'s `effect/sql` has no drizzle module** (verified in tarball) | 0.51.0 2026-07-13 | MIT | 3 | **WATCH (blocker)** | The single hard blocker for the v4 jump. Options: wait; port kernel.ts to raw `@effect/sql`; or vendor a thin adapter |
| **@effect/platform-bun / sql-pg / opentelemetry / vitest** | Runtime-adjacent Effect packages, all on the unified 4.x line, same module names as v3 (`BunHttpServer`, etc. — verified) | 4.0.2 2026-10-07 (repo pins 0.90.0 / 0.53.0 / 0.64.0) | MIT | 5 | ADOPT | Ready the moment the drizzle gate clears |
| **@effect/atom-react** | NEW in v4: React bindings for Effect's Atom state system (signals); peers react 19 | 4.0.2 2026-10-07 | MIT | 2 | **WATCH** | Long-term could give Stellarc an Effect-native client state story to pair with `@tanstack/db`; brand-new, let it bake |
| **Bun** | 1.4 = rewritten Zig→Rust; +1,517 Node compat tests; 5x lower idle CPU, −35% memory, 50% faster Linux start; `Bun.cron()`, `bun test --parallel`, `bun dedupe`/`prune`, `Bun.markdown` | 1.4.0 2026-08-20, 1.4.2 2026-09-05 (repo pins `bun@1.4.0`) | MIT | 5 | **ADOPT** | Agent runtime hosting gets the CPU/memory wins for free; `bun test --parallel` speeds CI; `Bun.cron()` overlaps croner (keep croner for portability for now) |
| **@tanstack/db + @tanstack/electric-db-collection** | Client sync layer; 0.8→0.12 in six weeks; electric collection 0.4.7→0.5.8 and now pins `@tanstack/db 0.12.3` as a hard dep (not peer) | db 0.12.3 / electric 0.5.8, both 2026-10-07 (repo pins 0.8.7 / 0.4.7) | MIT | 3 | **TRIAL** | Must bump together. Pre-1.0 churn is real (4 minors in 6 weeks) but velocity is a good sign; ride it on dev, not mid-migration |
| **@electric-sql/client** | Shape-protocol client | 1.5.28 2026-10-08 (repo pins 1.5.27) | Apache-2.0 | 4 | ADOPT | Routine patch bump |
| **babel-plugin-react-compiler** | React Compiler hit **1.0.0 stable**; UI still pins a Jan-2025 beta (`19.0.0-beta-714736e-20250131`) | 1.0.0 (repo pin ~21 months old) | MIT | 4 | **ADOPT** | Off a stale beta onto stable; fewer re-render footguns in the board/board-virtualized views |
| **react / react-dom** | 19.3.0 | 2026-09-09 (repo pins 19.2.7) | MIT | 5 | ADOPT | Routine minor |
| **motion** (ex framer-motion) | Renamed package; framer-motion 12→14 = motion 14 | 14.0.0 2026-10-02 (UI pins framer-motion 12.42.2) | MIT | 4 | **TRIAL** | Major-version + package-name change; do it in its own PR with a visual pass over animated panels |
| **TypeScript** | **7.0.2** (the Go port, "tsgo" line; 6.0.3 shipped 2026-04-16 as bridge) | 7.0.2 2026-07-08 (repo pins 5.8.3) | Apache-2.0 | 4 | **TRIAL (spike)** | 5.8.3 is two majors behind. tsc drives `typecheck:ui` and turbo; a 7.x spike could cut minutes off CI, but Effect 4 + biome compat must be proven on a branch first |
| **Vite / @vitejs/plugin-react** | Vite 8 line current (8.0.0 was 2026-03-12); plugin-react 6.x | vite 8.3.4 2026-10-08 (UI on ^7.3.5); plugin-react 6.1.2 (UI on ^5.1.4) | MIT | 4 | WATCH | 7.3.x is supported; bundle with a UI-stack upgrade pass, not standalone |
| **Vitest** | 5.0 line started 2026-09-03 | 5.0.3 2026-09-30 (repo pins 4.1.10) | MIT | 4 | WATCH | 4.1.10 is fine; move when Effect 4 migration lands to avoid two variables at once |
| **TipTap / ProseMirror** | Steady minor cadence | @tiptap/core 3.31.4 2026-09-30 (pins 3.28.0); prosemirror-view 1.42.6 2026-09-25 | MIT | 5 | ADOPT | Routine bump; active maintenance confirmed |
| **BlockNote** | Notion-style editor on ProseMirror | 0.55.0 2026-09-22 | **MPL-2.0** | 3 | REJECT | Stellarc already committed to TipTap (rich editor); MPL-2.0 adds license friction for zero win |
| **Zero / Jazz / LiveStore** (local-first alternatives) | Zero 1.9.0 + daily 1.11 canaries; Jazz 2.0.0-alpha.59 in flight; LiveStore 0.4.0 + daily snapshots, repo active 2026-10-07 | as of 2026-10-08 | Apache-2.0 / MIT / Apache-2.0 | 3 | WATCH | Sync decision (Electric + TanStack DB, per 2026-09-08 recon) stands; nothing here argues for a redo — Zero 1.x maturing is the one to keep an eye on |
| **@modelcontextprotocol/sdk** | MCP TS SDK | 1.32.1 2026-10-05 (repo pins 1.29.0) | MIT | 5 | ADOPT | Routine; ADR 0011 agent runtime should track it closely |
| **@agentclientprotocol/sdk / @a2a-js/sdk** | ACP SDK unchanged (1.7.0 = pin); A2A JS SDK 1.3.0 | ACP 1.7.0; A2A 1.3.0 2026-09-29 | Apache-2.0 | 3 | WATCH | ACP current; A2A still no Stellarc use case — revisit if agent-to-agent federation lands in the charter |
| **dnd-kit** | Alive: commits 2026-09-12 (signal-subscription fixes), 17.7k stars | 6.3.1 (repo pin current) | MIT | 4 | WATCH | No action; maintenance fear from earlier research is resolved |
| **@atlaskit/pragmatic-drag-and-drop** | Atlassian's DnD hit 4.0 | 4.0.0 2026-09-24 | Apache-2.0 | 4 | WATCH | Better perf profile for board-sized trees; only revisit if dnd-kit stalls again |
| **better-auth / hono / drizzle / zod / biome** | better-auth 1.7.7 (pins+overrides 1.6.25); hono 4.13.13 with 5.0.0-rc.0 out; drizzle-orm 0.45.4 with 1.0.0-rc.5; zod 4.6.5; biome 2.5.15 | all 2026-09/10 | MIT / Apache-2.0 mix | 4 | TRIAL | better-auth minor bump is safe; **drizzle 1.0 rc is capped anyway by sql-drizzle `<0.50`**; hono 5 rc — stay on 4.13 until legacy tree shrinks |
| **shiki** | Syntax highlighter | 4.5.0 2026-10-01 (pins 4.3.1) | MIT | 5 | ADOPT | Routine bump |

## Proposals

### 1. ADOPT — Start the Effect 4 migration now, gated on `@effect/sql-drizzle`
Land 3.22.2 (final 3.x) as a stepping stone, run the MIGRATION.md audit against `packages/kaneo` + `apps/stellarc-api`, and open the v4 branch. The drizzle bridge is the only blocker; while it's missing, prototype kernel.ts's `PgDrizzle` layer three ways (wait upstream / raw `@effect/sql` rewrite / vendored adapter) and pick. Everything else moves in lockstep since v4 is one version across all `@effect/*`.
*(Issue brief posted as a separate comment for Talos.)*

### 2. ADOPT — Routine bumps batch: Bun 1.4.2, react-compiler 1.0.0, MCP SDK 1.32.1, react 19.3, TipTap 3.31, shiki 4.5, electric client 1.5.28
All low-risk, high-certainty. `bun test --parallel` alone should trim CI wall time.
*(Issue brief posted as a separate comment for Talos.)*

### 3. TRIAL — TypeScript 7 spike (one branch, one measurement)
`bunx tsc --noEmit` (7.0.2) over root + `typecheck:ui` vs current 5.8.3 timings, plus `biome check` compatibility. If typecheck:ui drops materially, plan a 5.8→7 jump after the Effect 4 migration; if Effect 4's types don't resolve under 7, park it and re-check next quarter.

## Notable non-findings

- `@effect/platform` / `@effect/sql` showing 0.x versions on npm is **not** abandonment — their contents moved into `effect` core at 4.0; only platform bindings and drivers remain as separate packages. Don't wait for "platform 4.0".
- Web search provider was down this run (`9router` unregistered); npm + GitHub carried the whole beat. No claim above depends on secondary sources.
