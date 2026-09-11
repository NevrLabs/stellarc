# STL-18 — T4 repository, GitHub integration and mirrors

## 1. Scope and premise audit

Implement the repository resource and separate provider connection, GitHub installation/user-grant authorization, GitHub integration configuration, and lossless `repo`, `repo_issue`, and `repo_pull_request` mirrors. Deliver the thinnest live path: authorized repository discovery → sidebar repository list → live issues/PRs list, plus transactional import/reconciliation and webhook/provider sync seams. Preserve source identifiers, provider state, JSON metadata, timestamps, and the fork's UI pixels; use the merged T0/T1/T2/T3 Effect, authz, event, and shape contracts rather than a parallel runtime.

The ticket is materially stale: the plan's six-table/88-column/119-row count is a historical inventory, not proof of current data. The pinned Kaneo schema confirms the six named tables, but `integration` is board-owned and therefore is a connection/configuration table, while installation and grants are the GitHub authorization tables. `github_delegation_state` is explicitly transient and excluded. `task_repo_item_link` is owned by STL-19, not this slice. The current Stellarc checkout contains docs/forge only; all paths below must be rebound to the merged foundation and sibling APIs before implementation.

**OUT of scope:** foundation/runtime/sync protocol (STL-14); identity/org/principal/grant baseline and GitHub sign-in accounts (STL-15); boards/tickets/statuses (STL-16); activity/notification consumers (STL-17); ticket links, followers, graph, milestones and `task_repo_item_link` (#7, STL-19); generic resource grants/assets (#9/#11/#12, STL-20); projects and final fourteen-query gate (STL-21); visual rebrand (STL-30); transient `github_delegation_state`, outbound delivery, OAuth provider provisioning, and GitHub webhook transport unless the orchestrator assigns them explicitly. STL-18 owns the provider adapter and inbound mirror application, not a duplicate webhook server.

## 2. Tables, columns, events

Types: `t=text`, `i=integer`, `b=boolean`, `j=jsonb`, `ts=timestamp without time zone`; `?` is nullable. Preserve exact snake_case storage and source nullability.

| Table | Exact columns |
|---|---|
| `repo` | `id:t PK`, `organization_id:t FK`, `provider:t`, `owner:t`, `name:t`, `external_id:t?`, `url:t`, `description:t?`, `default_branch:t?`, `is_private:b default false`, `config:j?`, `is_active:b default true`, `org_privilege:t?`, `last_synced_at:ts?`, `created_at:ts`, `updated_at:ts` |
| `repo_issue` | `id:t PK`, `repo_id:t FK`, `number:i`, `external_id:t?`, `title:t`, `body:t?`, `state:t`, `author_login:t?`, `author_avatar_url:t?`, `assignee_logins:j?`, `labels:j?`, `comment_count:i default 0`, `url:t`, `external_created_at:ts?`, `external_updated_at:ts?`, `closed_at:ts?`, `created_at:ts`, `updated_at:ts` |
| `repo_pull_request` | `id:t PK`, `repo_id:t FK`, `number:i`, `external_id:t?`, `title:t`, `body:t?`, `state:t`, `is_draft:b default false`, `author_login:t?`, `author_avatar_url:t?`, `head_branch:t?`, `base_branch:t?`, `labels:j?`, `comment_count:i default 0`, `additions:i?`, `deletions:i?`, `changed_files:i?`, `url:t`, `external_created_at:ts?`, `external_updated_at:ts?`, `merged_at:ts?`, `closed_at:ts?`, `created_at:ts`, `updated_at:ts` |
| `organization_github_installation` | `id:t PK`, `organization_id:t FK`, `installation_id:i`, `account_id:i`, `account_login:t`, `account_type:t`, `account_avatar_url:t?`, `repository_selection:t?`, `permissions:j?`, `created_at:ts`, `updated_at:ts` |
| `github_user_grant` | `id:t PK`, `user_id:t FK`, `provider_id:t`, `github_user_id:t`, `github_login:t`, `access_token:t`, `refresh_token:t?`, `access_token_expires_at:ts?`, `refresh_token_expires_at:ts?`, `scope:t?`, `created_at:ts`, `updated_at:ts` |
| `integration` | `id:t PK`, `board_id:t FK`, `type:t`, `config:t`, `is_active:b?`, `created_at:ts`, `updated_at:ts` |

Required constraints include unique `(organization_id,provider,owner,name)`, unique `(organization_id,installation_id)`, unique `(user_id,provider_id)`, unique `(repo_id,number)` on each mirror table, and unique `(board_id,type)` for integrations. Enforce same-org references, installation ownership, provider allowlists, and encrypted-at-rest/token redaction for grants and config. Do not expose raw tokens or config secrets in events, shapes, logs, errors, or attributes.

All new events use `schema_version=1`: `repository:repo-upserted`, `repository:repo-deleted`, `repository:issue-upserted`, `repository:issue-deleted`, `repository:pull-request-upserted`, `repository:pull-request-deleted`, `repository:installation-upserted`, `repository:installation-deleted`, `repository:github-grant-upserted`, `repository:github-grant-deleted`, and `repository:integration-upserted`/`repository:integration-deleted`. Upsert payloads are `{id,row:<public row>,origin:'live'|'import'}`; deletes are `{id,repoId?}`. Grant/install/config secrets are omitted or represented only by safe metadata. Every service is `Effect.fn`; endpoint spans carry standard HTTP and `stellarc.org/principal.kind`; DB spans are `db.*` without statement text.

## 3. HTTP API shape

IDs are opaque nonempty strings ≤128; query limits are 1–200; dates are ISO UTC; strict schemas reject excess keys. Every route returns the common union: `ValidationError` 400, `Unauthenticated` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409 (`Duplicate|StaleWrite|InvalidReference`), `RateLimited` 429, `Unavailable` 503. No SQL, PII, token, or provider-secret details appear in errors.

| Method/path | Request | Success |
|---|---|---|
| GET `/api/identity/orgs/:org/repos` | query `{provider?:string,active?:boolean}` | `{repos:RepoPublic[]}` |
| POST `/api/identity/orgs/:org/repos` | `{provider,owner,name,url,externalId?,description?,defaultBranch?,isPrivate?,config?,orgPrivilege?}` | `Mutation<RepoPublic>` |
| PATCH `/api/identity/orgs/:org/repos/:id` | partial mutable repo metadata | `Mutation<RepoPublic>` |
| DELETE `/api/identity/orgs/:org/repos/:id` | none | `Mutation<{id}>` |
| GET `/api/identity/orgs/:org/repos/:repo/issues` | query `{cursor?,limit?,state?:string}` | `{items:RepoIssuePublic[],nextCursor:string|null}` |
| GET `/api/identity/orgs/:org/repos/:repo/pulls` | query `{cursor?,limit?,state?:string}` | `{items:RepoPullRequestPublic[],nextCursor:string|null}` |
| GET `/api/identity/orgs/:org/github/installations` | none | `{installations:InstallationPublic[]}` |
| POST `/api/identity/orgs/:org/github/installations` | `{installationId,accountId,accountLogin,accountType,accountAvatarUrl?,repositorySelection?,permissions?}` | `Mutation<InstallationPublic>` |
| DELETE `/api/identity/orgs/:org/github/installations/:id` | none | `Mutation<{id}>` |
| GET `/api/identity/github/grants` | none | `{grants:GrantPublic[]}` (self only) |
| DELETE `/api/identity/github/grants/:id` | none | `Mutation<{id}>` (self only) |
| GET `/api/identity/orgs/:org/integrations` | none | `{integrations:IntegrationPublic[]}` |
| PUT `/api/identity/orgs/:org/integrations` | `{boardId,type,config,isActive?}` | `Mutation<IntegrationPublic>` |
| DELETE `/api/identity/orgs/:org/integrations/:id` | none | `Mutation<{id}>` |
| GET `/orgs/:org/v1/shape` | T0 shape query, allowlisted repository tables | Electric messages/headers |

`Mutation<T>` is `{data:T,txid:number}` after commit. Public DTOs omit grant tokens and integration secrets. Installation/grant management requires the appropriate identity capability; repository reads require resource access. Foreign-org identifiers deliberately return 404.

## 4. Sync shapes affected

Add authorized org collections `repo`, `repo_issue`, `repo_pull_request`, `organization_github_installation`, and safe `integration`; expose no raw grant/token/config-secret collection. Repository lists are org-scoped; issue/PR shapes require repo scope and filter by `repo_id`. Snapshot, tail, deletes, old values, reconnect, and revocation use identical authorization predicates. Org switching disposes old handles and caches. Grant/installation changes invalidate affected provider handles and remove inaccessible rows. UI reads lists from stock live collections, not a decorative REST cache.

## 5. File manifest

CREATE (each must mirror the named existing implementation):

- `packages/db/migrations/0005_repository.sql` — fork `apps/api/src/database/schema.ts` repository, mirror, installation, grant, and integration definitions.
- `packages/contracts/src/repository.ts` — T0 `packages/contracts/src/api.ts`.
- `packages/domain/src/repository.ts` — fork repository/issue/PR controllers and GitHub integration services.
- `packages/domain/src/repository-events.ts` — T0 `packages/sync/src/upcasters.ts`.
- `packages/domain/src/github-provider.ts` — fork GitHub integration/provider modules.
- `packages/domain/src/repository-import.ts` — T0 `packages/db/src/migrate.ts`.
- `packages/sync/src/repository-shapes.ts` — T0 `packages/sync/src/index.ts`.
- `apps/stellarc-api/src/repository-http.ts` — T0 `apps/stellarc-api/src/http.ts`.
- `apps/stellarc-ui/src/lib/repository-collections.ts` — T0 `packages/contracts/src/shape.ts` and fork repository fetchers.
- `apps/stellarc-ui/src/lib/repository-client.ts` — fork `apps/web/src/lib` GitHub/integration client patterns.
- `tools/import-repository.ts` — T0 `packages/db/src/migrate.ts`.
- `tests/unit/repository.test.ts` — T0 `tests/unit/foundation.test.ts`.
- `tests/integration/repository.test.ts` — T0 `tests/integration/foundation.test.ts`.
- `tests/integration/repository-import.test.ts` — T0 `tests/integration/foundation.test.ts`.
- `tests/integration/repository-telemetry.test.ts` — T0 in-memory span test pattern.
- `tests/helpers/repository-fixture.ts` — T0 `tests/helpers/postgres.ts`.
- `tests/fixtures/repository-reconciliation.sql` — canonical reconciliation query #10 (obtain exact inventory; never invent it).
- `apps/stellarc-ui/e2e/repository.spec.ts` — T0 `apps/stellarc-ui/e2e/frozen.spec.ts`.

MODIFY after dependency merge: `packages/contracts/src/api.ts`, `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/sync/src/index.ts`, `packages/sync/src/upcasters.ts`, `apps/stellarc-api/src/http.ts`, `apps/stellarc-api/src/main.ts`, `apps/stellarc-api/src/errors.ts`, `apps/stellarc-api/src/config.ts`, package exports/dependencies and `bun.lock` only as required, plus existing UI fetchers/hooks/components under the fork's repository/integration paths. Preserve JSX and navigation; locate actual lifted paths during rebase rather than inventing duplicates.

## 6. Pixel-frozen UI surfaces

The sidebar repository section, repository picker/list, repository detail shell, issues list, pull requests list, row state/labels/avatars, loading/empty/error states, filters, pagination/cursor affordances, integration settings, GitHub installation/grant controls, navigation, typography, spacing, focus/hover, responsive breakpoints, and all unrelated fork screens must render identically. Validate desktop 1440×900, tablet 1024×768, mobile 390×844, and 360×640 with max diff ratio 0.001 against reviewed fork baselines. The acceptance path must use a built API, real isolated Postgres, live shapes, and imported rows; intercepting repo/issue/PR requests invalidates parity evidence.

## 7. TEST PLAN

Each case must first be assertion-RED, then GREEN, then one-variable sabotage-RED. T01 migration/catalog exactness; RED missing table/type/FK, sabotage removes `repo_id` FK. T02 repository CRUD/authz/txid; RED route absent, sabotage bypasses org predicate. T03 issue/PR live list reads imported rows; RED collection empty, sabotage replaces it with fixture REST data. T04 provider state mapping preserves open/closed/merged/draft, JSON labels and nullable timestamps; RED mapping loses a field, sabotage maps merged to closed. T05 same-org installation/repo/integration constraints; RED cross-org insert succeeds, sabotage disables composite validation. T06 grant/token encryption and self-only access; RED raw secret leaks, sabotage selects token into DTO. T07 snapshot/tail/reconnect/delete exact-once behavior; RED boundary omission duplicates/misses rows, sabotage removes boundary filter. T08 importer compares all six PK/value sets, source read-only, malformed FK/duplicate/token aborts atomically; RED importer absent, sabotage commits table-by-table. T09 idempotent import emits no duplicate events and preserves source IDs; sabotage appends seed events on rerun. T10 canonical reconciliation #10 passes and detects its exact inventory-defined violation; blocked until canonical SQL is supplied, never substituted with a fabricated query. T11 every endpoint/service/provider/import/shape path has required HTTP/principal/DB spans, no SQL text/PII and no `console.*`; sabotage removes one `Effect.fn` span and must fail. T12 frozen sidebar/repository/issues/PR screenshots and real navigation match all four viewports; sabotage changes row padding or removes the live collection and must fail. T13 org switch/logout disposes old repository handles and cannot reveal prior-org rows; sabotage reuses an unscoped collection key. T14 root test discovery executes unit, Postgres, telemetry, importer and Playwright suites; sabotage an assertion and root gate must fail.

STL-18 owns reconciliation **#10 only**. #1–#3 are STL-15; #4–#6 STL-16; #7 STL-19; #8 STL-17; #9/#11/#12 STL-20; final queries remain STL-21.

## 8. Suggested vertical build order

1. Rebind to merged T0–T3 contracts, obtain canonical #10, pin provider/API schemas, and resolve token encryption and webhook ownership.
2. Write T01/T08 RED; add migration, fixture, import preflight/ledger, and exact six-table preservation.
3. Build the thinnest path: repo import → authorized repo shape → sidebar list → issue/PR shape → existing fork lists (T02–T04, T12).
4. Add transactional CRUD/events/txids, org revocation, reconnect semantics, and span assertions (T05–T07, T11, T13).
5. Add installation, grant, integration configuration, provider adapter and safe DTOs; prove secret isolation and negative controls.
6. Run canonical #10 plus importer idempotency, full gates and live Playwright evidence; hand to different-family adversarial review. The orchestrator alone merges, commits, and updates the tracker.
