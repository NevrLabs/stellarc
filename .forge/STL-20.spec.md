# STL-20 — T6 files, internal S3 assets and resource grants

## 1. Scope and premise audit

Implement the `asset` and `resource_grant` tables, an internal S3-compatible storage container (self-hosted, no external provider), the presign → upload → finalize → serve asset lifecycle, the resource-grant CRUD and the single privilege-resolution chokepoint (`view|edit|manage` over `board|repo`) that board/repo/task asset authorization reads, plus transactional import of both tables including binary object transfer so every imported asset URL resolves 200. Deliver the thinnest live path: imported/uploaded image renders in ticket description/comment through the new file layer; visibility settings screens manage grants live; cross-org isolation is proven RED-able.

Premise audit against pinned Kaneo `2504e64512b84b9b739d4d4fb0d4ceaefdb14783`: the 2-table/23-column count is exact (14 + 9). The 122 rows are a historical snapshot assertion, not verified live data — do not make import tests require 122 rows. `apps/api/src/database/schema.ts`'s inline `resource_grant_resource_type_check` (`board|repo|table`) is stale: final migration `0072` widens it to `board|repo|table|project`; the migration wins, and the router already accepts `project` and `table`. The fork's asset download is deliberately anonymous-readable for repo media (unguessable ID, GitHub image proxy) — "every asset URL resolves 200" must preserve that semantic, not force auth. Fork grants carry only `user`/`team` principals; agent principals inherit via team grants — do not invent an agent-grant kind. `data_table` and `project` grant types have no Stellarc slice yet: store/import them, expose no routes. The current checkout contains docs/forge only; rebind every path to merged T0–T4 code at implementation start.

**OUT of scope:** foundation/runtime/sync protocol (STL-14); identity tables, structural `identity_grant`, org default `default_resource_privilege` column semantics, user avatar bytea (STL-15); boards/tickets/statuses and `board.is_public`/`board.org_privilege` column ownership (STL-16); activity/comment tables and comment store (STL-17 — this slice only serves/finalizes their media); repo tables and `repo.org_privilege` column ownership (STL-18); ticket graph/followers/links/milestones (STL-19); project resource kind and project grant routes (STL-21, `project` values merely persist); final 14-query gate coordination (STL-21); visual rebrand (STL-30). Reworking sibling HTTP handlers to call the new chokepoint beyond the minimal wiring each sibling spec already stubbed is coordinated by the orchestrator, not silently done here.

## 2. Tables, columns, events

Types: `t=text`, `i=integer`, `ts=timestamp without time zone`; `?` nullable. Snake_case storage exact; camelCase is the API mapping.

| Table | Exact columns |
|---|---|
| `asset` | `id:t PK`, `organization_id:t FK organization cascade/cascade`, `board_id:t? FK board cascade/cascade`, `repo_id:t? FK repo cascade/cascade`, `task_id:t? FK task cascade/cascade`, `activity_id:t? FK activity cascade/cascade`, `object_key:t not null UNIQUE`, `filename:t not null`, `mime_type:t not null`, `size:i not null`, `kind:t not null default 'image'`, `surface:t not null default 'description'`, `created_by:t? FK user set null/cascade`, `created_at:ts not null defaultNow()` |
| `resource_grant` | `id:t PK`, `organization_id:t FK organization cascade`, `resource_type:t not null`, `resource_id:t not null`, `user_id:t? FK user cascade`, `team_id:t? FK team cascade`, `privilege:t not null`, `created_at:ts not null defaultNow()`, `updated_at:ts not null` |

Constraints: `asset_owner_context_check (board_id IS NOT NULL OR repo_id IS NOT NULL)`; `resource_grant_resource_type_check in ('board','repo','table','project')` (migration 0072 set — not schema.ts's stale triple); `privilege in ('view','edit','manage')`; `num_nonnulls(user_id,team_id)=1`; partial uniques `(organization_id,resource_type,resource_id,user_id) where user_id not null` and the team equivalent; indexes `(organization_id,resource_type,resource_id)`, `user_id`, `team_id`, and the six asset FK indexes. Object keys follow the fork layout `organization/<org>/(board/<board>/task/<task>|repo/<repo>)/(descriptions|comments)/<base>-<ts>-<cuid2>[.ext]` with the global `keyPrefix`. `org_privilege` baselines and `is_public` live on sibling-owned tables; this slice reads them and owns the resolution order: org-wide role → explicit user grant ∪ transitive team grants (highest wins) → resource `org_privilege` baseline → org `default_resource_privilege`; null baseline follows org default, `none` hides.

Events, all `schema_version=1`: `files:asset-upserted` `{id,row:<public row>,origin:'live'|'import'}`, `files:asset-deleted` `{id,organizationId}`, `files:grant-upserted` `{id,row}`, `files:grant-deleted` `{id,resourceType,resourceId,principal:{type,id}}`, `files:resource-visibility-changed` `{resourceType,resourceId,orgPrivilege}`. Never emit object keys, storage credentials, or presigned URLs in events, shapes, logs, errors, or attributes. Every service method is `Effect.fn`; endpoints carry standard http.* + `stellarc.org/principal.kind`; DB spans are `db.*` without statement text; no `console.*`; no PII in attributes.

## 3. HTTP API shape

IDs opaque nonempty ≤128; limits 1–200; dates ISO UTC; strict schemas reject excess keys; `Mutation<T> = {data:T,txid:number}` after commit. Common error union on every route: `ValidationError` 400, `Unauthenticated` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409 (`Duplicate|InvalidReference`), `Unavailable` 503 when storage is not configured. Foreign-org identifiers deliberately 404; no SQL, object keys, or storage details in errors.

| Method/path | Request | Success |
|---|---|---|
| GET `/api/assets/:id` | none (cookie, bearer, or anonymous) | binary stream; `Content-Disposition` inline only for safe image types else `application/octet-stream` + attachment; `X-Content-Type-Options: nosniff`; cache `private,max-age=120` (public board: `public,max-age=300`) |
| POST `/api/assets/uploads` | `{context:{kind:'task',boardId,taskId,surface:'description'\|'comment'}\|{kind:'repo',repoId,surface},filename,contentType,size}` | `{key,uploadUrl,headers}` (presigned PUT, TTL per config) |
| POST `/api/assets/uploads/finalize` | `{key,filename,contentType,size,surface}` + same context | `Mutation<AssetPublic>`; rejects keys not matching the caller's verified context |
| GET `/api/identity/orgs/:org/grants/:resourceType/:resourceId` | `resourceType∈{board,repo}` | `{grants:GrantPublic[]}`; `manage_settings` |
| PUT `/api/identity/orgs/:org/grants/:resourceType/:resourceId` | `{principalType:'user'\|'team',principalId,privilege}` | `Mutation<GrantPublic>` upsert on `(org,type,resource,principal)`; `manage_settings`; principal must be same-org member/team |
| DELETE `/api/identity/orgs/:org/grants/:resourceType/:resourceId/:grantId` | none | `Mutation<{id}>`; `manage_settings` |
| GET `/api/identity/orgs/:org/grants/:resourceType/:resourceId/org-privilege` | none | `{orgPrivilege:'none'\|'view'\|'edit'\|'manage'\|null}`; `manage_settings` |
| PUT `/api/identity/orgs/:org/grants/:resourceType/:resourceId/org-privilege` | `{orgPrivilege}` (nullable) | `Mutation<{orgPrivilege}>`; emits `files:resource-visibility-changed` |
| GET `/orgs/:org/v1/shape` | T0 shape query | adds `asset`, `resource_grant` collections (§4) |

Asset download auth mirrors the fork exactly: authenticated caller needs org membership and, for board-owned assets, `view` privilege on the board (chokepoint) — else 404; repo-owned assets remain fetchable anonymously by unguessable ID; board assets on `is_public` boards render for anonymous users; unknown/foreign-org IDs 404 identically. Upload requires the sibling task/repo update capability and validates the image MIME allowlist and size ceiling (defaults 10 MB / 300 s, config-overridable).

## 4. Sync shapes affected

New org-scoped collections: `asset` (safe public row only — no object key, no URLs) and `resource_grant` (snapshot and tail filtered by `manage_settings`, mirroring HTTP). Deletes, old values, reconnect, and revocation use identical predicates; losing `manage_settings` invalidates handles and drops cached rows. Existing board/repo/task collections are unchanged — grants alter authorization, not payloads. UI visibility screens read the live `resource_grant` collection, not a decorative REST cache.

## 5. File manifest

CREATE (each mirrors the named existing implementation):

- `packages/db/migrations/0007_files_grants.sql` — fork `apps/api/src/database/schema.ts` assetTable + resourceGrantTable (constraints from final migrations 0041/0045/0066/0072, not the stale inline check); renumber if siblings land first.
- `packages/contracts/src/files.ts` — T0 `packages/contracts/src/api.ts`.
- `packages/domain/src/files.ts` (asset lifecycle + storage client) — fork `apps/api/src/storage/s3.ts` + `apps/api/src/index.ts` `/asset/:id` handler.
- `packages/domain/src/grants.ts` (grant CRUD + privilege chokepoint) — fork `apps/api/src/resource-grant/index.ts` + `apps/api/src/resource-access.ts`.
- `packages/domain/src/files-events.ts` — T0 `packages/sync/src/upcasters.ts`.
- `packages/domain/src/files-import.ts` — T0 `packages/db/src/migrate.ts`.
- `packages/sync/src/files-shapes.ts` — T0 `packages/sync/src/index.ts`.
- `apps/stellarc-api/src/files-http.ts` — T0 `apps/stellarc-api/src/http.ts`.
- `apps/stellarc-ui/src/lib/files-collections.ts` — T0 `packages/contracts/src/shape.ts`.
- `apps/stellarc-ui/src/lib/files-client.ts` — fork `apps/web/src/lib/upload-task-image.ts` + `apps/web/src/fetchers/task/create-image-upload.ts`.
- `tools/import-files.ts` — T0 `packages/db/src/migrate.ts`.
- `tests/unit/files.test.ts` — T0 `tests/unit/foundation.test.ts`.
- `tests/integration/files.test.ts` — T0 `tests/integration/foundation.test.ts`.
- `tests/integration/files-import.test.ts` — T0 `tests/integration/foundation.test.ts`.
- `tests/integration/files-telemetry.test.ts` — T0 in-memory span test pattern.
- `tests/helpers/files-fixture.ts` (ephemeral internal S3 container + snapshot bucket) — T0 `tests/helpers/postgres.ts`.
- `tests/fixtures/files-reconciliation.sql` — canonical queries #9/#11/#12 (obtain exact inventory; never invent).
- `apps/stellarc-ui/e2e/files.spec.ts` — T0 `apps/stellarc-ui/e2e/frozen.spec.ts`.

MODIFY after dependency merge: `packages/contracts/src/api.ts`, `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/sync/src/index.ts`, `packages/sync/src/upcasters.ts`, `apps/stellarc-api/src/http.ts`, `apps/stellarc-api/src/main.ts`, `apps/stellarc-api/src/errors.ts`, `apps/stellarc-api/src/config.ts` (S3 env), package exports/`bun.lock`, plus existing UI fetchers/hooks under the fork's asset-upload and visibility paths and the sibling board/repo authorization call sites switched to the chokepoint per their own stubs. Preserve JSX and navigation; locate lifted paths at rebase.

## 6. Pixel-frozen UI surfaces

Settings → Organization → Visibility (org default + grant lists), Settings → Boards → `$boardId` Visibility, Settings → Repos → `$repoId` Visibility (grant rows, principal pickers, privilege selects, baseline selector, empty/loading/error states), ticket description resizable images and attachment cards, comment editor upload flow, activity thread image rendering, and every unrelated fork screen must render identically. Validate desktop 1440×900, tablet 1024×768, mobile 390×844, 360×640, maxDiffPixelRatio 0.001 against reviewed fork baselines. Acceptance path uses a built API, real isolated Postgres, the live internal S3 container, and imported rows; intercepting asset/grant requests invalidates parity evidence.

## 7. TEST PLAN

Each case: assertion-RED before code exists, GREEN, then one-variable sabotage-RED.

- T01 migration/catalog exactness (both tables, all 23 columns, checks incl. `project` in resource_type, partial uniques, FK cascade set). RED: table/constraint absent. Sabotage: drop `asset_owner_context_check`.
- T02 grant CRUD: upsert-on-principal, same-org principal/resource validation, 404 masking cross-org, error union. RED: routes absent. Sabotage: remove org predicate from delete.
- T03 privilege resolution precedence: org-wide role → user grant ∪ transitive team grants → resource baseline → org default; `none` hides; null follows org. RED: chokepoint absent. Sabotage: skip team expansion.
- T04 cross-org isolation (**reconciliation #12**): member of org A with board grant cannot read/see org B assets, grants, or shapes; identical 404s. RED: chokepoint/grant check absent. Sabotage: remove the grant check in the download path — suite must go red (gate condition).
- T05 asset serving auth matrix: member+`view` 200; member without grant on restricted board 404; anonymous on public board 200; anonymous repo media 200 (unguessable semantics); unknown ID 404. RED: `/api/assets/:id` absent. Sabotage: bypass membership check.
- T06 unsafe content types forced to download, nosniff, cache headers, ETag/Last-Modified passthrough. RED: headers unimplemented. Sabotage: inline everything.
- T07 upload roundtrip: presign → PUT to internal container → finalize creates row → GET 200 with identical bytes; key/context binding; MIME/size rejection. RED: endpoints absent. Sabotage: skip key-context match on finalize.
- T08 every asset URL resolves 200 (**reconciliation #9**): after import, iterate all asset IDs through the live HTTP layer. RED: no file layer. Sabotage: skip one object transfer — must fail.
- T09 events/txid: all five event types on live writes only, atomic with rows, projection-visible via shape; imports seeded exactly once. RED: no events. Sabotage: emit outside the write tx.
- T10 shape behavior: snapshot/tail/reconnect exact-once for `asset` + `resource_grant`; `manage_settings` loss drops rows and handle. RED: collections absent. Sabotage: unscoped collection key.
- T11 importer: read-only source, preflight (columns, checks, FK targets, context constraint, duplicates), one destination tx incl. S3 object transfer, idempotent rerun zero new events, ledger digest, no keys/secrets in report. RED: importer absent. Sabotage: commit table-by-table.
- T12 telemetry: every endpoint/service/storage/shape path has required spans (http.*, principal.kind, db.*), no statement text, no object keys, no `console.*`. RED: span assertions absent. Sabotage: remove one `Effect.fn` span.
- T13 frozen screenshots (§6 surfaces, four viewports) against live imported data. RED: baseline mismatch pre-implementation. Sabotage: change grant-row padding or swap live collection for fixture REST — must fail.
- T14 root discovery runs unit/integration/importer/telemetry/Playwright suites. Sabotage: break one assertion, root gate fails.

STL-20 owns reconciliation **#9, #11, #12**. The 14 legacy SQL definitions are not in this repo (recorded missing in STL-14); #9/#12 have slice-specific semantics above, but canonical SQL must be obtained from the orchestrator before GREEN is claimed — never substitute a fabricated query; #11 (grants apply to the same `(principal, resource)`) is proven by T02/T03 plus the canonical query. #1–#3 STL-15; #4–#6 STL-16; #7 STL-19; #8 STL-17; #10 STL-18; #13/#14 and the final gate STL-21.

## 8. Suggested vertical build order

1. Rebind to merged T0–T4 code; obtain canonical #9/#11/#12 SQL and the snapshot bucket layout; pin internal S3 container choice (CI ephemeral + deployable compose) and config surface.
2. T01/T11 RED → migration, fixture (Postgres + S3), importer with binary transfer and preflight GREEN.
3. Thinnest path: import → `GET /api/assets/:id` 200 with auth matrix (T05–T08) → images render in ticket detail.
4. Grants CRUD + chokepoint + visibility endpoints; wire sibling call sites; isolation #12 and precedence (T02–T04).
5. Events, shapes, reconnect/revocation, span coverage (T09/T10/T12).
6. Frozen UI evidence, canonical queries, full gates in clean worktree, adversarial review (different family). The orchestrator alone merges, commits, updates the tracker.
