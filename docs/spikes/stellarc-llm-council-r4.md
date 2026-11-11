# Stellarc LLM Council — R4 (final integration gate recovery + independent source review)

Lane: GLM council review sub-agent (R4), under Terminus SUPERVISOR.
Worktree: `spike/auth-llmgw-maple` @ `2dce6d069db62ebf880ec0cb7c280f3a58a7034c` (branch `spike/auth-llmgw-maple`).
Execution snapshot (remote): `~/.cache/fxrun/workspaces/stellarc-integration-r3-full2-80c6e549aa4e` (archive sha256 `80c6e549aa4e…cc43`).
Gate script: `~/.hermes/cache/scratch/stellarc-r3/full2-gate.sh` (preserved locally, 10 phases: `format, bounds, seam, strict, stream, http, artifact, lint, typecheck, build` → `final-source.sha256`, `GATE_PASS`).

Scope guard honored: no product-source edits; only this report and the private harness were touched. `remote*` and `tool-approval*` files untouched (other lanes). No commit/push/subagents. No deploy/provider/IdP/CF/Maple/DB writes. No credentials read or logged (banner lines filtered on every ssh output).

## Part 1 — Source semantic review (independent of network)

Reviewed bytes verified this lane — all 11 hashes match the R3 report exactly (owned 7 + protected 4):

| file | sha256 (first 16) |
|---|---|
| main.ts | `24c76609991b68c1` |
| provider-routing.ts | `eabd5f69b9e3c0c2` |
| provider-routing-check.ts | `78888393c67f14c5` |
| stream-check.ts | `43838f9feb04070e` |
| http-check.ts | `ad8f577058bd82f3` |
| bounded-sse.ts | `d38cb113e2a2187c` |
| bounded-sse-check.ts | `22bd5e8d4478ea6f` |
| store.ts (protected) | `ee32a71c608028d3` |
| auth.ts (protected) | `fe3cdfc10b97701c` |
| audit.ts (protected) | `beaa3b12b45ef682` |
| mcp.ts (protected) | `fc8b7e37af782140` |

Full verification trail in `~/.hermes/cache/scratch/stellarc-r4/`.

### 1. boundedSse — chunk invariance, CR/LF/BOM, wire caps — VERIFIED

`bounded-sse.ts:11-37`. Per-instance `size`/`line`/`cr`/`first` state; per-code-point loop over each feed ⇒ counting is segmentation-invariant by construction. CRLF pair consumed with the LF — including a pair split across feed boundaries; lone CR is a line terminator; `\r\r` dispatches. Counting is in UTF-16 units (`char.length`, astral = 2) as advertised.

Whole-event state: `size` accumulates field names, colons, data, and each internal line terminator (+1 per line); a blank line (`line === 0`) resets. The 65,536-unit ceiling therefore covers the complete event wire state — including comment lines (`: …`) — not just data fields. Exact boundary derived from source and confirmed by the check's 4-length × 3-width × 2-shape matrix: event with content-line wire ≤ 65,535 units + its terminating newline (total ≤ 65,536) accepted; 65,537 → `provider_frame_limit`. Single-line and multi-line events agree at the boundary.

Three independent caps: (a) whole-event wire pre-counter (65,536 units), (b) dispatched parsed data `length + 1 > 65536` (`bounded-sse.ts:22`), (c) 16 MiB total response bytes (`provider-routing.ts:172`). `parser.feed(text)` truthy return also trips `tooLarge` (Effect's own `maxEventSize: 65536` pending cap).

BOM: stripped from the counter at stream start only (first code point ever fed); mid-stream BOM counted as data. Note: the raw feed text (BOM included) is still handed to Effect's parser — downstream BOM behavior rests on the installed Effect 4.1.2 (donor node_modules is remote-only; not re-inspected this lane). Worst case if Effect did not strip it: the first data line fails `provider_invalid_json` — fail-closed, never mis-parsed. Standing executed evidence: full2 observed `bounds exit=0` (31 checks, incl. BOM + CRLF + `\r\r` wires) before the transport loss; identical receipt in the `bounds`/`green2` archives.

### 2. Terminal gating — awaited finish, fresh authority, abort before success — VERIFIED

`provider-routing.ts:297-317`. Loop exits on first rendered event or terminal → `throwIfAborted` → `await cleanup()` (upstream reader cancelled: provider I/O stopped before persistence) → `await finish("completed")` (memoized durable finalization, awaited to completion) → `await control.authorize()` (`main.ts:451-473`: fresh **nonadmitting** `store.authorize(…, admit=false)` — full credential + permission + delegation + org checks, no run insert — bracketed by `throwIfAborted` before and after, promise tracked) → final `throwIfAborted` → `enqueue`/`close`/`removeEventListener`/`settled` — all synchronous after the last await. No intervening await between the final checks and terminal delivery.

Terminal-containing batches (multiple events incl. `[DONE]` inside one pull) are buffered in `rendered` and released only post-finalization. Abort during `finish("completed")`: double memoization (`provider-routing.ts:211-213` plus main's memoized finish wrapper) makes both callers await the same durable promise; the subsequent `throwIfAborted`/authorize throw ⇒ terminal bytes withheld while the durable outcome stays `completed` — exactly the R2 §5 race semantics. Executed coverage: stream-check `cancellation-during-terminal-persistence-withholds-done`; provider-routing-check `finish then reauthorize before terminal delivery`.

### 3. Independent no-pull / abort / deadline settlement — VERIFIED

- Abort listener registered once, immediately (`provider-routing.ts:214-220`): `finish("cancelled")` + `reader.cancel` + settled, with zero consumer pulls.
- Consumer cancel: ReadableStream `cancel()` callback (`provider-routing.ts:334-344`) settles and aborts; main's `cancelled` listener (registration + fired-check at `main.ts:437-443`) settles + releases.
- Deadline: 30 s timer (`main.ts:206`) → abort → same paths.
- Exactly-once via double memoization + `released` guard (`main.ts:208`) + store first-choice 409 (`store.ts:397-405`). Executed: stream-check no-pull three modes with DB outcome and exactly one `call.cancelled` audit row.

### 4. Tracked authorization promises / pools / drain — VERIFIED

`main.ts:451-473`: `authorities` set — work added in the same synchronous block as promise creation (no await between), removed in `finally`. Dispose (`main.ts:608-616`): `stopping` gate → abort all controllers → await requests → await authorities → `auth.drain` (pg pool) → `mcp.dispose` → await finalizers → `runtime.dispose` → `sql.end` (postgres.js) → `pool.end` (pg). No new authorize DB work can start after abort (`throwIfAborted` is the first synchronous statement). Memoized `finish` persistence promises (finalizers) are drained before both DB pools close.

### 5. Late admission + first-choice persistence — VERIFIED

`store.ts:390-440`: `finish` = tx1 `{ UPDATE gw_run SET terminal_choice WHERE terminal_choice IS NULL (store.ts:398); mismatch ⇒ 409 (store.ts:397-405) }` + tx2 `{ audit append + outcome; interrupted marks externalEffect unknown (store.ts:421) }`. tx2 failure keeps `terminal_choice` with outcome `running` → recovery replays the same choice (`terminal_choice ?? "interrupted"`, 409-tolerant, `store.ts:436-438`). First write wins; audit inserts idempotent (`run_id, kind` unique).

`main.ts:426-443`: abort-after-admission handled by the `cancelled` listener registered immediately after the awaited admission (and fired immediately if already aborted); dispose's late-admission path settles cancelled. Executed: transient-terminal-write-recovers-exactly-once; sustained outage bounded 3 attempts with withheld success; expired orphan → `interrupted` / externalEffect unknown; late admission during shutdown (shutdown does not complete while a terminal finalizer is pending; late-admitted run persisted cancelled).

### 6. JSON disabled + live-disabled direct route — VERIFIED

- `provider-routing.ts:180-183`: non-stream (all 3 protocols) → cancel upstream body → `fail(503, "provider_json_disabled")` before any parse; check exercises `{}` / queued / in_progress payloads × chat/messages/responses.
- `main.ts:476-477`: live fetch gated on `GATEWAY_ENABLE_LIVE === "approved"` else `Denied(503, "live_provider_disabled")` (admitted run settles failed); ingress rejects `stream !== true` with 400 `stream_model_required` **before** admission (`main.ts:420-425`) — http-check asserts `gw_run` count unchanged.
- Route integrity: single server-owned chat route; `validateRoutes` enforces https-only, no creds/query/fragment, path suffix, duplicate-alias conflict rejection; `prepareProviderRequest` uses prepared headers, redirect error, signal-bound fetch, CR/LF credential check; no caller header/URL forwarding; provider `set-cookie` stripped (check-verified).

### R2 blocker dispositions

- **B1** bounded parse + yield-free flush — **closed in source** (bounded-sse.ts replaces incremental parse).
- **B2** finalization gating — **closed** (§2 above).
- **B3** post-terminal reauthorize — **closed** (§2 above).
- **B4** SSE wire bounds — **closed** (§1 above).
- **B5** parity — **open by design**: OAuth/OIDC provider auth, messages⇄chat⇄responses translation, model catalog persistence, SDK surface. Direct route is single chat-completions only.

### New findings (≤5, actionable, minimum fixes)

**F0 (blocker — verification-blocking runtime hang; discovered from the recovered full2 `seam` receipt, root-caused in source this lane).** The final `provider-routing-check.ts` (rev `78888393…`) has never completed in any execution: full2's `seam` phase ran its full 600 s and was killed (`seam.exit=124`) after printing exactly one PASS (`seam-70k-complete-event-chunk-independent`); green2 passed only an earlier revision. Static trace: every scenario from check L233 onward terminates **on paper** — so the hang is a runtime await that never settles. Prime suspect: `cleanup()` at `provider-routing.ts:221-226` **awaits** `reader.cancel()` on body readers that are consumed-but-not-closed (string bodies `new Response("data: [DONE]\n\n")` and mock-server fetch bodies whose server-side close was never pulled). Every scenario *before* the first PASS used inline `new ReadableStream` bodies whose cancel resolves trivially — the hang appears exactly when string/fetch bodies enter. Note the asymmetry: the `interrupted` listener (`provider-routing.ts:215`) already fires `void reader.cancel().catch(() => {})` without awaiting. Production impact is bounded — `main.ts` wraps every stream in the 30 s deadline + abort settlement, so a hung pull fails closed (stream errors, run settles cancelled) — but the seam gate cannot pass until this is fixed. **Minimum fix (parent lane):** make `cleanup` fire-and-forget the cancel (`void reader.cancel().catch(() => {})`) exactly like `interrupted`, keeping `releaseLock()` — the cancel *call* is what stops I/O; awaiting it is not required for the "abort provider I/O before persistence" ordering. A private bisect probe is preserved at `~/.hermes/cache/scratch/stellarc-r4/probe1.ts` (S1 inline-terminal / S2 server-single-terminal / S3 server-bytesplit-terminal / S4 server-bytesplit-incomplete, with control-object logging); run it detached on the builder before and after the fix.

**F1 (low — error-path fidelity, live route only).** `main.ts:553` collapses any seam `ProviderRoutingError` into `Denied(503, "unavailable")`. A live upstream 429 (carrying `retryAfter`) or 502/401 surfaces to clients as a bare 503, losing status + Retry-After; run still settles failed (fail-closed, no leak). Minimum fix when live parity lands: pass `error.status` and `error.retryAfter` through into the `Denied`/response construction (the error envelope already carries status + headers, `main.ts:599-600`). Not a security defect; not a blocker for this slice.

**F2 (low — throughput ceiling, already flagged in source).** `store.ts:51` takes global `pg_advisory_xact_lock(719324821)` in every authorize/finish transaction; 8 concurrent streams × per-pull authorize polls on `max: 4` connections with 3 s statement timeout can tail-fail authorize → fail-closed stream aborts at full load. The `ponytail:` comment already names the ceiling and upgrade path (shard lock key by org). No action this slice; measure first.

**F3 (info).** 30 s hard request deadline (`main.ts:206`) bounds every stream including live ones — intended for this slice; revisit with the live parity lane.

**F4 (info — unverified dependency note).** BOM handling downstream of the pre-counter rests on installed Effect 4.1.2 parser behavior (donor remote-only; not re-inspected this lane). Failure mode is fail-closed (`provider_invalid_json`). Executed bounds receipts (31 checks incl. BOM wire) are the standing evidence. One `rg -n "FEFF" <donor>/node_modules/effect/dist/...` on a recovered remote closes this note permanently.

**Source-review verdict: PASS with one verification-blocking exception (F0).** No defects found in the six settlement/security areas — R2 B1–B4 are closed in source and covered by surviving executed receipts (green2 + bounds + full2 observed phases); B5 open by design. F0 blocks the `seam` gate (and therefore the full gate) until fixed; F1 is the only other fix-worthy item and only matters when the live route is enabled.

## Part 2 — Execution / full2 recovery

### Recovery log (all reads bounded, read-only, banner-filtered)

1. Attempt 1 of 2, alias `fxbuilder`: **recovered** (hostname `fxcompute-01`). Three further bounded reads succeeded (inventory; receipts+logs+identity verify; lock/process/container probe). A fifth call (probe exec via `fxrun`) died mid-session; two subsequent bounded attempts — one per alias (`fxbuilder`, `fxcompute-direct`) — both failed with `Connection timed out during banner exchange`. Per the brief: **remote attempts stopped**; no polling, no reruns.
2. Transport pattern observed: short sessions (<30 s) complete; anything longer-lived dies — consistent with how full2 originally lost its session during a 600 s phase. Any future remote work must run **detached with file redirect** (`setsid` + `exec > file`), polled by short ssh reads only.

### Recovered full2 inventory (exact)

Workspace `~/.cache/fxrun/workspaces/stellarc-integration-r3-full2-80c6e549aa4e` (remote), contents: `gate.sh`, `owned.tar`, `source.tar`, `source/`, `receipts/`.

Identity chain (verified this lane, read-only):
- `source.tar` sha256 `4a83a40012c70d30…928452c7` = `receipts/archive.sha256` ✓
- `owned.tar` sha256 `80c6e549aa4eeeeeaab0e49b082e6cbae7dbdbcd42a87b17273ac785cb57cc43` = receipt-source-index ✓
- `source/` tree passes `sha256sum -c receipts/source.sha256` (rc=0) — all 12 files (7 owned + 5 protected incl. `remote-mcp.ts 761e5841…`) byte-identical to the R3 report and to the local worktree ✓

Receipts against their actual sources (not formatting claims):

| receipt | value | meaning |
|---|---|---|
| `format.exit` | 0 | biome over the 7 owned files, applied (observed in log: one `useTemplate` auto-fix) |
| `bounds.exit` | 0 | `PASS bounded-sse: 31 exact-boundary/pending/CRLF checks` |
| `source.sha256` | — | captured post-format; matches local bytes exactly |
| `seam.exit` | **124** | **timeout at 600 s** — hang root-caused as F0; only one PASS line in `seam.log` |
| `gate.exit` | 141 | runner died on SIGPIPE after the seam timeout (trap ran; timeline: phases 16:26→16:27, seam killed + trap 16:37 — the runner **survived** the SSH drop and died on its own stdout pipe, so no partial/corrupt execution is in flight) |
| `strict`…`build`, `final-source.sha256`, `GATE_PASS` | **absent** | never reached |

Adoption check: no process has cwd under the workspace; no `stellarc-r3-full-*` docker container; `~/.cache/stellarc-authgw-gate.lock` **free**. Nothing to adopt or duplicate.

### Exact remaining gates (unverified, preserved — do not mark green)

1. `seam` — blocked on F0 fix (parent lane), then rerun.
2. `strict` (tsc over the 7 owned files), `stream` (real PG container), `http` (`SLOW_BODY_CHECK=1` real socket), `artifact` (gateway build), `lint`, `typecheck`, `build` (full repo), `final-source.sha256`, `GATE_PASS`.
3. Resume recipe (next lane): take `~/.cache/stellarc-authgw-gate.lock`, verify `source/` against `receipts/source.sha256` first, **skip `format` and `bounds` (already 0)**, run only missing phases with the same `phase()` receipt discipline, `9>&-` on children, never edit the frozen `source/` tree or full-v9. The bisect probe `~/.hermes/cache/scratch/stellarc-r4/probe1.ts` (rsync-likely-landed in the fxrun `stellarc-r4-*` workspace, unverified) confirms the F0 fix before spending a gate round.

### Execution verdict

- **Recovered and verified**: full2 inventory, identity chain, `format`/`bounds` receipts, runner death forensics, seam-hang root cause (F0).
- **Not recovered** (network window closed after two bounded aliases): live rerun of `seam` and the 8 downstream phases. These remain **exactly unverified** — no green claim is made for them.
- No writes were made to the remote snapshot, full-v9, any service, or any credential store.

## Part 3 — Remaining parity (not this slice)

OAuth/OIDC provider auth, messages⇄chat⇄responses translation, persisted model catalog, SDK surface — per R3 §Parity; unchanged by this lane.

## Verdict

- **Source review: PASS with one verification-blocking exception (F0)** — the six reviewed areas (bounded SSE wire caps, terminal gating, independent settlement, tracked authorizations/drain, late admission + first-choice persistence, JSON/live-disabled routing) are correctly implemented in the exact R3 bytes; F0 (`cleanup()` awaiting `reader.cancel()`) hangs the seam check at runtime and must be fixed before the gate can pass. F1–F4 are low/info.
- **Execution: partial recovery.** full2 identity chain and `format`/`bounds` receipts verified against actual sources; `seam` root-caused (F0); runner death forensics complete; lock free, nothing active. `seam` + 8 downstream phases remain **exactly unverified** — the network window closed after the two bounded aliases were exhausted.
- **Not replacement-ready.** 9router/Executor replacement requires: F0 fix → seam green → strict/stream/http/artifact/lint/typecheck/build green → then Part 3 parity (OAuth, translation, catalog, SDK). Parent sequences next work; this lane claims nothing beyond the receipts above.
