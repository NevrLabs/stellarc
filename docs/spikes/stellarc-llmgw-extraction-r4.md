# Stellarc llmgw extraction — execution report R4

Source-only Slice 3 move, **executed** 2026-11-09 in worktree
`spike/auth-llmgw-maple` @ `2dce6d0` (untracked spike tree, after Slices 1–2).
Contract: [`stellarc-app-boundaries-r1.md`](stellarc-app-boundaries-r1.md)
§7 Slice 3, **as superseded by the supervisor brief for this slice**: the
contract's "prerequisite: LLM-lane F0 fix landed" sequencing is explicitly
lifted — bytes move unchanged now, the F0 defect stays open, and future
RED/GREEN seam tests target the new paths. This report is the actual
move/import manifest plus structural verification. **It is NOT runtime
acceptance** — every run gate remains open; builder gates stay paused until
parent headroom receipts.

## 1. Move manifest (4 files, byte-identical, no exceptions)

Method per Slices 1–2: SHA-256 before-manifest, byte-copy to
`apps/llmgw/src/`, destination hashes re-verified equal, originals
re-verified un-drifted immediately before `python os.unlink` of exactly the
four originals; post-removal re-verified. **Zero bytes changed inside any
moved file** — no import edits were needed:

- `provider-routing.ts` → `./bounded-sse` (sibling, moved together) plus
  external `effect`-free stdlib only (Headers/URL/TextDecoder/TextEncoder);
  its only import is the sibling.
- `provider-routing-check.ts` → `node:assert/strict` + `./provider-routing`.
- `bounded-sse.ts` → `effect/encoding/Sse` (external, root-pinned) only.
- `bounded-sse-check.ts` → `node:assert/strict` + `./bounded-sse`.
- No dynamic `import()` and no `import.meta` self-spawn exists in any of the
  four (verified by scan) — nothing else references file location.

| old path (`apps/stellarc-gateway/src/`) | new path (`apps/llmgw/src/`) | SHA-256 (before == after) |
|---|---|---|
| `provider-routing.ts` | `provider-routing.ts` | `eabd5f69b9e3c0c2011bf627a480e7939f34b624d3854313c3df91c93707b75f` |
| `provider-routing-check.ts` | `provider-routing-check.ts` | `78888393c67f14c56cce0a12dfccb57d65493879306adf4533b44f7bd18df827` |
| `bounded-sse.ts` | `bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| `bounded-sse-check.ts` | `bounded-sse-check.ts` | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` |

Copy fidelity note: the copy was performed as a **binary** read/write, not a
text round-trip — reader tooling masks one fixture value
(`provider-routing-check.ts:104`, an unknown-key rejection fixture that is
not valid TS as displayed), so text reconstruction could not be trusted to
reproduce bytes. Hash guards prove byte identity regardless of mechanism.

`apps/llmgw/` is a **source-only app**, consistent with toolgw (R3 §6): no
`package.json`, no tsconfig/workspace/turbo/lock change. External deps
(`effect/encoding/Sse` in bounded-sse; none others) resolve from the root
workspace install, already pinned — nothing new resolved.

## 2. Import repoint manifest (exactly one edit outside the moved set)

Complete consumer set located by repo-wide scan (sibling
`from "./<module>"`, `stellarc-gateway/src/<module>` path references,
symbols `validateRoutes`/`modelCatalog`/`prepareProviderRequest`/
`providerResponse`/`ProviderRoutingError`/`ProviderRoute`/`boundedSse`,
dynamic `import(…)`, manifests/turbo/CI/tests):

| file | line | old specifier → new specifier |
|---|---|---|
| `apps/stellarc-gateway/src/main.ts` | 14 | `} from "./provider-routing"` → `} from "../../llmgw/src/provider-routing"` |

That is the **only** edit. `apps/llmgw/src` is depth-identical to
`apps/toolgw/src` (both `apps/<app>/src`), matching the established
two-up-sibling-app pattern (`../../toolgw/src/mcp`, main.ts:9). No other
file in the repo imports any moved module:

- `http-check.ts` / `stream-check.ts` exercise the chat-completions route
  through the host `gatewayApp`; zero direct imports of either module.
- No `packages/core-auth` or `apps/toolgw` file references llmgw modules —
  the core/toolgw → llmgw dependency does **not** exist (scan-verified), so
  none needed documenting as a required consumer.
- Gateway `package.json`: no script referenced `provider-routing-check` or
  `bounded-sse-check` before the move (checks ran ad hoc via
  `bun src/<check>.ts`) — **no stale path found, zero script edits**, same
  as Slice 2's outcome for its unwired checks.
- `tools/spikes`, `tests/`, `turbo.json`, `.github/` — zero references.
- Historical path-pinned hashes in `docs/spikes/auth-llmgw-receipts/` are
  deliberately untouched per contract §7 and are now historical.

## 3. app.ts decision — orchestration stays host-side (deliberate, not skipped)

`apps/llmgw/src/app.ts` was **not** created, same reasoning as toolgw R3 §3:

- The chat-completions route block (`main.ts` ~455–560; usages at
  `main.ts:479,489,532`) is per-request host orchestration: non-admitting +
  admitting `store.authorize("llm:stream")`, the host `body()` bounded
  reader, admission/deadline abort machinery, the `finish` closure with
  runId tracking and `finalizers` shared with `/mcp`, `recover`, and span
  annotation. An `llmgwApp(deps)` wrapper would thread those host closures
  through a pass-through with no ownership — rejected by the brief.
- The existing module **is** the factory seam: `validateRoutes`,
  `prepareProviderRequest`, `providerResponse(upstream, protocol, stream,
  control)` own route catalog validation, upstream request shaping, and the
  full terminal-ordering/EOF/bounds/authority-callback stream contract; the
  host composes them exactly as before, now from `apps/llmgw/src`.

Consequence recorded as ownership, not behavior: `apps/llmgw/src/` now owns
provider routing (catalog validation, live-gate request prep, SSE
translation) and bounded SSE framing, with their checks; the temporary host
owns ingress, admission, and lifecycle composition until process
separation.

## 4. Defect status — moved, not fixed (explicit)

Byte-identity means every known defect moves verbatim:

- **F0 (OPEN)**: `cleanup()` awaits `reader.cancel()`
  (`apps/llmgw/src/provider-routing.ts:221-226`) — the seam-gate hang
  pending RED/GREEN. Unchanged; future RED/GREEN tests use the new path.
- **F1 (OPEN)**: live upstream error fidelity. Unchanged.
- Terminal ordering (`provider_after_terminal` guard, `[DONE]` /
  `message_stop` / `response.completed` handling), EOF
  (`provider_incomplete` on `next.done`), bounds (16 MiB body ceiling,
  64 Ki UTF-16 frame ceiling incl. multiline/pending), per-read
  `control.authorize()` + `throwIfAborted()` ordering, settle/cancel
  listener discipline — all byte-preserved, none claimed verified here.

## 5. Structural verification actually run

- **Hash identity**: all 4 destination SHA-256s equal the before-manifest
  (§1); originals confirmed un-drifted immediately before unlink;
  post-unlink re-verified; final-tree re-hash matches.
- **Import-graph resolution**: 52 relative imports across
  `apps/stellarc-gateway/src`, `apps/llmgw/src`, `apps/toolgw/src`,
  `packages/core-auth/src`, `packages/telemetry/src`,
  `tools/spikes/auth-llmgw` all resolve (specifier + `.ts` / `/index.ts`
  rules). Unresolved: 0.
- **Stale-reference scan**: zero references to the moved modules via old
  sibling specifiers or `stellarc-gateway/src/{provider-routing,
  bounded-sse}` paths anywhere outside `apps/llmgw/src`.
- **`git diff --check`**: clean.
- **Host diff**: `main.ts` differs from pre-slice by exactly line 14
  (import specifier swap; single applied hunk).

## 6. NOT executed — open gates inherited, none claimed

Per task constraints (source-only, no builder/host load, gates paused):
typecheck, biome, build, `bun` runs of `provider-routing-check` /
`bounded-sse-check` from new paths (note: `provider-routing-check` spins a
loopback fixture server only — still not run), host `test:stream` /
`test:http`, host start, `/health` were **NOT run**. Slice 3 acceptance
criteria remain open gates. Structural verification above is graph/hash
proof, clearly not runtime acceptance. Resource recovery (GPT lane) is
exclusive on fxbuilder; nothing here touched builders.

## 7. Canonical new paths for future gates

`apps/llmgw/src/{provider-routing,provider-routing-check,bounded-sse,bounded-sse-check}.ts`
— hashes as minted in §1 (identical bytes, new paths; all prior
path-pinned receipts historical per §7 of the contract). Future gates:
`bounded-sse-check` and `provider-routing-check` (loopback fixtures, no
inference), host `test:stream`/`test:http` through the host route block,
F0 RED/GREEN at the new path, plus repo `typecheck`/`lint`/`build` on the
frozen tree once gates un-pause.

## 8. Open items unchanged (no claim of resolution)

LLM lane F0 (cleanup hang) / F1 (error fidelity) + seam and 8 downstream
phases, B5 parity, tool-approval F1–F4 (integration HOLD,
`gw_tool_approval` still applied by no owner CLI), audit persistence gap,
production-fix approvals F1–F3 / LLM-hang, and the GPT resource-owner
recovery lane all keep their owning lanes exactly as the boundaries
contract §9 records them. Rollback = restore `main.ts:14` and move the
four files back (no DB/env/deploy/manifest state).
