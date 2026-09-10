# STL-15 — S1 identity implementation spec

## 1. Scope and premise audit

Implement the ten identity-table import, Better Auth as a first-party Effect Layer, org/principal/grant authorization, a single-schema OrgRouter seam, and live identity collections supporting sign-in → switch organization → Members plus Teams/Roles/API keys without changing the fork pixels. Preserve source identifiers, password/key encodings and permission semantics; all domain writes, projections and events commit atomically. This is a specification, not implementation evidence. Only the orchestrator commits, changes branches, or touches the tracker.

### Premise audit — code wins

- Gate checked: latest STL-15 triage is `pass`, at `2026-09-10T02:17:59+00:00`.
- `dev` at `5645f65` has documentation/forge only, no application workspace. STL-14 is not merged. The inspected provisional foundation is `/home/rpw/.paseo/worktrees/1syfl7s2/stl-14-c22` at `259a0a1`; all foundation MODIFY paths below are conditional on that dependency merging. Recheck actual merged interfaces before implementation; do not cherry-pick or duplicate T0 here.
- Fork reference is committed Kaneo `2504e64512b84b9b739d4d4fb0d4ceaefdb14783`, not its dirty checkout. `apps/api/src/database/schema.ts` defines the exact ten tables. Counting SQL column constructors gives 13/13/16/7/6/8/4/9/23/7 respectively, **106 columns**, not the ticket's 108. The 56 rows are an historical snapshot assertion, not verified live data. Do not make import tests require 56 rows.
- `member`/`role` in the issue title mean `organization_member`/`organization_role`; include `team_member` and `user_avatar` even though omitted from that title.
- Fork API keys use `config_id`, `reference_id`, nullable legacy `user_id`; do not assume `user_id` is the canonical owner. The ticket's SHA256-base64url assertion needs a synthetic known-answer test plus importer fingerprint comparison, not access to the real Talos secret.
- Fork auth uses bcrypt password verification, `/api/auth`, Better Auth organization/dynamic-role/team/API-key plugins, and an existing Drizzle adapter. Do not transplant its untraced DB client or best-effort post-commit hooks: those violate ADR 0007/0010.
- Foundation `Authz.authorize(org, headers)` is currently synchronous and fail-closed. Real authentication needs an Effect-returning interface and updated callers/tests, not a Promise cast or always-allow replacement.
- Session import is explicitly dropped, not session storage: create empty runtime `session` and `verification` tables for Better Auth. These are additional runtime tables, not part of the ten-table reconciliation.
- The canonical fourteen reconciliation SQL definitions are absent from this checkout and a broader filename search found no legacy inventory. T1 owns #1–#3 by the wave plan, but their exact definitions are **unresolved**. Obtain the canonical inventory from the orchestrator before claiming 3/3. The checks below are supplementary, never counterfeit numbered queries.

### OUT of scope / owner

- Foundation runtime, engine protocol and shell lift: STL-14/T0; merge prerequisite.
- Boards/statuses/tickets and #4–#6: STL-16/T2.
- Historical activity, notification/inbox/outbox delivery and #8: STL-17/T3. Identity events are emitted here; notification consumers are not.
- GitHub sign-in account rows are preserved here; GitHub grants/connections/mirrors and #10: STL-18/T4.
- Ticket graph/milestones and #7: STL-19/T5.
- Resource-specific grants, S3 assets and #9/#11/#12: STL-20/T6. Structural org grants and identity isolation are T1; avatar bytea remains here rather than waiting for S3.
- Projects and final all-fourteen/three-consecutive-import gate: STL-21/T7.
- Visual rebrand: STL-30/T7b. No token, typography, navigation or logo redesign here.
- Multi-schema deployment, workflow/node principal implementations, OAuth provider provisioning, OTP/magic-link transport, guest/device/admin account-deletion workflows: no verified sibling ownership exists in the local wave map. **UNASSIGNED: orchestrator must name follow-up tickets**; do not silently enable unsupported endpoints or claim full fork-auth parity. Preserve sign-in baseline configuration; if it visibly requires an excluded provider, resolve that scope conflict before implementation rather than hiding controls.

## 2. Exact tables/columns and event contracts

Shared `public` schema. Imported SQL names remain exact; camelCase is the API mapping. Types: `t=text`, `b=boolean`, `i=integer`, `ts=timestamp without time zone`, `bytes=bytea`; `?` nullable. Every imported `id:t` is a primary key. Preserve original timestamps without timezone reinterpretation (source export timezone must be explicitly UTC). No source DB writes.

| Table | Columns |
|---|---|
| `user` | id:t, name:t, email:t, email_verified:b, image:t?, locale:t?, created_at:ts, updated_at:ts, is_anonymous:b?, role:t?, banned:b?, ban_reason:t?, ban_expires:ts? |
| `account` | id:t, account_id:t, provider_id:t, user_id:t, access_token:t?, refresh_token:t?, id_token:t?, access_token_expires_at:ts?, refresh_token_expires_at:ts?, scope:t?, password:t?, created_at:ts, updated_at:ts |
| `organization` | id:t, name:t, slug:t, logo:t?, metadata:t?, description:t?, repos_enabled:b, tables_enabled:b, default_resource_privilege:t, ai_enabled:b, ai_default_token_limit:i, ai_default_character_limit:i, ai_provider_base_url:t?, ai_provider_model:t?, ai_provider_api_key:t?, created_at:ts |
| `organization_member` | id:t, organization_id:t, user_id:t, role:t, ai_token_limit:i?, ai_character_limit:i?, joined_at:ts |
| `organization_role` | id:t, organization_id:t, role:t, permission:t, created_at:ts, updated_at:ts |
| `team` | id:t, name:t, organization_id:t, source:t, icon:t?, parent_team_id:t?, created_at:ts, updated_at:ts? |
| `team_member` | id:t, team_id:t, user_id:t, created_at:ts? |
| `invitation` | id:t, organization_id:t, email:t, role:t?, team_id:t?, status:t, expires_at:ts, created_at:ts, inviter_id:t |
| `apikey` | id:t, config_id:t, name:t?, start:t?, reference_id:t, prefix:t?, key:t, user_id:t?, refill_interval:i?, refill_amount:i?, last_refill_at:ts?, enabled:b?, rate_limit_enabled:b?, rate_limit_time_window:i?, rate_limit_max:i?, request_count:i?, remaining:i?, last_request:ts?, expires_at:ts?, created_at:ts, updated_at:ts, permissions:t?, metadata:t? |
| `user_avatar` | id:t, user_id:t, mime_type:t, size:i, data:bytes, created_at:ts, updated_at:ts |
| `session` (empty on import) | id:t, expires_at:ts, token:t, created_at:ts, updated_at:ts, ip_address:t?, user_agent:t?, user_id:t, active_organization_id:t?, active_team_id:t?, impersonated_by:t? |
| `verification` (empty on import) | id:t, identifier:t, value:t, expires_at:ts, created_at:ts, updated_at:ts |
| `principal` (new) | id:t PK, kind:t CHECK IN ('human','agent'), user_id:t FK user, apikey_id:t? FK apikey UNIQUE; human has null apikey_id, agent has nonnull apikey_id; unique partial index user_id WHERE kind='human' |
| `identity_grant` (new) | org_id:t FK organization, principal_id:t FK principal, capability:t, PRIMARY KEY(org_id,principal_id,capability) |
| `identity_import` (new) | source_id:t, table_name:t, source_pk:t, digest:t, PRIMARY KEY(source_id,table_name,source_pk) |

Retain source default values and FK/index definitions from the pinned schema. In particular email unique; slug unique plus lower(slug) unique; user_avatar.user_id unique; team parent SET NULL. Add unique `(organization_id,user_id)` members, `(organization_id,role)` roles and `(team_id,user_id)` team members only after importer preflight rejects duplicate source pairs with a useful report. Never silently discard duplicates. Team-parent mutations lock the org and reject cycles/cross-org references. Invitation team IDs must resolve inside the invitation org. Prevent removing the last owner, including concurrent requests. Runtime does not delete orgs or users in this slice, avoiding unowned cross-slice cascade policy.

`organization` is the structural org; do not create a duplicate org table. OrgRouter.resolve(orgId) is Effect.fn returning `{schema:'public', orgId}` after verifying existence and caller access. It accepts IDs, never SQL schema names; every scoped query still binds org_id/organization_id. Human principal IDs derive stably from user IDs, agent IDs from API-key IDs (separate namespace). Imported keys without determinable owner/scope fail preflight, never gain all-org access. Effective agent capability = current membership/dynamic-role capability INTERSECT key ceiling INTERSECT structural grant. Humans use membership role plus structural grant. Revoke membership/role/key access without waiting for session cookie cache expiry. Default roles mirror `packages/permissions/src/index.ts`; owner stays immutable, dynamic overrides replace rather than union defaults. User role `admin` is instance-level, not an org-role shortcut.

Existing T0 tables `event`, `org_event_counter`, `stellarc_migration` are written through their existing services without column changes. Add FK org_event_counter.org→organization.id only after removing test-only probe data in isolated test setup; never purge a live DB to make migration pass. Actor is principal.id; preserve T0 decimal-string cursor and safe-integer txid conventions.

### Events (pluginId `identity`, schema_version 1 throughout)

- `identity:organization-upserted`: `{id, row: OrganizationPublic}`.
- `identity:member-upserted`, `identity:role-upserted`, `identity:team-upserted`, `identity:team-member-upserted`, `identity:invitation-upserted`, `identity:apikey-upserted`, `identity:principal-upserted`: `{id, row: <respective public row>}`.
- `identity:member-deleted`, `identity:role-deleted`, `identity:team-deleted`, `identity:team-member-deleted`, `identity:apikey-deleted`: `{id}`.
- `identity:grant-upserted` / `identity:grant-deleted`: `{principalId,capability}` within event.org; not browser-visible.
- `identity:user-upserted`: `{id,row:UserPublic}` emitted into each membership org affected, never a global public-user feed.
- `identity:avatar-upserted`: `{userId,avatarId,updatedAt}`; bytes are never in events.

Public rows are explicit allowlists in §3; no secrets in payloads. Invitations change status through upsert, not physical deletion. Session/token/verification/account-secret/rate-counter writes are operational auth storage and emit no domain events. Domain-changing Better Auth operations must execute adapter writes, grant recalculation, event append and projections on the **same @effect/sql transaction/connection**; after-hooks on a separate connection are forbidden. Multi-org user changes lock counters in sorted order. Authentication establishes actor context before any mutation; fixture import uses an explicit maintenance principal and is not an HTTP bypass.

Importer: read a restored snapshot using a read-only source connection; preflight column set, FKs, role permission JSON, hash format, avatar length/MIME and duplicates; abort before any writes on mismatch. Import users/accounts/orgs/roles/members/teams/team members/invitations/keys/avatars in FK order (teams in two passes), then principals/grants. One destination transaction per full fixture run; lock imports. Preserve existing hashes verbatim, never hash an imported hash. Ledger digest covers canonical all-column representation including null and bytea; identical rerun produces zero new events; changed source rows require explicit replace mode on a disposable destination, never overwrite live edits implicitly. Emit sanitized projection-seeding events for each affected org and compare all ten source/destination PK sets and values. No tokens, emails, hashes or bytes in logs/report output.

## 3. HTTP API and Schemas

New domain endpoints below are intentional target contracts, not claims about the fork's current URLs. Adapt only identity fetchers/hooks. Better Auth login remains at its existing base path. Use Effect Schema, reject excess write keys, nonempty opaque ID length ≤128, bounded names ≤256, validated email, ISO UTC date strings, finite integer limits. Nullable and optional differ: `?` below means optional request member, `|null` is explicit clearing. Permission = Record(nonempty resource name, Array(nonempty action name)), validated against the pinned permission vocabulary. Unknown capability is rejected, never interpreted as '*'.

Public row Schemas map §2 snake_case→camelCase and omit these fields: UserPublic omits banned/banReason/banExpires and instance role except in self session; OrganizationPublic omits aiProviderApiKey; ApiKeyPublic omits key and userId legacy duplicate; Avatar metadata omits data. Account/session/verification have no collection/read-list endpoint. MemberPublic includes `{...member,user:Pick<UserPublic,id|name|email|image>,principalId}`; TeamMemberPublic includes `{...teamMember,organizationId}` derived server-side. PrincipalPublic = `{id,kind,userId}` restricted to current org. RolePublic parses permission text to Permission. ApiKeyPublic.permissions parses nullable JSON with explicit empty ceiling semantics; malformed source permissions fail import. All public reads are private/no-store, cookie credentials allowed only for configured origins.

Common error union E: `{_tag:'ValidationError',message}` 400; `{_tag:'Unauthenticated'}` 401; `{_tag:'Forbidden'}` 403; `{_tag:'NotFound'}` 404; `{_tag:'Conflict',code:'Duplicate'|'LastOwner'|'RoleInUse'|'TeamCycle'|'AlreadyAccepted'}` 409; `{_tag:'RateLimited',retryAfterSeconds}` 429; `{_tag:'Unavailable'}` 503. E applies to every endpoint, including auth normalization; do not leak SQL errors or secret-bearing Better Auth errors. Foreign-org identifiers return the same 404 as absent entities after authenticating the org. Unsupported methods 405; unsupported paths 404. Mutations return HTTP 200 `{data:T,txid:number}` after commit, deletion T=`{id}`. Login/logout/session selection return the envelopes listed separately (no fake domain txid).

| Method/path | Request Schema | Success Schema |
|---|---|---|
| POST `/api/auth/sign-in/email` | `{email,password,rememberMe?:boolean,callbackURL?:sameOriginURL}` | Better Auth `{redirect:boolean,token:string,url?:string,user:UserPublic}` plus secure HttpOnly session cookie; secret response never logged |
| GET `/api/auth/get-session` | no body | `{session:{id,userId,expiresAt,createdAt,updatedAt,activeOrganizationId:string|null},user:UserPublic}|null`; keep token out of adapted browser state |
| POST `/api/auth/sign-out` | `{}` | `{success:true}`, expired cookie |
| POST `/api/identity/active-org` | `{organizationId:ID}` | `{organization:OrganizationPublic}`; session update only after membership authorization |
| GET `/api/identity/organizations` | no body | `{organizations:OrganizationPublic[]}` restricted to current principal's grants |
| POST `/api/identity/organizations` | `{name,slug,description?:string}` | Mutation<OrganizationPublic>; instance admin only; creates owner membership/default roles/grants atomically |
| PATCH `/api/identity/orgs/:org` | `{name?:string,description?:string|null,slug?:string}` nonempty | Mutation<OrganizationPublic>; slug change instance-admin-only |
| GET `/api/identity/orgs/:org/members` | no body | `{members:MemberPublic[]}` |
| PATCH `/api/identity/orgs/:org/members/:id` | `{role:string}` | Mutation<MemberPublic> |
| DELETE `/api/identity/orgs/:org/members/:id` | no body | Mutation<{id}> |
| GET `/api/identity/orgs/:org/roles` | no body | `{roles:RolePublic[]}` |
| POST `/api/identity/orgs/:org/roles` | `{role:string,permission:Permission}` | Mutation<RolePublic> |
| PATCH `/api/identity/orgs/:org/roles/:id` | `{permission:Permission}` | Mutation<RolePublic> |
| DELETE `/api/identity/orgs/:org/roles/:id` | no body | Mutation<{id}>; in-use and owner blocked |
| GET `/api/identity/orgs/:org/teams` | no body | `{teams:TeamPublic[]}` |
| POST `/api/identity/orgs/:org/teams` | `{name,icon?:string|null,parentTeamId?:ID|null}` | Mutation<TeamPublic> |
| PATCH `/api/identity/orgs/:org/teams/:id` | `{name?:string,icon?:string|null,parentTeamId?:ID|null}` nonempty | Mutation<TeamPublic> |
| DELETE `/api/identity/orgs/:org/teams/:id` | no body | Mutation<{id}>; emit reparented child upserts and removed member deletions in same tx |
| GET `/api/identity/orgs/:org/teams/:id/members` | no body | `{members:TeamMemberPublic[]}` direct membership only; inherited membership computed by shared resolver |
| POST `/api/identity/orgs/:org/teams/:id/members` | `{userId:ID}` | Mutation<TeamMemberPublic> |
| DELETE `/api/identity/orgs/:org/teams/:id/members/:memberId` | no body | Mutation<{id}> |
| GET `/api/identity/orgs/:org/invitations` | no body | `{invitations:InvitationPublic[]}` managers only |
| POST `/api/identity/orgs/:org/invitations` | `{email,role,teamId?:ID}` | Mutation<InvitationPublic>; authenticated inviter derived, no caller inviterId |
| POST `/api/identity/orgs/:org/invitations/:id/cancel` | `{}` | Mutation<InvitationPublic> |
| POST `/api/identity/invitations/:id/accept` | `{}` | Mutation<MemberPublic>; authenticated matching invitee, unexpired pending invitation, atomic consume/membership/team/grants |
| GET `/api/identity/orgs/:org/apikeys` | no body | `{keys:ApiKeyPublic[]}` own keys only, scoped to org |
| POST `/api/identity/orgs/:org/apikeys` | `{name,permissions:Permission,expiresAt?:DateString}` | Mutation<{key:ApiKeyPublic,secret:string}>; secret returned once, ceiling ≤ issuer capabilities |
| DELETE `/api/identity/orgs/:org/apikeys/:id` | no body | Mutation<{id}>; own key only, revokes agent grants immediately |
| GET `/api/identity/users/:id/avatar` | no body | bytes with stored safe image MIME, Content-Length=size, nosniff; self or shared authorized org only; 404 when missing |
| GET `/orgs/:org/v1/shape` | T0 shape query plus allowlisted identity table | unchanged Electric messages/headers, errors E; reauthorize each tail poll |

The Better Auth Layer uses only enabled, specified routes. Do not mount its entire plugin wildcard with undocumented second mutation paths. Its organization/key adapter powers the typed identity services; preserve Better Auth access-control semantics while returning the domain envelopes. Pin the actual package versions after STL-14 merge and contract-test the real handler: if its login response differs, update the contract and client together before implementation review, not by unsafe casts. Reject ambiguous simultaneous session/API-key credentials. Key requests use `x-api-key`, digest `base64url(SHA256(UTF8(rawKey)))`, constant-time digest comparison, disabled/expired/banned/permission/rate checks. No plaintext persistence. API-key creation requires a human session to prevent recursive credential minting. Invitation delivery is not falsely reported as sent; copy/link remains functional without SMTP, and STL-17 owns delivery consumer integration.

## 4. Sync shapes / collections

Register `organization`, `organization_member`, `organization_role`, `team`, `team_member`, `invitation`, `apikey`, `principal`, `user` as explicit public projections, never arbitrary SQL table access. Each canonical URL includes the org ID, authenticated principal scope and table authorization; handles are bound to scope. Org switch disposes old collections/long polls before attaching new ones; no old-org cache reuse. The organization picker uses the private organizations endpoint to discover scopes before attaching any shape.

Members joins scoped public users; user update fans out into those org projections. Teams includes parent/icon/source; member rows do not materialize inherited membership. Roles/invitations require management capability. Keys are owner-filtered both in snapshot and tail; principals are membership-filtered. All events filter through the same capabilities as HTTP; revocation forces handle invalidation/refetch and removes inaccessible cached data rather than continuing an established stream. No `account`, `session`, `verification`, `identity_grant`, `identity_import` or raw `user_avatar` shape. No organization secret or key digest anywhere in messages, old_value, logs or schema metadata.

Reuse T0 snapshot-boundary/counter/txid/upcaster implementation. Register all identity v1 schemas and identity upcasters, unknown/future versions fail closed. CRUD events update/delete the actual TanStack DB collections; awaitTxId settles mutations, including deletes and multi-event updates. REST list endpoints support bootstrap/compatibility tests but Members/Teams/Roles/Keys views must read live collections, not React Query snapshots with a decorative shape connection. Session active-org is user-private state and need not be streamed.

## 5. File manifest

Paths relative to repository root. CREATE count below excludes the spec itself. T0 mirrors refer to the inspected provisional worktree and must be rebased to merged STL-14; fork mirrors refer to committed `2504e645...`. A mirror is a concrete behavioral/template reference, not an instruction to copy Hono/Drizzle into the new runtime.

| CREATE | Specific existing mirror |
|---|---|
| `packages/db/migrations/002_identity.sql` | fork `apps/api/src/database/schema.ts` (ten tables/runtime auth); T0 `packages/db/src/migrate.ts` for migration discovery |
| `packages/contracts/src/identity.ts` | T0 `packages/contracts/src/api.ts` |
| `packages/domain/src/identity.ts` | T0 `packages/domain/src/index.ts`; fork `apps/api/src/auth.ts` for service behavior |
| `packages/domain/src/org-router.ts` | T0 `packages/domain/src/authz.ts` Layer boundary |
| `packages/domain/src/identity-events.ts` | T0 `packages/sync/src/upcasters.ts` |
| `packages/domain/src/better-auth.ts` | fork `apps/api/src/auth.ts` |
| `packages/domain/src/better-auth-adapter.ts` | T0 `packages/db/src/index.ts` transaction client; fork `apps/api/src/auth.ts` model mapping |
| `packages/domain/src/identity-import.ts` | T0 `packages/db/src/migrate.ts` transactional maintenance service |
| `packages/sync/src/identity-shapes.ts` | T0 `packages/sync/src/index.ts` |
| `apps/stellarc-api/src/identity-http.ts` | T0 `apps/stellarc-api/src/http.ts` |
| `apps/stellarc-ui/src/lib/identity-collections.ts` | T0 `packages/contracts/src/shape.ts` protocol contract; actual TanStack adapter wiring in T0 frozen UI |
| `apps/stellarc-ui/src/lib/identity-client.ts` | fork `apps/web/src/lib/auth-client.ts` |
| `tools/import-identity.ts` | T0 `packages/db/src/migrate.ts` |
| `tests/unit/identity.test.ts` | T0 `tests/unit/foundation.test.ts` |
| `tests/integration/identity.test.ts` | T0 `tests/integration/foundation.test.ts` |
| `tests/integration/identity-import.test.ts` | T0 `tests/integration/foundation.test.ts` |
| `tests/integration/identity-telemetry.test.ts` | T0 `tests/integration/foundation.test.ts` in-memory span assertions |
| `tests/helpers/identity-fixture.ts` | T0 `tests/helpers/postgres.ts` |
| `apps/stellarc-ui/e2e/identity.spec.ts` | T0 `apps/stellarc-ui/e2e/frozen.spec.ts` |
| `tests/fixtures/identity-reconciliation.sql` | canonical inventory #1–#3 **missing: obtain before writing, do not invent** |

MODIFY after T0 merge: `packages/domain/src/authz.ts` (Effect authentication/capabilities), `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/contracts/src/api.ts`, `packages/sync/src/index.ts`, `packages/sync/src/upcasters.ts`, `apps/stellarc-api/src/http.ts`, `apps/stellarc-api/src/main.ts`, `apps/stellarc-api/src/errors.ts`, `apps/stellarc-api/src/config.ts`; affected package.json files and root `bun.lock` for pinned Better Auth/bcrypt dependencies; existing foundation tests/test-server for async Authz; `tests/gates.test.ts` if discovery does not already include new suites. Never add a parallel root runtime/exporter.

UI MODIFY (prefix `apps/stellarc-ui/src/`, matching fork files under apps/web/src): `lib/auth-client.ts`; `components/providers/auth-provider/hooks/use-auth.ts`; `hooks/queries/organization/use-active-organization.ts`, `use-get-full-organization.ts`, `use-get-organizations.ts`, `use-organization-roles.ts`; `hooks/queries/use-get-api-keys.ts`; `hooks/mutations/api-key/use-create-api-key.ts`, `use-delete-api-key.ts`; `hooks/mutations/organization/use-create-organization-role.ts`, `use-update-organization-role.ts`, `use-delete-organization-role.ts`; `fetchers/organization/create-organization.ts`, `get-organizations.ts`, `update-organization.ts`; `fetchers/organization-member/get-organization-members.ts`, `get-active-organization-members.ts`, `get-organization-principals.ts`, `delete-organization-member.ts`, `invite-organization-member.ts`; `fetchers/team/team-hierarchy.ts`; `fetchers/invitation/get-invitation-details.ts`, `get-pending-invitations.ts`. Locate the lifted team/sign-in consumers during rebase and wire existing callbacks, not duplicate UI. Unsupported org-delete/ownership-transfer callbacks must not be silently repointed to an unimplemented path; baseline scope conflict requires explicit resolution. Preserve all unrelated fetchers.

Screenshot artifacts update only by reviewed reuse of fork baselines under `apps/stellarc-ui/e2e/__screenshots__/`; never regenerate expected images from the candidate to make a red test green. Filename set is inherited from T0 rather than invented in advance.

## 6. Frozen UI surfaces

Keep sign-in (including configured provider choices and validation/loading/error states), org switcher (open menu/current selection/create form), Settings Members (people rows, avatar, invite dialog, role picker/removal), Teams (nested tree, icons, direct/inherited membership, create/edit/member dialogs), Roles (list/permission editor/immutable owner), API keys (list/create/one-time reveal/revoke) rendering identically to the pinned fork. Keep shared sidebar, Settings navigation, empty states, typography, spacing, labels, focus/hover and responsive behavior. T0's four viewports apply; 768px is desktop at the fork breakpoint. User avatar bytes must render through the new authorized URL without changing dimensions. Pixel criterion: Playwright maxDiffPixelRatio 0.001, same browser/fonts/theme/locale/fixture dates. Members must be live against a built API+real isolated Postgres; unrelated sibling data can retain T0 stubs. Intercepting Members/identity requests in the acceptance test invalidates the result.

## 7. Test plan — explicit RED and negative controls

Each numbered row is one planned test (parameterized subcases stay within that row). Run the genuine implementation imports, real Better Auth handler, real PG transactions, stock shape adapter and actual mounted UI. Missing files are only an initial RED; once compiled, capture assertion-based RED too. Sabotage one behavior at a time in an isolated test worktree under orchestrator control, rerun the specific test, observe the stated assertion fail, restore, and rerun GREEN. Never mutate production credentials/data or keep bypass switches in the runtime.

| ID | Test / RED condition before implementation | Negative control that must turn it RED |
|---|---|---|
| T01 | Migration catalogs match all specified names/types/nullability/FKs/defaults; absent identity table fails | Remove team.parent_team_id or key.reference_id migration |
| T02 | bcrypt-imported password signs in via real handler, cookie loads session; initial 404/failed auth fails | Replace bcrypt verifier with reject-all |
| T03 | Wrong password/expired session/banned user fail without leaking account existence | Bypass credential/banned check |
| T04 | SHA256-base64url known-answer vector and imported digest verify raw key, not hex/padded/double-hash | Switch digest encoding to hex |
| T05 | Disabled/expired/rate-exhausted keys denied and counters atomic under concurrent calls | Skip expiry or unlocked increment |
| T06 | Human/agent same role reads succeed; key ceiling prevents escalation and ambiguous credentials rejected | Union rather than intersect key ceiling |
| T07 | Org switch validates membership and preserves old session on denial; discover only accessible orgs | Remove discovery/switch membership predicate |
| T08 | OrgRouter returns public+bound ID, unknown org fails, injection-like ID never becomes identifier | Concatenate org into SQL identifier |
| T09 | Members page reads imported rows from stock shape collection after login/switch | Disconnect collection and use fixture/empty list |
| T10 | Member mutation updates projection/event with matching returned txid; rollback leaves neither | Append event outside transaction |
| T11 | Connected/reconnecting Members collection sees update exactly once across snapshot race | Remove snapshot boundary filter |
| T12 | Revoking member/key/role terminates access including existing shape handles/session cache | Authorize only first snapshot |
| T13 | Dynamic role override replaces defaults; immutable owner and unknown permissions rejected | Merge defaults or allow owner edit |
| T14 | Two concurrent last-owner removals cannot leave zero owners | Remove org locking/count guard |
| T15 | Role CRUD emits live updates, duplicate/in-use delete conflict | Skip in-use check or role event |
| T16 | Teams create/edit/reparent/delete persist icon/source; cycles and cross-org parent rejected | Bypass cycle/org validation |
| T17 | Team membership adds/removes, inherited resolution does not materialize stale ancestor rows | Materialize ancestors without cleanup |
| T18 | Invitation acceptance validates invitee/expiry/status and consumes once under concurrency | Remove conditional status update |
| T19 | Invitation cancel/create updates managers' shape but is unavailable to ordinary members | Drop invitation shape capability filter |
| T20 | API key create returns secret once, stores digest, scopes agent, revoke immediately denies | Persist raw secret or leave revoked grants |
| T21 | Snapshot/tail/old_value/REST never expose password/key/token/org provider secret/other-org rows | Select raw account/apikey or remove org predicate |
| T22 | Avatar round-trips exact bytes/MIME/length and denies unrelated user | Return text-encoded bytes or skip shared-org check |
| T23 | Import compares all ten PK sets/columns and preserves nullable values, hashes and avatar bytes | Drop any account/hash/avatar row |
| T24 | Identical import rerun has identical event counts/ledger/destination; source remains unchanged | Append seed events unconditionally |
| T25 | Import bad FK/duplicate/permission/hash aborts entire transaction with sanitized report | Commit each table before preflight completes |
| T26 | Canonical reconciliation #1 passes on restored fixture and detects its inventory-defined violation | Apply exact #1 offending-row sabotage after inventory obtained |
| T27 | Canonical reconciliation #2 passes and detects its inventory-defined violation | Apply exact #2 offending-row sabotage after inventory obtained |
| T28 | Canonical reconciliation #3 passes and detects its inventory-defined violation | Apply exact #3 offending-row sabotage after inventory obtained |
| T29 | All HTTP table routes decode real requests/responses incl. error union, auth/permission cases; unsupported paths fail closed | Unregister route or bypass Schema/auth decoder |
| T30 | Every endpoint has server/http/org/principal span and parent auth/service/DB span under supplied traceparent | Remove one endpoint/service Effect.fn instrumentation |
| T31 | Every importer/router/adapter/event/shape service path emits named spans; mutation→append→emit txid correlated; no SQL text/PII/secrets | Disable adapter spans or add token/statement attribute |
| T32 | Frozen Members screenshot live + sign-in/switcher/Teams/Roles/Keys states match fork at all inherited viewports | Change member row padding by visible amount; remove baseline comparison to prove harness audit fails |
| T33 | Org switch disposes streams/caches; browser back/reload cannot display prior inaccessible org; role/key/team mutations settle awaitTxId | Reuse unscoped collection key or omit txids on deletes |
| T34 | Org creation atomically seeds owner/defaults/principal grants/events; failed slug collision leaves no artifacts | Move role seeding to best-effort after-hook |
| T35 | Per-org user public update fans out deterministically, secret account changes do not stream | Emit user update to only first org or emit account row |
| T36 | Test gate runs all new Vitest/PG/browser suites; intentional identity failure fails root gate | Remove identity suite from gate glob |

T26–T28 are blocked test specifications until canonical SQL is supplied: no invented assignment of user/member/key counts to query numbers. They must be expanded with the exact violation and query text before implementation is accepted. This is an explicit handoff blocker, not permission to mark skipped tests green. T1 owns only reconciliation #1–#3; #4–#14 remain siblings/final gate as §1. Supplementary all-column checks T23–T25 are mandatory regardless of inventory coverage.

Run after dependency merge: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun test` (T0 bridge must execute real Vitest+PG suites), and T0's existing Playwright command selecting `apps/stellarc-ui/e2e/identity.spec.ts`. Verify the merged package scripts before choosing any additional command; no package.json exists on current dev. Use `tests/helpers/postgres.ts` disposable database, never shared production. Record RED/GREEN/negative-control command exits and failing assertion per ID. Reviewer must separately sign off **SPANS**, credential/scope isolation, source encoding preservation, importer ledger correctness, and true live-collection/screenshot evidence.

## 8. Suggested vertical build order

1. Rebase assumptions onto merged STL-14, obtain canonical #1–#3, pin Better Auth API/adapter types, and resolve visible excluded-auth actions. This is the pre-implementation readiness gate; do not build against provisional files blindly.
2. T01/T23 RED → migration + fixture users/accounts/orgs/members → catalog and byte-exact import GREEN. Add principals/org grants/OrgRouter; T04/T08 RED/GREEN with negative controls.
3. Thinnest complete path: real Better Auth bcrypt login → cookie session → authorized org discovery/switch → members shape → existing Members view → live Members screenshot (T02/T07/T09). No Teams polish before this works end to end.
4. Add transactional member write/events/txid/tail and revocation (T10–T14/T33); prove negative controls before adding more CRUD.
5. Role then team then invitation then API-key services/routes/collections, with corresponding test RED preceding each implementation; keep existing JSX frozen. Add avatar serving and safe public-user fanout.
6. Complete ten-table importer ledger/replay/preflight; run canonical #1–#3 plus all-column checks on restored fixture. Failed or missing query prevents 3/3 claim.
7. Run telemetry contract tests across every route/service and secret-redaction sabotage; then full built-UI parity at inherited viewports. Deliver real screenshots and traces, not descriptions or newly blessed candidate baselines.
8. Hand spec/code/evidence to different-family adversarial review; orchestrator alone handles commits, clean-worktree full gate, tracker and merge. Do not report implementation complete from this spec stage.
