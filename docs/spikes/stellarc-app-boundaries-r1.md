# Stellarc app boundaries — migration contract R1

Design artifact (this file is the only owned output). Baseline: worktree
`spike/auth-llmgw-maple` @ `2dce6d069db62ebf880ec0cb7c280f3a58a7034c` + untracked
spike files, read-only traced 2026-11-09. Authoritative destination:
[`stellarc-replacement-map.md`](stellarc-replacement-map.md) §Destination —
`core-auth` core module, separate `llmgw` + `toolgw` apps, current
`apps/stellarc-gateway` = temporary scaffolding. This contract is a file/ownership
map for immediate execution. **It fixes and claims no open defect** (§9).

## 1. Verified source baseline

`apps/stellarc-gateway/src` (8,465 lines incl. checks). Actual local import graph:

| module | local deps | wired into `main.ts` | colocated check |
|---|---|---|---|
| `store.ts` | — | yes | `store-check.ts` |
| `database.ts` | — | yes (startup) | `database-check.ts` |
| `auth.ts` | — | yes | `auth-check.ts` |
| `audit.ts` | `store` (Denied) | yes (export loop) | `audit-check.ts` |
| `mcp.ts` | `store` (Denied) | yes (`/mcp`) | via `http-check.ts` |
| `provider-routing.ts` | `bounded-sse` | yes (`/orgs/:org/v1/chat/completions`) | `provider-routing-check.ts` |
| `bounded-sse.ts` | — | via provider-routing | `bounded-sse-check.ts` |
| `remote-mcp.ts` | `store` (Denied) | **no — unwired** | `remote-mcp-check.ts` |
| `openapi-operation.ts` | — (zod type-only) | **no — unwired** | `openapi-operation-check.ts` |
| `tool-approval.ts` | `store` (Denied + store type) | **no — unwired** | `tool-approval-check.ts` |
| `main.ts` | audit, auth, database, mcp, provider-routing, store, `../../../packages/telemetry/src/index` | composition root | `http-check.ts`, `stream-check.ts` |
| `migrate.ts` | auth, database, store | owner-only CLI (not runtime) | — |

External deps in use: `better-auth` (+`oauth2`, `plugins/generic-oauth`,
`db/migration`), `jose`, `pg`, `postgres`, `effect` (`/ai`, `/http`,
`/encoding/Sse`), `zod` (type-only, openapi-operation). All already pinned at
repo root — the split adds **no dependency**.

External consumer outside the app: `tools/spikes/auth-llmgw/candidate-preflight.ts:4-6`
imports `audit`/`database`/`store` by app path — must be repointed in Slice 1.
`vitest.config.ts` sweeps only `tests/unit/**`; no vitest coupling. Root
`tsconfig.json` already includes `packages/**/*.ts`.

Deployed reality (delivery ledger): v84 candidate on Talos loopback :1438,
tunnel 8802 → `stellarc.entelechia.cloud` behind Cloudflare Access, dedicated
PG18 :55438, runtime role `stellarc_gateway_runtime`. The split changes none of
it — the host process keeps serving throughout.

## 2. Conventions reused (nothing invented)

1. **Factory composition, callback deps.** `gatewayApp(env)` / `gatewayAuth(config)`
   / `gatewayStore(sql)` / `mcpGateway(origin, telemetry, memoMap)` /
   `auditExporter(sql, endpoint)` are plain factories; deps flow as explicit
   parameters (`auth.ts:19-20` takes `approved`/`audit` callbacks bound to
   `store.human`/`store.securityEvent` at `main.ts:63-64`). New app roots use the
   same shape; no DI framework, no Context tags beyond what `mcp.ts` already uses.
2. **Relative source imports, source-only packages.** `packages/telemetry` has no
   `package.json` and is imported relatively (`main.ts:5`); `apps/stellarc-api`
   imports even workspace packages relatively (`packages/db/src/index` etc.,
   `apps/stellarc-api/src/main.ts:13-24`). → `packages/core-auth` is created the
   same way: **no package.json, no workspace/tsconfig/turbo change**.
3. **Owner-only migration + immutable pin.** `migrate.ts` is an owner CLI
   (`GATEWAY_OWNER_DSN` + exact role regex `stellarc_gateway_runtime`,
   `migrate.ts:45-47`); runtime never migrates. `bindIdentity` initializes
   `gw_identity_binding` only from the owner CLI (`initialize=true`,
   `migrate.ts:16-21`) and the runtime **asserts** it at startup
   (`main.ts:41-42`, assert-only call). Same doctrine as `packages/db` `grantRuntime`
   (checksummed migrations, unprivileged-role check). Preserved verbatim.
4. **Checks beside modules.** `<module>.ts` + `<module>-check.ts` colocated,
   `node:assert/strict`, run via package.json scripts (`bun src/<m>-check.ts`);
   PG checks take disposable `SPIKE_OWNER_DSN`/`SPIKE_RUNTIME_DSN`. Checks move
   with their module; cross-module runtime checks stay with the host.
5. **`gw_` table family in `public` schema** of the dedicated candidate DB
   (`store.ts:13-27`, `tool-approval.ts:43-67`). Table ownership, not schema
   moves, is the per-app boundary (schema-per-org is a Stellarc-CP concern, not
   this spike's).

## 3. Target ownership map

| current path (`apps/stellarc-gateway/src/`) | destination | moves with |
|---|---|---|
| `store.ts`, `store-check.ts` | `packages/core-auth/src/` | — |
| `database.ts`, `database-check.ts` | `packages/core-auth/src/` | — |
| `auth.ts`, `auth-check.ts` | `packages/core-auth/src/` | — |
| `audit.ts`, `audit-check.ts` | `packages/core-auth/src/` | — |
| `migrate.ts` (owner CLI) | `packages/core-auth/src/` | — |
| `provider-routing.ts` + check, `bounded-sse.ts` + check | `apps/llmgw/src/` | new `apps/llmgw/src/app.ts` + `package.json` |
| `mcp.ts`, `remote-mcp.ts` + check, `openapi-operation.ts` + check, `tool-approval.ts` + check | `apps/toolgw/src/` | new `apps/toolgw/src/app.ts` + `package.json` |
| `main.ts`, `http-check.ts`, `stream-check.ts`, `artifact-check.ts`, `console.html/js/css`, `package.json`, `README.md` | stays: temporary host | — |

Dependency rule (enforced by import direction): **core-auth imports nothing from
apps**; llmgw/toolgw import core-auth relatively (`../../../../packages/core-auth/src/...`);
the host imports all three. `Denied` lives in core (`store.ts:4-11`) and remains
the shared error currency. New app `package.json`s mirror the gateway's shape
with `"dependencies": { "effect": "4.1.2" }` only (toolgw; llmgw same via
bounded-sse) — versions already pinned at root, nothing new resolved.

Each app exposes a factory, not a server: `llmgwApp(deps)` returns the
`/orgs/:org/v1/chat/completions` handler extracted from `main.ts:409-550`
(authorize → body/model gate → fixture/live route → `providerResponse` control);
`toolgwApp(deps)` returns the `/mcp` invocation path from `main.ts:360-408`
(authorize `mcp:status` → `mcpGateway.handler` with per-request
`authorize`/`finish` callbacks). The host passes its already-built
`store`/`runtime`/`memoMap`/`origin` — exactly how `main.ts` wires `mcp` today.
`tool-approval`, `openapi-operation`, `remote-mcp` stay **unwired** in toolgw
(integration is council-gated, §9).

## 4. Shared authority entrypoint (existing); tx-scoped recheck still missing

Supervisor clarification: `store.authorize()` owns a transaction; it is NOT an
entrypoint usable inside an existing claim transaction. Only the internal checks
are candidates for reuse. Do not describe the missing tx-scoped recheck as built.
Also, source-only module moves need not wait for runtime headroom, but no moved
source receives acceptance until new-path checks execute. New workspace manifests
require explicit lockfile reconciliation; a pinned version alone does not prove
zero workspace/lock churn. Slice 1 needs no new manifest.

`gatewayStore.authorize(raw, org, action, request, trace, delegation?, admit)`
(`store.ts:285-382`) is the seam both apps consume:

- runs inside `store.transaction` under `pg_advisory_xact_lock(719324821)`
  (`store.ts:50-51,76-91`), appends `call.deny`/`call.admit` audit in the same
  tx (`store.audit`, `store.ts:54-75`), inserts `gw_run` on `admit=true`,
  returns `{principal, subject, delegation, runId}`.
- Apps re-call it non-admitting for mid-stream re-authorization
  (`main.ts:451-473`) and own terminal settlement via `store.finish`/`recover`.
- Human/session side: `gatewayAuth` binds identity to the store through the
  `approved` (`store.human`) and `audit` (`store.securityEvent`) callbacks;
  org is always resolved from the verified principal, never headers.

**Core-auth exports:** `gatewayStore`, `gatewaySchema`, `Denied`, `Principal`,
`gatewayAuth`, `bindIdentity`, `assertRuntimeDatabase`, `auditExporter`. Nothing
else.

**Not in core (provider/tool policy stays in apps):** route validation/catalog
and SSE translation (`provider-routing`, incl. its live-gate
`GATEWAY_ENABLE_LIVE`), MCP tool registration/protocols (`mcp`), remote-MCP
custody bounds (`remote-mcp`), effect classes + operation registry
(`openapi-operation`), approval lifecycle/encryption (`tool-approval`). Actions
(`"llm:stream"`, `"mcp:status"`) remain data rows in `gw_principal.permissions` —
core checks membership, apps define meaning.

**Named seam obligation (identified, not built):** tool-approval's `ClaimRecheck`
(`tool-approval.ts:120-132`) already receives `(tx, record)`. Council R2
explicitly forbids calling `store.authorize()` inside it (nested tx + same
global lock, `store.ts:294`). The tx-aware re-evaluation seam = core exposing
its existing internal `credential`/`principal`/`chain` checks (`store.ts:92-215`)
for use inside a caller's transaction. Implementation belongs to the approval
lane after its F1–F4 fixes; this contract only fixes its location and owner.

## 5. Schema / migration / audit boundaries

| owner | tables | applied by |
|---|---|---|
| core-auth | `gw_installation`, `gw_identity_binding` (immutable pin), `gw_principal`, `gw_credential`, `gw_delegation`, `gw_run`, `gw_audit_state`, `gw_audit` + better-auth `user`/`account`/`session`/`verification` | `packages/core-auth/src/migrate.ts` owner CLI — byte-identical behavior, grants, pin init |
| toolgw | `gw_tool_approval` (`toolApprovalSchema`) | new `apps/toolgw/src/migrate.ts` owner CLI. **Today's `migrate.ts` neither applies nor grants it** (council-noted gap) — carving toolgw makes toolgw the owner of that obligation; the move itself does not discharge it (§9) |
| llmgw | none today | future parity tables (model catalog, B5) land under an `apps/llmgw` owner CLI, never in core |

Audit boundary: the per-org `gw_audit` sequence and its OTLP exporter
(`audit.ts`) are core-owned; apps append **only** through `store.audit` inside
`store.transaction` with their own kind strings (`tool.approval.*` precedent,
`tool-approval.ts:241-257`) — no direct table writes from apps. Exporter
`service.name` stays `"stellarc-gateway"` until a telemetry-change decision;
not part of these slices.

Runtime role: one `stellarc_gateway_runtime` while a single host process
serves. Per-app roles (`llmgw_runtime`, `toolgw_runtime` with table-scoped
grants + per-app `assertRuntimeDatabase`) are a **prerequisite of process
separation**, not of this split — approval-gated, out of scope.

## 6. Host / composition root

The host stays `apps/stellarc-gateway/src/main.ts` (temporary scaffolding per
the map): env + pools + telemetry runtime + core startup
(`assertRuntimeDatabase` → `bindIdentity` assert-only) + auth routes +
`/manage/*` + console + admission/deadline/dispose machinery, delegating the
LLM route to `llmgwApp` and `/mcp` to `toolgwApp`. `Bun.serve` loopback :1438
with pinned-origin translation (`main.ts:628-645`), env names (`GATEWAY_*`),
rollback route and Cloudflare Access gate are untouched.

Host retirement (each app its own process/port/ingress path + role) requires
ingress/Access changes and per-app credentials — separate explicit approval
scopes, deliberately not scheduled here. `/manage/*` (authority management
console) remains host-served until that decision; the store operations behind
it are already core-owned.

## 7. Implementation sequence — 3 slices, exclusive files

Lane prerequisites (from the map's workstreams): `audit.ts`/`audit-check.ts`
sit in the audit-closure lane's scope (its R1 concluded no sender patch;
currently stable — move only with that lane quiet); `tool-approval*.ts` carry
approval-lane F1–F4 fixes awaiting execution; `provider-routing.ts` carries the
LLM-lane F0 fix. The parent sequences actual moves around those lanes; each
slice lists exactly the files its executor may touch.

**Slice 1 — extract `packages/core-auth` (move-only, zero behavior delta).**
- New: `packages/core-auth/src/{store,database,auth,audit,migrate}.ts` +
  `{store,database,auth,audit}-check.ts` (moves; only import lines inside
  moved files change where they referenced siblings).
- Edit (import paths only): `apps/stellarc-gateway/src/{main,mcp}.ts`,
  `http-check.ts`, `stream-check.ts`, gateway `package.json` test scripts,
  `tools/spikes/auth-llmgw/candidate-preflight.ts`.
- Acceptance: moved files byte-identical except import lines (hash before/after);
  `bun` run of auth/store/database/audit checks from new paths green on
  disposable PG; host `http-check` green; typecheck + biome on touched files;
  host starts with unchanged env, `/health` and startup pin assert behave
  identically (no re-init of `gw_identity_binding`).
- Rollback: restore import lines, delete `packages/core-auth/`. No DB, env,
  deploy or packaging state to undo.

**Slice 2 — carve `apps/toolgw`.**
- New: `apps/toolgw/package.json`, `apps/toolgw/src/app.ts` (`toolgwApp`
  factory = the `main.ts:360-408` `/mcp` wiring, parameterized).
- Move: `mcp.ts`, `remote-mcp.ts` + check, `openapi-operation.ts` + check,
  `tool-approval.ts` + check → `apps/toolgw/src/` (imports repointed to core).
- Edit: host `main.ts` `/mcp` block → call `toolgwApp` handler; host
  `package.json` scripts for moved checks.
- Acceptance: `http-check` (metadata tool, session binding, denial audit through
  the host) green; `remote-mcp`/`openapi-operation`/`tool-approval` checks run
  from new paths, bytes unchanged except imports; no new route or behavior.
- Rollback: move files back, restore host `/mcp` block and scripts.

**Slice 3 — carve `apps/llmgw` + slim host.**
- New: `apps/llmgw/package.json`, `apps/llmgw/src/app.ts` (`llmgwApp` factory =
  the `main.ts:409-550` streaming route, parameterized).
- Move: `provider-routing.ts` + check, `bounded-sse.ts` + check →
  `apps/llmgw/src/`. Prerequisite: LLM-lane F0 fix landed (moving first would
  churn the exact bytes the seam gate must hash).
- Edit: host `main.ts` chat-completions block → `llmgwApp` handler; scripts.
- Acceptance: `stream-check` + `http-check` green through the host (fixture
  stream, revocation mid-read, terminal settlement unchanged); artifact-check
  console bytes identical; repo `typecheck`/`lint`/`build` on the frozen tree.
- Rollback: revert moves and host block; imports/packaging only.

**Receipt caveat:** council manifests and `docs/spikes/auth-llmgw-receipts/`
pin SHA-256s to current paths. Every move makes those path-pinned receipts
historical (bytes may be identical; paths are not). Each slice re-mints
new-path hashes and inherits **no** green claims — §9 gaps stay open.

## 8. Invariants preserved (acceptance reads them back)

- Startup issuer/client pin: `main.ts:41-42` assert-only `bindIdentity`
  unchanged; owner CLI remains sole initializer; mismatch still refuses boot.
- Delegation literals `audience='stellarc-gateway'` / `resource='gateway'`
  (`store.ts:253,281,332-333`) — **do not rename**; existing rows and checks
  depend on them. Per-app audiences are a process-split decision.
- `GATEWAY_*` env names, cookie prefix `stellarc-gateway` (`auth.ts:175`),
  `Denied` statuses/reasons, audit kinds, route shapes, 30 s deadline +
  admission ceiling 8, dispose ordering (`main.ts:609-625`), console bytes.

## 9. Open items NOT claimed fixed by this refactor

- Tool-approval council R2: F1 (rolled-back expiry/claim-denial audits), F2
  (recovery audits stale candidates), F3 (report bypasses claim-owner), F4
  (check defects) — integration HOLD stands; `gw_tool_approval` still unapplied
  by any owner CLI; human/session binding + CSRF obligations stand.
- LLM council R4: F0 (`cleanup()` awaiting `reader.cancel()` — seam gate hang),
  F1 (live error fidelity), seam + 8 downstream phases unverified; B5 parity
  (OAuth providers, cross-wire translation, catalog, SDK) open by design.
- Audit persistence gap: acknowledged-but-missing Maple events remain OPEN
  (collector-owner correction, offline); the audit lane owns it.
- Builder gates paused for resource headroom; nothing here authorizes reruns.

File moves change ownership boundaries, not defect status. Every item above
keeps its owning lane and evidence gate exactly as the replacement map records.
