# STL-21 — T7 Project as grouping resource (D25); Projects section + final parity gate

## 1. Scope and premise audit

Deliver the Project grouping resource per D25 (context + resource refs): the `project` table with full org-scoped CRUD, slug/alias canonical-URL machinery, archive/unarchive, resource links to board/repo/table with safe summaries, project-scoped milestones, project-ticket membership with progress, project updates with health — each live through Effect service → HTTP (fork-contract-identical) → event log → sync collections → the frozen Projects screens; plus transactional import of the one populated `project` row; plus execution of the wave-exit final gate (all 14 reconciliation queries green on a production-snapshot fixture, three consecutive clean full imports). The orchestrator alone commits/merges/updates the tracker.

Premise audit against pinned Kaneo `2504e64512b84b9b739d4d4fb0d4ceaefdb14783` (verified: fork HEAD at pin; working tree dirty with uncommitted `stellarc/kfl-378-project-sidebar` WIP — **excluded from the frozen baseline**):

- "1 table · 21 cols · 1 row" is correct for the **import inventory only**: `project` (migration 0072) is exactly 21 columns and the only populated Projects-wave table. The pinned fork ships **nine** Projects-wave tables (0072–0077: `project`, `project_slug_alias`, `project_milestone`, `project_ticket`, `project_board`, `project_repo`, `project_table_link`, `project_update`) and ~30 endpoints — the satellite tables are among the "24 empty tables designed fresh, not imported" (plan §Not-in-plan). Code wins: this slice implements the committed fork surface, imports only `project`.
- "Projects sidebar section" at the pin is **one nav entry** (`NavProjects`, KFL-366: FolderKanban icon, `navigation:sidebar.projects`, mounted before `NavBoards`) linking to the Projects overview — **not** the expandable per-project tree with progress (that is uncommitted kfl-378 WIP: `/project/sidebar`, `list-project-sidebar`). Frozen baseline = committed pin only.
- "Project = context + resource refs" (D25/primitives-v1) is implemented in the fork as typed link tables (`relationship ∈ context|dependency|deliverable`) — **not** a markdown context blob. This slice mirrors the fork; primitives-v1's "context md" phrasing is aspirational, the code wins.
- Ticket "Blocked by #15" understates real deps: `project_ticket`→task and `project_board`→board need STL-16; `project_repo`→repo needs STL-18; privilege resolution and `resourceType=project` grant routes need STL-20's chokepoint. Wave DAG already orders T7 after Wave 2; build order reflects it.
- `data_table` has **no slice** (empty in snapshot, designed fresh later). `project_table_link` is created with its columns but its FK to `data_table` is **deferred**; the service rejects `resourceType='table'` links (409 `InvalidReference`) until that resource exists. Matches STL-20's precedent (grant type `table` stored, no routes).
- Reconciliation **#13/#14 are not defined by this slice** — STL-27 (T13) owns the canon; STL-21 executes the final all-14 gate. (STL-20's note "#13/#14 and the final gate STL-21" predates the T13 filing.)
- The fork's `ws/project-sync-broadcast` (project.created/updated/archived/unarchived WS fanout) is **not ported** — shapes + events replace it (ADR 0007).

**OUT of scope / owner:** foundation, runtime, sync protocol, importer framework (STL-14); identity tables, role JSON, authz baseline — this slice only enforces the existing `project` permission domain and extends the STL-20 chokepoint consumers (STL-15); boards/tickets/statuses, ticket key/`PREFIX-seq`, board safe summaries' source tables (STL-16); activity/comment store — project updates are **not** activity comments and emit no activity writes (STL-17); repo resource + provider adapter (STL-18); board-level `milestone` table and ticket graph — distinct from `project_milestone` (STL-19, currently escalated; no code dependency either way); asset storage and grant storage/endpoints for board/repo — this slice only adds `resourceType=project` to STL-20's existing grant + org-privilege endpoints (STL-20); #13/#14 canon SQL and the all-14 harness definition (STL-27); desktop/mobile shells (STL-22/STL-23); schema-per-org escalation (STL-24); sync transport hardening (STL-25); design-token migration (STL-26); rebrand (STL-30); the kfl-378 sidebar tree if upstream adopts it (future UI ticket); `data_table` resource itself.

## 2. Tables, columns, events

Types: `t=text`, `i=integer`, `ts=timestamp without time zone`, `j=jsonb`; `?` nullable. Snake_case storage exact; camelCase is the API mapping. All mirror fork migrations 0072–0077 verbatim (constraints included); renumber the Stellarc migration to fit the merged sequence.

| Table | Exact columns |
|---|---|
| `project` (21) | `id:t PK`, `organization_id:t NN FK organization cascade/cascade`, `slug:t NN`, `name:t NN`, `icon:t?`, `color:t?`, `summary:t NN`, `description:t?`, `success_criteria:t?`, `status:t NN default 'planned' CHECK in ('planned','started','completed','canceled')`, `priority:t?` (ticket priority vocabulary, API-validated), `lead_user_id:t NN FK user restrict/cascade`, `lead_team_id:t? FK team set null/cascade`, `start_date:t?`, `target_date:t?`, `org_privilege:t?` (API picklist `none\|view\|edit\|manage`; no DB check, as fork), `archived_at:ts?`, `archived_by:t? FK user set null/cascade`, `created_at:ts NN defaultNow()`, `updated_at:ts NN defaultNow()`, `created_by:t NN FK user restrict/cascade`. UNIQUE `(organization_id,id)`; unique index `(organization_id, lower(slug))`; indexes `(organization_id,archived_at)`, `lead_user_id`, `lead_team_id` |
| `project_slug_alias` (5) | `id:t PK`, `organization_id:t NN FK organization cascade/cascade`, `project_id:t NN FK project cascade/cascade`, `slug:t NN`, `created_at:ts NN defaultNow()`. Unique index `(organization_id, lower(slug))`; index `project_id` |
| `project_milestone` (10) | `id:t PK`, `project_id:t NN FK project cascade/cascade`, `name:t NN`, `description:t?`, `target_date:t?`, `rank:i NN`, `completed_at:ts?`, `completed_by:t? FK user set null/cascade`, `created_at:ts NN defaultNow()`, `updated_at:ts NN defaultNow()`. UNIQUE `(project_id,id)`; CHECK `project_milestone_completion_pair_check` (`completed_at` and `completed_by` both null or both set) |
| `project_ticket` (7) | `id:t PK`, `project_id:t NN FK project cascade/cascade`, `task_id:t NN FK task(STL-16) cascade/cascade`, `project_milestone_id:t? FK project_milestone set null`, `rank:i NN`, `added_by:t NN FK user`, `added_at:ts NN defaultNow()`. UNIQUE `task_id` (a ticket lives in ≤1 project); UNIQUE `(project_id,task_id)` |
| `project_board` (10) | `id:t PK`, `organization_id:t NN`, `project_id:t NN FK project cascade`, `board_id:t NN FK board(STL-16) cascade`, `relationship:t NN CHECK in ('context','dependency','deliverable')`, `label:t?`, `note:t?`, `rank:i NN CHECK ≥0`, `created_by:t NN FK user`, `created_at:ts NN defaultNow()`. UNIQUE `(project_id,board_id)` |
| `project_repo` (10) | as `project_board` with `repo_id:t NN FK repo(STL-18) cascade`; UNIQUE `(project_id,repo_id)` |
| `project_table_link` (10) | as `project_board` with `table_id:t NN` — **FK to `data_table` deferred** (§1); UNIQUE `(project_id,table_id)` |
| `project_update` (9) | `id:t PK`, `organization_id:t NN`, `project_id:t NN FK project cascade`, `author_id:t NN FK user`, `content:t NN`, `health:t NN CHECK in ('on-track','at-risk','off-track')`, `edit_history:j NN default '[]'` (`Array<{content,editedAt,userId}>`), `created_at:ts NN defaultNow()`, `updated_at:ts NN defaultNow()` |

Events, all `schema_version=1`, payload rows are public projections: `project:created` `{id,organizationId}`, `project:updated` `{id,organizationId}` (also on link/milestone/ticket/update mutations that change the aggregate, mirroring fork's coarse event), `project:archived` `{id,organizationId}`, `project:unarchived` `{id,organizationId}`, `project:slug-alias-created` `{id,projectId,organizationId,slug}`, `project:resource-link-upserted`/`-deleted` `{id,projectId,resourceType,resourceId}`, `project:milestone-upserted`/`-deleted` `{id,projectId}`, `project:ticket-linked`/`-unlinked` `{id,projectId,taskId}`, `project:update-upserted`/`-deleted` `{id,projectId}`. Import emits projection-seed events exactly once per org, never live-type events. Observability per ADR 0010: every service method `Effect.fn`; `http.*` + `stellarc.org` + `stellarc.principal.kind` on endpoints; `db.*` spans without statement text; ≥1 span assertion per new path; no `console.*`; no PII in attributes.

## 3. HTTP API shape

Paths mirror the fork's mounted routes (`/api/project…`) so the frozen client fetchers work unchanged; `organizationId` stays in query/body as the fork sends it, validated against the authenticated principal's org (mismatch → 403). IDs opaque nonempty ≤128; dates ISO UTC; strict schemas reject excess keys; `Mutation<T> = {data:T,txid:number}` after commit. Common error union on every route: `ValidationError` 400 (slug regex `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` ≤63 after normalize, status/priority/relationship/health picklists, rank ≥0), `Unauthenticated` 401, `Forbidden` 403 (missing org-role `project:*` permission; insufficient resource privilege), `NotFound` 404 with identical body for unknown/cross-org/inaccessible ids and slugs (no-leak), `Conflict` 409 (`Duplicate` — slug canonical-or-alias collision, `(project,resource)` link, `task_id` already in a project; `InvalidReference` — lead user/team not same-org, task/board/repo target missing or cross-org, `resourceType='table'` until that resource exists). Permission mapping as fork: org-role `project:read|create|update` (+`delete` in the role vocabulary); resource privilege via the STL-20 chokepoint extended with `resourceType=project`: org-wide role → explicit user grant ∪ transitive team grants → `project.org_privilege` baseline → org `default_resource_privilege`; `edit` required for link/milestone/ticket/update mutations.

| Method/path (under `/api/project`) | Request | Success |
|---|---|---|
| GET `/` | q `{organizationId, includeArchived?}` | `ProjectPublic[]` |
| POST `/` | `{organizationId,name,summary,leadUserId,leadTeamId?,slug?,status?,priority?,icon?,color?,description?,successCriteria?,startDate?,targetDate?}` (createdBy = principal) | `Mutation<ProjectPublic>` |
| GET `/resolve` | q `{organizationId,slug}` | `{...ProjectPublic,usedSlugAlias:boolean}` — canonical case-insensitive, then alias |
| GET `/:id` | — | `ProjectPublic` |
| PUT `/:id` | full payload `{name,summary,status,priority,icon,color,description,successCriteria,leadUserId,leadTeamId,startDate,targetDate,orgPrivilege}` | `Mutation<ProjectPublic>` |
| PUT `/:id/slug` | `{slug}` | `Mutation<ProjectPublic>`; old slug becomes alias row |
| PUT `/:id/archive` · PUT `/:id/unarchive` | — | `Mutation<ProjectPublic>` (archivedBy = principal) |
| GET `/:id/resources` | — | `ResourceLinkPublic[]` |
| POST `/:id/resources` | `{resourceType:'board'\|'repo'\|'table',resourceId,relationship,label?,note?,rank?}` | `Mutation<ResourceLinkPublic>` |
| PUT `/:id/resources/:linkId` | `{relationship?,label?,note?,rank?}` | `Mutation<ResourceLinkPublic>` |
| DELETE `/:id/resources/:linkId` | — | `Mutation<{id}>` |
| GET `/:id/milestones` | — | `MilestonePublic[]` (with `progress`) |
| POST `/:id/milestones` | `{name,description?,targetDate?,rank?}` | `Mutation<MilestonePublic>` |
| PUT `/:id/milestones/:milestoneId` | `{name?,description?,targetDate?,rank?}` | `Mutation<MilestonePublic>` |
| DELETE `/:id/milestones/:milestoneId` | — | `Mutation<{id}>` |
| PUT `/:id/milestones/:milestoneId/complete` · `/reopen` | — | `Mutation<MilestonePublic>` (completion pair set/cleared atomically) |
| GET `/:id/tickets` | — | `{tickets:TicketPublic[],progress:{completed,eligible,percent\|null}}` (rank order) |
| POST `/:id/tickets` | `{taskId,projectMilestoneId?,rank?}` | `Mutation<TicketPublic>` |
| PUT `/:id/tickets/:taskId` | `{projectMilestoneId?,rank?}` | `Mutation<TicketPublic>` (milestone assign + reorder) |
| DELETE `/:id/tickets/:taskId` | — | `Mutation<{id}>` |
| GET `/:id/updates` | — | `UpdatePublic[]` |
| POST `/:id/updates` | `{content,health}` | `Mutation<UpdatePublic>` |
| PUT `/:id/updates/:updateId` | `{content?,health?}` | `Mutation<UpdatePublic>` (append `{content,editedAt,userId}` to `edit_history`) |
| DELETE `/:id/updates/:updateId` | — | `Mutation<{id}>` |
| GET/PUT/DELETE `/api/identity/orgs/:org/grants/project/:resourceId[/…]` + `org-privilege` | STL-20 shapes, `resourceType=project` un-blocked | STL-20 contracts; `project:resource-visibility` rides `project:updated` |
| GET `/orgs/:org/v1/shape` | T0 shape query | adds §4 collections |

Public schemas (camelCase, exact): `ProjectPublic` = fork `projectSchema` incl. joined `leadUserName`, `leadTeamName` (authorized public identity data). `ResourceLinkPublic` = `{id,projectId,resourceType,resourceId,relationship,label,note,rank,createdBy,createdAt,resource}` where `resource` is the **safe-summary union** (board `{id,slug,name,icon,archivedAt}` / repo `{id,owner,name,provider,url,description,isActive}` / table `{id,name,icon}`) — never repo config, credentials, table fields/rows. `MilestonePublic` incl. `completedBy:{id,name}|null`, `progress`. `TicketPublic` incl. `boardId,boardSlug,boardName,number,key,title,status,priority,archivedAt,startDate,dueDate,projectMilestoneId,rank,addedAt,addedBy`. `UpdatePublic` incl. `authorName`, `editHistory`.

## 4. Sync shapes affected

New org-scoped collections: `project` (snapshot+tail filtered by the caller's resolved project privilege — identical predicates, incl. old_value and deletes), `project_slug_alias`, `project_resource_link`, `project_milestone`, `project_ticket`, `project_update` (each scoped to visible projects; revocation loses visibility → handles invalidated, cached rows dropped). Board/repo/task collections are unchanged — links carry IDs only; summary enrichment happens in the HTTP projection. The frozen client keeps its fetchers; every mutation settles via returned `txid` before the UI leaves its pending state, so screens reflect committed state without refresh (no `refetchInterval`, no WS port). No `data_table`, no raw event log, no grant storage exposed as collections.

## 5. File manifest

CREATE (each mirrors the named existing implementation):

- `packages/db/migrations/0008_projects.sql` — fork `apps/api/drizzle/0072_project_foundation.sql`…`0077_project_updates.sql` (verbatim constraints; `project_table_link` FK deferred).
- `packages/contracts/src/projects.ts` — fork `apps/api/src/project/index.ts` + `project-resource-projection.ts` valibot schemas.
- `packages/domain/src/projects.ts` (CRUD, slug/alias, archive) — fork `apps/api/src/project/controllers/{create,update,get,list}-project.ts`, `rename-project-slug.ts`, `{un,}archive-project.ts`, `resolve-project.ts`, `validate-project-leads.ts`.
- `packages/domain/src/project-links.ts` — fork `apps/api/src/project/controllers/resources/*`.
- `packages/domain/src/project-milestones.ts` — fork `…/{create,update,delete,complete,reopen,list}-project-milestone*.ts`, `milestone-fields.ts`.
- `packages/domain/src/project-tickets.ts` — fork `…/{add,remove}-project-ticket.ts`, `assign-project-ticket-milestone.ts`, `list-project-tickets.ts`.
- `packages/domain/src/project-updates.ts` — fork `…/*-project-update.ts`.
- `packages/domain/src/projects-events.ts` — T0 `packages/sync/src/upcasters.ts`.
- `packages/domain/src/projects-import.ts` — T0 `packages/db/src/migrate.ts`.
- `packages/sync/src/projects-shapes.ts` — T0 `packages/sync/src/index.ts`.
- `apps/stellarc-api/src/projects-http.ts` — T0 `apps/stellarc-api/src/http.ts`.
- `apps/stellarc-ui/src/lib/projects-collections.ts` — T0 `packages/contracts/src/shape.ts`.
- `apps/stellarc-ui/src/lib/projects-client.ts` (frozen-fetcher adapter over the fork's `apps/web/src/fetchers/project/*` + `hooks/queries/project/*`).
- `tools/import-projects.ts` — T0 `packages/db/src/migrate.ts`.
- `tests/unit/projects.test.ts`, `tests/integration/projects.test.ts`, `tests/integration/projects-import.test.ts`, `tests/integration/projects-telemetry.test.ts` — T0 suite pattern.
- `tests/helpers/projects-fixture.ts` — T0 `tests/helpers/postgres.ts`.
- `tests/fixtures/projects-reconciliation.sql` — supplementary 21-column round-trip check; #13/#14 canon comes from STL-27, never invented here.
- `apps/stellarc-ui/e2e/projects.spec.ts` — T0 `apps/stellarc-ui/e2e/frozen.spec.ts`.

MODIFY after T0–T6 merge: `packages/contracts/src/api.ts`, `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/sync/src/index.ts` + `upcasters.ts`, `apps/stellarc-api/src/{http,main,errors}.ts`, STL-15's permission seam (whitelist the `project` role domain), STL-20's grants/org-privilege HTTP (accept `resourceType=project`) and chokepoint (project baseline step), package exports/`bun.lock`, plus the lifted UI's sidebar mount (`app-sidebar.tsx`: `NavProjects` before `NavBoards`), i18n namespaces (`navigation:sidebar.projects`, `projects:*`), and project fetchers/hooks. Preserve JSX and navigation; locate lifted paths at rebase.

## 6. Pixel-frozen UI surfaces (committed pin only)

Sidebar **Projects entry** (FolderKanban, tooltip, active-state, before Boards) → **Projects overview** (`/organization/$slug/projects`: header, permission-gated New Project, active vs completed sections, include-archived toggle, table rows, empty/skeleton states) → **project detail** `/projects/$projectSlug` overview tab (status/priority/dates header, health badge from latest update, properties form incl. `orgPrivilege` selector, contextual resources section with link/unlink dialogs and typed rows, milestones section with create/complete/reopen and progress) plus **tickets tab** (picker, ranked list, progress bar, milestone assign, remove) and **updates tab** (list, create, edit, delete, health picklist); create-project modal; archive/unarchive and rename-slug dialogs. The **kfl-378 expandable sidebar tree is not the baseline**. Every unrelated fork screen renders identically. Four Playwright projects (1440×900, 1024×768, 390×844, 360×640), landmark assertions + baselines `maxDiffPixelRatio 0.001`, against a built API + isolated Postgres + imported/live rows; intercepting project requests invalidates parity evidence.

## 7. TEST PLAN

Each case: RED before code exists, GREEN, then one-variable sabotage-RED.

- T01 migration/catalog exactness — all 8 tables, exact columns/constraints (21-col `project`, status/relationship/rank/health/completion-pair checks, lower-slug uniques incl. alias namespace, `task_id` unique). RED: tables absent. Sabotage: drop `project_status_check`.
- T02 importer — read-only source, preflight (21 cols, FK targets, slug format, leads exist, satellites empty/absent), one destination tx, the single `project` row preserved verbatim (ids/timestamps), idempotent rerun = zero new events, ledger digest, sanitized report. RED: importer absent. Sabotage: commit table-by-table.
- T03 list/get/resolve authz — privilege-filtered list via extended chokepoint; resolve canonical-case-insensitive → alias (`usedSlugAlias`); cross-org/unknown → identical 404. RED: routes absent. Sabotage: drop the accessible-ids filter.
- T04 create — slug normalize+regex, collision 409 across canonical **and** alias namespace, same-org lead validation, `status` default `planned`, event+row atomic. RED: route absent. Sabotage: skip alias-namespace collision check.
- T05 update/properties — full-payload PUT, `orgPrivilege` picklist, lead revalidation, `updated_at`. RED: absent. Sabotage: accept cross-org lead.
- T06 slug rename — alias row created, old slug resolves with `usedSlugAlias:true`, case-insensitive uniqueness over `project.slug` ∪ aliases. RED: absent. Sabotage: rename without alias insert.
- T07 archive/unarchive — sets `archived_at/by`, hidden from default list, `includeArchived` returns it. RED: absent. Sabotage: include archived in default filter.
- T08 resource links — CRUD, relationship picklist, target same-org + caller `view` on target, **safe summaries only**, rank, no-leak 404, `resourceType='table'` → 409 until the table resource exists. RED: absent. Sabotage: return full repo row (config/credentials) in the summary.
- T09 milestones — CRUD + complete/reopen (pair check enforced), rank order, progress computation. RED: absent. Sabotage: set `completed_by` without `completed_at` — check must reject.
- T10 project tickets — add/remove/assign/reorder, `(project,task)` and global `task_id` uniques, same-org task, progress `{completed,eligible,percent}`. RED: absent. Sabotage: allow duplicate task link.
- T11 updates — CRUD, health picklist, edit-history append-only (content+editedAt+userId), authorName join. RED: absent. Sabotage: overwrite history.
- T12 events/txid — all 14 event types on live writes only, atomic with rows, shape-visible; import seeds once. RED: no events. Sabotage: emit outside the write tx.
- T13 shape behavior — snapshot/tail/reconnect exact-once for all six collections; snapshot and tail share privilege predicates; revocation drops rows+handles. RED: collections absent. Sabotage: unscoped collection key.
- T14 grants extension — `resourceType=project` on STL-20 grant + org-privilege endpoints; resolution order role → grants ∪ team → `project.org_privilege` → org default; `none` hides. RED: extension absent. Sabotage: skip the project baseline step.
- T15 telemetry — every endpoint/service path has `http.*`/`stellarc.org`/`principal.kind`/`db.*` spans, no statement text, no `console.*`. RED: span assertions absent. Sabotage: remove one `Effect.fn`.
- T16 frozen-UI parity — §6 screens across four viewports, landmarks + baselines, live data. RED: screens absent pre-implementation. Sabotage: change row padding or swap live data for a static fixture.
- T17 final wave gate (**this slice's reconciliation obligation**) — all 14 queries green on a production-snapshot fixture (#1–#12 from owning slices; #13/#14 canon from STL-27 — obtain, never invent) + **three consecutive clean full imports** across all importers. RED: harness absent. Sabotage: flip one expected count — must fail.

STL-21 owns **zero** of #1–#12 (#1–3 STL-15, #4–6 STL-16, #7 STL-19, #8 STL-17, #9/11/12 STL-20, #10 STL-18); it owns final-gate execution and the supplementary project round-trip check.

## 8. Suggested vertical build order

1. Rebind every §5 path to merged T0–T6 code; confirm chokepoint + role-seam extension points; request #13/#14 canon from STL-27/orchestrator.
2. T01/T02 RED → migration + fixture + importer GREEN (one row, preflight, idempotence).
3. Thinnest E2E: import → GET/resolve → sidebar entry + overview render live (T03, part of T16).
4. Create/update/archive + slug/alias (T04–T07).
5. **Resource links — the gate item** (T08), then milestones/tickets/updates (T09–T11).
6. Events, collections, reconnect/revocation, grants extension, spans (T12–T15).
7. Four-viewport frozen-UI evidence; final all-14 + three-clean-imports gate (T16/T17); adversarial review (different family); orchestrator merges.
