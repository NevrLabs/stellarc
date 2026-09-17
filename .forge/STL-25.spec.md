# STL-25 — T11 Sync engine hardening: SSE through Cloudflare/tunnel, HTTP/1.1 shape multiplexing

## 1. Scope and premise audit

Harden the shape server's live tail from long-poll-only to the Electric protocol's SSE mode (`live_sse=true`): accept and negotiate SSE, stream `text/event-stream` frames without whole-body buffering, re-authorize held-open streams at cycle boundaries, keep the long-poll fallback provable through a buffering proxy, and produce **documented measurements** (SSE buffering verdict through the production Cloudflare edge via a credential-free `cloudflared` quick tunnel; concurrent live-shape ceiling per browser over direct HTTP/1.1 vs through-edge) plus the per-org multiplexing decision they inform. Deliverable doc: **ADR 0012**. This is a specification, not implementation evidence; only the orchestrator commits, branches, or touches the tracker.

### Premise audit — code wins

- Gate checked: latest STL-25 triage `pass` (2026-09-15T13:45:20Z).
- **"DoD: ADR 0009" — stale** (same finding as STL-22/23/24): 0009 is the accepted forge-workflow ADR. The real doc obligation is ADR 0007 §Open questions (SSE buffering; concurrent shapes under HTTP/1.1; multiplexing). STL-26 ships ADR 0011 (tokens), so this slice ships **ADR 0012** (`0012-sync-transport-hardening.md`).
- **"Prototype live_sse=true" — the client half already exists.** `@electric-sql/client@1.5.27` (bun.lock, worktree-verified) supports `liveSse: true`: it appends `live_sse=true&experimental_live_sse=true` **only once up-to-date** (initial snapshot is always a JSON request), sends `Accept: text/event-stream`, parses one JSON message per `data:` frame, flushes on `up-to-date` control frames, and **auto-falls-back to long-poll** after consecutive short-lived SSE connections (its own proxy-buffering detector, with the Nginx `X-Accel-Buffering`/Caddy `flush_interval` guidance embedded). The gap is entirely server-side: `ShapeEngine.page` allowlist (packages/sync/src/index.ts) **rejects `live_sse` with 400**, and `tests/unit/foundation.test.ts` T18 **asserts that rejection** — a sibling-test edit this slice must coordinate through the orchestrator (STL-24 §5 precedent).
- **The handler cannot stream today.** `apps/stellarc-api/src/http.ts` shape handler consumes `response.text()` and re-wraps `HttpServerResponse.raw` — whole-body buffering. SSE needs an `HttpServerResponse.stream` branch (ADR 0007 evidence line anticipated `.stream`; "native SSE helper in HttpApi: UNVERIFIED — hand-roll over `.stream` if absent" still stands).
- **Authorization is request-scoped, not stream-scoped.** The handler re-checks `authorize` after the engine effect resolves — correct for a bounded long-poll (≤20 s deadline, foundation T11) but meaningless for a held-open stream. SSE must re-authorize at cycle boundaries or a revoked principal keeps receiving frames (STL-15 §4 revocation semantics carried onto the new transport).
- **"Concurrent-shape limits per browser under HTTP/1.1" — the binding case is the desktop direct path, not the edge.** Browser↔Cloudflare is HTTP/2+ (multiplexed; the 6-connections-per-origin HTTP/1.1 cap does not bind there). The frozen Tauri shell (STL-22) bakes `VITE_API_URL` to a direct origin (`get-api-url.ts`), so browser(webview)↔API is plain HTTP/1.1 and the 6-connection ceiling **does** bind once sibling slices register >6 live collections. The measurement must cover both topologies; the title's "multiplexing" is a decision the numbers inform, not a foregone build (see OUT of scope).
- **Only one shape exists today** (`sync_probe`); identity shapes arrive with STL-15 (implement-running). Per the orchestrator's 2026-09-10 note, the SSE/proxy/concurrency harness is written **generic over table names** and per-slice checks register as each slice merges.
- **"Blocked by #14" — satisfied**: STL-14 merged (cycle 30); its T11/T23 long-poll wake/cancel/204 semantics are the baseline this slice extends, not replaces. Long-poll behavior stays byte-compatible (fallback path).
- Metrics/telemetry: gauge `stellarc_shape_live_connections` + histogram `stellarc_shape_tail_wait_seconds` exist (packages/sync/src/index.ts); ADR 0010 instrumentation rules apply in full to the new paths.

### OUT of scope / owner

- Shape registrations, projection content, revocation-driven handle invalidation per table: the owning slices — identity STL-15, board/ticket STL-16, activity STL-17, repos STL-18, graph STL-19, files/grants STL-20, projects STL-21.
- Storage routing of shape reads (schema-per-org): STL-24 — this slice transports whatever the engine already reads.
- Desktop/mobile shells that consume the direct HTTP/1.1 topology (STL-22/23) — measured here, changed nowhere.
- **Per-org multiplex endpoint / client transport shim**: the stock Electric client is per-shape and cannot be server-multiplexed unilaterally; if ADR 0012's numbers demand multiplexing, implementation is an **unassigned follow-up ticket the orchestrator must name** (STL-14 §2 precedent) — this slice ships the decision, the measurement harness, and the ADR sketch only. Building it here without the numbers would be speculative.
- Reconciliation #13/#14 canon (STL-27), final all-14 gate (STL-21), design tokens (STL-26), rebrand (STL-30).
- WebSocket/other transports, protocol deviations from the Electric HTTP shape spec: rejected per ADR 0007 (client stays stock and protocol-bound).
- UI source changes of any kind: zero, by construction (transport is invisible to components).

## 2. Tables, columns, events

**Tables/columns touched: NONE.** No migration, no new table, no column, no index. Transport-only (mirrors STL-24's zero-domain-events stance).

**Event types emitted: NONE new.** Existing `foundation:probe-upserted`, `foundation:probe-deleted` (schema_version 1) pass through the SSE frames **byte-identical** to their long-poll encoding — same `key/value/headers{operation,txids}`, same `electric-schema` metadata, same upcaster path. No `schema_version` changes anywhere.

**Observability surface added (ADR 0010; not DB schema):**

| Signal | Name | Semantics |
|---|---|---|
| Histogram | `stellarc_shape_sse_duration_seconds` | Held-open SSE lifetime per connection, recorded at close (cycle, disconnect, revocation) |
| Counter | `stellarc_shape_sse_frames_total` | `data:` frames emitted, split by `control` vs `operation` |
| Counter | `stellarc_shape_sse_fallbacks_total` | SSE connection closed before first `up-to-date` flush (the buffering signature) |
| Gauge | `stellarc_shape_live_connections` | unchanged — counts SSE and long-poll exactly once each via the existing acquireUseRelease |

Spans: `stellarc.shape.sse` (per held connection, child of the inbound request span) reusing the existing `stellarc.shape.snapshot`/`stellarc.shape.tail` children; attributes `stellarc.shape.table`, `stellarc.shape.offset_from`, `stellarc.shape.events_sent`; `stellarc.org` + `stellarc.principal.kind` from the handler; no statement text, no PII, no `console.*`.

## 3. HTTP API shape

**No new endpoint.** `GET /orgs/:org/v1/shape` gains a negotiated mode; everything else is unchanged.

**Negotiation (server rule, matching stock client behavior):** serve SSE **only** when the request carries `live=true` + `handle` + `offset≠-1` + `Accept: text/event-stream` + `live_sse=true` (and `experimental_live_sse=true`, accepted-and-ignored). Any other combination (including `offset=-1`, missing handle, or no Accept header) ignores the SSE params and serves the existing JSON long-poll — the client never sends SSE params before up-to-date, so this cannot diverge live traffic.

**SSE response:** `200`, `content-type: text/event-stream`, headers `electric-handle`, `electric-offset` (offset the stream tails from), `electric-schema`, `cache-control: no-store`, `X-Accel-Buffering: no` (harmless; the documented Nginx fix). Body: one `data: <JSON message>` frame per protocol message (change or control), each flushed immediately; `: ka` comment every 15 s idle; stream **cycles at the existing 20 s deadline** — final `up-to-date` control frame, clean FIN, client reconnects (identical cadence to today's 204; client treats post-up-to-date close as normal).

**Request params:** allowlist grows to `live_sse`, `experimental_live_sse` — literal `"true"` only, else `400` (strict-boolean style of `live`/`log`). All other undocumented params keep 400ing.

**Error union — unchanged members, SSE-mode mapping:** `BadRequest` 400 / `Unauthenticated` 401 / `Forbidden` 403 / `NotFound` 404 (table) / `Conflict` 409 `must-refetch` (expired handle: JSON body, never a stream) / `Unavailable` 503. Pre-stream errors use the existing sanitized JSON contract with the correct status. Mid-stream failures (DB gone, driver error): server emits one final `must-refetch` frame and closes — the client then re-requests and hits the sanitized JSON error. **Mid-stream revocation:** re-authorization at each cycle boundary and each keep-alive tick; a revoked principal's stream closes within ≤ cycle/ka interval; the reconnect then receives 401/403 from the standard path.

**Long-poll mode: byte-compatible.** No header, status, timing, or body change to the existing path (fallback proof depends on it).

## 4. Sync shapes affected

**No collection is added or removed; no shape definition changes.** The only collection today (`sync_probe`) and every future sibling registration (STL-15 §4 list) keep URL `/orgs/:org/v1/shape?table=…`, snapshot/tail semantics, cursor/handle opacity, org binding, and authorization predicates. The per-collection *transport* may switch long-poll→SSE transparently — the stock client decides per stream state, so both transports must stay green forever. `canonicalShapeKey` behavior with the new params is a verify-at-implementation item: the client excludes Electric protocol params from the canonical key (client `index.d.ts:746`); confirm `live_sse`/`experimental_live_sse` are in its exclusion set so org-switch handle caches are unaffected (assert in S03; if the client unexpectedly keys them, record the deviation in ADR 0012 and pin `cache-buster` behavior instead).

## 5. File manifest

CREATE (paths relative to repo root; mirrors are behavioral references):

| CREATE | Specific existing mirror |
|---|---|
| `packages/sync/src/sse.ts` (frame encoder, cycle/keep-alive scheduler, buffering-signature counters; generic over table) | `packages/sync/src/index.ts` (`Effect.fn` service pattern, acquireUseRelease gauge discipline) |
| `tests/integration/shape-sse.test.ts` (S01–S07, S10–S11, S14–S15 against disposable PG + stock client) | `tests/integration/foundation.test.ts` (T01/T08/T09/T11/T23 patterns: span capture, txid settle, abort) |
| `tests/unit/shape-sse.test.ts` (encoder/negotiation/allowlist units; T18 successor) | `tests/unit/foundation.test.ts` |
| `tests/helpers/proxy-fixture.ts` (disposable HTTP/1.1 reverse proxy, `mode: "buffer"\|"flush"`; the buffering oracle) | `tests/helpers/postgres.ts` (disposable-fixture lifecycle) |
| `tests/integration/shape-proxy.test.ts` (S08–S09 through the fixture; S12 self-check) | `tests/integration/foundation.test.ts` |
| `tools/measure-edge-sse.ts` (cloudflared quick-tunnel harness: first-byte latency, buffering verdict, HTTP version seen; no CF credentials; emits `docs/evidence/edge-sse-report.json` — orchestrator-run, CI-independent) | `tools/verify-otel-export.mts` (run-and-report evidence tool shape) |
| `tools/measure-shape-concurrency.mts` (Playwright-driven N-live-shape ceiling, direct vs tunneled) | `apps/stellarc-ui/e2e/tools/build-fork-manifest.mts` |
| `docs/adrs/0012-sync-transport-hardening.md` (numbers, buffering verdict, ceiling table, multiplex decision) | `docs/adrs/0007-embedded-sync-engine.md` (§Open questions → resolution format) |

MODIFY: `packages/sync/src/index.ts` (allowlist + SSE branch in `runShape`, cycle-boundary authz hook surface, new metrics); `apps/stellarc-api/src/http.ts` (streaming branch via `HttpServerResponse.stream`, SSE-scoped re-authorization, abort propagation — no `response.text()` on the SSE path); `tests/integration/test-server.ts` (mount unchanged engine; expose SSE-capable URL); `tests/unit/foundation.test.ts` (**sibling edit, orchestrator-coordinated**: T18's reject list drops `live_sse` — superseded by `tests/unit/shape-sse.test.ts` strict-acceptance); `tests/gates.test.ts` only if suite discovery needs registration. No UI file is touched.

## 6. Pixel-frozen UI surfaces

**Zero UI source changes.** Every frozen screen must keep rendering identically in all four inherited Playwright projects (desktop 1440×900, tablet 1024×768, mobile 390×844, mobile-small 360×640), `maxDiffPixelRatio 0.001` against existing baselines, landmarks unchanged: sign-in, org shell, members/teams/roles/keys settings, boards/kanban/list/backlog, ticket detail + activity, inbox, repos, projects. The transport switch must be invisible: if SSE regressed rendering, the frozen suite goes red — that suite runs **unmodified** in this slice as the regression umbrella (S16). Playwright shape traffic is never intercepted/routed (ADR 0009 evidence rules).

## 7. TEST PLAN — RED condition · negative control · reconciliation ownership

| ID | Test / RED before code exists | Sabotage that must turn it RED |
|---|---|---|
| S01 | SSE negotiation: qualifying request → `200 text/event-stream` + immediate flush. RED: today 400 (allowlist rejects `live_sse`) | Remove the two params from the allowlist |
| S02 | Non-qualifying requests (no Accept, `offset=-1`, missing handle, `live_sse=false`) serve JSON long-poll byte-compatibly, never a stream. RED: no branch exists / everything 400s on the new params | Force SSE whenever params are present regardless of Accept/offset |
| S03 | Stock `@electric-sql/client` `ShapeStream{liveSse:true}` round-trip on disposable PG: snapshot JSON → SSE tail; frames parse one-message-per-`data:`; `canonicalShapeKey` unchanged by new params | Emit two messages in one `data:` frame (client parse fails) |
| S04 | Exactly-once across SSE cycles: write during a held stream → exactly one change frame; cycle close → reconnect continues from issued offset; no dup/loss across ≥3 cycles. RED: no SSE path | Remove the snapshot boundary filter (STL-14 T01 control, SSE variant) |
| S05 | `awaitTxId` settles over SSE: mutation during subscription delivers `headers.txids`. RED: stalls (documented failure mode) | Strip `txids` from frames |
| S06 | Client disconnect aborts the held stream: gauge returns to baseline, SQL tail polling stops, `stellarc.shape.sse` span ends with disconnect status. RED: today no stream to abort | Skip wiring the abort signal into the stream release |
| S07 | Revocation closes the stream ≤ cycle/ka interval; reconnect gets sanitized 401/403. RED: stream lives until process death | Skip the cycle-boundary re-authorize |
| S08 | **Fallback proven under buffering**: through `proxy-fixture{buffer}`, stock client detects short connections and falls back to long-poll; data still converges. RED: server has no SSE → nothing to fall back from; with SSE but broken fallback (long-poll 400) convergence fails | Remove `live` from the allowlist (kills long-poll) → convergence assert fires |
| S09 | Flushing proxy passes SSE live: change frame arrives <1 s (not at cycle close) through `proxy-fixture{flush}`. RED: server emits no frames | Flip the fixture to `buffer` mode → latency assert fires (proves the fixture measures what it claims) |
| S10 | Keep-alive: idle stream emits `: ka` comments at interval; a connection whose `ka` never traverses the buffering proxy increments `stellarc_shape_sse_fallbacks_total`. RED: no ka path | Remove ka emission |
| S11 | Param hygiene: `live_sse=true`/`experimental_live_sse=true` accepted; any other value 400; undocumented params still 400 (T18 successor). RED: both params rejected today | Accept `live_sse=1` |
| S12 | Concurrency-harness self-check: `measure-shape-concurrency.mts` reports the ceiling of a limiting proxy configured at 2 (canary shape stalls → detected), and no false stall at N≤4 unlimited. RED: harness absent. (The real browser numbers are documented evidence, not a CI gate) | Point the harness at the conn-cap-2 proxy and assert it reports 2 — reporting ≥6 is the failure |
| S13 | Edge-verdict tool: `measure-edge-sse.ts` verdict logic unit-tested against synthetic buffered vs streaming captures (first-byte + inter-frame deltas); report schema validated. RED: no tool. Live quick-tunnel numbers go to ADR 0012 as orchestrator-run evidence | Feed the verdicter a buffered capture, assert verdict `buffered` — a `streaming` verdict is the failure |
| S14 | Telemetry: SSE paths carry `stellarc.shape.sse` + child snapshot/tail spans with the standard attrs, new metrics present, no statement text/PII/`console.*`. RED: spans absent on new path | Remove one `Effect.fn` wrapper |
| S15 | Gauge counts SSE + long-poll exactly once each (no double-count on frame vs acquire); `stellarc_shape_sse_duration_seconds` recorded at every close kind. RED: metric absent | Register the gauge a second time per frame |
| S16 | Sibling regression: full foundation suite (T01/T08/T09/T11/T18-updated), identity suites as merged, and frozen+responsive Playwright all green, all four viewports, no interception | Remove the long-poll 204 deadline → foundation T11 red |

**Reconciliation queries owned: 0 of 14.** Transport owns no legacy query. Split unchanged: #1–#3 STL-15, #4–#6 STL-16, #7 STL-19, #8 STL-17, #9/#11/#12 STL-20, #10 STL-18, #13/#14 canon STL-27, final gate STL-21. Obligation here: every already-executed query stays green with SSE enabled alongside long-poll (S16).

## 8. Suggested vertical build order

1. Rebind to merged dev (STL-14 baseline; STL-15 as it lands); agree the T18 sibling edit with the orchestrator. Readiness, not code.
2. Unit-first thinnest path: allowlist + SSE frame encoder + negotiation rules (S01/S02/S11) — pure, no PG.
3. Streaming branch in `http.ts` over the existing engine loop; stock-client round-trip on disposable PG (S03–S05) — the first true end-to-end SSE slice.
4. Stream lifecycle: disconnect abort, cycle-boundary re-authz, metrics/spans (S06/S07/S14/S15).
5. Proxy truth: `proxy-fixture` buffer/flush, fallback proof, keep-alive (S08–S10).
6. Measurement: both tools with self-checks (S12/S13); orchestrator runs the quick-tunnel edge pass; numbers + multiplex decision land in ADR 0012 (multiplexing built here **only** if numbers demand and the orchestrator rules it in-scope; otherwise named follow-up).
7. Full gates in a clean worktree at HEAD + sibling regression + frozen e2e (S16); adversarial review from a different family; orchestrator alone merges.
