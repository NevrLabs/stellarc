# STL-16 — S2 Board + Ticket implementation spec

## 1. Scope and premise audit

Import the eight board-slice tables, implement Board/Status/Ticket/Label/Template/Flag as Effect domain services with atomic event append, expose HTTP + sync collections, and wire the five frozen fork screens (sidebar boards, Kanban, list, backlog, ticket detail) to live shape data with ticket-key `PREFIX-seq` allocation and taxonomy-validated status transitions. All writes, projections and events commit on one transaction; identical rerun imports change nothing. This is a specification, not implementation evidence; only the orchestrator commits, branches, or touches the tracker.

### Premise audit — code wins

- Gate checked: latest STL-16 triage is `pass` (2026-09-10T02:20:18+00:00), NEEDS-INFO answered: **board is app-owned data, not a resource kind**; **T2 owns status-transition validation, T3 owns `workflow_rule`**. This spec follows that resolution: no structural-resource machinery here.
- Dependency chain is real, not formal: STL-14/T0 implement was still `running` (after two `blocked`) and STL-15/T1 has only a passed spec at audit time. All T0/T1 MODIFY paths are **conditional on those PRs merging**; rebase interfaces before building. Inspected provisional foundation: `.forge/worktrees/stl-14-c27` at `73c5ee5`.
- Fork reference is committed Kaneo `2504e64512b84b9b739d4d4fb0d4ceaefdb14783`. Counting SQL column constructors in `apps/api/src/database/schema.ts`: board 16, board_key_alias 5, column 10, task 21, flag_type 8, task_flag 12, label 8, task_template 6 = **86, exact match**. The 573 rows are an historical snapshot assertion; do not gate tests on 573.
- `Status replaces Column as a domain object`: the imported SQL table stays `column` (a reserved word — always quote it) so reconciliation compares like for like; Effect domain, contracts, HTTP and UI naming is `Status`. Virtual statuses (`triage`, `planned`, `canceled`, `duplicate` per `status-taxonomy.ts`) have **no row** and never emit events; fork `create-board` seeds exactly four column rows (to-do/in-progress/in-review/done).
- `task_template` is **organization-scoped**, not board-scoped, despite the ticket grouping it under "Board". `label` rows are task-attached (`task_id`) or org-global (partial unique only where `task_id is null`); rows null in both are reported by preflight, not silently coerced.
- `task.milestone_id` references `milestone`, which no earlier slice creates (T5/STL-19). Import the column as plain text **without FK**; T5 adds the constraint. Same story: `workflow_rule` (T3/STL-17) FKs `column_id` — T2 supplies the rows, not the table.
- Fork Drizzle property names diverge from SQL: `userId`→`assignee_id`, `teamId`→`team_assignee_id`. Importer writes SQL names.
- Fork permits deleting a `column` while tasks reference its slug (`ON DELETE SET NULL` on `column_id`, `status` text survives) — that manufactures exactly the orphan statuses reconciliation #6 exists to catch. Stellarc **rejects** `StatusInUse` instead; stricter-than-fork is intentional and recorded.
- Fork task table has **no parent/subtask column**; nesting depth (`board.subtask_depth_limit`) is enforced through relations owned by T5. T2 imports the column and enforces nothing with it.
- Public board: fork exposes unauthenticated `GET /api/public-board/:id` gated on `board.is_public`. T2 imports the column and serves a minimized read-only endpoint; the public screen itself keeps its T0 rendering and makes no parity claim.
- The canonical fourteen reconciliation SQL definitions remain absent from this checkout (same blocker STL-15 recorded). T2 owns **#4–#6** by the wave plan; their exact text is unresolved — obtain from the orchestrator, never invent. Checks below are supplementary until then.
- Board per-resource privilege machinery (`board.org_privilege`, `resource_grant`) resolves in T6/STL-20; T2 imports `org_privilege` verbatim and applies only org-level membership authorization.

### OUT of scope / owner

- Foundation runtime, shape engine, frozen shell, migration runner: STL-14/T0 (merge prerequisite).
- Identity/org/principal/auth tables and Better Auth layer: STL-15/T1 (merge prerequisite — FK targets).
- `activity`/`notification` import, outbox consumers, inbox UI, and `workflow_rule` (integration-triggered automation; NOT transition validation): STL-17/T3. T2 emits status-change events; T3 consumes.
- Repository mirrors, `github_*`, `integration`, `repo_*` and reconciliation #10: STL-18/T4. `label.source='repo'` rows are imported as data here; their producers are T4.
- Ticket graph: `task_relation`, `task_follower`, `external_link`, `task_repo_item_link`, `milestone` (+ the deferred FK), subtask nesting/cycle enforcement, #7: STL-19/T5.
- Assets/S3 (`task` image upload endpoints), `resource_grant` semantics, per-board privilege resolution, #9/#11/#12: STL-20/T6.
- `project*` tables and Projects sidebar, final all-fourteen gate: STL-21/T7. Visual rebrand: STL-30.
- Trash **purge scheduler**, CSV export/import of tasks, my-tasks aggregation endpoint, AI fields, calendar/gantt live wiring: no verified sibling ownership. **UNASSIGNED — orchestrator must name follow-ups.** Soft-delete/restore IS here (task columns); screens keep T0 stubs where not in the frozen five.

## 2. Exact tables/columns and event contracts

Shared `public` schema; imported SQL names exact; camelCase only at the API mapping. Types: `t=text`, `b=boolean`, `i=integer`, `ts=timestamp without time zone`, `js=jsonb`; `?` nullable. Every `id:t` is PK. Preserve source timestamps verbatim (export timezone explicitly UTC); no source writes. Retain fork defaults, FK actions and indexes as pinned.

| Table | Columns |
|---|---|
| `board` | id:t, organization_id:t→organization cascade, slug:t, icon:t? def 'Layout', name:t, description:t?, created_at:ts def now, is_public:b? def false, archived_at:ts?, last_task_number:i def 0 notnull, org_privilege:t?, task_status_order:js def ["to-do","in-progress","in-review","done","canceled","duplicate"] notnull, backlog_status_order:js def ["triage","planned"] notnull, subtask_depth_limit:i def 4 notnull CHECK 1..4, default_assignee_id:t?→user set null, default_assignee_team_id:t?→team set null. Unique (organization_id,id); unique (organization_id,lower(slug)) |
| `board_key_alias` | id:t, organization_id:t→organization cascade, board_id:t→board cascade, key:t, created_at:ts. Unique (organization_id,lower(key)) — org-global, cross-board collisions reject; index board_id |
| `column` (Status rows) | id:t, board_id:t→board cascade, name:t, slug:t, position:i def 0, icon:t?, color:t?, is_final:b def false notnull, created_at:ts, updated_at:ts. Index board_id. Add unique (board_id,slug) only after importer preflight rejects duplicate source pairs with a report |
| `task` | id:t, board_id:t→board cascade, position:i? def 0, number:i? def 1, assignee_id:t?→user set null, team_assignee_id:t?→team set null, title:t notnull, description:t?, description_history:js def [] notnull ({content,editedAt,userId,sealed?}[]), status:t def 'to-do' notnull, column_id:t?→column set null, priority:t? def 'low' (no-priority\|low\|medium\|high\|urgent), milestone_id:t? **no FK (T5)**, archived_at:ts?, archived_by:t?→user set null, deleted_at:ts?, deleted_by:t?→user set null, start_date:ts?, due_date:ts?, created_at:ts, updated_at:ts. Unique (board_id,number); indexes board/due/assignee/team/column |
| `label` | id:t, name:t, color:t notnull, source:t def 'kaneo' notnull CHECK kaneo\|repo, created_at:ts, updated_at:ts, task_id:t?→task cascade, organization_id:t?→organization cascade. Unique (task_id,name); partial unique (organization_id,name) WHERE task_id is null |
| `task_template` | id:t, organization_id:t→organization cascade notnull, name:t, data:js notnull ({title, description\|null, priority\|null, startDate\|null, dueDate\|null, status?, labels?:string[], startDateOffset?, dueDateOffset?}), created_at:ts, updated_at:ts. Unique (organization_id,name) |
| `flag_type` | id:t, board_id:t→board cascade notnull, name:t, color:t?, icon:t?, position:i def 0 notnull, created_at:ts, updated_at:ts. Unique (board_id,name) |
| `task_flag` | id:t, task_id:t→task cascade notnull, flag_type_id:t→flag_type cascade notnull, flagged_by:t?→user set null, target_user_id:t?→user cascade, target_team_id:t?→team cascade, note:t?, resolve_note:t?, resolved_at:ts?, resolved_by:t?→user set null, created_at:ts, updated_at:ts. Indexes task/flag_type/target_user/target_team/resolved_at |

Domain rules: ticket number allocation reproduces the fork's self-healing claim — `last_task_number = GREATEST(counter, max(task.number) on board) + count` in one locked statement, returning `counter-count+1`; concurrent creates serialize without unique-violation loops. Status validity for a board = its `column` slugs ∪ virtual statuses (`triage`,`planned`,`canceled`,`duplicate`); archived is orthogonal to status (archival writes `archived_at/by`, never touches `status`). Status slugs are a frozen append-only persistence contract; the eight definitions and their groups/isClosed/isBacklog flags are pinned by test. Board create seeds the four default statuses positionally (done `is_final`) atomically with the board. Key rename writes the old key as an `board_key_alias` row; old URLs and `KEY-seq` references keep resolving. Flag target is user XOR team (service-enforced; fork has no DB constraint); resolve requires a nonempty note and stamps resolver/time, keeping the row. Template apply fills title/description/priority/dates/labels and board-default assignee when the request omits them.

### Events (pluginId `work`, schema_version 1 throughout)

- `work:board-upserted` `{id,row:BoardPublic}`; `work:board-deleted` `{id}`.
- `work:board-key-upserted` `{id,row:KeyAliasPublic}`; `work:board-key-deleted` `{id}`.
- `work:status-upserted` `{id,row:StatusPublic}`; `work:status-deleted` `{id}` (row statuses only).
- `work:ticket-upserted` `{id,row:TicketPublic}`; `work:ticket-deleted` `{id}`.
- `work:ticket-status-changed` `{id,boardId,from,to}` — emitted alongside the upsert because T3 imports `activity.type='status_changed'` from source; live parity needs the transition pair, not just the new row.
- `work:label-upserted`/`-deleted`, `work:template-upserted`/`-deleted`, `work:flag-type-upserted`/`-deleted`, `work:task-flag-upserted` (resolve is an upsert): `{id,row…}` / `{id}`.

No description bodies, notes, or titles in span attributes or logs (rows may carry them; telemetry may not). Domain mutations run service write + projection + event append + counter advance on one `@effect/sql` transaction; post-commit hooks on a second connection are forbidden. Virtual statuses emit nothing. Actor = principal.id; T0 counter/txid/cursor conventions unchanged.

Importer (`tools/import-work.ts`): read-only source connection; preflight column sets, FK resolvability (assignees/teams/targets against merged T1 data), duplicate (board,lower(slug)), alias, (board_id,number), (board,name) pairs, status values outside taxonomy∪columns, priority vocabulary, template `data` shape, flag exactly-one-target — abort before any write with a sanitized report. Import order: board → column → board_key_alias → task → label, task_template, flag_type → task_flag; one destination transaction per run; digest ledger per STL-15's `identity_import` pattern (reuse, don't reinvent); rerun = zero new events; changed source requires explicit replace mode on a disposable destination. Preserve `description_history` jsonb and all nulls byte-exactly.

## 3. HTTP API and Schemas

Intentional target contracts (STL-15 precedent), not claims about fork URLs; only board/column/task/label/task-template/flag fetchers and hooks are adapted. Effect Schema; reject excess write keys; IDs opaque ≤128; names ≤256; slugs kebab-case ≤64; board keys `^[A-Za-z][A-Za-z0-9-]{0,19}$` (fork `parseTicketKey`); priorities and status slugs validated against pinned vocabularies; ISO UTC dates. `?` = optional member, `|null` = explicit clear. Public row Schemas map §2 snake→camel and omit nothing else sensitive (this slice holds no secrets); TicketPublic includes computed `key` = `normalizeBoardKey(board.slug)-number`.

Error union E (shared with T1): `ValidationError` 400 (invalid status/priority/key/slug/body), `Unauthenticated` 401, `Forbidden` 403, `NotFound` 404 (foreign-org ≡ absent, post-auth), `Conflict` 409 codes `DuplicateSlug`|`KeyAliasInUse`|`StatusInUse`|`BoardNotEmpty`(delete)|`NumberDrift`(unhealable), `RateLimited` 429, `Unavailable` 503. Unsupported method 405/path 404. Mutations return `{data:T,txid:number}` after commit; deletes `{id}`. No SQL or driver text escapes.

| Method/path | Request Schema | Success Schema |
|---|---|---|
| GET `/api/work/boards` | query `includeArchived?:b,teamId?:ID` | `{boards:BoardPublic[]}` live-collection bootstrap |
| POST `/api/work/boards` | `{name,slug?,icon?,description?}` | Mutation<BoardPublic>; seeds 4 statuses atomically |
| GET `/api/work/boards/:id` | — | `{board:BoardPublic}` |
| PATCH `/api/work/boards/:id` | `{name?,icon?,description?\|null,taskStatusOrder?:string[],backlogStatusOrder?:string[],defaultAssigneeId?:ID\|null,defaultAssigneeTeamId?:ID\|null}` nonempty | Mutation<BoardPublic>; orders validated as permutations/extensions of taxonomy |
| DELETE `/api/work/boards/:id` | — | Mutation<{id}>; `BoardNotEmpty` unless empty (fork cascade is a foot-gun; stricter) |
| POST `/api/work/boards/:id/archive` \| `/unarchive` | `{}` | Mutation<BoardPublic> |
| PUT `/api/work/boards/:id/key` | `{key:BoardKey}` | Mutation<BoardPublic>; prior key becomes alias |
| GET `/api/work/boards/:id/statuses` | — | `{statuses:StatusPublic[]}` ordered union of rows (board order applied) + virtuals appended canonically |
| POST `/api/work/boards/:id/statuses` | `{name,slug?,position?,icon?,color?,isFinal?}` | Mutation<StatusPublic> |
| PATCH `/api/work/statuses/:id` | `{name?,icon?,color?,position?,isFinal?}` | Mutation<StatusPublic>; slug immutable |
| DELETE `/api/work/statuses/:id` | — | Mutation<{id}>; `StatusInUse` while any non-virtual task references it |
| PUT `/api/work/boards/:id/statuses/reorder` | `{ids:ID[]}` | Mutation<{ids}>; complete permutation |
| GET `/api/work/boards/:id/tickets` | query `status?,assigneeId?,teamId?,includeArchived?,includeDeleted?` | `{tickets:TicketPublic[]}` |
| POST `/api/work/boards/:id/tickets` | `{title,description?,status?,priority?,assigneeId?\|null,teamId?\|null,startDate?,dueDate?,labels?:ID[],templateId?}` | Mutation<TicketPublic>; claims number; defaults fill |
| GET `/api/work/tickets/:id` | — | `{ticket:TicketPublic}` |
| PATCH `/api/work/tickets/:id` | `{title?,description?,priority?,assigneeId?\|null,teamId?\|null,startDate?\|null,dueDate?\|null}` | Mutation<TicketPublic>; description change appends sealed history entry |
| PUT `/api/work/tickets/:id/status` | `{status:StatusSlug}` | Mutation<TicketPublic>; taxonomy∪board validation; emits status-changed |
| POST `/api/work/tickets/:id/move` | `{boardId:ID,status?,position?}` | Mutation<TicketPublic>; claims destination number, remaps status to a valid destination status (first column when omitted), single tx |
| PUT `/api/work/boards/:id/tickets/reorder` | `{updates:[{id,position,status?}]}` | Mutation<{ids}>; per-update validation |
| PATCH `/api/work/tickets/bulk` | `{ids:ID[],patch:{status?,priority?,assigneeId?\|null,teamId?\|null}}` | Mutation<{ids}> |
| DELETE `/api/work/tickets/:id` | — | Mutation<{id}>; soft delete (`deleted_at/by`) |
| POST `/api/work/tickets/:id/restore` | `{}` | Mutation<TicketPublic> |
| PUT `/api/work/tickets/:id/archive` | `{archived:b}` | Mutation<TicketPublic>; status untouched |
| GET `/api/work/labels` | query `organizationId` | `{labels:LabelPublic[]}` org-global only |
| GET `/api/work/tickets/:id/labels` | — | `{labels:LabelPublic[]}` |
| POST `/api/work/labels` | `{name,color,taskId?:ID,organizationId?:ID}` exactly one scope | Mutation<LabelPublic> |
| PUT `/api/work/labels/:id` | `{name?,color?}` | Mutation<LabelPublic> |
| PUT `/api/work/labels/:id/task` | `{taskId:ID}` / `{}` unassign semantics | Mutation<LabelPublic> |
| DELETE `/api/work/labels/:id` | — | Mutation<{id}> |
| GET `/api/work/templates` | query `organizationId` | `{templates:TemplatePublic[]}` |
| POST `/api/work/templates` | `{organizationId,name,data:TemplateData}` | Mutation<TemplatePublic> |
| PATCH `/api/work/templates/:id` | `{name?,data?}` | Mutation<TemplatePublic> |
| DELETE `/api/work/templates/:id` | — | Mutation<{id}> |
| GET `/api/work/flag-types` | query `boardId` | `{flagTypes:FlagTypePublic[]}` |
| POST `/api/work/flag-types` | `{boardId,name,color?,icon?,position?}` | Mutation<FlagTypePublic> |
| PATCH `/api/work/flag-types/:id` | `{name?,color?,icon?,position?}` | Mutation<FlagTypePublic> |
| DELETE `/api/work/flag-types/:id` | — | Mutation<{id}>; `StatusInUse`-style block while flags reference it |
| GET `/api/work/tickets/:id/flags` | — | `{flags:TaskFlagPublic[]}` |
| POST `/api/work/tickets/:id/flags` | `{flagTypeId,targetUserId? XOR targetTeamId?,note?}` | Mutation<TaskFlagPublic> |
| POST `/api/work/flags/:id/resolve` | `{note:string nonempty}` | Mutation<TaskFlagPublic> |
| GET `/api/public/boards/:id` | — | `{board:PublicBoardMinimal}` only when `is_public`; minimal fields, no member data, unauthenticated, rate-limited |
| GET `/orgs/:org/v1/shape` | T0 shape query + allowlisted work tables | unchanged Electric messages; reauthorize each tail poll |

Board visibility: members of the owning org; `is_public` boards' minimal endpoint excepted. Authorization composes T1's membership/principal grants; per-board privilege resolution is T6 and deliberately unused.

## 4. Sync shapes / collections

Register eight explicit projections: `board`, `board_key_alias`, `status` (column rows; virtuals are client-static taxonomy, never streamed), `ticket`, `label`, `task_template`, `flag_type`, `task_flag`. Handles are org+principal scoped; snapshot and tail both filter by org membership; revocation invalidates handles (T1 mechanism reused). Deletes stream as deletes; moves stream one ticket upsert; reorder streams affected upserts only. `awaitTxId` settles every mutation including bulk and delete. Reuse T0 snapshot-boundary/counter/txid/upcaster machinery; register work v1 schemas; unknown versions fail closed. REST lists are bootstrap/compat only — the five frozen views read live collections, not React Query snapshots with a decorative connection. No raw `column`-unscoped access, no cross-org rows, no titles/descriptions in schema metadata or logs.

## 5. File manifest

Paths relative to repo root. CREATE excludes this spec. T0/T1 mirrors refer to provisional `stl-14-c27` at `73c5ee5` and STL-15's spec manifest — rebase to merged state before use. Fork mirrors refer to committed `2504e645…`. A mirror is a behavioral reference, never an instruction to transplant Hono/Drizzle.

| CREATE | Specific existing mirror |
|---|---|
| `packages/db/migrations/0002_work.sql` | fork `apps/api/src/database/schema.ts` (8 tables); T0 `packages/db/migrations/0001_foundation.sql` style + `migrate.ts` discovery |
| `packages/contracts/src/work.ts` | T0 `packages/contracts/src/api.ts`; fork route validators in `apps/api/src/{board,column,task,label,task-template,flag}/index.ts` |
| `packages/domain/src/status-taxonomy.ts` | fork `apps/api/src/task/status-taxonomy.ts` (behavioral mirror; frozen-slug test too) |
| `packages/domain/src/ticket-key.ts` | fork `apps/api/src/identity/identity.ts` + `resolve-ticket-identity.ts` |
| `packages/domain/src/work.ts` | T0 `packages/domain/src/index.ts` structure; fork `claim-task-numbers.ts`, `create-board.ts`, `update-task-status.ts`, `move-task.ts`, `validate-task-fields.ts` behavior |
| `packages/domain/src/work-events.ts` | T0 `packages/sync/src/upcasters.ts`; STL-15 `identity-events.ts` pattern |
| `packages/domain/src/work-import.ts` | T0 `packages/db/src/migrate.ts`; STL-15 `identity-import.ts` pattern |
| `packages/sync/src/work-shapes.ts` | T0 `packages/sync/src/index.ts` |
| `apps/stellarc-api/src/work-http.ts` | T0 `apps/stellarc-api/src/http.ts` |
| `apps/stellarc-ui/src/lib/work-collections.ts` | T0 `packages/contracts/src/shape.ts` + UI TanStack wiring in `apps/stellarc-ui/src/tanstack/` |
| `tools/import-work.ts` | STL-15 `tools/import-identity.ts` / T0 `migrate.ts` |
| `tests/unit/work.test.ts` | T0 `tests/unit/foundation.test.ts` |
| `tests/integration/work.test.ts` | T0 `tests/integration/foundation.test.ts` |
| `tests/integration/work-import.test.ts` | T0 `tests/integration/foundation.test.ts` |
| `tests/integration/work-telemetry.test.ts` | T0 `tests/integration/foundation.test.ts` span assertions |
| `tests/helpers/work-fixture.ts` | T0 `tests/helpers/postgres.ts` |
| `apps/stellarc-ui/e2e/work.spec.ts` | T0 `apps/stellarc-ui/e2e/frozen.spec.ts` |
| `tests/fixtures/work-reconciliation.sql` | canonical inventory #4–#6 **missing: obtain before writing, do not invent** |

MODIFY after T0+T1 merge: `packages/contracts/src/api.ts`, `packages/domain/src/index.ts` (+ `authz.ts` integration points), `packages/db/src/index.ts`, `packages/sync/src/index.ts`, `packages/sync/src/upcasters.ts`, `apps/stellarc-api/src/{http,main,errors,config}.ts`, `tests/gates.test.ts` (suite discovery), affected `package.json`/`bun.lock`. UI MODIFY (fork files already lifted by T0): under `apps/stellarc-ui/src/` — `fetchers/{board,column,label,task,flag}/**`, `task-template` fetchers, `hooks/queries/{board,column,task,label,flag}/**` + `task-template`, `hooks/mutations/` counterparts, `components/nav-boards.tsx`, board route components (`routes/…/board/$boardSlug/{board,backlog}.tsx`, `task/$taskId_.tsx`), list-view data edges, `lib/{status,column,reorder-board-task,task-template-date-offset,generate-board-id}.ts(x)` as needed. Preserve every unrelated fetcher/hook. No new UI strings; if one proves unavoidable it lands byte-exact in both i18n files per T0 convention.

Screenshot artifacts update only by reviewed reuse of fork baselines under `apps/stellarc-ui/e2e/__screenshots__/` (fork-provenance subdirectory per ADR 0009); never regenerate expected images from the candidate.

## 6. Frozen UI surfaces (pixel-frozen)

These fork screens must keep rendering identically while reading live data through the shape: **sidebar boards** (`components/nav-boards.tsx`: board list, icons, archived toggle, order reconcile), **Kanban** (`board/$boardSlug/board.tsx` viewMode=board: columns from statuses, cards, drag affordances, WIP chrome), **list view** (ListView components: grouping, bulk-actions toggle, rows), **backlog** (`backlog.tsx`: triage/planned grouping per `backlogStatusOrder`, archived dropdown), **ticket detail** (`task/$taskId_.tsx`: title/description/status/priority/dates/assignee/labels/flags/template-applied defaults). T0's four viewports apply (768px = fork desktop breakpoint). Pixel criterion: Playwright maxDiffPixelRatio 0.001, same browser/fonts/theme/locale/fixture dates, against built API + real isolated Postgres. Intercepting work requests in the acceptance test invalidates it. Sibling surfaces (gantt, calendar, milestones, my-tasks, trash, public board, inbox) must not regress from their T0 baselines — stubbed data acceptable, visual drift is not.

## 7. Test plan — explicit RED and negative controls

Each row is one test (parameterized subcases within it). Genuine implementations only: real migrations, real PG (`tests/helpers/postgres.ts` disposable DBs), stock shape adapter, mounted UI, real import runs. Missing files are only the initial RED; once compiling, capture assertion RED. Sabotage one behavior at a time in an isolated worktree, observe the named assertion fail, restore, rerun GREEN. No production credentials; no bypass switches left in runtime.

| ID | Test / RED condition before implementation | Negative control that must turn it RED |
|---|---|---|
| T01 | Migration catalogs all 8 tables/86 columns with exact names, types, nullability, defaults, uniques, CHECKs; `milestone_id` has no FK; absent table fails | Drop `task_status_order` default or `(board_id,number)` unique |
| T02 | Ticket-key parse/normalize known answers: `KEY-1`, 20-char keys, case normalization, rejection of `0`, leading/trailing dash, 21 chars | Relax regex to accept `A--` or number 0 |
| T03 | Status taxonomy pin: 8 slugs, frozen order, groups, isClosed/isBacklog (archived absent); reorder/rename fails | Swap two definition entries |
| T04 | Board create seeds exactly 4 statuses (positions 0–3, done isFinal) atomically; failed create leaves nothing | Move seeding outside the tx |
| T05 | Slug/alias uniqueness: same-org case-insensitive board slug, org-global alias lower-unique reject with `DuplicateSlug`/`KeyAliasInUse` | Drop the lower() from the unique index |
| T06 | Board CRUD/archive/unarchive commits row+event+projection under one txid; archive hides from default sidebar list | Append event after commit |
| T07 | `PUT /key` writes prior key as alias; old `KEY-seq` and slug URLs still resolve | Delete old alias on rename |
| T08 | Number claim self-heals drifted counter: GREATEST(counter,max)+1; board with counter 12/max 13 claims 14, not 13 | Replace with `counter+1` |
| T09 | 20 concurrent creates on one board get 20 unique consecutive numbers, no 500s | Read-then-write without the row lock |
| T10 | Status transition validates slug ∈ board columns ∪ virtuals; invalid → 400 ValidationError, no row/event write | Remove the validation predicate |
| T11 | Archival is orthogonal: archived ticket keeps status; closed statuses (done/canceled/duplicate) carry isClosed semantics into status-changed event | Overwrite status with 'archived' on archive |
| T12 | Move ticket board→board: destination number claimed, status remapped to valid destination status (first column when omitted), single tx, one upsert streamed | Keep source number or status unchanged |
| T13 | Reorder persists positions; kanban drag = status transition through the same validation path | Skip position write |
| T14 | Label CRUD/assign/unassign; per-task name unique; org-global unique only when task-scoped null; exactly-one-scope create enforced | Drop the partial-unique WHERE clause |
| T15 | Template CRUD validates `data` shape (offsets, labels, status slug); apply fills defaults incl. board-default assignee | Accept arbitrary json |
| T16 | Flag create requires target user XOR team; flag-type delete blocked while referenced | Allow zero targets |
| T17 | Flag resolve requires nonempty note, stamps resolved_by/at, keeps row; idempotent re-resolve rejected | Accept empty note |
| T18 | Import: 86-column fidelity on restored fixture incl. description_history jsonb, nulls, timestamps; PK sets equal | Drop one column from the insert |
| T19 | Identical rerun: zero new events, identical ledger; source connection never written | Unconditional seed-event append |
| T20 | Preflight aborts whole run before writes on dup slug/alias/number/name, bad FK, invalid status/priority/target with sanitized report | Commit each table as it completes |
| T21 | Board delete blocked `BoardNotEmpty` when tickets/statuses exist; empty board deletes cascading aliases | Restore fork's unconditional cascade |
| T22 | Shape snapshot+tail for all 8 collections; reconnecting client receives every event exactly once across the snapshot race | Remove the snapshot boundary filter |
| T23 | Membership filter: non-member cannot snapshot/tail work shapes; revoked member's handle stops at next poll | Authorize only the initial snapshot |
| T24 | Public board endpoint serves is_public boards only, minimal fields, no member data; private → 404 | Skip the is_public predicate |
| T25 | Telemetry allowlist: no titles/descriptions/notes in span attributes, logs, or schema metadata; db spans carry no statement text | Add a title attribute to the ticket span |
| T26 | Every endpoint carries http.route/method/status + stellarc.org + principal.kind; every service method is Effect.fn; ≥1 span assertion per new path | Strip one Effect.fn/name |
| T27 | awaitTxId settles create/status/move/bulk/delete through the stock adapter | Omit txid on deletes |
| T28 | Kanban renders imported tickets live through the shape; drag commits a validated transition; invalid drop rejected without UI corruption | Fixture-patch the collection |
| T29 | Sidebar boards list live (archived toggle, order reconcile); board slug and alias URLs both resolve | Serve a stale snapshot |
| T30 | Backlog groups triage/planned per backlogStatusOrder; archived dropdown lists archived tickets | Ignore backlog ordering |
| T31 | Ticket detail live: status/priority/labels/flags/template-created ticket all mutate through events | Mock the fetchers |
| T32 | List view live: grouping + bulk status update validates and streams | Bypass validation on bulk |
| T33 | Sibling screens (gantt/calendar/milestones/my-tasks/trash/public) byte-identical to T0 baselines | Change one row padding |
| T34 | Screenshot parity: 5 frozen screens × 4 viewports vs fork-provenance baselines, real API+PG | Padding change; plus delete a baseline to prove the harness fails |
| T35 | Reconciliation **#4 (boards)** on restored fixture + its inventory-defined violation | Exact #4 sabotage (blocked until canonical SQL supplied) |
| T36 | Reconciliation **#5 (tickets)** + violation | Exact #5 sabotage (blocked, as above) |
| T37 | Reconciliation **#6 zero orphan statuses)** + violation; supplementary now: every non-virtual task status has a same-board column row; every column has a board; status delete blocked while referenced | Insert an orphan status/task row; drop the StatusInUse guard |
| T38 | Gate: full suite runs in clean worktree at HEAD; intentional work failure fails the root gate | Remove the work suite from the gate glob |

T35–T37 are blocked test specifications until the orchestrator supplies the canonical inventory SQL — no invented mapping of board/ticket counts to query numbers; expand with exact query text and violation before implementation acceptance. Supplementary all-column/orphan checks (T18–T20, T37 supplementary) are mandatory regardless. T2 owns only #4–#6; #1–#3 are T1, #7–#14 siblings/final gate.

Run after dependency merge: `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun test`, T0's Playwright command selecting `apps/stellarc-ui/e2e/work.spec.ts`; verify merged package scripts first (none exist on current `dev`). Record RED/GREEN/negative-control exits + failing assertion per ID. Reviewer signs off named items: SPANS coverage, orphan-status invariant, number-claim concurrency, key-alias resolution, import fidelity, live-collection (not intercepted) screenshot evidence.

## 8. Suggested vertical build order

1. Rebase onto merged STL-14+STL-15; obtain canonical #4–#6 SQL; re-verify identity interfaces and fork pin. Readiness gate — do not build against provisional files blindly.
2. T01–T05 RED → migration + taxonomy + ticket-key modules GREEN with negative controls.
3. Thinnest end-to-end path: import fixture boards/statuses/tickets → `work-shapes` → nav-boards + Kanban render live → first screenshot parity (T22/T28/T34 partial). Nothing else before this works.
4. Ticket writes: number claim (T08/T09), status validation + drag transition (T10/T13/T27), archive orthogonality (T11).
5. Move/reorder/bulk/soft-delete/restore (T12/T21/T32), board key rename + alias resolution (T07/T29).
6. Labels → templates → flags services and collections, RED preceding each (T14–T17), detail screen live (T31).
7. Importer preflight/ledger/idempotence + supplementary reconciliation; canonical #4–#6 the moment they arrive (T18–T20/T35–T37).
8. Telemetry contract suite + public endpoint minimization (T24–T26), full 4-viewport parity + sibling-baseline checks (T33/T34), clean-worktree gate (T38); hand to different-family adversarial review. Orchestrator alone commits, merges, touches the tracker. Spec stage reports the spec, not implementation.
