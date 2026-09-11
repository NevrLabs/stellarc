# STL-24 — T11 Schema-per-org escalation behind the routing seam (D9)

## 1. Scope and premise audit

Implement the D9 schema-per-org storage tier behind the OrgRouter seam STL-15 stubbed: a public org→storage routing registry, server-generated per-org schema names, a scope-aware migration runner that fans org-scoped migrations into every org schema, a transaction-scoped executor that routes org queries via `SET LOCAL search_path`, a verified one-time backfill that moves existing public org-scoped data into per-org schemas, and importer/shape routing through the same seam. Gate: two orgs in two schemas, cross-org isolation (#12) green in that fixture, one cursor per (client, org). No new product surface; every frozen screen renders identically. This is a specification, not implementation evidence; only the orchestrator commits, branches, or touches the tracker.

### Premise audit — code wins

- Gate checked: latest STL-24 triage `pass` (2026-09-10T05:50:38Z); prior spec `fail` was an orphaned watcher, not content.
- **"Migrations run per schema" — stale.** T0 `packages/db/src/migrate.ts` runs one migration (`0001_foundation`) against `public` with a single `public.stellarc_migration` ledger and advisory lock. Nothing is per-schema yet. This ticket builds that runner.
- **"Importer targets the org's schema" — not yet true.** No importer is merged; every sibling spec (STL-15 §2 "Shared `public` schema", STL-20 §5) writes `public` with bound org predicates. Importer routing is implemented here against whichever importers have merged (T1/T6 minimum), coordinated by the orchestrator.
- **"Per-org event counter already exists" — true.** `org_event_counter` single-row-per-org advanced inside the write tx (`packages/domain/src/index.ts`), concurrency-tested (foundation T02/T03).
- **"Sync shape URLs already disambiguate org" — true on the wire** (`/orgs/:org/v1/shape`, `http.ts`), but `ShapeEngine` queries are org-column filters against `public` tables, not schema-routed. "One cursor per (client, org)" is structurally satisfied — handles are keyed by shape URL, which embeds org — but must be proven under routing and against cross-org handle forgery (foundation T12).
- **"T1 stubs the seam" — consistent.** STL-15 §2: `OrgRouter.resolve(orgId)` returns `{schema:'public', orgId}`, accepts IDs never schema names. This slice replaces the stub's return with registry-driven routing; STL-15's T08 expectation (`schema:'public'`) must be updated — sibling-test rework via orchestrator, listed in §5.
- **"Blocked by #15, #20" — both `spec: pass`, unimplemented.** All paths rebind to merged code at implementation start (standing ruling since STL-20 §1).
- **"DoD: ADR 0009" — already accepted** (2026-09-08); nothing to ratify (same finding as STL-22/23). The pipeline itself is the DoD.
- **D9 scope note:** dedicated-DB escalation and "PaaS/apps get their own DB" are **reserved, not implemented** — the seam's tier field and interface must not leak SQL identifiers or assume same-database, but this slice ships tier `'schema'` only; tier `'db'` fails closed with a named error.

### OUT of scope / owner

- Identity tables/importer content, Better Auth, grants semantics: STL-15 (this slice only reroutes their storage).
- Boards/tickets (#4–#6): STL-16. Activity/inbox (#8): STL-17. Repos (#10): STL-18. Graph (#7): STL-19.
- Files/S3/grants and **ownership of #9/#11/#12**: STL-20 — STL-24 re-proves #12 in the two-schema fixture, never re-owns it.
- Projects, final all-14 gate: STL-21; #13/#14 canon: STL-27. Desktop/mobile shells: STL-22/23. Sync transport hardening: STL-25. Design tokens: STL-26. Rebrand: STL-30.
- Dedicated-DB tier, per-org DB credentials, connection-pool-per-org: unassigned follow-up (flagged by STL-14 §2 as D9 escalation); seam keeps the door open, nothing built.
- UI source changes of any kind: owned by each slice; zero here by construction.

## 2. Tables, columns, events

New **global** table (public, exact):

| Table | Columns |
|---|---|
| `org_storage` | `org:t PK REFERENCES organization(id)`, `schema_name:t NOT NULL UNIQUE CHECK (schema_name ~ '^org_[a-z0-9_]{1,40}$')`, `tier:t NOT NULL CHECK (tier IN ('schema','db')) DEFAULT 'schema'`, `status:t NOT NULL CHECK (status IN ('provisioning','active','migrating','quarantined')) DEFAULT 'provisioning'`, `provisioned_at:ts NOT NULL DEFAULT now()` |

Schema names are generated server-side at provisioning (`org_` + lowercase slug/hash of the org id, uniqueness-retried) and read only from this registry — never derived from request input at query time. Runtime role grants (extend `grantRuntime`): `USAGE` on every active org schema plus the existing per-table grants inside them; `org_storage` itself is owner-only.

Existing tables are **relocated, not altered**: per-org schemas receive `event`, `org_event_counter`, `sync_probe` and every table classified `org` in the scope manifest (§5 `schema-scope.ts`; at minimum the org-scoped identity/files tables merged at implementation time). Column types unchanged. `public` keeps global tables: `user, account, session, verification, user_avatar, principal, identity_grant, organization, org_storage, stellarc_migration`. `stellarc_migration` gains one ledger row **per schema** (org schemas track their own versions; public ledger keeps global + its own). `event.org`/`org_event_counter.org` columns are retained (constant per schema) for reconciliation and compatibility.

**Events: zero new types; zero schema_version changes.** All existing `pluginId:type` events and `schema_version` values are unchanged — this is storage topology, not domain. Org schema provisioning/backfill emit no domain events (operational, not domain); they log spans only. ADR 0010 applies in full: every service method `Effect.fn`; standard http.* + `stellarc.org`/`principal.kind` attrs; `db.*` spans with no statement text; ≥1 span assertion + negative control per new path; no `console.*`; no PII in attributes.

## 3. HTTP API shape

**No new endpoints, no request/response Schema changes, no error-union members.** All sibling endpoints keep their contracts verbatim. Two behavior notes: (1) org creation (STL-15 `POST /api/identity/organizations`) now provisions the schema inside its existing atomic tx and may surface provisioning failure as existing `Unavailable` 503 — no new error shape; (2) `GET /orgs/:org/v1/shape` behaves identically — URL, Electric messages, headers, authorization (pre- and post-wake re-check) unchanged; only the underlying reads route through the seam. Any org whose `org_storage.status ≠ 'active'` (or tier `'db'`) fails closed with the existing sanitized 403/503 contract, never a raw driver error.

## 4. Sync shapes affected

**No collection is added or removed.** Every org-scoped collection (`organization_member`, `organization_role`, `team`, `team_member`, `invitation`, `apikey`, `principal`, `user`, boards/tickets, activity, repos, `asset`, `resource_grant`, projects) keeps its name, URL (`/orgs/:org/v1/shape`), snapshot/tail semantics, and authorization predicates. The `ShapeEngine` snapshot read and tail read (currently `sql.begin` + org-filtered `SELECT` against public) execute inside the org's routed transaction instead. Defense in depth: existing `org`-column predicates stay bound — search_path routing is the isolation mechanism, the predicates are the second lock. Cursor/handle semantics: one cursor per (shape URL, org); same client with two orgs gets two independent handles; cross-handle or cross-org continuation tokens are rejected exactly as foundation T12 proves today.

## 5. File manifest

CREATE (paths relative to repo root; renumber migrations per siblings landed; mirrors are behavioral references):

| CREATE | Specific existing mirror |
|---|---|
| `packages/db/migrations/0009_org_routing.sql` | T0 `packages/db/migrations/0001_foundation.sql` |
| `packages/db/src/schema-scope.ts` (migration-version → `global`\|`org` manifest + catalog assertion) | T0 `packages/db/src/migrate.ts` (version/checksum ledger) |
| `packages/db/src/org-schemas.ts` (per-schema migration runner + atomic provisioning DDL) | T0 `packages/db/src/migrate.ts` |
| `packages/domain/src/org-storage.ts` (OrgStorageService: resolve/provision/route; dedicated-DB-ready interface) | T0 `packages/domain/src/index.ts` Effect.fn service pattern; `authz.ts` Layer boundary |
| `tools/backfill-org-schemas.ts` (verify-then-flip cutover, idempotent) | T0 `packages/db/src/migrate.ts` transactional maintenance; STL-15's `tools/import-identity.ts` once merged |
| `tests/unit/org-routing.test.ts` | T0 `tests/unit/foundation.test.ts` |
| `tests/integration/org-schemas.test.ts` (registry, provisioning, fan-out, executor) | T0 `tests/integration/foundation.test.ts` |
| `tests/integration/org-isolation.test.ts` (two-schema #12 re-proof) | foundation T03/T12 cases in `tests/integration/foundation.test.ts` |
| `tests/integration/org-backfill.test.ts` | foundation migration cases in `tests/integration/foundation.test.ts` |
| `tests/integration/org-telemetry.test.ts` | T0 in-memory span-assertion pattern |
| `tests/helpers/two-org-fixture.ts` (two orgs, two schemas, seeded rows) | T0 `tests/helpers/postgres.ts` |
| `apps/stellarc-ui/e2e/two-org.spec.ts` (org-switch across schemas, live) | T0 `apps/stellarc-ui/e2e/frozen.spec.ts` |

MODIFY after STL-15/STL-20 merge: `packages/db/src/index.ts` (SqlTracing table allowlist for routed schemas; scoped-executor wiring), `packages/db/src/migrate.ts` (scope-aware dispatch, per-schema ledgers, grantRuntime org-schema grants), `packages/domain/src/org-router.ts` (STL-15's stub → registry-backed resolve returning the org schema; never accepts schema names), `packages/domain/src/index.ts` (probe mutations through the seam), `packages/sync/src/index.ts` (snapshot/tail inside routed tx), `apps/stellarc-api/src/http.ts` / `main.ts` / `config.ts` (registry wiring; no new env beyond optional tier default), `tests/integration/test-server.ts`, `tests/gates.test.ts` if discovery needs it. **Orchestrator-coordinated sibling edits** (not silent): STL-15 T08's `schema:'public'` expectation → org schema; importer call sites (identity, files) target the org schema via the seam; no sibling SQL string rewrites — unqualified names resolve via search_path.

## 6. Pixel-frozen UI surfaces

Zero UI source files change; the routing is invisible. Every fork screen must keep rendering identically against the two-org two-schema fixture: sign-in, org switcher, Settings Members/Teams/Roles/API keys, sidebar boards, Kanban/list/backlog, ticket detail + activity thread, inbox, repos, visibility/asset surfaces, projects — same landmarks, spacing, typography, focus/hover, responsive behavior at the four inherited Playwright viewports (1440×900, 1024×768, 390×844, 360×640), `maxDiffPixelRatio 0.001` against existing baselines. The two-org E2E uses the real built API + isolated Postgres; intercepting identity/board/shape requests invalidates the evidence.

## 7. TEST PLAN — RED condition · negative control · reconciliation ownership

| ID | Test / RED before code exists | Sabotage that must turn it RED |
|---|---|---|
| R01 | Registry catalog exact (columns, checks, unique schema_name); schema names server-generated, match regex; injection-shaped org IDs (`a); DROP SCHEMA x`) never reach DDL — absent registry/migration fails | Interpolate raw org id into DDL |
| R02 | Org creation provisions schema + full org-scoped migration set + per-schema ledger + registry row `active` atomically; provisioning failure leaves zero artifacts | Insert registry row before schema create without compensating rollback |
| R03 | New org-scoped migration version fans out to every existing org schema (and new orgs); checksum drift in one org schema detected with schema name; global migrations apply once to public | Apply fan-out to first schema only |
| R04 | Catalog completeness: every table in public and every org schema classified `global`\|`org` in the manifest; unclassified table fails | Classify `event` as `global` |
| R05 | Two orgs/two schemas: events + counter rows land in the owning schema; seq independent, monotonic, gap-free per org; foundation T02/T03 concurrency stays green | Route org B appends into org A's schema |
| R06 | **Cross-org isolation (#12 re-proof, gate)**: org A member denied org B HTTP/shape/asset/grant paths, identical 404/403, no cross-schema reads anywhere | Drop search_path isolation in one handler |
| R07 | Scoped executor: `SET LOCAL search_path` confined to the tx (no pool leakage to the next borrower); central tables readable inside org tx (authz joins); org tx cannot resolve another org's tables unqualified | Use `SET` without `LOCAL`, return connection to pool |
| R08 | One cursor per (client, org): same client, org A + org B shapes → independent handles/cursors; forged/cross-handle/cross-org continuations rejected (T12 semantics under routing) | Key the handle map by table only, drop org |
| R09 | Snapshot/tail exact-once per org schema; reconnect receives every event once; boundary-race tests (foundation T01/T23) green per org | Remove the snapshot boundary filter |
| R10 | Sibling regression post-cutover: all executed slices' reconciliation queries (#1–#3 identity, #4–#6 board as merged, #9/#11 files…) + API suites green on the two-org fixture | Skip one table in backfill copy |
| R11 | Backfill: moves an existing public org (rows, events, counter, seq continuity) into its schema; idempotent rerun zero-change; verify counts **before** flipping registry; drops legacy public org-scoped tables only after verification; mismatch fails closed | Flip registry before verification |
| R12 | Importer routing: merged importers write each org's rows into that org's schema via the seam; per-org reports; idempotent rerun zero new events per org | Strip routing from one importer |
| R13 | Two-org E2E: sign in → org A live data → switch → org B live data → back; frozen screenshots unchanged, no interception | Point both orgs at one schema — isolation assert fires |
| R14 | Telemetry: provisioning/fan-out/backfill/resolve/scoped-executor/routed-shape paths all spanned (`Effect.fn`, http.*/stellarc.org/principal.kind where applicable, `db.*`, no statement text, no console, no PII) | Remove one `Effect.fn` wrapper |
| R15 | Root gate discovery runs all new suites; intentional failure fails the root gate | Remove a suite from the glob |

**Reconciliation queries owned: 0 of 14.** STL-24 owns no legacy query (no tables of its own); split stands: #1–#3 STL-15, #4–#6 STL-16, #7 STL-19, #8 STL-17, #9/#11/#12 STL-20, #10 STL-18, #13/#14 canon STL-27, final gate STL-21. Obligation here: every already-executed query stays green under per-org schemas, and #12 is explicitly re-proven in the two-schema fixture (R06) — canonical SQL still comes from the orchestrator, never invented.

## 8. Suggested vertical build order

1. Rebind to merged STL-15/STL-20 code; agree the initial scope-manifest classification and the STL-15 T08 sibling-test change with the orchestrator. Readiness gate, not code.
2. R01–R04 RED → registry migration, scope manifest, per-schema runner, atomic provisioning GREEN with negative controls.
3. Thinnest routed path: scoped executor + probe/event/counter writes through the seam, two orgs in two schemas (R05/R07) — before touching sync or backfill.
4. Route `ShapeEngine` snapshot/tail; cursors and exact-once under routing (R08/R09).
5. Backfill tool with verify-then-flip; sibling regression sweep (R10/R11); importer routing (R12).
6. Isolation re-proof in the fixture (R06), two-org E2E (R13), telemetry coverage (R14), full gates in a clean worktree at HEAD; adversarial review from a different family. The orchestrator alone commits, merges, updates the tracker.
