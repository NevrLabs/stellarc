# STL-25 review — cycle 10 (PR #60 @ 3edafb8a, base dev @ 52ba949e)

**VERDICT: PASS**

Reviewer: adversarial, fresh worktree `/mnt/deepvault/forge-merge/review-stl-25-c10` (git worktree --detach, removed after). Diff audited commit-by-commit (20 commits, 18 files, +2510/−73), not the implementer's summary.

## Per-item audit

### 1. SPEC COMPLIANCE

| Spec item | Verdict | Evidence |
|---|---|---|
| SSE negotiation (live+handle+offset≠−1+Accept+live_sse; everything else long-poll) | implemented | `packages/sync/src/sse.ts` `negotiateSse`; S01/S02 int+unit |
| Frame encoding: one JSON message per `data:` frame, immediate flush | implemented | `encodeDataFrame`; S03 unit + stock-client round-trip |
| 20 s cycle, `: ka` every 15 s, cycle-close `up-to-date` + clean FIN | implemented | `SSE_CYCLE_MS=20000`, `SSE_KA_INTERVAL_MS=15000`; S01 (short-cycle override via test hook), S10 unit |
| SSE response headers (handle/offset/schema/no-store/X-Accel-Buffering/cursor) | implemented | `sseEffect` header block; S01 asserts 7 of 8 — `electric-schema` is set but never asserted (minor, D3) |
| Param hygiene: `live_sse`/`experimental_live_sse` literal-"true"-only, else 400; unknown params still 400 | implemented | `page()` allowlist + strict-boolean loop; S11 (sabotaged red, see §2) |
| Error union: pre-stream errors sanitized JSON (409 must-refetch never a stream); mid-stream one final must-refetch frame; revocation close ≤ cycle/ka, reconnect 401/403 | implemented | 409 pre-stream int test; must-refetch unit; S07 int (sabotaged red) |
| Long-poll byte-compatible | implemented | S02; foundation suite (43 tests) green unmodified |
| `canonicalShapeKey` unaffected | implemented | S03 unit + int, against installed client 1.5.27 |
| Proxy oracle buffer/flush + fallback proof + live-latency + fallback counter (S08–S10) | implemented | `tests/helpers/proxy-fixture.ts`, `shape-proxy.test.ts` — all 5 green |
| Measurement tools + self-checks (S12/S13) | implemented | `tools/measure-edge-sse.ts` (verdict logic unit-tested), `tools/measure-shape-concurrency.mts` (real snapshot-minted held SSE probes; cap-2 + unlimited legs green) |
| ADR 0012 with buffering verdict, ceiling methodology, multiplex decision | implemented | `docs/adrs/0012-sync-transport-hardening.md`; live quick-tunnel numbers correctly reserved as orchestrator-run (spec S13 wording); decision 4 defers multiplexing exactly per spec OUT-of-scope |
| Observability: 4 metrics + `stellarc.shape.sse` span with mandated attrs | implemented | S14/S15; parent-linkage of page spans proven (sabotaged red) |
| T18 sibling edit (drop `live_sse` from reject list) | implemented | one-line deletion in `tests/unit/foundation.test.ts`, exactly as spec |
| Zero UI source changes | complied | no diffs under `apps/stellarc-ui/src` or playwright config |
| File manifest | matched | all 8 CREATE + 5 MODIFY present; nothing extra in runtime code |

Scope creep (minor, orchestrator call): `.forge-blocker.md` deleted (stale STL-18 note, not in manifest — D4); `package.json`+`bun.lock` add `playwright@1.62.0` (root) — documented in `.forge-deps-added.md` under the file's own pre-authorised rule; lockfile fsevents dedupe churn is regen noise.

### 2. TESTS THAT CANNOT FAIL

Every new test names a concrete code change that turns it red. Negative controls replayed by me (sabotage → red → restore → green), all at PR head:

1. Remove ka emission (`sse.ts` `emit(encodeKa())` commented):
   `× S10/S07 unit: runSseStream emits ka comments on idle… 224ms — Tests 1 failed`
2. Drop strict-boolean gate (`index.ts` `if (q.has(name) && q.get(name)!=="true")` → `if (false)`): accept `live_sse=1`:
   `FAIL S11 allowlist accepts literal live_sse/experimental_live_sse… — Tests 1 failed`
3. Sever page-span→sse-span linkage (remove `Effect.provideService(Tracer.ParentSpan, span)`):
   `FAIL S15 … AssertionError: expected '3104930b29acdcf0' to be '60d24149bd501e8e' (tail.parentSpanContext.spanId ≠ sse.spanId) — Tests 1 failed`
4. Skip re-authorization (`sse.ts` `if (!options.authorize())` → `&& false`):
   `FAIL S07 revocation closes the stream within the cycle/ka interval — Tests 1 failed`

Non-decorative by inspection: unit edge-verdict (buffered/clustered captures vs thresholds), unit ceiling logic (cap-2, gapped, unlimited), all integration suites drive a real server + disposable PG + stock client. The S09↔S10 pair literally varies the fixture mode the spec names as its own sabotage.

### 3. MIGRATIONS

None touched. `packages/db` has zero diffs; no `git tag --contains` relevance (no migration files modified/deleted anywhere in the diff). Spec §2 (transport-only, zero schema) honoured.

### 4. DOCTRINE

Clean. No direct SQL writes (engine SELECTs + read-only snapshot tx only); no events emitted, none missing; no hardcoded hex (cursor tokens via `crypto.randomUUID()`); no model calls in the control plane; no PII in span attrs (principal *kind* only, handler-derived `actor|anonymous` — review-9 D5 fix verified in code and asserted in S15). SSE response authz re-checked at cycle boundary AND ka tick.

### 5. WORKER DEBRIS

None in runtime code: no `console.*` in `packages/` or `apps/` (tools' `console.log` is the report channel, same as the mirrored `verify-otel-export.mts`); no commented-out code; no debug logs; no stray files (the one candidate, `.forge-blocker.md`, is a deliberate stale-doc deletion → D4). Diff is proportionate; no generated blobs.

### 6. SCREENSHOTS

Spec §6 expects **zero** UI changes and the frozen suite running **unmodified** — the PR regenerates no baselines (correct: transport must be invisible). I ran the full e2e (all four projects: desktop/tablet/mobile/mobile-small, touch projects included): 84 tests, 21 passed / 60 skipped / **3 failed** — `repo-issues`, `repo-pull-detail` (desktop), `projects-list` (tablet). All three are locator/visibility flakes, not pixel diffs: each passes in isolation at PR head (`2 passed (19.0s)`, `1 passed (13.1s)`) and the same `repo-issues` test passes on dev. No baseline changed; the failures show no rendering regression from SSE. Not rework — but see D5 (merge-gate history shows this flake recurring).

### 7. SPANS (ADR 0010)

- New/changed service functions: `sseEffect` is `Effect.fn("Sync.sseEffect")`; page spans keep `Effect.fn("stellarc.shape.snapshot"|"stellarc.shape.tail")`. ✓
- SSE span carries `stellarc.shape.table`, `stellarc.shape.offset_from`, `stellarc.shape.events_sent` (set at close), `stellarc.org`, `stellarc.principal.kind`, close kind. ✓
- Span assertions exist per new path and go red when instrumentation is removed (my sabotage #3; also gauge assertions in S06/S15). ✓
- No new endpoint (negotiated mode on the existing one), so no new http.route obligations; existing `requestTelemetry` covers the route. ✓
- No statement text/PII in attributes; no `console.*` outside tools/tests. ✓

### 8. GATES RE-RUN (PR head, this machine)

- `bun run test:unit` → **27/27 passed** (5 files)
- `bun run test:integration` → **65/65 passed** (4 files, 501.6 s)
- `bun test` (gate) → unit leg pass; **integration leg FAIL: exit 143** — `tests/gates.test.ts:16` kills vitest at 300 000 ms, suite needs ~501 s.
- **Dev baseline (no PR): same gate fails identically** (killed at 300.2 s; foundation+identity alone ≈ 350 s serial, `maxWorkers: 1`). Pre-existing red, not introduced here; this PR adds ~151 s (shape-sse 70.5 s + shape-proxy 80.6 s), which makes any timeout-only fix larger.
- `tsc --noEmit` clean; `biome check .` clean (963 files).
- `bun run build` ✓; `bun run e2e` → 3 locator flakes (pass on retry, pass on dev — see §6).
- S12 runtime attribution: the two integration self-check legs hold 2×(4 shapes × 16 s) ≈ 64 s+ by design (liveness needs one 15 s ka tick).

## DEFECTS

1. **`tests/gates.test.ts:16,22` — integration gate kill-timeout (300 s) < suite runtime (501 s at head; 350 s already at dev).** Exact fix expected: orchestrator raises the kill/test timeouts (e.g. `setTimeout(..., 900000)` and test timeout `910000`) or splits the gate; additionally the S12 legs can drop to `server.sseTiming = { kaMs: 500 }` + proportionally smaller `holdMs` (stalls still never emit; detection logic unchanged) to reclaim ~60 s. Needs an explicit scope ruling — gates.test.ts edits are spec-limited to "suite discovery". Not merge-blocking for this PR (dev equally red), but merge-gate will stay red until fixed.
2. **`tests/integration/shape-sse.test.ts:332-409` (S15) / `:267` (S06) / `:437` (S07)` — `stellarc_shape_sse_duration_seconds` asserted only for the `cycle` close kind.** Spec §2: "recorded at every close kind". The recording path is shared (`finish()` always records), but no test observes a duration datapoint for `disconnect` or `revocation`. Exact fix: in S06/S07, after the close-kind span assertion, `forceFlush` then assert `metricPoints(server, "stellarc_shape_sse_duration_seconds").length` grew.
3. **`tests/integration/shape-sse.test.ts:123-129` (S01) — `electric-schema` response header never asserted** (it is set in `sseEffect`). Exact fix: add `expect(response.headers.get("electric-schema")).toBeTruthy()`.
4. **`.forge-blocker.md` deletion is outside the spec manifest** (stale STL-18 doc; harmless cleanup, but unrequested). Exact fix: orchestrator either ratifies the deletion or reverts the file; also append one ADR 0012 line noting the SSE gauge acquire/release is hand-rolled per-connection (semantics identical to `acquireUseRelease`, S15-proven) — spec §2's letter says "via the existing acquireUseRelease".
5. **Flaky frozen-e2e locators (`frozen.spec.ts:148/170/194`)** — failed once in a full 84-test run, pass in isolation and on dev; merge-gate history shows `bun run e2e` failing on these before. Exact fix: raise those `toBeVisible` timeouts to 15 s or await a network-idle on the fixture routes; belongs to the frozen-suite owner (STL-14 surface), not this PR's transport.
