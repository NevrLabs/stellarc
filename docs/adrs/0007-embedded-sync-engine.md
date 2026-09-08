# ADR 0007: Embedded sync engine — Electric-protocol-compatible shape server over the event log

Status: **accepted** (2026-09-08, operator-ratified). Extends ADR 0002 (stack),
ADR 0001 D6/D10/D12/D19, v1 ADR 0037 (async Postgres event log).

## Decision

Stellarc ships its own sync engine as an **Effect `Layer` in `packages/sync`**,
mounted **inside `stellarc-api`** for v0. It speaks the **ElectricSQL HTTP
Shape protocol** on the wire so the browser uses the stock
`@tanstack/electric-db-collection` adapter unchanged. Its change source is
**Stellarc's own append-only event log**, not Postgres logical replication.

Reads flow `event log → projection snapshot + event tail → shape stream →
TanStack DB collection`. **Writes stay on the Effect API** (optimistic on the
client, reconciled by `txid`). No dual-write, no second write path.

Later, when arclet claims and agent transcript streams arrive, the same Layer
lifts into a dedicated `stellarc-sync` binary. The Layer boundary makes that a
deploy change, not a rewrite — the ADR 0002 "tunnel lib+bin" pattern.

## Rejected

| Option | Why not |
|---|---|
| **Electric as a service/sidecar** | Elixir/BEAM; cannot load into the Bun process. D6 chokepoint would live in a proxy in front of it, not in the kernel. Second runtime, second crash domain, `wal_level=logical` on every Postgres. Read-path only — cannot serve event-log shapes to agents/arclets. |
| **Zero (Rocicorp)** | Owns the write path via its own mutator server — a second kernel. Collides with D6/D12. |
| **PowerSync** | Separate service; client SDK owns a local SQLite that would bypass TanStack DB collections. |
| **TrailBase** | A whole Rust+SQLite backend; would replace the control plane, not serve it. |
| **RxDB replication** | Viable protocol (push/pull/event-stream, server is ours) but adds an RxDB collection layer under TanStack DB; TanStack's Electric adapter is more mature (txid matching). |
| **LiveStore** | Effect-based and attractive, but client owns a local SQLite event log and the reference sync server is a Cloudflare Worker; server authority and D10 audit semantics get awkward. |
| **CRDTs (Yjs/Automerge)** | Convergence without a central authority is the wrong model for relational control-plane data with a single Postgres writer; complicates D12 actor attribution. No TanStack DB adapter. |

## Evidence (from recon lane d502c6fc, 2026-09-08; re-verify before implementation)

- `ShapeStreamOptions.url` — `@electric-sql/client` `dist/index.d.ts:483`: "full URL … Electric server directly **or a proxy**". `fetchClient?: typeof fetch` at `:537` allows auth/Bun interop injection. `electricCollectionOptions` takes `shapeOptions: ShapeStreamOptions` (`electric.d.ts:68`). **The client is protocol-bound, not Electric-bound.**
- Protocol: `GET /v1/shape`, `offset=-1` initial, paginate via `electric-offset`, `live=true` + `handle` for tail, `204` on live timeout, `live_sse=true` optional. Control messages: `up-to-date`, `must-refetch`, `snapshot-end {xmin,xmax,xip_list}`. Op: `{key, value, old_value?, headers:{operation, txids?}}` (`index.d.ts:116-128`). OpenAPI spec: `electric-sql/electric/website/electric-api.yaml`. Electric's own docs: *"the pattern is simple enough that you should be able to write your own client."*
- Write settle: TanStack DB `onInsert/onUpdate/onDelete` return `{ txid }`; `collection.utils.awaitTxId(txid)` blocks until a stream message carries that txid in `headers.txids`. **Mismatch = stall** (documented known issue).
- Effect: `HttpServerResponse.stream(Stream<Uint8Array>)` (`@effect/platform` `HttpServerResponse.d.ts:150`); `PgClient.listen(channel): Stream<string>` (`@effect/sql-pg` `PgClient.d.ts:39`). `PubSub`/`Queue` present. Native SSE helper in `HttpApi`: UNVERIFIED — hand-roll over `.stream` if absent.
- Versions probed: `@tanstack/db@0.8.7`, `electric-db-collection@0.4.7`, `@electric-sql/client@1.5.27`, `@effect/sql-pg@0.53.0`.

## Hard contracts the implementation must meet

1. **Monotonic, gap-tolerant, commit-ordered cursor.** `BIGSERIAL` alone is unsafe: a tx with a smaller seq can commit *after* one with a larger seq, so `WHERE seq > N` skips it. Use a **single-row per-org counter advanced inside the write tx** (schema-per-org, D9, gives one counter per org for free) *or* Electric's snapshot-metadata filter. Decide in the first spike; prove with a concurrency test.
2. **Snapshot + tail atomicity.** Read the projection at cursor N under `REPEATABLE READ`, then stream events `> N` from the same snapshot boundary. A reconnecting client must receive every event once — **this is the first test written, and it must fail when the boundary is removed.**
3. **`txid` round-trip.** Every mutation runs in one tx, returns its txid, and every event it produced carries that txid into the shape stream's `headers.txids`. Otherwise `awaitTxId` hangs.
4. **Capability check at the chokepoint.** Shape requests are authorised inline by the same grant check as any API call (D6). No proxy, no bypass.
5. **Org disambiguation in the shape URL.** Table names repeat across org schemas; `canonicalShapeKey` (`index.d.ts:746`) is URL-keyed. Shape URLs are `/orgs/:org/v1/shape?…`.
6. **Upcast before emit** (D19). The shape server applies the owning plugin's upcaster chain; clients see the latest schema only.

## Open questions (resolve in the spike, not in argument)

- Long-poll timeout / keep-alive behaviour behind Bun's HTTP server — prototype.
- SSE buffering through Cloudflare / the tunnel — prototype; fall back to long-poll if proxied.
- Concurrent live shapes per browser under HTTP/1.1 connection limits — measure; consider multiplexing shapes per org.
- Whether per-org counters are sufficient ordering or snapshot `xmin/xmax` filtering is also needed.

## Consequences

- The event log becomes the sync source of truth, not a compliance artefact. Projections are rebuildable from it.
- One engine serves three consumers: browser (TanStack DB), agents (event-stream shapes), arclets (claim replay, D14/D15).
- Real Electric remains a drop-in **behind the same protocol** if the custom engine ever becomes the bottleneck. The client would not change.
- Effort: ~2–3 weeks for engine + negative-control suite. Implementer `cx/gpt-6-astra`, reviewer `glm/glm-5.3`, different families per pipeline rule.
