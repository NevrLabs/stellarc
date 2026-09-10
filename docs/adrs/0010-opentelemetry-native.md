# ADR 0010: OpenTelemetry-native observability

Status: **accepted** (2026-09-09, operator-ratified). Constrains every Layer in
`stellarc-api`, `stellarc-worker`, and `packages/sync` from T0 onward. Carries
forward the intent of v1 ADR 0018 (OTel-native, durable diagnostics) onto the
v2 stack.

## Decision

Stellarc is **OTel-native**: traces, metrics, and logs are emitted through the
OpenTelemetry API from the first line of code, with Effect's built-in tracing
as the integration point. There is no separate logging framework, no ad-hoc
`console.log`, no metrics library, and no "add observability later" ticket.

| Signal | Mechanism | Export |
|---|---|---|
| **Traces** | Effect spans (`Effect.withSpan`, `Effect.fn("Name")`, `Effect.annotateCurrentSpan`) → `@effect/opentelemetry` `NodeSdk` layer | OTLP/HTTP to `OTEL_EXPORTER_OTLP_ENDPOINT` |
| **Metrics** | Effect `Metric` (counter/gauge/histogram/frequency) → same SDK layer | OTLP/HTTP |
| **Logs** | Effect `Logger` → OTel `LogRecord` via `@effect/opentelemetry` logger bridge; every log carries `trace_id`/`span_id` | OTLP/HTTP |
| **Context** | W3C `traceparent` in/out on every HTTP boundary (inbound requests, outbound fetch, shape long-polls, worker job pickup) | — |

One `TelemetryLive` Layer, provided at the root of each process. Nothing else
constructs exporters or providers.

## Why Effect makes this cheap

Effect already threads a fibre-local context through every operation. Spans,
log annotations, and metric labels ride that context for free. `Effect.fn("X")`
names the span after the function; `Effect.withSpan` nests; errors are recorded
on the span automatically with the tagged-error `_tag` as `error.type`. The
"instrumentation tax" that makes teams defer observability is ~zero here — which
is why deferring it would be negligent rather than pragmatic.

## Mandatory instrumentation (per module, enforced by review)

- **Every service method** is `Effect.fn("<Service>.<method>")` — that is the span.
- **Every HTTP endpoint** has a server span with `http.route`, `http.request.method`,
  `http.response.status_code`, `stellarc.org` (never PII), `stellarc.principal.kind`.
- **Every DB call** goes through the `@effect/sql` client, which is wrapped to emit
  `db.system=postgresql`, `db.operation`, `db.sql.table`; statement text is
  **not** exported (may contain data).
- **Event log**: `stellarc.event.append` span with `stellarc.event.type`,
  `stellarc.event.seq`, `stellarc.event.txid`; counter `stellarc_events_appended_total{type}`.
- **Sync engine**: `stellarc.shape.snapshot` and `stellarc.shape.tail` spans with
  `stellarc.shape.table`, `stellarc.shape.offset_from`, `stellarc.shape.events_sent`;
  histogram `stellarc_shape_tail_wait_seconds`; gauge `stellarc_shape_live_connections`.
  The **`txid` round-trip is traced end to end**: mutation span → event append →
  shape emit, all under the request's trace, so `awaitTxId` stalls are diagnosable
  from a single trace.
- **Worker**: one span per job (`stellarc.job.<type>`), linked to the producing
  mutation's span via span links; `stellarc_outbox_lag_seconds` gauge.
- **Auth**: `stellarc.auth.verify` span; **never** log tokens, hashes, or emails.
  Principal id is fine; email is not.

Resource attributes on every signal: `service.name` (`stellarc-api` /
`stellarc-worker`), `service.version` (git SHA), `deployment.environment`,
`stellarc.boot_generation` (D7).

## Sampling and cost

- Traces: parent-based, **100% in dev/test**, `OTEL_TRACES_SAMPLER_ARG` in prod
  (start at 0.1). Errors are always sampled (tail-based rule in the collector).
- Metrics: full.
- Logs: `info` and above exported; `debug` only when `OTEL_LOG_LEVEL=debug`.

## Tests own telemetry too

- Integration tests run with an **in-memory exporter** and **assert on spans**:
  e.g. T01 asserts the reconnect trace contains exactly one `stellarc.shape.snapshot`
  and N `stellarc.shape.tail` spans with contiguous `offset_from`. A negative
  control removes the instrumentation and the test goes red.
- A lint rule forbids `console.log` / `console.error` outside `tests/` and the
  process entrypoint's fatal handler.

## Local stack

Native binaries under systemd user units (the dev host has no Docker): Tempo
(OTLP/HTTP `:4318`, gRPC `:4317`, query `:3200`) and Grafana (`:3210`, anonymous
Admin, Tempo datasource provisioned). `docs/otel-local.md` has the config. A
`docker-compose.otel.yml` (Collector → Tempo + Prometheus + Loki + Grafana) is
the portable equivalent for other machines. Neither is required for tests (in-
memory exporter); one of them is required for `bun run dev` and for the trace
screenshot every observability-touching PR carries.

## Rejected

| Option | Why not |
|---|---|
| pino/winston + separate metrics lib | two more context-propagation problems; Effect's logger already carries trace context |
| Sentry as primary | vendor-shaped; keep as an **optional** OTLP destination, not the API surface |
| "Instrument later" | the cheapest moment is now; every Layer added without spans is a retrofit ticket |
| Manual `@opentelemetry/api` calls | bypasses Effect context; spans lose parentage across fibres |

## Consequences

- `TelemetryLive` is a T0 deliverable (see STL-14 spec §5f).
- Every slice ticket's spec inherits the "mandatory instrumentation" list for its
  domain; the adversarial reviewer checks span coverage as a named audit item.
- `forge` reviewer brief gains: "SPANS — is every new service method an
  `Effect.fn`? Do new endpoints carry the required attributes? Does the test
  suite assert on at least one span for the new path?"
