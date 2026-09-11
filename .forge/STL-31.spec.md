# STL-31 — [T1a] Identity contracts: migration + Schemas + HttpApi groups + service tags (no behaviour)

Parent spec: `.forge/STL-15.spec.md` (T1). This slice extracts its §2/§3 **definitions only** so
T2 (STL-16), T3 (STL-17), T4 (STL-18), T7 (STL-21) can start against stable FK targets and
importable schemas without waiting for auth behaviour. Merge target `dev`. Closes nothing;
#15 stays open and rebases onto this.

## 1. Scope and premise audit

### Scope (one paragraph)

Land the identity data contracts as a fast, behaviour-free PR: one checksum-registered SQL
migration (`0002_identity.sql`) creating the ten imported fork tables plus the three D25
structural tables (`principal`, `identity_grant`, `identity_import`) and the two empty
runtime auth tables (`session`, `verification`); Effect `Schema` definitions in
`packages/contracts/src/identity/` for every table row, every identity event (schema_version 1),
and every §3 request/response plus `HttpApiGroup` endpoint declarations with no handlers;
`Context.Tag` service interfaces in `packages/domain/src/identity/index.ts` with no `Layer`s;
and one integration test proving the migration applies, reapplies as a no-op, rejects checksum
drift, and produces the exact catalog. No Better Auth wiring, no importer, no HTTP mounting,
no sync shapes, no UI.

### Premise audit — code wins

Verified against `dev` @ `9e7f694` and PR #28 head `forge/stl-14-c4` @ `a8575a43` (STL-14 in
review, cycle 30, **unmerged**); fork pin `2504e64512b84b9b739d4d4fb0d4ceaefdb14783` = HEAD of
`/home/rpw/repos/kaneo`, `apps/api/src/database/schema.ts`.

- **Gate**: latest STL-31 `triage` = `pass` (2026-09-11T20:45:05Z). A prior spec attempt failed
  "no spec file written"; this file is the deliverable.
- **T0 unmerged**: `dev` has no `packages/`. Every T0 mirror below is the *branch content* of
  PR #28 and must be re-verified against the merged tree before implementation. The earlier
  provisional worktrees (`/home/rpw/.paseo/worktrees/*`) are **deleted**; do not reference them.
- **Column counts — ticket 108 / STL-15 106 / reality 107.** Counted from the pinned fork
  schema: user 13, account 13, organization **17**, organization_member 7, organization_role 6,
  team 8, team_member 4, invitation 9, apikey 23, user_avatar 7 → **107**. Discrepancies:
  (a) waves doc `2026-09-08-kaneo-parity-waves.md` says 108 — stale; (b) STL-15 §2's
  `organization` row lists 16 columns and **omits `work_enabled`** (fork line 188:
  `boolean("work_enabled").default(false).notNull()`). Code wins: this spec's §2 includes
  `work_enabled`; the "byte-for-byte vs §2" acceptance is measured against the corrected table
  below (deltas flagged †). T1 (#15) must rebase its spec accordingly.
- **`team.updated_at` is nullable** in the fork (no `.notNull()`), matching §2's `ts?` — keep
  it nullable; do not "fix" it.
- **Ticket enumerates 13 tables** (10 imported + 3 structural); STL-15 §2 additionally defines
  runtime `session`/`verification` (empty, Better Auth storage). Decision: **include both** in
  `0002_identity.sql`. They are pure DDL with zero behaviour, §2 defines them exactly, and
  omitting them forces a renumbering migration in #15. Information-schema test covers all 15.
- **Migration filename**: ticket says `0002_identity.sql` — correct; actual T0 file is
  `0001_foundation.sql` (4-digit). STL-15 §5's `002_identity.sql` is stale; ignore it.
- **Runner is single-version**: `packages/db/src/migrate.ts` hardcodes `0001_foundation`
  (read file → sha256 → advisory-lock tx → checksum-register/drift-reject). There is **no
  version list**; registering `0002` requires a minimal MODIFY (see §5). Never rewrite
  `0001_foundation.sql` bytes — its checksum is already registered on migrated clusters and
  any reformat is drift.
- **Contracts layout**: T0 has flat `packages/contracts/src/api.ts` (`HttpApi.make` +
  `HttpApiGroup.make("foundation")`, 18 lines, no error schemas, no exports field in
  package.json). The ticket's `packages/contracts/src/identity/*` directory is new — allowed;
  follow the merged T0 module-resolution convention at implement time.
- **Event naming**: T0 writes `plugin_type` as `pluginId:type` (`foundation:probe-upserted`).
  §2's `identity:*` events follow the same convention. `event.schema_version integer > 0`
  exists from 0001; identity events use **1**.
- **`packages/domain/src/index.ts` is function-style, not Tag-style** (only `authz.ts` uses
  `Context.Tag`). The ticket's Tag-only interfaces mirror `authz.ts`, not `index.ts`.
- **Better Auth pinned** in T0 contracts package.json (`better-auth 1.6.25`) — already a
  dependency; no package.json/bun.lock changes in this slice.
- **Deferred composite uniques are NOT ours**: §2 adds `(organization_id,user_id)`,
  `(organization_id,role)`, `(team_id,user_id)` uniques "only after importer preflight rejects
  duplicates" — that is T1 importer behaviour. `0002_identity.sql` must **not** create them.
  Same for the `org_event_counter.org → organization.id` FK (T1, after probe-data cleanup).

### OUT of scope / owner

- Better Auth Layer, sessions, cookies, sign-in behaviour, bcrypt: **STL-15 (#15 / T1)**.
- Importer, preflight, composite uniques, reconciliation #1–#3: **STL-15 (T1)**.
- Grants evaluation, capability intersection, OrgRouter behaviour: **STL-15 (T1)**.
- Identity sync shapes/collections/upcasters: **STL-15 (T1)**. T1a emits no events.
- All UI (fetchers, hooks, components): **STL-15 (T1)**; rebrand: STL-30 (T7b).
- Boards/tickets: STL-16; activity/notifications: STL-17; repos: STL-18; graph: STL-19;
  assets/grants: STL-20; projects + final 14-query gate: STL-21.
- This slice owns **zero** of the 14 reconciliation queries (see §7).

## 2. Exact tables/columns, events, schema_version

`public` schema, SQL names exact (snake_case); camelCase is the API mapping. `t=text`,
`b=boolean`, `i=integer`, `ts=timestamp without time zone`, `bytes=bytea`; `?` nullable.
Every imported `id:t` is PK. Source defaults and FK/index definitions retained verbatim
from the pin. † = correction vs STL-15 §2.

**Imported (10 tables, 107 columns)**

| Table | Columns |
|---|---|
| `user` (13) | id:t PK, name:t, email:t UNIQUE, email_verified:b NOT NULL DEFAULT false, image:t?, locale:t?, created_at:ts NOT NULL DEFAULT now(), updated_at:ts NOT NULL DEFAULT now(), is_anonymous:b? DEFAULT false, role:t?, banned:b? DEFAULT false, ban_reason:t?, ban_expires:ts? |
| `account` (13) | id:t PK, account_id:t, provider_id:t, user_id:t FK→user ON DELETE CASCADE, access_token:t?, refresh_token:t?, id_token:t?, access_token_expires_at:ts?, refresh_token_expires_at:ts?, scope:t?, password:t?, created_at:ts NOT NULL DEFAULT now(), updated_at:ts NOT NULL; INDEX account_userId_idx(user_id) |
| `organization` (17) | id:t PK, name:t, slug:t UNIQUE, logo:t?, metadata:t?, description:t?, repos_enabled:b NOT NULL DEFAULT false, tables_enabled:b NOT NULL DEFAULT false, **work_enabled:b NOT NULL DEFAULT false †**, default_resource_privilege:t NOT NULL DEFAULT 'manage', ai_enabled:b NOT NULL DEFAULT false, ai_default_token_limit:i NOT NULL DEFAULT 1024, ai_default_character_limit:i NOT NULL DEFAULT 4000, ai_provider_base_url:t?, ai_provider_model:t?, ai_provider_api_key:t?, created_at:ts NOT NULL; UNIQUE INDEX organization_slug_lower_unique ON lower(slug) |
| `organization_member` (7) | id:t PK, organization_id:t FK→organization CASCADE, user_id:t FK→user CASCADE, role:t NOT NULL DEFAULT 'member', ai_token_limit:i?, ai_character_limit:i?, joined_at:ts; INDEXES (organization_id),(user_id) |
| `organization_role` (6) | id:t PK, organization_id:t FK→organization CASCADE, role:t, permission:t, created_at:ts NOT NULL DEFAULT now(), updated_at:ts NOT NULL; INDEXES (organization_id),(role) |
| `team` (8) | id:t PK, name:t, organization_id:t FK→organization CASCADE, source:t NOT NULL DEFAULT 'kaneo', icon:t?, parent_team_id:t? FK→team **ON DELETE SET NULL**, created_at:ts, updated_at:ts? (nullable, per fork); INDEX (organization_id) |
| `team_member` (4) | id:t PK, team_id:t FK→team CASCADE, user_id:t FK→user CASCADE, created_at:ts?; INDEXES (team_id),(user_id) |
| `invitation` (9) | id:t PK, organization_id:t FK→organization CASCADE, email:t, role:t?, team_id:t?, status:t NOT NULL DEFAULT 'pending', expires_at:ts, created_at:ts NOT NULL DEFAULT now(), inviter_id:t FK→user CASCADE; INDEXES (organization_id),(email),(inviter_id) |
| `apikey` (23) | id:t PK, config_id:t NOT NULL DEFAULT 'default', name:t?, start:t?, reference_id:t FK→user CASCADE, prefix:t?, key:t, user_id:t? FK→user CASCADE (legacy), refill_interval:i?, refill_amount:i?, last_refill_at:ts?, enabled:b? DEFAULT true, rate_limit_enabled:b? DEFAULT true, rate_limit_time_window:i? DEFAULT 86400000, rate_limit_max:i? DEFAULT 10, request_count:i? DEFAULT 0, remaining:i?, last_request:ts?, expires_at:ts?, created_at:ts, updated_at:ts, permissions:t?, metadata:t?; INDEXES (config_id),(key),(reference_id),(user_id) |
| `user_avatar` (7) | id:t PK, user_id:t UNIQUE FK→user CASCADE, mime_type:t, size:i, data:bytes, created_at:ts NOT NULL DEFAULT now(), updated_at:ts NOT NULL; INDEX (user_id) |

**Runtime auth storage (2, created empty; not part of ten-table reconciliation)**

| Table | Columns |
|---|---|
| `session` (11) | id:t PK, expires_at:ts, token:t UNIQUE, created_at:ts, updated_at:ts, ip_address:t?, user_agent:t?, user_id:t FK→user CASCADE, active_organization_id:t?, active_team_id:t?, impersonated_by:t? |
| `verification` (6) | id:t PK, identifier:t, value:t, expires_at:ts, created_at:ts, updated_at:ts |

**Structural, new (3)**

| Table | Columns |
|---|---|
| `principal` (4) | id:t PK, kind:t CHECK IN ('human','agent'), user_id:t FK→user, apikey_id:t? FK→apikey UNIQUE; CHECK (kind='human' AND apikey_id IS NULL) OR (kind='agent' AND apikey_id IS NOT NULL); UNIQUE partial INDEX ON (user_id) WHERE kind='human' |
| `identity_grant` (3) | org_id:t FK→organization, principal_id:t FK→principal, capability:t, PRIMARY KEY(org_id,principal_id,capability) |
| `identity_import` (4) | source_id:t, table_name:t, source_pk:t, digest:t, PRIMARY KEY(source_id,table_name,source_pk) |

Create order in the SQL file respects FKs: user → account → organization →
organization_member → organization_role → team → team_member → invitation → apikey →
user_avatar → session → verification → principal → identity_grant → identity_import.
No FK touches `event`/`org_event_counter` (that counter FK is T1's). No composite uniques
from §2's deferred list. No grants to the runtime role (grantRuntime is T1's to extend;
nothing queries these tables until behaviour exists).

### Events — pluginId `identity`, schema_version **1** (declared, not emitted here)

17 types, all payloads `Schema`-defined in `contracts/src/identity/events.ts` as
`IDENTITY_SCHEMA_VERSION = 1`:

- `identity:organization-upserted` `{id, row: OrganizationPublic}`
- `identity:member-upserted`, `identity:role-upserted`, `identity:team-upserted`,
  `identity:team-member-upserted`, `identity:invitation-upserted`,
  `identity:apikey-upserted`, `identity:principal-upserted` — `{id, row:<public row>}`
- `identity:member-deleted`, `identity:role-deleted`, `identity:team-deleted`,
  `identity:team-member-deleted`, `identity:apikey-deleted` — `{id}`
- `identity:grant-upserted` / `identity:grant-deleted` — `{principalId,capability}` (org-scoped)
- `identity:user-upserted` — `{id,row:UserPublic}` (fanned per membership org by T1)
- `identity:avatar-upserted` — `{userId,avatarId,updatedAt}` (bytes never in events)

This slice declares payload Schemas only; append/upcast/emit is T1.

## 3. HTTP API shape (contracts only — no handlers, no mounting)

Effect Schemas in `contracts/src/identity/`. Validation primitives per STL-15 §3:
nonempty opaque ID ≤128, names ≤256, validated email, ISO-8601 UTC date strings, finite
integers, `Permission = Record<nonempty resource, Array<nonempty action>>` validated against
`packages/contracts/src/legacy/permissions` vocabulary, excess write keys rejected,
`?`=optional vs `|null`=explicit clear. Public row Schemas map snake_case→camelCase with the
§3 allowlist omissions: `UserPublic` (no banned/banReason/banExpires/instance role),
`OrganizationPublic` (no aiProviderApiKey), `ApiKeyPublic` (no key, no legacy userId;
permissions parsed as nullable Permission with empty-ceiling semantics),
`MemberPublic` = `{...member, user:Pick<UserPublic,id|name|email|image>, principalId}`,
`TeamMemberPublic` = `{...teamMember, organizationId}`, `PrincipalPublic` = `{id,kind,userId}`,
`RolePublic` parses permission text→Permission, avatar metadata omits `data`.
No read endpoint for account/session/verification.

Common error union `IdentityError` (7 tags): `ValidationError` 400, `Unauthenticated` 401,
`Forbidden` 403, `NotFound` 404, `Conflict` 409 (`Duplicate|LastOwner|RoleInUse|TeamCycle|
AlreadyAccepted`), `RateLimited` 429 (`retryAfterSeconds`), `Unavailable` 503. Attached to
every declared endpoint via `addError`; tag→HTTP mapping is T1 app work, not here.
Mutations return `Mutation<T> = {data:T, txid:number}`; deletes `Mutation<{id}>`.

| # | Method/path | Request Schema | Success Schema |
|---|---|---|---|
| 1 | POST `/api/identity/active-org` | `{organizationId:ID}` | `{organization:OrganizationPublic}` |
| 2 | GET `/api/identity/organizations` | — | `{organizations:OrganizationPublic[]}` |
| 3 | POST `/api/identity/organizations` | `{name,slug,description?:string}` | `Mutation<OrganizationPublic>` |
| 4 | PATCH `/api/identity/orgs/:org` | `{name?,description?:string|null,slug?}` nonempty | `Mutation<OrganizationPublic>` |
| 5 | GET `/api/identity/orgs/:org/members` | — | `{members:MemberPublic[]}` |
| 6 | PATCH `/api/identity/orgs/:org/members/:id` | `{role:string}` | `Mutation<MemberPublic>` |
| 7 | DELETE `/api/identity/orgs/:org/members/:id` | — | `Mutation<{id}>` |
| 8 | GET `/api/identity/orgs/:org/roles` | — | `{roles:RolePublic[]}` |
| 9 | POST `/api/identity/orgs/:org/roles` | `{role:string,permission:Permission}` | `Mutation<RolePublic>` |
| 10 | PATCH `/api/identity/orgs/:org/roles/:id` | `{permission:Permission}` | `Mutation<RolePublic>` |
| 11 | DELETE `/api/identity/orgs/:org/roles/:id` | — | `Mutation<{id}>` |
| 12 | GET `/api/identity/orgs/:org/teams` | — | `{teams:TeamPublic[]}` |
| 13 | POST `/api/identity/orgs/:org/teams` | `{name,icon?:string|null,parentTeamId?:ID|null}` | `Mutation<TeamPublic>` |
| 14 | PATCH `/api/identity/orgs/:org/teams/:id` | `{name?,icon?:string|null,parentTeamId?:ID|null}` | `Mutation<TeamPublic>` |
| 15 | DELETE `/api/identity/orgs/:org/teams/:id` | — | `Mutation<{id}>` |
| 16 | GET `/api/identity/orgs/:org/teams/:id/members` | — | `{members:TeamMemberPublic[]}` |
| 17 | POST `/api/identity/orgs/:org/teams/:id/members` | `{userId:ID}` | `Mutation<TeamMemberPublic>` |
| 18 | DELETE `/api/identity/orgs/:org/teams/:id/members/:memberId` | — | `Mutation<{id}>` |
| 19 | GET `/api/identity/orgs/:org/invitations` | — | `{invitations:InvitationPublic[]}` |
| 20 | POST `/api/identity/orgs/:org/invitations` | `{email,role,teamId?:ID}` | `Mutation<InvitationPublic>` |
| 21 | POST `/api/identity/orgs/:org/invitations/:id/cancel` | `{}` | `Mutation<InvitationPublic>` |
| 22 | POST `/api/identity/invitations/:id/accept` | `{}` | `Mutation<MemberPublic>` |
| 23 | GET `/api/identity/orgs/:org/apikeys` | — | `{keys:ApiKeyPublic[]}` |
| 24 | POST `/api/identity/orgs/:org/apikeys` | `{name,permissions:Permission,expiresAt?:DateString}` | `Mutation<{key:ApiKeyPublic,secret:string}>` |
| 25 | DELETE `/api/identity/orgs/:org/apikeys/:id` | — | `Mutation<{id}>` |
| 26 | GET `/api/identity/users/:id/avatar` | — | bytes (stored safe image MIME, Content-Length=size); Schema-level: `Uint8ArrayFromArray` |

All 26 declared as `HttpApiEndpoint`s in `HttpApiGroup.make("identity")` (path params
`Schema.NonEmptyString maxLength(128)` like T0's shape endpoint), **no handlers**. Exported
standalone; adding to the served `HttpApi` is T1.

**Not declared as Effect endpoints** (Schemas only, in `identity/auth-schemas.ts`): the three
Better Auth routes — POST `/api/auth/sign-in/email` `{email,password,rememberMe?:boolean,
callbackURL?:sameOriginURL}` → `{redirect:boolean,token:string,url?:string,user:UserPublic}`;
GET `/api/auth/get-session` → `{session:{id,userId,expiresAt,createdAt,updatedAt,
activeOrganizationId:string|null},user:UserPublic}|null`; POST `/api/auth/sign-out` `{}`
→ `{success:true}`. Rationale: Better Auth serves these at its own base path in T1; Effect
endpoint declarations would be a duplicate path contract. `GET /orgs/:org/v1/shape` already
exists in T0's foundation group — untouched here; identity-table allowlisting is T1.

## 4. Sync shapes affected

**None.** This slice changes no collections, registers no shapes, emits no events, adds no
upcasters. For context, T1 (#15) will register `organization`, `organization_member`,
`organization_role`, `team`, `team_member`, `invitation`, `apikey`, `principal`, `user` and
the identity upcasters; the event payload Schemas declared here (§2) are the contracts those
upcasters will consume. `session`, `verification`, `account`, `identity_grant`,
`identity_import`, raw `user_avatar` never become shapes.

## 5. File manifest

Mirror = concrete template reference from PR #28 head `a8575a43` (rebase onto merged STL-14;
mirror file may have moved). Fork mirrors = committed pin `2504e645`.

| CREATE | Mirrors |
|---|---|
| `packages/db/migrations/0002_identity.sql` | DDL style of T0 `packages/db/migrations/0001_foundation.sql`; column truth = fork `apps/api/src/database/schema.ts` (+`auth-schema.ts` session/verification); structural three per STL-15 §2 / ADR D25 |
| `packages/contracts/src/identity/tables.ts` | T0 `packages/contracts/src/api.ts` Schema style; row Schemas use **snake_case keys exactly as SQL** |
| `packages/contracts/src/identity/events.ts` | T0 `packages/sync/src/upcasters.ts` payload shapes (registry itself is T1) |
| `packages/contracts/src/identity/http.ts` (public rows, requests, error union, 26 endpoints, `HttpApiGroup.make("identity")`) | T0 `packages/contracts/src/api.ts` (`HttpApi`/`HttpApiGroup`/`HttpApiEndpoint`, path-param pattern) |
| `packages/contracts/src/identity/auth-schemas.ts` | fork `apps/web/src/lib/auth-client.ts` shapes (Schemas only) |
| `packages/contracts/src/identity/index.ts` (barrel) | package convention of merged T0 |
| `packages/domain/src/identity/index.ts` | T0 `packages/domain/src/authz.ts` `Context.Tag` pattern — Tags only: `IdentityStore` (typed byId/list reads for the ten rows), `OrgRouter` (`resolve(orgId): Effect<{schema:'public',orgId},IdentityError>`), `PrincipalResolver` (actor→`PrincipalPublic`), `IdentityEvents` (typed append per §2 event). Signatures reference contract Schemas; **no Layer, no SQL** |
| `tests/integration/identity-migration.test.ts` | T0 `tests/integration/foundation.test.ts` + `tests/helpers/postgres.ts` disposable cluster |
| `tests/unit/identity-contracts.test.ts` | T0 `tests/unit/foundation.test.ts` |

**MODIFY**: `packages/db/src/migrate.ts` — replace the hardcoded single version with an
ordered list `[{version:"0001_foundation",…},{version:"0002_identity",…}]`; per entry inside
the existing advisory-lock tx: registered → verify sha256 (mismatch throws, unchanged
semantics), else execute file + insert `(version,checksum)`. `0001_foundation.sql` bytes stay
untouched. `applyMigration` annotates `stellarc.migration.version` with the entry's version.
Conditional: `tests/gates.test.ts` only if the merged vitest configs' globs don't already
discover `tests/integration/identity-migration.test.ts` / `tests/unit/identity-contracts.test.ts`
(they cover `tests/integration/*` and `tests/unit/*` today, so likely no change). No
package.json / bun.lock changes — no new dependencies.

## 6. UI surfaces (pixel-frozen)

**Zero UI files touched; no screen may change.** Guard = existing frozen suite stays green
(`apps/stellarc-ui/e2e`, fork-provenance baselines). The identity-adjacent fork screens that
must keep rendering identically: sign-in (all states), org shell/switcher, Settings Members,
Teams, Roles, API keys — plus everything else in the inherited fork-provenance manifest at
T0's four viewports. This slice cannot regress them (no app code changes), and the acceptance
test is precisely that nothing moved.

## 7. Test plan — RED condition + negative control per case

Reconciliation ownership: **this slice owns none of the 14 queries** — #1–#3 stay with
STL-15's importer; nothing here may create or fake a numbered reconciliation fixture.
Run gates: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`,
`bun test` (or merged-T0 equivalents; verify scripts after STL-14 merges). Integration tests
use `tests/helpers/postgres.ts` disposable clusters only. Sabotage in an isolated worktree,
one variable at a time, rerun the specific case, observe the stated assertion fail, restore,
rerun green.

| ID | Test / RED before code exists | Negative control (must turn RED) |
|---|---|---|
| I1 | Fresh `0002` apply on disposable cluster creates all 15 tables; absent migration → `to_relation_exists` checks fail | Delete `0002_identity.sql` from the version list → apply succeeds without creating tables → assertions fail |
| I2 | Re-apply is a no-op: second run succeeds, zero DDL side effects, `stellarc_migration` has `('0002_identity', sha256)` row | Remove the registration insert → row-absent assertion fails |
| I3 | Checksum drift rejected: tamper the SQL file (or registered checksum) after first apply → second run throws "Migration checksum mismatch"; 0001 drift also still rejected | Delete the per-entry mismatch check for 0002 only → drift passes silently → fails |
| I4 | Parameterized over all 15 tables × every column: `information_schema.columns` matches §2 name, type (text/boolean/integer/timestamp/bytea), nullability, and default (incl. `work_enabled`, `default_resource_privilege 'manage'`, `team.source 'kaneo'`, apikey defaults, nullable `team.updated_at`) | Drop `team.parent_team_id`; retype a `timestamp`→`timestamptz`; change `apikey.config_id` default → each subcase red |
| I5 | FK graph via `pg_constraint`: all §2 FKs with exact ON DELETE (account/user cascades, member org+user cascades, role/invitation org cascades, `team.parent_team_id` **SET NULL**, apikey reference_id+user_id cascades, avatar unique-user cascade, principal.user_id/apikey_id, grant org+principal) | Remove `ON DELETE SET NULL` from parent_team_id (→ NO ACTION) → red |
| I6 | Uniques/indexes via `pg_indexes`+`pg_constraint`: `user.email` unique, `organization.slug` unique + `organization_slug_lower_unique` ON `lower(slug)`, `user_avatar_user_id_unique`, `principal.apikey_id` unique, principal **partial** unique `(user_id) WHERE kind='human'`, and every named secondary index in §2; composite deferred uniques absent | Replace lower(slug) index with plain unique → red; convert partial unique to full unique → red |
| I7 | CHECK constraints: `principal.kind IN ('human','agent')`; human↔apikey_id null-oracle CHECK (insert-time DDL probe in the test) | Drop the kind CHECK → bad-kind insert succeeds → red |
| U1 | Row Schema round-trip: each of the 15 table row Schemas accepts a representative valid row (snake_case keys, §2 types) and rejects missing-column and excess-key rows | Widen one row Schema to permissive keys → rejection subcase fails |
| U2 | All 17 event payload Schemas decode canonical samples; `IDENTITY_SCHEMA_VERSION === 1`; events carry no secret/byte fields | Relax one payload Schema (e.g. drop `row` from member-upserted) → sample decode fails |
| U3 | Contract surface: `HttpApiGroup.make("identity")` exposes exactly the 26 endpoints with correct path shapes; `IdentityError` has exactly the 7 tags and 5 Conflict codes; domain file exports 4 Tags with no `Layer` symbols | Remove one endpoint declaration → presence assertion fails |
| U4 | Request validation primitives: sign-in/org-create/apikey-create request Schemas accept valid samples; reject excess keys, `email` non-email, >256 name, >128 ID, `slug` change attempts without admin-only marker noted | Swap a request Schema for `Schema.Any` → rejection subcase fails |

RED capture rule (repo TDD contract): run each case before its implementation exists, paste
the failing assertion; only then implement. I1–I3 RED against the unmodified single-version
runner; I4–I7 RED before `0002_identity.sql` exists; U1–U4 RED before the contract files
exist (import errors count as initial RED only — after files exist, capture assertion RED via
the negative controls).

## 8. Suggested vertical build order

1. **Rebase gate**: after STL-14 merges, re-verify mirror paths, `migrate.ts` shape, test
   globs, and module-resolution convention; re-confirm the fork pin is still `2504e645`.
2. **Runner first (thinnest path)**: I1–I3 RED → version-list MODIFY of `migrate.ts` +
   empty-bones `0002_identity.sql` (canary table) → green. This de-risks registration before
   15 tables of DDL land.
3. **Full DDL**: I4–I7 RED (parameterized catalog assertions) → complete `0002_identity.sql`
   in FK order → green; run negative controls (drop column / retype / SET NULL / lower(slug) /
   partial-unique) one at a time.
4. **Row Schemas** `tables.ts` (U1) — mechanical transcription of §2, snake_case.
5. **Events + public/request/error Schemas + endpoints** `events.ts`, `http.ts`,
   `auth-schemas.ts` (U2–U4), then barrel + domain Tags (U3 compile surface).
6. Full gates (`lint`, `typecheck`, `bun test`, frozen UI suite untouched-and-green),
   record RED/GREEN/negative-control evidence per ID, hand to adversarial review — different
   family from the implementer; orchestrator handles commit/merge/tracker.

*Written by the STL-31 spec stage. No commits, no branch changes, no tracker writes.*
