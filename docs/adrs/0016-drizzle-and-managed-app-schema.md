# ADR 0016: Drizzle for Stellarc persistence

Status: proposed (2026-11-21). Applies to the `effect/v4` lineage. Extends
[ADR 0014 §4](0014-stellarc-app-tanstack-db.md) and
[ADR 0015](0015-apps-clients-and-arclet.md); does not change their UI or app
activation contracts.

## Operator decisions

- **Drizzle is required** as Stellarc's ORM. Future Stellarc-managed apps
  will need live schema changes (PostgreSQL data definition language, DDL).
- **Keep the current frontend.** Use React and the existing TanStack stack
  in `apps/web`. Foldkit is deferred; no pilot or migration in this change.

## Adoption

Effect and Bun stay. Use Drizzle table definitions and typed queries for new
Stellarc-owned persistence. Migrate existing stores when changing them, not
in a repo-wide rewrite. Keep explicit parameterized SQL where locking,
leases or event ordering are clearer in SQL. When a mutation and an event
must commit atomically, they must use the same physical transaction; do not
call a separate pool or transaction from inside it. Keep Effect schemas at
wire boundaries; a Drizzle row type is not runtime input validation.

Keep the existing checksum-registered migration runner and SQL files. Do not
add a second migration ledger or use `drizzle-kit push` against deployed
schemas. This decision neither replaces `@effect/sql-pg` nor requires a
Drizzle prerelease. Start with an isolated store on the pinned adapter. The
[0.45.4 postgres.js adapter][driver] changes client parsers and serializers
when initialized; do not wrap a client shared with existing stores without
proving their value mappings stay intact. Its [query implementation][session]
can attach SQL and parameters to tracing spans; verify those attributes are
not exported before adopting it in a production path.

## Live DDL is a separate delivery

Drizzle supplies schema/query primitives, not a managed-app migration
system. No runtime DDL privilege or API is added here. Before the first
managed app needs it, specify a server-owned path for validated, versioned
changes scoped to that app's storage. Separate the schema-change authority
from the ordinary serving role. Accept declared schema changes, not app-
supplied SQL. Define serialization, drift detection, durable audit, and
failure recovery before enabling it. Prove cross-app and cross-org refusal,
unchanged schema on failure, and recovery on a disposable PostgreSQL first.

## First executable check

[`drizzle-schema.test.ts`](../../tests/bun/drizzle-schema.test.ts) exercises
the pinned `drizzle-orm/postgres-js` on disposable PostgreSQL. A schema
creation, table alteration and typed insert commit together. A second
transaction rolls back both an added column and a row. This proves the
adapter transaction primitive only, not a production role, dynamic schema
planner, migration runner, native Effect adapter or live rollout.

[driver]: https://cdn.jsdelivr.net/npm/drizzle-orm@0.45.4/postgres-js/driver.js
[session]: https://cdn.jsdelivr.net/npm/drizzle-orm@0.45.4/postgres-js/session.js
