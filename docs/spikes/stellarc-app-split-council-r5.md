# Stellarc app split — independent GPT council R5

## Verdict

**Source ownership split: conditional GO. Runtime/release acceptance: HOLD.**

The executed tree implements the supervisor-amended **source-only** split, not the original R1 proposal's independent app factories/manifests. Semantic tracing found no move-induced change in admission, identity pinning, shared error identity, terminal tracking or shutdown composition. Four actionable move-related consumer/gate issues follow; none is a new approval/LLM security finding. Fix the lint-policy and build-cache issues and repoint future gate inputs before calling the split release-ready. No process split, new database role, ingress change or new manifest is required for this scope.

**No runtime green is claimed.** This review ran no product check, test, build, compiler, formatter, install, DB/service probe or network/builder operation. It did not inspect the resource-recovery lane's outputs, wait for it, or change product files. Only this report is owned.

Reviewed in shared dirty checkout `spike/auth-llmgw-maple`, HEAD `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`. Inputs: R1 boundary contract and executed R2/R3/R4 reports, all moved modules and location-sensitive checks, host composition/assets/checks/manifest, candidate-preflight importer, root package/lock/TypeScript/Biome/Turbo/test/CI configuration, and two historical local gate scripts as text only.

## Findings — introduced by the relocation (4)

### R5-1 — P2: core-auth now matches a stricter lint override

**Evidence:** `biome.json:73-86` applies `suspicious.noConsole: error` to `packages/**`. Moving the checks and owner CLI from `apps/stellarc-gateway` into `packages/core-auth` newly brings their existing console calls under that rule: e.g. `packages/core-auth/src/auth-check.ts:174`, `store-check.ts:16`, `database-check.ts:35`, `audit-check.ts:47`, `migrate.ts:59`. Root `package.json:14` runs `biome check .`; these paths are not excluded. R2 §5 mentions import ordering but misses this behavior of the lint configuration.

**Impact:** unchanged TypeScript bytes do not mean unchanged gate behavior. These calls are newly configured lint errors; this is a source-derived gate prediction, not an observed lint run.

**Minimum fix:** preserve the exact receipt strings using `process.stdout.write` with explicit newlines in the moved checks/CLI (preserving multiline/JSON formatting), or make an explicit narrow CLI/check console exception in Biome. Do not turn off `noConsole` for production core modules. Re-mint hashes for any edited files and run the full lint gate; organize the repointed imports as a separate mechanical cleanup when authorized.

### R5-2 — P2: Turbo's host build cache has no dependency on the moved source trees

**Evidence:** `apps/stellarc-gateway/package.json:12` builds `src/main.ts`, whose imports now cross into core-auth/toolgw/llmgw (`main.ts:6-15`). Those three destinations intentionally have no package manifests. `turbo.json:3` defines only `dependsOn: ["^build"]` and `outputs: ["dist/**"]`, with no external source inputs or global dependencies. The host's manifest does not declare these source-only directories as workspace dependencies.

**Impact:** they are neither files under the host package's default input tree nor package-graph build dependencies. A later edit to a moved implementation can leave the host package and its dependency graph unchanged and permit reuse of an older cached `dist/main.js`. The first import-changing build may miss cache correctly; that does not repair subsequent invalidation. Root `bun run build` cannot be treated as proof that these changed bytes were rebuilt merely because Turbo exits successfully.

**Minimum fix:** add a host-specific `@stellarc/gateway#build` input declaration retaining `$TURBO_DEFAULT$` and including `$TURBO_ROOT$/packages/core-auth/src/**`, `$TURBO_ROOT$/apps/toolgw/src/**`, and `$TURBO_ROOT$/apps/llmgw/src/**`. No new app manifests are necessary. Until that lands, use `bun run --cwd apps/stellarc-gateway build` directly for the host artifact and `bun run build -- --force` for fresh full-repository build evidence. Cache-key behavior itself remains unexecuted here.

### R5-3 — P2: historical gate runners execute/hash deleted paths

**Evidence (local script text, not builder state):**

- `/home/rpw/.hermes/cache/scratch/stellarc-r3/full2-gate.sh:48-52` lists `provider-routing*` and `bounded-sse*` under the host, hashes deleted host `store/auth/audit/mcp/remote-mcp` paths, and runs both LLM checks from deleted paths.
- `/home/rpw/.hermes/cache/scratch/stellarc-verify-v83.sh:25` runs deleted `apps/stellarc-gateway/src/auth-check.ts`; line 40 constructs `apps/stellarc-gateway/src/$phase-check.ts` for phases including moved checks.

**Impact:** those runners are valid historical recipes for their old archives, not reusable split-tree acceptance commands. Reusing them with a current source snapshot fails before exercising moved code, or tests an old archive instead of the split. The TypeScript relative-import scan cannot detect these shell consumers. R4 §2's claim of zero script references should not be read as covering local runner recipes.

**Minimum fix:** leave historical scripts/archives/receipts immutable. The supervisor's next authorized runner must use a new snapshot and explicit new-path hash/check lists (see below), include all three new source directories, and preserve the host/root/telemetry/tools inputs rather than copying only `apps/stellarc-gateway`. Do not patch or resume a running resource-owner job. No current builder runner was inspected, so this is a confirmed stale-recipe finding, not an assertion that the recovery lane is using it.

### R5-4 — P3: the current host README points operators at a removed migration CLI

**Evidence:** `apps/stellarc-gateway/README.md:34` still names `src/migrate.ts` in its activation instructions. That file is absent; the only CLI is now `packages/core-auth/src/migrate.ts`. Its actual owner DSN variable is `GATEWAY_OWNER_DATABASE_URL` (`migrate.ts:9`), not the abbreviated `GATEWAY_OWNER_DSN` in R1 §2.

**Impact:** following the activation instructions from the host package resolves a nonexistent file. This is a live operator entrypoint reference, unlike intentionally historical SHA receipts.

**Minimum fix:** update that instruction to `bun ../../packages/core-auth/src/migrate.ts` from the host directory, or `bun packages/core-auth/src/migrate.ts` from repository root, with the actual required environment names. This review does **not** authorize migration or synthetic bootstrap on an existing database.

## Semantic trace and boundaries

### Composition and shared authority

- `apps/stellarc-gateway/src/main.ts:27-65` still creates both pools, calls `assertRuntimeDatabase` then **assert-only** `bindIdentity(sql, issuer, client)`, constructs one store, one telemetry runtime/exporter and one `gatewayAuth`. Core `database.ts:7-19` defaults initialization to false; only the owner CLI passes true (`migrate.ts:16-21`). No relocation-dependent file access exists in database/store/audit.
- `gatewayAuth`'s `approved` and `audit` callbacks remain `store.human` and `store.securityEvent` (`main.ts:63-64`); OIDC verification, exact origin, PKCE-derived nonce, callback issuer validation, cookie prefix and session compensation/drain code remain in core `auth.ts`. This review does not replace actual-library execution evidence.
- Core imports only stdlib, external libraries and its own siblings. No core-to-app dependency was found. All host/tool/audit `Denied` imports resolve to the single definition at `packages/core-auth/src/store.ts:4`; no moved duplicate exists. llmgw keeps its separate `ProviderRoutingError`, as before.
- `store.authorize` **starts its own transaction** (`store.ts:285-294`); `transaction` obtains advisory lock `719324821` (`store.ts:50-51,76-83`). It is not a public tx-aware authorize API. `tool-approval.ts:403,438` invokes `ClaimRecheck(tx, record)` inside an existing store transaction: calling public `authorize` there would still start another transaction contending on the same lock. The missing tx-scoped integration seam has not been implemented by this split.
- Approval audit appends use the shared `store.audit(tx, ...)` (`tool-approval.ts:241-255`); no new direct app audit-table writer was introduced. The dedicated runtime login, pools, audit identity and pinned audience/resource literals remain shared. **Directory separation is code ownership, not a distinct security principal or per-app permission boundary.** Separate runtime roles/processes are not an acceptance requirement of this authorized move.

### Routes remain in the temporary host

- `main.ts:352-408` retains `/mcp` matching, non-admitting authentication, bounded body reading, verified-org derivation and admitting/finish closures. `apps/toolgw/src/mcp.ts:19-125` owns the MCP protocol/session/tool factory and receives those callbacks. The metadata tool still uses admission/finish and the existing memo map. `remote-mcp`, `openapi-operation` and `tool-approval` remain unwired outside their checks.
- `main.ts:409-550` still owns chat route matching, stream/model policy, live-enable decision, provider configuration/credential closure, upstream fetch/local fixture choice and callback wiring. llmgw owns request shaping/provider stream translation and bounded SSE framing. No `/models`, native Messages/Responses ingress, durable approval inbox or full provider replacement was made reachable by moving the modules.
- No `app.ts` was added. This is the R3/R4 explicitly amended ownership-first scope, not proof that R1's original handler-factory extraction or complete app products were delivered. A pass-through wrapper is unnecessary for this scope; future ingress/product integration remains open independently of process separation.

### Lifecycle and location-sensitive consumers

- The host still registers terminal promises before running settlement work (`main.ts:221-242`), tracks handlers and authority work (`149-158`, `451-473`), and drains in this order: stop admission/abort → requests → authorities → auth drain → MCP dispose → finalizers → runtime → SQL pool → PG pool (`609-624`). Import relocation does not introduce a second store/runtime or new untracked finalizer path.
- Reverse-applying only the new import strings in `main.ts`, `http-check.ts`, and `stream-check.ts` reproduces the pre-split hashes recorded in the earlier LLM R5 report exactly. This supports unchanged composition/lifecycle logic; it is not a fresh race/shutdown test.
- Core check self-spawns use `process.execPath` plus **their own** `import.meta.path` (`store-check.ts:272-274,301-303`); tool approval workers do the same at `tool-approval-check.ts:181-205`, forwarding the environment. They therefore follow the relocated file and its sibling/core imports, provided the new paths are present in the snapshot. No fixed old executable path or CWD-relative fixture asset was found in these spawn paths.
- The candidate preflight importer now targets core (`tools/spikes/auth-llmgw/candidate-preflight.ts:4-6`). It is **not** a safe generic acceptance command: it reads candidate configuration, asserts an uninitialized identity pin and writes a preflight audit event. It was read as source only and not run.
- Console loading stays anchored to the unmoved host `import.meta.url` (`main.ts:182-195`). The host build still copies all three assets next to `dist/main.js`, and `artifact-check.ts:3-12` compares exact source/built bytes. The move adds no new asset search root. A source-only snapshot must include new modules; a successful bundled deployment still needs `main.js` **and** its copied assets, not just the JS file.

### Dependency and gate coverage limits

- Root declares Better Auth 1.6.25, pg 8.22.0, postgres 3.4.7, Effect 4.1.2 and zod 4.4.3. **Root does not directly declare jose.** The host declares jose 6.2.12; `bun.lock:1768` pins one jose 6.2.12 resolution and Better Auth also depends on jose. After relocation core `auth.ts:6` must resolve it from a repository-root-visible install, not from the sibling host's private `node_modules`.
- This checkout has no `node_modules`; no resolver was executed. A normal hoisted root install can expose the locked jose, but R1/R2's blanket “all dependencies root-pinned” statement is too strong. Require a frozen-lock root install and source-parent resolution proof on the authorized snapshot. If the selected install isolates jose under the host/Better Auth, make jose a direct root dependency in a separately authorized manifest/lock reconciliation; do not invent a core manifest or claim failure without inspecting that layout.
- `tsconfig.json:23-35` includes both `apps/**/*.ts` and `packages/**/*.ts`; new app/core TS files are covered without manifests. `tools/spikes` is not a root include, so root typecheck does not by itself prove the changed candidate-preflight importer was compiled. No alias or sibling-package export map is needed for these relative imports.
- Biome includes the new TS paths but changes effective policy for core (R5-1); it excludes package.json, HTML and CSS. Root CI runs lint/typecheck/Bun bridge/build, but `tests/gates.test.ts` and the Vitest configs select only `tests/unit/**` and `tests/integration/**`. They do not discover any colocated `*-check.ts`. Direct new-path checks remain mandatory, not implied by repo CI.
- Source-only directories are not separate Turbo tasks/workspace packages. Host build reaches its imported core/MCP/provider modules; it does **not** bundle the unwired tool modules or all moved checks. Typecheck/lint and direct check commands cover different obligations. Cache invalidation needs R5-2.

## Deferred acceptance commands and prerequisites

**Not executed here.** Run only after the supervisor releases builder exclusivity/headroom, on an approved build host and a newly named immutable snapshot. Freeze/re-mint current new-path source and runner hashes before and after execution; preserve old receipts as historical. No live IdP, provider inference, candidate preflight, deployment, service restart or Maple probe is required for these fixture gates.

Prerequisites:

1. Repository-pinned Bun and existing frozen-lock root dependencies; keep `packages/core-auth`, `apps/toolgw`, `apps/llmgw`, the temporary host and `packages/telemetry` in their repository-relative layout. No new package manifest is assumed. Confirm core-source resolution of Better Auth/jose and tool/LLM Effect before interpreting a check result.
2. For **each** PG check invocation, provision a fresh disposable PostgreSQL cluster/role namespace (or explicitly clean isolated roles), not merely another database on a shared cluster: these scripts issue `CREATE ROLE gateway_runtime`. Supply private `SPIKE_OWNER_DSN` and `SPIKE_RUNTIME_DSN` pointing only to that fixture; owner needs the role/schema privileges used by the check. Never reuse an application DSN. Set `AUTH_PG_CHECK=1` for the restricted-PG auth leg; the default auth command tests the memory adapter only.
3. Allow loopback sockets and child processes. Apply an outer deadline with captured exit/logs per command, including self-spawn cleanup; use at least 120 seconds for the slow-body HTTP variant (its host deadline is 30 seconds), and supervisor-sized limits for full repo gates. Preserve known RED groups/hang receipts rather than force-exiting to manufacture green.

From repository root, exact source-parent resolution precheck (module resolution only, not auth execution):

```sh
bun -e 'for (const [p,d] of [["better-auth","packages/core-auth/src"],["better-auth/oauth2","packages/core-auth/src"],["better-auth/plugins/generic-oauth","packages/core-auth/src"],["better-auth/db/migration","packages/core-auth/src"],["jose","packages/core-auth/src"],["effect/ai","apps/toolgw/src"],["effect/http","apps/toolgw/src"],["effect/encoding/Sse","apps/llmgw/src"]]) console.log(p, Bun.resolveSync(p, process.cwd()+"/"+d))'
```

Fixture gates (each PG command gets its **own** fresh fixture/env):

```sh
bun packages/core-auth/src/auth-check.ts
AUTH_PG_CHECK=1 bun packages/core-auth/src/auth-check.ts
bun packages/core-auth/src/store-check.ts
bun packages/core-auth/src/database-check.ts
bun packages/core-auth/src/audit-check.ts
bun apps/toolgw/src/remote-mcp-check.ts
bun apps/toolgw/src/openapi-operation-check.ts
bun apps/toolgw/src/tool-approval-check.ts
bun apps/llmgw/src/bounded-sse-check.ts
bun apps/llmgw/src/provider-routing-check.ts
SLOW_BODY_CHECK=1 bun apps/stellarc-gateway/src/http-check.ts
bun apps/stellarc-gateway/src/stream-check.ts
```

`tool-approval-check` currently collects RED groups and exits nonzero; those are unresolved regression receipts, not acceptance green. `provider-routing-check` and host stream checks inherit F0's possible cleanup hang. Neither expected RED nor a timeout clears integration HOLD.

Artifact/repository gates:

```sh
bun run --cwd apps/stellarc-gateway build
bun apps/stellarc-gateway/src/artifact-check.ts
bun run typecheck
bun run lint
bun test
bun run build -- --force
```

The host build already invokes artifact-check; the explicit command is a standalone readback option, not another independent build proof. After R5-2's cache fix, ordinary `bun run build` is the ongoing build gate. Source host `bun run --cwd apps/stellarc-gateway start` and built `bun apps/stellarc-gateway/dist/main.js` require an **already prepared disposable fixture** with exact `GATEWAY_ORIGIN`, issuer/client/secret/endpoints/auth secret, restricted `GATEWAY_DATABASE_URL`, local OTLP endpoint and port configuration. Runtime startup must reject pin mismatch without initialization; verify `/health` and assets with the pinned Host header, then SIGTERM/drain. This review neither prepared that fixture nor started either entrypoint.

Owner migration path, **only when separately authorized for a fresh fixture**: `bun packages/core-auth/src/migrate.ts`. It requires `GATEWAY_OWNER_DATABASE_URL`, explicit `GATEWAY_BOOTSTRAP_SUBJECT`, exact `GATEWAY_RUNTIME_ROLE=stellarc_gateway_runtime`, and the origin/OIDC/auth variables read at `migrate.ts:16-31`. Runtime check scripts instead use `gateway_runtime`; do not conflate these role names. The core CLI still does not apply `gw_tool_approval`; a toolgw migration/claim integration remains the existing open obligation, not a move-induced defect.

## Frozen-source evidence

A review-local SHA-256 manifest was written before analysis and extended only with subsequently inspected config/historical-script inputs:
`/home/rpw/.hermes/cache/scratch/stellarc-r5-review-freeze.json`.
Manifest SHA-256: `d432086ece02109d9f0b05d5c32b807ccf4f97ba31f8e8af00f325ffd43d2d96` (130 inputs). This manifest is a drift guard, **not** test evidence. All initially frozen inputs were unchanged when the extended manifest was created. Final pre-handoff recheck confirmed **130 inputs unchanged, zero drift**, and the same HEAD and branch.

Independent mechanical corroboration: all 20 destination hashes match the R2/R3/R4 move manifests, all 20 old files are absent; reversing only consumer import substitutions reproduces all three cited pre-split host/check hashes. The parent's relative-import resolution result is corroborating structural evidence, not a substitute for the semantic tracing above.

Key current source hashes (SHA-256):

| New/current path | SHA-256 |
|---|---|
| `packages/core-auth/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `packages/core-auth/src/auth.ts` | `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c` |
| `packages/core-auth/src/database.ts` | `a254325dbb20cda499ace8a8c3edcd773c3ef4824881e6281ad7fadce7362b4c` |
| `packages/core-auth/src/audit.ts` | `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271` |
| `packages/core-auth/src/migrate.ts` | `b2819a149f5fa380cbcaeefb08d437aa2c6757786517f7346cb98da65d8ff9bc` |
| `apps/toolgw/src/mcp.ts` | `c78bad1bfdec570b82fa44f1bf74503620e44b663ca58d00322e52df5673e3d2` |
| `apps/toolgw/src/tool-approval.ts` | `30862c9566f38355f0ac47729c600737e87a99acb4572cf6ac7f34ad57793306` |
| `apps/llmgw/src/provider-routing.ts` | `eabd5f69b9e3c0c2011bf627a480e7939f34b624d3854313c3df91c93707b75f` |
| `apps/llmgw/src/bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| `apps/stellarc-gateway/src/main.ts` | `023fcd2be11932d6502891adf2b575379dc7fadd68cb572c55ebf56cf88490df` |
| `apps/stellarc-gateway/src/http-check.ts` | `ac4ec1d631e97178807cbe0b856a1a5638270be1240e710df1f389df5017a01e` |
| `apps/stellarc-gateway/src/stream-check.ts` | `48e12b867d27052f182edd2755eab34f63d20a5b48daefccc6c2a6daa1b444d2` |

Known approval F1–F4, LLM F0/F1 and downstream parity/seam gates, and audit persistence gap retain their existing owners/status. This report neither re-ranks nor fixes them. No new runtime, deployment or security-isolation claim follows from accepting source ownership.
