# ADR 0016: Drizzle for Stellarc persistence

Status: proposed (2026-11-21). Applies to the `effect/v4` lineage. Extends
[ADR 0014 §4](0014-stellarc-app-tanstack-db.md) and
[ADR 0015](0015-apps-clients-and-arclet.md); does not change their UI or app
activation contracts.

## Operator decisions

- **Drizzle is required for new Stellarc-owned persistence.** Future
  Stellarc-managed apps will need live schema changes (PostgreSQL data
  definition language, DDL).
- **Keep Effect and Bun** on the server.
- **Keep the current frontend.** Use React and the existing TanStack stack
  in `apps/web`. Foldkit is deferred; no pilot or migration in this change.

## Proposed adoption

Use Drizzle table definitions and typed queries for new stores. Adopt it
incrementally in existing stores when a change adds or materially reshapes
persistence; routine fixes and in-flight changes do not require conversion.
Keep Effect schemas at wire boundaries and explicit parameterized SQL where
clearer for locking, leases or event ordering.

Start with the existing [Drizzle–Effect bridge][bridge], already used by
[native Kaneo][kaneo-kernel]. Run its queries as Effects through the same
`SqlClient` under `SqlClient.withTransaction`; do not await a builder outside
that transaction context. This follows [ADR 0010's database boundary][otel]
and keeps `@effect/sql-pg`. Verify that production spans export neither SQL
text nor parameter values. The postgres.js adapter below is a fixture only,
not an exception to ADR 0010 or a production adapter choice.

For the foundation database, keep the [checksum-registered SQL ledger][ledger].
Do not add another ledger for that database, alter applied migrations, or use
`drizzle-kit push` against deployed schemas. Leave the existing Kaneo and
Gateway migration mechanisms unchanged. For each new store, run its typed
queries against the SQL-migrated schema in CI to catch mapping drift.

## Proposed live DDL scope

Here, a *Stellarc-managed app* means an out-of-process service in
[ADR 0015's terms][apps] for which Stellarc manages storage. The target is
that app's own database under [charter D9][charter], not the foundation
schema shared by in-process plugins or a database managed by the app itself.
This definition does not settle how org data is laid out inside an app DB.

Today [`stellarc-api`][api] creates the foundation schema and runs migrations
with the same PostgreSQL client it hands to the serving handlers. Before
live DDL ships, separate the server's owner/migration role from its serving
role. Prove the effective serving role cannot perform DDL or assume the owner
role. Use a separate, app-scoped migration identity for app schema changes;
verify cross-app and cross-org refusal, durable audit, rollback and recovery
on disposable PostgreSQL before enabling it.

Drizzle provides schema and query primitives, not this migration system.
Accept validated, versioned declarations rather than app-supplied SQL.
This ADR adds no runtime DDL API, role privileges or deployment changes.

## Open before implementation

- **First event-emitting store:** the store owner must prove a typed mutation
  and its event append share one physical transaction, including rollback when
  either fails and preservation of JSONB payloads, sequence and transaction ID.
  The current [append helper][append] takes a postgres.js `TransactionSql`
  and uses `tx.json`; it cannot join an Effect transaction by calling it with
  a separate client. Qualify the append on the same `SqlClient` before the
  first conversion. Do not wrap the existing pool in the fixture adapter:
  it replaces parsers and serializers, including JSONB, so the existing
  `tx.json` behavior cannot be assumed to survive.
- **Live DDL design:** define tenant layout, authority, serialization, drift
  detection and recovery before any managed-app rollout.

## Executable evidence

[`drizzle-schema.test.ts`](../../tests/bun/drizzle-schema.test.ts) exercises
Drizzle 0.45.4 with postgres.js 4.1.1 on an isolated disposable database as its
bootstrap superuser. It observes schema creation, table alteration and typed
inserts after commit. The discriminating assertion is that a later `ALTER`
and insert both disappear after an intentional abort. It covers text columns,
not rollback of schema creation, remapped types, Effect transaction sharing,
production role enforcement or live migration. The [fixture adapter][driver]
changes its private client's type mappings. Its [query span code][session]
has SQL and parameter attributes, but [the pinned tracer][tracer] has no OTel
binding; recheck on upgrades.

## Review

| Finding | Author disposition |
| --- | --- |
| R1.1 — Role split | Identified current boot/serve behavior and gated live DDL on the role split. |
| R1.2 — Managed-app meaning | Scoped the proposal to a dedicated database for a Stellarc-managed service app. |
| R1.3 — Adapter and events | Reused the Effect bridge, retained ADR 0010 and gated the first event-emitting conversion. |
| R1.4 — Decision scope | Separated decisions, proposals and open implementation gates; excluded incidental conversions. |
| R1.5 — Migration ledger | Scoped the checksum ledger to foundation and required CI queries against the migrated schema. |
| R1.6 — Evidence bounds | Narrowed the fixture claim and documented the pin and tracing limits; PR body tracks CI separately. |

[bridge]: ../../packages/drizzle-effect/src/index.ts
[kaneo-kernel]: ../../packages/kaneo/src/kernel.ts
[otel]: 0010-opentelemetry-native.md#mandatory-instrumentation-per-module-enforced-by-review
[ledger]: ../../packages/db/src/migrate.ts
[apps]: 0015-apps-clients-and-arclet.md#6-what-an-app-is
[charter]: ../v2-charter.md#events--storage
[api]: ../../apps/stellarc-api/src/main.ts
[append]: ../../packages/agents/src/store.ts
[driver]: https://cdn.jsdelivr.net/npm/drizzle-orm@0.45.4/postgres-js/driver.js
[session]: https://cdn.jsdelivr.net/npm/drizzle-orm@0.45.4/postgres-js/session.js
[tracer]: https://cdn.jsdelivr.net/npm/drizzle-orm@0.45.4/tracing.js
