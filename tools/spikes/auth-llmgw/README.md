# Auth/gateway boundary spike (PARTIAL, not production mounted)

`gateway.ts`: fixture-only stream handler; caller must obtain identity through
`oidc.ts` before granting. There is deliberately no HTTP mint/revoke endpoint:
the programmatic issue/revoke functions are trusted operator APIs, not safe
public APIs. No Kaneo module or production API entrypoint is modified.

## Run

On fxbuilder, supply a FRESH disposable PG owner DSN and runtime DSN pointing
to the same database (`SPIKE_OWNER_DSN`, `SPIKE_RUNTIME_DSN`). The check creates
the foundation tables, reuses `grantRuntime`, and provisions `authgw_runtime`
with a disposable test-only password. Never point this at an existing DB.

`bun tools/spikes/auth-llmgw/check.ts`

Signed OIDC boundary fixture (no real login or DB required):
`bun tools/spikes/auth-llmgw/oidc-check.ts` on fxbuilder.
`oidc-live.ts` is the temporary approved browser proof; requires a fresh
throwaway database, exact approved public client and explicitly mapped subject.
It issues only an internal fixture grant after verified login; no grant is
returned in a browser URL or receipt. Six signed-fixture groups plus targeted
types pass; real initiation reached Zitadel login, not callback completion.
Exact created IdP resources and temporary processes were cleaned up and verified.
See `docs/spikes/auth-llmgw-receipts/oidc-continuation.json`.

Dependencies are the versions already pinned by the root manifest. An isolated
remote dependency subset was used to avoid installing the full monorepo or
changing its lockfile. `SPIKE_LIVE_TELEMETRY=1` adds one fixture-stream pass using
`TelemetryLive` and the configured `OTEL_EXPORTER_OTLP_ENDPOINT`; otherwise all
ordinary signals are inspected in memory. Durable audit export is tested
against the clearly labelled local OTLP fixture sink.

The HTTP handler currently accepts only empty POSTs, returns three fixed SSE
chunks, and makes no inference-provider call. This is NOT a general completion
API. OIDC integration is an isolated code module, not a completed login flow.

## Limits and guarantees

- Two admitted streams, no waiting queue, ten-second stream deadline, one
  pull-buffered chunk; exact transport disconnect behavior still needs real
  socket tests (current tests call the handler using real Web Streams).
- Grants: 32 random bytes, SHA256 digest only in PG; route scope fixed,
  max TTL 60s. Every pull rechecks expiry/membership/revocation. A previously
  transport-buffered chunk cannot be recalled. Admission and revoke serialize
  on the grant row; race/barrier acceptance is still pending.
- Event log: existing `(org,seq)` append-only foundation table; no changes to
  its migration. Grant mutation + event append in one transaction. Runtime
  is not owner and cannot UPDATE/DELETE/TRUNCATE event.
- Export: per-org cursor, 100 records per org/100 orgs per invocation, one
  local exporter invocation at a time. At-least-once across ack/cursor failure;
  receiver success is not warehouse durability. No automatic daemon/scheduler
  installed. Shared event-log deployment needs a dedicated authgw subscription
  cursor/filter, not reuse of a general consumer's cursor.
- Pending ceiling 1000 normal /1100 emergency per scope. Denials use reserved
  system org/anonymous actor. Emergency exhaustion rejects all new requests;
  local gap boolean only, not independent durable OOB delivery. No unlimited
  deny evidence claim. Revocation can also fail at emergency exhaustion.
- Export responses require JSON with a valid object-shaped partial-success
  response, zero rejection and no diagnostic error. Null/array/scalar/unknown
  partial-success shapes retain the batch (regression caught before the fix).
  Receiver acceptance followed by timeout or forced PG cursor-write failure is
  tested: a new exporter instance replays the identical batch. Process-kill
  remains pending; this is at-least-once delivery, not exactly-once.
- Normal/emergency capacity decision edges are tested using explicitly
  artificial counter positions in disposable PG, not a claimed 1000-event load
  test. Revocation succeeds in reserved capacity; at emergency exhaustion it
  rolls back and denial cannot append further evidence. Gap state is local.
- Audit retention: event table remains append-only; no retention deletion job.
  Existing Maple logs are short-lived telemetry, not the audit source of truth.
  Production requires separately approved audit-reader/exporter roles, backup/
  restore evidence and retention policy; runtime SELECT privileges are broader
  than production audit access separation should allow.
- Metadata only. No raw bearer/digest/prompt/completion/tool args exported.
  No content-capture opt-in exists. Adding one needs explicit audited approval.
- Usage accounting is intentionally absent: fixture counts are not provider
  usage, estimates or monetary reserves. Real provider usage must remain
  source-labelled; cached input must not be added twice to total input.

## Remaining acceptance, explicitly OPEN

Actual Zitadel browser login/callback and gateway issuance from that identity,
Rust arclet W3C hop, full concurrent admission/revocation races,
all backlog edges, process-kill/timeout replay, independently running exporter,
full-repo lint/typecheck/build, complete SIEM rule fixture execution,
telemetry-gap/OOB email/Discord delivery. Alert routing and live IdP/Maple
configuration writes are separate approval gates. General subscription API
forwarding and native Claude Code subscription forwarding are different
contracts; no inference canary or permission claim was made.
