# ADR 0012: Sync transport hardening — SSE through Cloudflare/tunnel, HTTP/1.1 shape multiplexing

Status: **proposed** (STL-25; merges alongside the SSE transport in
`packages/sync/src/sse.ts` and the streaming branch in `apps/stellarc-api/src/http.ts`).
Resolves ADR 0007 §Open questions: "SSE buffering through Cloudflare / the
tunnel" and "Concurrent live shapes per browser under HTTP/1.1 connection
limits".

## Decision

1. **Serve SSE on `GET /orgs/:org/v1/shape`** when the request carries
   `live=true` + `handle` + `offset≠-1` + `Accept: text/event-stream` +
   `live_sse=true` (`experimental_live_sse=true` accepted-and-ignored);
   every other combination keeps the byte-compatible JSON long-poll. The
   stock `@electric-sql/client@1.5.27` with `liveSse: true` appends those
   params only once up-to-date, so negotiation cannot diverge live traffic.
2. **One JSON message per `data:` frame**, `: ka` comments every 15 s idle,
   cycle close at the existing 20 s deadline with a final `up-to-date` frame
   and clean FIN — the client reconnects exactly as it does after a 204.
   `X-Accel-Buffering: no` is set on every SSE response (documented Nginx
   fix; harmless elsewhere).
3. **Stream-scoped authorization.** Held-open streams re-authorize at every
   cycle boundary and every keep-alive tick; a revoked principal's stream
   closes ≤ cycle/ka interval and the reconnect receives the sanitized
   401/403 JSON contract (STL-15 §4 revocation semantics carried onto the
   new transport — S07 proves ≤ ka + slack).
4. **No per-org multiplex endpoint now.** The stock client is per-shape and
   cannot be server-multiplexed unilaterally; today one shape exists
   (`sync_probe`) and the desktop direct path (frozen Tauri shell bakes
   `VITE_API_URL` to a direct HTTP/1.1 origin) is bounded by the browser's
   6-connections-per-origin cap only once sibling slices register >6 live
   collections. When STL-15..21 register their shapes, the
   `measure-shape-concurrency` harness measures the real ceiling and the
   orchestrator names a follow-up ticket if — and only if — the numbers
   demand multiplexing.

## Measurements (documented evidence)

### SSE buffering verdict — deterministic proxy oracle (S08/S09/S10)

Through `tests/helpers/proxy-fixture.ts` (disposable HTTP/1.1 reverse proxy):

| Topology | Result |
|---|---|
| `flush` mode (transparent proxy) | change frame traverses **< 1 s** after the write (S09 asserts the latency bound; frames arrive live, not at cycle close) |
| `buffer` mode (whole-body buffering — the Cloudflare/Nginx pathology) | stock client detects the short-connection streak and **permanently falls back to long-poll**; data still converges (S08) |
| Buffering + keep-alive | connections closed before the first `up-to-date` flush increment `stellarc_shape_sse_fallbacks_total` — the buffering signature counter (S10) |

Mechanism (verified against the installed client, `chunk-H6CRSJ5O.mjs`):
the stock client marks an SSE connection "short" when it closes in < 1000 ms
without abort; three consecutive short connections flip
`sseFallbackToLongPolling` permanently. Our 20 s cycles hold connections
comfortably above the threshold when frames flush; a buffering proxy that
only releases bodies at upstream close produces exactly the short-connection
signature. The fallback is thus **client-owned and automatic** — the server
needs no edge sniffing.

### Edge verdict — production Cloudflare edge (orchestrator-run)

`tools/measure-edge-sse.ts` spawns a credential-free `cloudflared` quick
tunnel, times first byte + inter-frame deltas through the edge, and writes
`docs/evidence/edge-sse-report.json`. Verdict logic is unit-tested against
synthetic streaming/buffered/clustered captures (S13): first byte ≥ 5 s or
inter-frame gap ≥ 2 s ⇒ `buffered`. **Live quick-tunnel numbers are
orchestrator-run evidence** (spec §5 marks the tool CI-independent); the
report slot in `docs/evidence/` is reserved for that run. If the production
edge buffers (verdict `buffered`), decision 1 keeps long-poll as the
automatic client fallback — no server change required.

### Concurrent live-shape ceiling (S12)

`tools/measure-shape-concurrency.mts` drives a real Chromium page holding N
live shapes against a target (direct HTTP/1.1 origin or a tunnel) and
reports the first stalled shape. Self-check (unit-tested): against a
conn-cap-2 proxy the harness reports ceiling 2 and never false-stalls at
N ≤ 4 unlimited. Real browser numbers (direct vs tunneled) land in
`docs/evidence/shape-concurrency.json` when the orchestrator runs it; the
multiplexing decision (4) is deferred until then.

## Observability (ADR 0010 rules)

- `stellarc_shape_sse_duration_seconds` — histogram, recorded at every close
  kind (cycle, disconnect, revocation, error).
- `stellarc_shape_sse_frames_total` — `data:` frames, control vs operation
  split.
- `stellarc_shape_sse_fallbacks_total` — connections closed before first
  `up-to-date` flush (the buffering signature).
- `stellarc_shape_live_connections` — unchanged gauge; SSE acquires it
  exactly once per held-open connection (S15).
- Span `stellarc.shape.sse` per connection, ending at stream close with
  `stellarc.shape.sse.close ∈ {cycle, disconnect, revocation, error}`,
  children reusing `stellarc.shape.snapshot`/`stellarc.shape.tail`;
  attributes `stellarc.shape.table`, `stellarc.shape.offset_from`,
  `stellarc.shape.events_sent`, `stellarc.org`,
  `stellarc.principal.kind`. No statement text, no PII, no `console.*` on
  the SSE paths.

## Rejected

- **Server-side buffering detection / edge sniffing** — the client already
  owns fallback; duplicating it server-side adds state for no behavior.
- **WebSocket transport** — rejected per ADR 0007 (client stays stock and
  protocol-bound).
- **Multiplexing built speculatively** — one shape exists today; the harness
  exists, the numbers do not justify a protocol deviation yet.

## Consequences

- Both transports ship permanently: long-poll is the fallback contract and
  stays byte-compatible (S02, S16); SSE is negotiated per-request.
- `canonicalShapeKey` verified unaffected: the stock client excludes
  `live_sse`/`experimental_live_sse` (asserted in S03 against the installed
  client) — org-switch handle caches are safe.
- Sibling shape registrations (STL-15…21) inherit SSE transparently; the
  harness is generic over table names and measures as each slice lands.
