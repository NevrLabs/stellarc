# Stellarc core-auth extraction — execution report R2

Source-only Slice 1 move, **executed** 2026-11-09 in worktree
`spike/auth-llmgw-maple` @ `2dce6d0` (untracked spike tree). Contract:
[`stellarc-app-boundaries-r1.md`](stellarc-app-boundaries-r1.md) §7 Slice 1.
This report is the actual move/import manifest plus structural verification.
**It is NOT runtime acceptance** — every run gate (§5) remains open.

## 1. Move manifest (9 files, byte-identical, no exceptions)

Method: byte-copy to `packages/core-auth/src/`, SHA-256 before/after guard,
then `python os.unlink` of exactly the nine originals after both sides
verified identical to the before-manifest (guarded abort on any drift;
one abort actually occurred on a wrong expected-count in my own verifier and
was corrected — no file state was affected). No edits inside moved files:
their only local imports are sibling-to-sibling (`./store`, `./auth`,
`./database`, `./audit`) and all siblings moved together, so every relative
import inside the package still resolves unchanged. `store-check.ts`'s
self-spawn workers (`Bun.spawn([process.execPath, import.meta.path, ...])`,
lines 272–273, 301–302) reference their own file location and remain correct
at the new path.

| old path (`apps/stellarc-gateway/src/`) | new path (`packages/core-auth/src/`) | SHA-256 (before == after) |
|---|---|---|
| `store.ts` | `store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `store-check.ts` | `store-check.ts` | `a0ac1a28d925fefc20962cf9736d2b9e45cd8cf26b69cfee2bdbeacf54ab9279` |
| `database.ts` | `database.ts` | `a254325dbb20cda499ace8a8c3edcd773c3ef4824881e6281ad7fadce7362b4c` |
| `database-check.ts` | `database-check.ts` | `b8654e907ed865d535aca05e89a896119885bfade423228e3a3452f4c10ee4ea` |
| `auth.ts` | `auth.ts` | `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c` |
| `auth-check.ts` | `auth-check.ts` | `775b2e52a47a015c5fc479f45e70f8f27512fe5496fadb79c63ffcc5ba5932f4` |
| `audit.ts` | `audit.ts` | `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271` |
| `audit-check.ts` | `audit-check.ts` | `af3b82ea80d17885fd8e943d8aed612ebac1e4790dd77d0e9eee331c135b7aa7` |
| `migrate.ts` | `migrate.ts` | `b2819a149f5fa380cbcaeefb08d437aa2c6757786517f7346cb98da65d8ff9bc` |

`packages/core-auth/` is source-only, matching the `packages/telemetry`
precedent: **no package.json, no tsconfig/workspace/root/lock change**.
Root `tsconfig.json` already includes `packages/**/*.ts` (line 25), so
typecheck coverage requires no manifest change (coverage *claim* unverified —
typecheck not run, §5).

## 2. Import repoint manifest (only import strings changed; lines in place)

All consumers located by repo-wide symbol/path scan (`from "./<module>"`,
`stellarc-gateway/src/<module>`, `@stellarc/gateway`, dynamic `import(…)`).
The complete consumer set and every edit:

| file | line | old specifier → new specifier |
|---|---|---|
| `apps/stellarc-gateway/src/main.ts` | 6 | `"./audit"` → `"../../../packages/core-auth/src/audit"` |
| `apps/stellarc-gateway/src/main.ts` | 7 | `"./auth"` → `"../../../packages/core-auth/src/auth"` |
| `apps/stellarc-gateway/src/main.ts` | 8 | `"./database"` → `"../../../packages/core-auth/src/database"` |
| `apps/stellarc-gateway/src/main.ts` | 15 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/mcp.ts` | 5 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/http-check.ts` | 6 | `"./auth"` → `"../../../packages/core-auth/src/auth"` |
| `apps/stellarc-gateway/src/http-check.ts` | 7 | `"./database"` → `"../../../packages/core-auth/src/database"` |
| `apps/stellarc-gateway/src/http-check.ts` | 9 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/stream-check.ts` | 6 | `"./auth"` → `"../../../packages/core-auth/src/auth"` |
| `apps/stellarc-gateway/src/stream-check.ts` | 7 | `"./database"` → `"../../../packages/core-auth/src/database"` |
| `apps/stellarc-gateway/src/stream-check.ts` | 9 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/remote-mcp.ts` | 4 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/tool-approval.ts` | 8 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/tool-approval.ts` | 9 | `type "./store"` → `type "../../../packages/core-auth/src/store"` |
| `apps/stellarc-gateway/src/tool-approval-check.ts` | 4 | `"./store"` → `"../../../packages/core-auth/src/store"` |
| `tools/spikes/auth-llmgw/candidate-preflight.ts` | 4 | `"../../../apps/stellarc-gateway/src/audit"` → `"../../../packages/core-auth/src/audit"` |
| `tools/spikes/auth-llmgw/candidate-preflight.ts` | 5 | `"../../../apps/stellarc-gateway/src/database"` → `"../../../packages/core-auth/src/database"` |
| `tools/spikes/auth-llmgw/candidate-preflight.ts` | 6 | `"../../../apps/stellarc-gateway/src/store"` → `"../../../packages/core-auth/src/store"` |

Unchanged sibling imports in remaining host files (`./mcp`,
`./provider-routing`, `./main`, `./bounded-sse`, `../../../packages/telemetry/…`)
are preserved verbatim. No export renames, no compatibility shims, no
duplicate authority implementation — the moved files are the single
implementation.

## 3. Gateway `package.json` scripts (moved check paths only)

| script | before | after |
|---|---|---|
| `test` | `bun src/auth-check.ts` | `bun ../../packages/core-auth/src/auth-check.ts` |
| `test:store` | `bun src/store-check.ts` | `bun ../../packages/core-auth/src/store-check.ts` |
| `test:audit` | `bun src/audit-check.ts` | `bun ../../packages/core-auth/src/audit-check.ts` |

`test:http`, `test:stream`, `start`, `build` untouched (host checks;
`database-check.ts` never had a script — none added). No other manifest in
the repo references the moved files (turbo/CI/root package: zero hits).

## 4. Structural verification actually run

- **Hash identity**: all 9 destination SHA-256s equal the before-manifest
  (table §1); originals confirmed un-drifted immediately before removal;
  post-removal re-verified.
- **Import-graph resolution**: 53 relative imports across
  `apps/stellarc-gateway/src`, `packages/core-auth/src`,
  `tools/spikes/auth-llmgw`, `packages/telemetry/src` all resolve to existing
  files (specifier + `.ts` / `/index.ts` rules). Unresolved: 0.
- **Stale-reference scan**: zero remaining code references to the old module
  paths (`from "./store"`-style or `apps/stellarc-gateway/src/<moved>` in
  ts/js/json/html under apps/packages-tools-tests). Matches in
  `packages/agents` / `packages/kaneo-legacy` are their own distinct
  `./store`/`./auth`/`./database` modules, not consumers. Path-pinned hashes
  in `docs/spikes/auth-llmgw-receipts/` are historical by contract §7 and
  deliberately untouched.
- **`git diff --check`**: clean (no whitespace errors / conflict markers).
- **Dynamic/self-import trace**: no dynamic `import()` of moved modules
  exists anywhere; the only self-references are `import.meta.path` spawns
  inside `store-check.ts` (moves with the file) and `tool-approval-check.ts`
  (not moved).

## 5. NOT executed — open gates inherited, none claimed

Per task constraints (source-only, no builder/host load): **typecheck, biome,
build, `bun` check runs (auth/store/database/audit from new paths), host
start, `/health`, and pin-assert behavior were NOT run** — the contract §7
Slice 1 acceptance criteria remain open gates. Known deferred detail:
`biome.json` has assist `organizeImports: "on"`; in `main.ts` the in-place
specifier swaps leave import lines at their original positions, so a future
biome assist pass will re-sort (cosmetic ordering only, zero semantics).
Structural verification above is graph/hash proof, **clearly not runtime
acceptance**.

## 6. Canonical new paths for future gates

`packages/core-auth/src/{store,store-check,database,database-check,auth,auth-check,audit,audit-check,migrate}.ts`
— hashes as minted in §1 (identical bytes, new paths; all prior path-pinned
receipts are historical per §7). Future gates should re-mint from these
paths: the four moved checks via gateway scripts `test`, `test:store`,
`test:audit` (and `database-check` directly), host `test:http`/`test:stream`,
plus repo `typecheck`/`lint`/`build` on the frozen tree.

## 7. Invariants preserved by construction

Moved files are byte-identical ⇒ `Denied` statuses/reasons, delegation
literals `audience='stellarc-gateway'` / `resource='gateway'`, issuer/client
pin (`bindIdentity` assert-only startup, owner-CLI-only init), runtime-role
regex, `gw_` schema, `GATEWAY_*` env names, cookie prefix
`stellarc-gateway`, audit kinds, and exporter `service.name`
`"stellarc-gateway"` are all unchanged. Rollback = restore the nine import
blocks/scripts above and move the nine files back (no DB/env/deploy state).

## 8. Open items unchanged (no claim of resolution)

Tool-approval F1–F4 (integration HOLD), LLM lane F0/F1 + seam phases, audit
persistence gap, and the production-fix approvals F1–F3 / LLM-hang remain
owned by their lanes exactly as recorded in the boundaries contract §9.
