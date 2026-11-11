# Stellarc toolgw extraction — execution report R3

Source-only Slice 2 move, **executed** 2026-11-09 in worktree
`spike/auth-llmgw-maple` @ `2dce6d0` (untracked spike tree, after Slice 1).
Contract: [`stellarc-app-boundaries-r1.md`](stellarc-app-boundaries-r1.md)
§7 Slice 2, as amended by the supervisor brief for this slice: source-only app
(no package.json, no lock/deps change), orchestration host-side unless
extraction is real. This report is the actual move/import manifest plus
structural verification. **It is NOT runtime acceptance** — every run gate
remains open, and the builder gates stay paused until parent headroom
acceptance.

## 1. Move manifest (7 files, byte-identical, no exceptions)

Method identical to Slice 1: SHA-256 before-manifest, byte-copy to
`apps/toolgw/src/`, destination hashes re-verified equal, originals re-verified
un-drifted, then `python os.unlink` of exactly the seven originals;
post-removal re-verified. **Zero bytes changed inside any moved file** — no
import edits were needed:

- Core-auth imports (`Denied`, `type gatewayStore`, `gatewaySchema`,
  `gatewayStore`) were already at
  `../../../packages/core-auth/src/store` after Slice 1.
  `apps/toolgw/src` is depth-identical to `apps/stellarc-gateway/src`
  (both `apps/<app>/src`, three levels), so the three-up specifier is
  unchanged and correct (the contract §3 four-up note was a
  supervisor-corrected error; three ups is right, verified by resolution
  check §4).
- Check→module sibling imports (`./remote-mcp`, `./openapi-operation`,
  `./tool-approval`) moved together and stay sibling-valid.
- `openapi-operation.ts` has no local imports (node + zod type-only).
- Self-spawn paths move with their file: `tool-approval-check.ts`
  `Bun.spawn([process.execPath, import.meta.path, …])` (lines 184, 205)
  reference their own file location and remain correct at the new path.

| old path (`apps/stellarc-gateway/src/`) | new path (`apps/toolgw/src/`) | SHA-256 (before == after) |
|---|---|---|
| `mcp.ts` | `mcp.ts` | `c78bad1bfdec570b82fa44f1bf74503620e44b663ca58d00322e52df5673e3d2` |
| `remote-mcp.ts` | `remote-mcp.ts` | `6c2bc54768308f1395f4f45150784564e7852dbefde0bb917fcee12f13272adc` |
| `remote-mcp-check.ts` | `remote-mcp-check.ts` | `21111bdc4ab38e3382dc73404c5bde90581adfcab404f17e6a936156f7008166` |
| `openapi-operation.ts` | `openapi-operation.ts` | `a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1` |
| `openapi-operation-check.ts` | `openapi-operation-check.ts` | `cf707a22e1660c8eaf33b660c76006998c021c4acbed991c022f04e3e861b573` |
| `tool-approval.ts` | `tool-approval.ts` | `30862c9566f38355f0ac47729c600737e87a99acb4572cf6ac7f34ad57793306` |
| `tool-approval-check.ts` | `tool-approval-check.ts` | `3f3d56525f49e305fd8524db655c91ca0fdd47118213ef1fe7420120112afaa6` |

## 2. Import repoint manifest (exactly one edit outside the moved set)

Complete consumer set located by repo scan (sibling `from "./<module>"`,
`stellarc-gateway/src/<module>` path references, `@stellarc/gateway`, dynamic
`import(…)`, symbol references `mcpGateway`/`connectRemoteMcp`/
`createToolApprovals`/`createOperationExecutor`, manifest/turbo/CI scripts):

| file | line | old specifier → new specifier |
|---|---|---|
| `apps/stellarc-gateway/src/main.ts` | 9 | `"./mcp"` → `"../../toolgw/src/mcp"` |

That is the **only** edit. No other file in the repo imports any moved module
(`http-check.ts`/`stream-check.ts` exercise `/mcp` through the host
`gatewayApp`, not the module; no package.json/turbo/CI script referenced the
moved checks — they were run ad hoc via `bun src/<check>.ts`; the
`@stellarc/gateway` name appears only in its own manifest's `name` field).
Historical path-pinned hashes in `docs/spikes/auth-llmgw-receipts/` are
deliberately untouched per contract §7 and are now historical.

## 3. app.ts decision — orchestration stays host-side (deliberate, not skipped)

`apps/toolgw/src/app.ts` was **not** created. The brief's criteria decided it:

- The `/mcp` route block (`main.ts:360-408`) is per-request host orchestration:
  it consumes `store.authorize` admission, the host `body(request, signal)`
  bounded reader, the host `abort.signal` (admission controller + 30 s
  deadline + disconnect listener), the host `finish` closure (runId tracking,
  terminal retry, `finalizers` set shared with the LLM route and `dispose()`),
  and `span.traceId`. A `toolgwApp(deps)` factory would be a pass-through
  wrapper threading 8+ host closures — a wrapper with no ownership, exactly
  what the brief rejects ("real app separation not needless wrappers").
- The existing `mcpGateway(origin, telemetry, memoMap)` factory
  (`apps/toolgw/src/mcp.ts:19`) **is** the app seam: it owns MCP protocol,
  tool registration, session binding/capacity, and exposes per-request
  `authorize`/`finish` callbacks — the repo's established factory convention
  (contract §2.1). The host composes it exactly as before.
- Extracting the block would require a coupled lifecycle rewrite of shared
  admission/finish/dispose machinery; the brief explicitly prefers moving
  implementation ownership first over breaking lifecycle to shorten `main.ts`.

Consequence recorded as ownership, not behavior: `apps/toolgw/src/` now owns
the MCP/remote-MCP/OpenAPI-operation/tool-approval implementation and their
checks; the temporary host (`apps/stellarc-gateway/src/main.ts`) owns
ingress, admission, and lifecycle composition until process separation.

## 4. Structural verification actually run

- **Hash identity**: all 7 destination SHA-256s equal the before-manifest
  (table §1); originals confirmed un-drifted immediately before unlink;
  post-unlink re-verified; `sha256sum` re-run on the final tree matches.
- **Import-graph resolution**: 53 relative imports across
  `apps/stellarc-gateway/src`, `apps/toolgw/src`,
  `packages/core-auth/src`, `tools/spikes/auth-llmgw` all resolve
  (specifier + `.ts` / `/index.ts` rules). Unresolved: 0. (Two earlier
  verifier-script bugs — a regex missing the space in `from "…"` and an
  over-broad stale pattern that flagged the new home's own sibling imports
  plus kaneo-legacy's distinct `./mcp` — were fixed in the verifier and
  re-run; no file state was affected.)
- **Stale-reference scan**: zero remaining code references to the moved
  modules at old paths or via sibling specifiers outside `apps/toolgw/src`;
  `packages/*` contains zero `stellarc-gateway/src/` imports.
  `packages/kaneo-legacy/src/index.ts`'s `from "./mcp"` is its own distinct
  module (same caveat as Slice 1 §4), not a consumer.
- **`git diff --check`**: clean.
- **Host diff**: `main.ts` differs from pre-slice by exactly line 9
  (import specifier swap; verified by the applied patch hunks).

## 5. Lifecycle equivalence argument (why behavior cannot change)

The only executable-code delta in the entire slice is one import specifier in
`main.ts:9`. Therefore, by construction:

- **Authority/admission order** — `/mcp` still runs non-admitting
  `store.authorize(..., "mcp:status", …, false)` first, resolves org from the
  verified principal, then re-authorizes admitting (`true`) inside the
  per-request `authorize` callback (`main.ts:362-404`), byte-identical.
- **Body-before-method** — `const payload = await body(request, abort.signal)`
  still executes before the `request.method !== "POST"` rejection
  (`main.ts:372-374`), byte-identical.
- **runId tracking / finish / abort** — the `runId` variable, `finish`
  closure (bounded retry, `finalizers` bookkeeping), post-handler
  `if (runId && abort.signal.aborted) await finish("cancelled")` and the
  499 paths are byte-identical host code.
- **Shutdown callbacks** — `dispose()` still aborts controllers, joins
  requests → authorities → `auth.drain()` → **`mcp.dispose()`** →
  finalizers → runtime → pools, in the same order (`main.ts:609-625`);
  `mcp` is the same `mcpGateway` instance, now imported from
  `apps/toolgw/src/mcp.ts` (identical bytes ⇒ identical `handler.dispose`
  wiring under `HttpRouter.toWebHandler`).
- **No policy change, no new routes** — route table, `http.route` span
  annotation, delegation header handling, session binding checks, and the
  metadata-tool set are byte-identical. `tool-approval`, `remote-mcp`,
  `openapi-operation` remain **unwired** (no importer beyond their checks,
  same as before the move).
- **No hidden defect fixes** — zero lines of moved logic were edited; open
  findings F1-F4 stay with the approval lane exactly as §9 records them.

## 6. Manifest limitation (reported honestly, per brief)

`apps/toolgw/` is a **source-only app**: no `package.json`, no tsconfig /
workspace / turbo / lockfile change — per explicit supervisor instruction,
accepted for this spike until workspace reconciliation. Consequences:

- Its modules resolve `effect`, `zod` (type-only), `postgres` from the root
  workspace install; versions were already pinned at root (contract §1), so
  nothing new is resolved — but toolgw is not independently runnable/packageable
  until a manifest exists.
- The host `apps/stellarc-gateway/package.json` needed **zero** script edits:
  none of the moved checks (`remote-mcp-check`, `openapi-operation-check`,
  `tool-approval-check`) had a script before the move (only
  auth/store/audit checks got scripts in Slice 1; http/stream checks stay
  host-side). Future check gates run them from
  `apps/toolgw/src/<check>.ts` directly (§7).
- The contract §3's planned `"dependencies": { "effect": "4.1.2" }` app
  manifest is deferred to workspace reconciliation, not silently dropped.

## 7. NOT executed — open gates inherited, none claimed

Per task constraints (source-only, no builder/host load, gates paused):
typecheck, biome, build, all `bun` check runs from new paths
(`remote-mcp-check`, `openapi-operation-check`, `tool-approval-check` incl.
its self-spawn workers), host start, `/health`, and `http-check`'s `/mcp`
metadata-tool path were **NOT run**. Slice 2 acceptance criteria remain open
gates. Structural verification above is graph/hash proof, clearly not runtime
acceptance.

## 8. Canonical new paths for future gates

`apps/toolgw/src/{mcp,remote-mcp,remote-mcp-check,openapi-operation,openapi-operation-check,tool-approval,tool-approval-check}.ts`
— hashes as minted in §1 (identical bytes, new paths; all prior path-pinned
receipts are historical per contract §7). Future gates: `tool-approval-check`
(needs disposable `SPIKE_OWNER_DSN`/`SPIKE_RUNTIME_DSN` PG; contains the
expected-RED reg-f1/f2/f3 groups — REDs there are receipts, not failures),
`remote-mcp-check`, `openapi-operation-check` (local fixture servers only),
plus host `test:http` through the host `/mcp` block, and repo
`typecheck`/`lint`/`build` on the frozen tree once gates un-pause.

## 9. Open items unchanged (no claim of resolution)

Tool-approval F1–F4 (integration HOLD; `gw_tool_approval` still applied by no
owner CLI — toolgw now owns that obligation, contract §5), LLM lane F0/F1
(untouched; `provider-routing`/`bounded-sse` stay host-side pending Slice 3),
audit persistence gap, production-fix approvals F1–F3 / LLM-hang, and the
GPT resource-owner recovery lane all keep their owning lanes exactly as the
boundaries contract §9 records. Rollback = restore `main.ts:9` and move the
seven files back (no DB/env/deploy/manifest state).
