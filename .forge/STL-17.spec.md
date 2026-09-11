# STL-17 — T3 activity, notifications, workflow rules and durable outbox

## 1. Scope and premise audit

Deliver one comment store, an event-backed activity projection, imported notifications and workflow rules, private live inbox/preferences collections, and a transactional worker that turns a committed comment mutation into a recipient notification without browser refresh or interval polling. Preserve the fork's activity/inbox/preferences/workflow UI and identifiers, including history and external attribution. Use Effect services, the existing event counter/shape protocol and root telemetry Layer; no second write path. This file is a specification, not execution evidence; only the orchestrator commits, changes branches or updates the tracker.

### Audit before design — code wins

- Latest STL-17 triage entry is pass (`2026-09-10T02:22:14+00:00`). Inspected checkout HEAD is `4c483bb`; it has no packages workspace. T0/STL-14 and identity/STL-15 are not implemented here. Foundation references below are provisional files inspected at `/home/rpw/.paseo/worktrees/1syfl7s2/stl-14-c22`; rebind to merged dependencies before implementation.
- Source reference is committed `/home/rpw/repos/kaneo` SHA `2504e64512b84b9b739d4d4fb0d4ceaefdb14783`, read via git show, not its dirty tree. `apps/api/src/database/schema.ts` has activity (13 columns), notification (11), workflow_rule (7): the issue's 31-column claim matches these definitions. 3592 is historical inventory, not a verified live count or a test constant.
- The frozen preference screen actually needs three more tables: `user_notification_preference`, `user_notification_org_rule`, `user_notification_org_board`. They are included as runtime/preservation scope here; do not confuse them with the three populated-table inventory. Import their rows if present in the supplied snapshot; do not assume empty.
- Workflow rules reference board and column; activity references task; recipients reference followers. Thus '#15 only' is insufficient for production integration: STL-16 must supply real ticket/board/status services and mappings before this slice's final gate. STL-19 supplies followers later. Do not build duplicate ticket/status tables to maintain the nominal parallel schedule.
- Fork creates comments and notifications synchronously/best-effort (`activity/controllers/create-comment.ts`, `notification/index.ts`), not through a durable outbox. Assignment notifies only the new assignee; ordinary changes notify participants/assignee/followers; comment mentions supersede ordinary comment notifications. Preserve these distinctions, but close foreign-org mention/direct-recipient leaks rather than copying them.
- Fork `workflow-rule` is integration event→column mapping, not a general automation language. CRUD belongs here; GitHub webhook ingestion and invoking the mapping belong to STL-18.
- Fork accepts caller-authored system activity at `/activity/create`; new domain API must not expose audit-event forgery. Adapt any legitimate caller to its owning mutation, not this old bypass.
- 'No polling' means no periodic browser REST refetch and no interval-only worker wakeup. ADR 0007 explicitly permits the stock Electric live long-poll protocol. Use committed DB wakeups plus durable catch-up; do not replace the protocol with bespoke WebSockets.
- Canonical reconciliation #8 SQL is not present in inspected docs (the wave plan references an absent legacy inventory). Obtain it from the orchestrator before acceptance. Do not label a made-up activity count '#8'.
- ADR 0009 now separates fork-provenance PNGs from deterministic lifted-UI baselines. Structural landmarks prove fork parity; baseline diffs use 0.001 threshold, not comparisons against production-data provenance images.

### OUT of scope and owner

- Runtime/event ordering/protocol/shell/TelemetryLive: STL-14. Authentication, identity import, org routing and grants: STL-15.
- Ticket/status/board/label/flag writes and reconciliation #4–#6: STL-16. This slice consumes their versioned events and provides activity/notification adapters, not competing writes.
- GitHub connections, inbound integration events and remote comment transport: STL-18; consume this slice's workflow resolver there. Preserve imported external comment metadata here.
- Followers, auto-follow-on-comment, ticket graph and link writes, #7: STL-19. Expose recipient-provider seam here; do not materialize a fake follower table. Final full parity requires its real provider, with dedicated integration test here once merged.
- Assets/resource grants and #9/#11/#12: STL-20; use its authorization seam, never bypass it. Projects and final fourteen-query/three-import gate: STL-21. Rebrand: STL-30.
- External notification delivery (email/ntfy/Gotify/webhook), scheduled due-date reminders and identity-invitation transport have no verified named sibling owner in the supplied plan. **UNASSIGNED scope blocker:** orchestrator must assign a follow-up or explicitly enlarge this slice before enabling those delivery paths. Persist and render existing settings accurately; never claim a message was sent. Do not hide frozen controls. If acceptance requires operational external delivery, this spec must be extended before implementation, not silently marked complete.

## 2. Exact tables/columns and event contracts

Notation: t=text, i=integer, bi=bigint, b=boolean, j=jsonb, ts=timestamp without time zone, tz=timestamptz; ? nullable. All columns nonnull unless marked ?. IDs t PK unless composite PK listed. Dates serialize ISO UTC; source ts interpreted using explicitly documented export timezone. Preserve source PKs, nulls, edit-history order and all JSON values. Names below are deliberate target contracts, not existing tables on dev.

| Table | Exact columns |
|---|---|
| comment | id:t, org_id:t, ticket_id:t, type:t CHECK='comment', created_at:ts, updated_at:ts, user_id:t?, content:t?, edit_history:j default '[]', event_data:j?, external_user_name:t?, external_user_avatar:t?, external_source:t?, external_url:t? |
| activity_projection | org_id:t, id:t, ticket_id:t, type:t, created_at:ts, updated_at:ts, user_id:t?, content:t?, edit_history:j, event_data:j?, external_user_name:t?, external_user_avatar:t?, external_source:t?, external_url:t?, last_seq:bi; PK(org_id,id) |
| notification | id:t, org_id:t?, user_id:t, title:t?, content:t?, type:t default 'info', event_data:j?, is_read:b? default false, resource_id:t?, resource_type:t?, created_at:tz, updated_at:tz, source_org:t?, source_seq:bi?, delivery_key:t? UNIQUE |
| workflow_rule | id:t, org_id:t, board_id:t, integration_type:t, event_type:t, status_id:t, created_at:ts, updated_at:ts |
| user_notification_preference | id:t, user_id:t UNIQUE, email_enabled:b=false, ntfy_enabled:b=false, ntfy_server_url:t?, ntfy_topic:t?, ntfy_token:t?, gotify_enabled:b=false, gotify_server_url:t?, gotify_token:t?, webhook_enabled:b=false, webhook_url:t?, webhook_secret:t?, task_assignment_enabled:b=true, task_comment_enabled:b=true, task_status_change_enabled:b=true, due_date_reminder_enabled:b=true, due_date_reminder_lead_time_minutes:i=1440, created_at:ts, updated_at:ts |
| user_notification_org_rule | id:t, user_id:t, organization_id:t, is_active:b=true, email_enabled:b=false, ntfy_enabled:b=false, gotify_enabled:b=false, webhook_enabled:b=false, board_mode:t='all', created_at:ts, updated_at:ts |
| user_notification_org_board | id:t, organization_id:t, org_rule_id:t, board_id:t, created_at:ts, updated_at:ts |
| notification_outbox | id:t, org_id:t, event_seq:bi, consumer:t='inbox-v1', traceparent:t?, tracestate:t?, state:t='pending', attempts:i=0, available_at:tz, completed_at:tz?, last_error_code:t?, created_at:tz; UNIQUE(org_id,event_seq,consumer) |
| activity_import | source_id:t, table_name:t, source_pk:t, digest:t, destination_id:t, destination_org:t?, destination_seq:bi?; PK(source_id,table_name,source_pk) |

`comment` is authoritative current comment state; `activity_projection` is disposable read data, never a second comment write store. Non-comment activity exists authoritatively only in event payloads. Project comment mutations to activity in the same transaction. Foreign keys: org fields→organization; user fields→user (comment/projection author SET NULL); comment/projection ticket→STL-16 ticket; workflow board/status enforce same org and same board through composite keys or equivalent locked validation. Workflow UNIQUE(board_id,integration_type,event_type); duplicate source mappings fail preflight, not last-row-wins. Preference rule UNIQUE(user_id,organization_id), UNIQUE(organization_id,id); selection composite FKs (organization_id,org_rule_id) and (organization_id,board_id), UNIQUE(org_rule_id,board_id). All preference timestamps/defaults/FKs mirror source schema; lead time CHECK 5..43200, board_mode CHECK all|selected. Tokens encrypted at rest through a configured crypto Layer; do not copy ciphertext without verifying source decryption/re-encryption keys.

Outbox FK(org_id,event_seq)→event(org,seq). state CHECK pending|complete|dead; attempts >=0. Pending index(state,available_at), activity index(org_id,ticket_id,created_at,id), notification index(user_id,org_id,created_at,id), source event lookup and workflow board indexes. External comment uniqueness mirrors source (ticket_id,external_source,external_url) with PostgreSQL null semantics. Migration uses a unique next migration name after merged sibling migrations; manifest reserves `0004_activity_notifications.sql` and requires collision check, never rename shipped history.

Existing `event(org:t,seq:bi,plugin_type:t,actor:t,payload:j,schema_version:i,txid:bi,created_at:tz)` and `org_event_counter(org:t,seq:bi)` are written by the T0 append service only. No column changes. Existing migration ledger is updated by its runner. Identity/board/status/follower tables are read, not owned here.

### Events — all emitted versions are schema_version=1

Use Effect Schema tagged payloads with explicit fields. Row types below are §3 public rows, not SELECT *. Actor is authenticated principal.id; imported nullable author remains payload userId, maintenance principal is actor. `origin` is 'live'|'import'; only live producing events enqueue notifications.

- `activity:comment-created`, `activity:comment-updated`: `{id,ticketId,boardId,row:ActivityRow,origin}`. Create also carries `{mentionUserIds:ID[],recipientUserIds:ID[]}` resolved/validated server-side; update does not notify again.
- `activity:comment-deleted`: `{id,ticketId,boardId,userId:ID|null,origin}`; delete projection, preserve audit log.
- `activity:legacy-recorded`: `{id,ticketId,boardId,row:ActivityRow,origin:'import'}` for each non-comment legacy row. Preserve original type/eventData verbatim; this is a typed legacy domain event, not an unvalidated live mutation endpoint. Upcaster handles its opaque legacy JSON explicitly.
- `notification:created`, `notification:updated`: `{id,userId,orgId:ID|null,row:NotificationRow,origin}`; `notification:deleted`: `{id,userId,orgId:ID|null}`. No notification-producing consumer subscribes to notification events.
- `notification:preferences-updated`: `{id,userId,row:PreferencePublic}`; no secret or destination URL in event payload (public shape DTO derives safe fields separately).
- `notification:organization-rule-upserted`: `{id,userId,row:PreferenceRulePublic}`; `notification:organization-rule-deleted`: `{id,userId,organizationId}`. Selected boards represented in rule row.
- `workflow:rule-upserted`: `{id,boardId,row:WorkflowRow}`; `workflow:rule-deleted`: `{id,boardId}`.

STL-16 event names/versions are **dependency contract unresolved**: its services are absent on this checkout. Require an explicit adapter mapping for creation, assignment, status/title/description/priority/due-date/flag/unassignment/move/label changes after merge, including actor user ID and immutable event-time ticket/board/org context. Do not invent existing `ticket:*` identifiers or emit duplicate semantic events here. The thin gate uses this slice's concrete comment-created event and does not wait for naming guesses. Map imported historical types without replaying them as live actions.

### Outbox and recipient algorithm

Comment/service mutation, event, projection and one inbox outbox job commit atomically on the same @effect/sql connection. Append per-org counter under transaction lock. Issue pg_notify on a fixed channel inside that transaction with opaque org/job ID only. Worker LISTENs before initial catch-up, drains pending durable rows on startup/reconnect/wakeup, and uses an Effect timer for the earliest persisted retry deadline (not interval-only polling). Never rely on notifications as storage.

For inbox-only jobs, hold selected job `FOR UPDATE SKIP LOCKED` and transaction through recipient inserts, notification events and completion. No external HTTP while locked. Crash before commit rolls everything back; crash after commit cannot duplicate. Unique delivery_key is canonical tuple encoding of (source org, source seq, recipient user, channel='inbox'); mention wins over comment for the same recipient. Deletes/clear never permit replay resurrection because completed job/delivery identity persists. Failed transaction increments attempts in a separate bounded error transaction; exponential backoff capped 5 minutes, dead after 10 failures, sanitized error code only. One corrupt job must not block other orgs. Graceful shutdown interrupts wait and rolls back active work. Provide internal Effect replay operation for dead jobs, not an unauthenticated admin HTTP route.

Recipients: assignment→new assignee only, excluding actor; comment→eligible assignee + historical participants + mentions + provider-supplied followers, unique and excluding actor's underlying user. Mention notification supersedes ordinary comment. Other supported ticket changes→participants + assignee + eligible direct targets + followers. Resolve event-time candidates in producing transaction, recheck membership/resource access at delivery so revoked users do not receive content. Compare actor by user identity, not agent principal ID. Import must retain historical participants from non-comment event rows. No implied owner/all-org fanout. The follower provider explicitly unavailable until STL-19; do not declare follower parity from an empty fake provider.

Inbox creation is independent of optional external-channel toggles (fork delivery preferences govern outbound delivery, not deletion of in-app history). Store global preference choices and org/board channel rules, preserve effective-policy calculation for later sender integration. Unknown live event versions fail closed and dead-letter with telemetry; imported history never sends notifications.

Global notifications/preferences require private user scope: extend the existing shape router with `/users/me/v1/shape`; resolve its stream to internal counter namespace `user:<userId>` after authentication, never accept caller user ID. T0 org counter has no identity FK in inspected SQL; if STL-15 adds one as proposed, dependency integration must separate private counters or revise that FK **before** implementation. Do not create fake organizations. Cross-org private events must still be recipient-only and revoke inaccessible resource rows. This is a named foundation/identity contract blocker, not permission to leak global data into all org shapes.

## 3. HTTP API shapes and schemas

These are target endpoints; change fetchers only. All use Effect HttpApi/Schema, strict excess-key rejection, ID=nonempty opaque string <=128, Date=ISO UTC string, JSON=bounded JSON value (no executable object). Limit comment content to 1 MiB UTF-8, reject blank live comments; legacy nullable content remains readable. Query cursor opaque validated keyset token, limit integer 1..200 default 100. Scalar text <=4096 unless content. Requests never accept actor/user/org ownership from body.

ActivityRow = exact camelCase mapping of activity_projection excluding orgId,lastSeq, with ticketId exposed also as `taskId` in the frozen-client adapter, and `user:{id,name,image}|null` from authorized identity public data. EditHistory = Array<{content:string,editedAt:Date,userId:ID}>. Non-comment history keeps same row contract and immutable original type. NotificationRow = camelCase notification columns excluding sourceOrg/sourceSeq/deliveryKey; includes orgId nullable. Keep resourceType='task' compatibility for imported/navigation DTOs. WorkflowRow = {id,orgId,boardId,integrationType,eventType,statusId,createdAt,updatedAt}; fork adapter maps statusId→columnId without changing controls.

PreferencePublic = {id,userId,emailEnabled,ntfyEnabled,ntfyConfigured,ntfyTokenConfigured,gotifyEnabled,gotifyConfigured,gotifyTokenConfigured,webhookEnabled,webhookConfigured,webhookSecretConfigured,taskAssignmentEnabled,taskCommentEnabled,taskStatusChangeEnabled,dueDateReminderEnabled,dueDateReminderLeadTimeMinutes,createdAt:Date|null,updatedAt:Date|null}; booleans except IDs/dates/leadTime. PreferenceRulePublic = {id,userId,organizationId,organizationName,isActive,emailEnabled,ntfyEnabled,gotifyEnabled,webhookEnabled,boardMode:'all'|'selected',selectedBoardIds:ID[],createdAt,updatedAt}. PreferenceResponse = PreferencePublic + {emailAddress:string|null,ntfyServerUrl:string|null,ntfyTopic:string|null,gotifyServerUrl:string|null,webhookUrl:string|null,maskedNtfyToken:string|null,maskedGotifyToken:string|null,maskedWebhookSecret:string|null,organizations:PreferenceRulePublic[]}; REST self-only/no-store. Match fork masking in REST, never put masks/URLs/email in spans or events. Client merges safe live preferences/rules with private configuration fetched once and after its own write; no polling. Other-session config edits trigger explicit one-shot private refresh from preference event, not periodic refetch.

Common errors E for every route: 400 {_tag:'ValidationError',code:string}; 401 {_tag:'Unauthenticated'}; 403 {_tag:'Forbidden'}; 404 {_tag:'NotFound'}; 409 {_tag:'Conflict',code:'Duplicate'|'StaleWrite'|'InvalidReference'}; 429 {_tag:'RateLimited',retryAfterSeconds:number}; 503 {_tag:'Unavailable'}. No SQL/PII in error bodies. Foreign org/resource uses same 404 as missing after org authentication. Mutations HTTP 200 M<T>={data:T,txid:number}; txid uses T0 safe-integer contract. Bulk no-op returns existing rows/count and real transaction txid; avoid awaitTxId for zero-change response via explicit `changed:boolean` on bulk response. Unsupported method/path 405/404. Credentials use STL-15 auth, capabilities intersect key ceiling; no blanket human-only comment restriction. Preferences/notification mutations are self-user access, never another user's via key body.

| Method/path | Request | Success |
|---|---|---|
| GET /api/orgs/:org/tickets/:ticket/activity | query {cursor?,limit?} | {items:ActivityRow[],nextCursor:string|null} |
| POST /api/orgs/:org/tickets/:ticket/comments | {content:string} | M<ActivityRow> |
| PATCH /api/orgs/:org/tickets/:ticket/comments/:id | {content:string,expectedUpdatedAt:Date} | M<ActivityRow> |
| DELETE /api/orgs/:org/tickets/:ticket/comments/:id | {expectedUpdatedAt:Date} | M<{id}> |
| GET /api/notifications | query {cursor?,limit?,orgId?:ID} | {items:NotificationRow[],nextCursor:string|null} |
| GET /api/notifications/unread-count | query {orgId?:ID} | {count:nonnegative integer} across full scope, not page length |
| PATCH /api/notifications/:id/read | {} | M<NotificationRow> |
| PATCH /api/notifications/read-all | {orgId?:ID} | M<{count:integer,changed:boolean}> |
| DELETE /api/notifications/clear-all | {orgId?:ID} | M<{count:integer,changed:boolean}> |
| DELETE /api/notifications/:id | no body | M<{id}> |
| GET /api/notification-preferences | no body | PreferenceResponse |
| PUT /api/notification-preferences | nonempty optional fields: emailEnabled,ntfyEnabled,gotifyEnabled,webhookEnabled,taskAssignmentEnabled,taskCommentEnabled,taskStatusChangeEnabled,dueDateReminderEnabled:boolean; ntfyServerUrl,ntfyTopic,ntfyToken,gotifyServerUrl,gotifyToken,webhookUrl,webhookSecret:string|null; dueDateReminderLeadTimeMinutes:integer 5..43200 | M<PreferenceResponse> |
| PUT /api/notification-preferences/organizations/:org | {isActive,emailEnabled,ntfyEnabled,gotifyEnabled,webhookEnabled:boolean,boardMode:'all'|'selected',selectedBoardIds?:ID[]} | M<PreferenceResponse> |
| DELETE /api/notification-preferences/organizations/:org | no body | M<PreferenceResponse> |
| GET /api/orgs/:org/boards/:board/workflow-rules | no body | {items:WorkflowRow[]} |
| PUT /api/orgs/:org/boards/:board/workflow-rules | {integrationType:string,eventType:string,statusId:ID} | M<WorkflowRow> |
| DELETE /api/orgs/:org/boards/:board/workflow-rules/:id | no body | M<{id}> |
| GET /orgs/:org/v1/shape | T0 query with table activity or workflow_rule, ticket/board scope | T0 Electric messages/headers, E |
| GET /users/me/v1/shape | T0 query with table notification, notification_preference or notification_org_rule | same protocol, authenticated private handle, E |

Comment create requires ticket update; edit/delete require own comment plus current ticket access, preserving fork author-only edit, and optimistic timestamp check under lock. Do not allow editing system/external comments as local authors. Workflow write requires board update; status must be in board; validate integration/event pair against the pinned workflow editor vocabulary (not arbitrary code or expressions). Preference selected mode requires nonempty unique board IDs all in selected org; global channel disable cascades corresponding rule flags atomically, as in fork. Omitted field preserves; explicit null clears (do not copy fork's nullish-coalescing clearing bug). Validate enabled channel prerequisites and destination safety without sending traffic. No public POST-notification or generic system-activity route.

## 4. Sync shapes and collections

Add authorized org `activity` (activity_projection) and `workflow_rule` collections, plus self-only `notification`, `notification_preference`, `notification_org_rule` private collections. Do not expose comment table separately, outbox, import ledger, secrets, raw event log, or arbitrary table/filter SQL. Snapshot and tail share scope predicates, including old_value, deletes and every live authorization recheck. Bind handle to principal+scope; org switch disposes ticket/rule streams, logout disposes all private collections. Revocation invalidates handles and removes cached inaccessible rows.

Use stock TanStack Electric collections, T0 snapshot boundary/upcaster chain and txids. Activity view joins public identity data with deterministic (createdAt,id) ordering and existing compaction/grouping rules. Inbox groups and unread count derive from complete private notification collection, not a REST page; no refetchInterval. Comment mutation txid settles its activity collection; the worker's notification insert has its own txid, linked causally by source event, never falsely reuse producer txid for a later transaction. Safe preference changes fan into private projection, configuration secrets remain REST self-only. Workflow shape update settles upsert/delete in open editor. Bulk updates emit every changed row/deletion, no lone aggregate event that leaves collection stale.

## 5. File manifest

All CREATE paths relative to repository root; no implementation file is authorized to be written during this spec stage. Mirrors marked fork refer to pinned Kaneo; T0 refers to the inspected provisional worktree, not merged code. Collision/rebase check required before implementation. CREATE count excludes this spec and inherited screenshot outputs.

| CREATE | Specific existing mirror |
|---|---|
| packages/db/migrations/0004_activity_notifications.sql | fork apps/api/src/database/schema.ts; T0 packages/db/migrations/0001_foundation.sql |
| packages/contracts/src/activity-notifications.ts | T0 packages/contracts/src/api.ts |
| packages/domain/src/activity.ts | fork apps/api/src/activity/controllers/create-comment.ts |
| packages/domain/src/notifications.ts | fork apps/api/src/notification/controllers/mark-notification-as-read.ts |
| packages/domain/src/notification-recipients.ts | fork apps/api/src/notification/task-notification-recipients.ts |
| packages/domain/src/notification-preferences.ts | fork apps/api/src/notification-preferences/service.ts |
| packages/domain/src/notification-secrets.ts | fork apps/api/src/notification-preferences/secrets.ts |
| packages/domain/src/workflow-rules.ts | fork apps/api/src/workflow-rule/controllers/upsert-workflow-rule.ts |
| packages/domain/src/activity-events.ts | T0 packages/sync/src/upcasters.ts |
| packages/domain/src/notification-outbox.ts | T0 packages/db/src/index.ts transaction pattern |
| packages/domain/src/activity-import.ts | T0 packages/db/src/migrate.ts |
| packages/sync/src/activity-notification-shapes.ts | T0 packages/sync/src/index.ts |
| apps/stellarc-api/src/activity-notification-http.ts | T0 apps/stellarc-api/src/http.ts |
| apps/stellarc-worker/src/notification-consumer.ts | T0 packages/domain/src/index.ts Effect service pattern |
| apps/stellarc-ui/src/lib/activity-notification-collections.ts | T0 packages/contracts/src/shape.ts and fork apps/web/src/fetchers/activity/get-activites-by-task-id.ts |
| tools/import-activity-notifications.ts | T0 packages/db/src/migrate.ts |
| tests/unit/activity-notifications.test.ts | T0 tests/unit/foundation.test.ts |
| tests/integration/activity-notifications.test.ts | T0 tests/integration/foundation.test.ts |
| tests/integration/notification-worker.test.ts | T0 tests/integration/foundation.test.ts |
| tests/integration/activity-import.test.ts | T0 tests/integration/foundation.test.ts |
| tests/integration/activity-telemetry.test.ts | T0 tests/integration/foundation.test.ts in-memory exporter |
| tests/helpers/activity-fixture.ts | T0 tests/helpers/postgres.ts |
| tests/fixtures/activity-reconciliation.sql | canonical inventory query #8 — MISSING, obtain, never invent |
| apps/stellarc-ui/e2e/activity-notifications.spec.ts | T0 apps/stellarc-ui/e2e/frozen.spec.ts |

MODIFY after dependency merge: `packages/contracts/src/api.ts`, `packages/domain/src/index.ts`, `packages/db/src/index.ts`, `packages/sync/src/index.ts`, `packages/sync/src/upcasters.ts`, `apps/stellarc-api/src/http.ts`, `apps/stellarc-api/src/main.ts`, `apps/stellarc-api/src/errors.ts`, `apps/stellarc-api/src/config.ts`, `apps/stellarc-worker/src/main.ts`; relevant package.json dependency/export entries, root bun.lock only if needed; existing integration helper/root test bridge if test discovery needs extension. Private shape routing may require coordinated T0/T1 counter FK change described above, not an unreviewed schema workaround. STL-16 event adapter hooks are integration edits in its merged owning services; exact paths must be bound once that implementation exists.

UI MODIFY prefix `apps/stellarc-ui/src/` (fork prefix apps/web/src): fetchers/activity/create-activity.ts and get-activites-by-task-id.ts; all listed existing fetchers under notification (`clear-notifications.ts`, `delete-notification.ts`, `get-notifications.ts`, `get-unread-notification-count.ts`, `mark-all-notifications-as-read.ts`, `mark-notification-as-read.ts`), notification-preferences (`get-notification-preferences.ts`, `update-notification-preferences.ts`, `upsert-notification-organization-rule.ts`, `delete-notification-organization-rule.ts`), workflow-rule (`get-workflow-rules.ts`, `upsert-workflow-rule.ts`, `delete-workflow-rule.ts`). Rewire their existing query/mutation hooks and component data subscriptions, preserving JSX: `components/activity/index.tsx`, `comment-card.tsx`, `comment-editor.tsx`, `comment-input.tsx`, `components/account/notification-preferences-settings.tsx`, `components/notification/notification-dropdown.tsx`, `components/board/workflow-editor.tsx`. Locate actual lifted inbox route and hooks on merge; do not invent filenames or duplicate screens. Frozen screen baseline/actual PNG files belong under inherited e2e screenshot directories and follow ADR 0009 provenance rules.

## 6. Pixel-frozen UI surfaces

Keep ticket thread with comment input/draft, edit history/editor, delete confirmation, external author/avatar/link, mention formatting, compact system-change rows, flags including resolveNote, loading/empty/error states and keyboard focus. Keep inbox grouped ticket rows, unread badge/count, read/read-all, single delete/clear-all, navigation/deep links and dropdown preview. Keep account notification settings channel fields, configured/masked secrets, event toggles, reminder lead time, organization rules, selected-board picker and validation messages. Keep board workflow editor integration/event/status choices and remove action. No layout/token/typography/navigation redesign, no save-spinner layout shifts.

Test desktop 1440x900, tablet 1024x768, mobile 390x844, mobile-small 360x640. Structural landmark assertions against fork provenance plus deterministic existing baseline comparison at maxDiffPixelRatio=0.001. First new-state baseline may be generated once under ADR 0009 with reviewed fixture, never use candidate rebaselining to erase regressions. Actual live comment→worker→inbox test must not intercept those APIs/shapes; use real isolated PG and built UI/API/worker, two authenticated users, deterministic dates/fonts/locale/theme. Deliver PNG links grouped by viewport and a trace screenshot via orchestrator review artifacts, not MEDIA claims.

## 7. Test plan — RED conditions and negative controls

Each numbered row is one planned test with parameterized subcases. Missing module is initial RED only: record assertion-based RED after harness compiles. Import actual services/handlers/collections; no source-text tests, no fake inbox responses, no test-local reimplementation. Sabotage only disposable fixtures/worktrees, restore and rerun GREEN. Each HTTP/service/worker/import/shape path must additionally appear in T28's named span matrix. Run merged scripts `bun run lint`, `bun run typecheck`, `bun test`, `bun run build`, `bun run e2e`; verify actual test discovery and package scripts after T0 merge.

| ID | Test and RED condition | Negative control that must fail |
|---|---|---|
| T01 | Schema catalog types/null/default/FK/unique checks for every §2 table; missing store fails | Remove edit_history or composite selection FK |
| T02 | Real POST comment commits comment+activity+event+outbox, matching txid; absent job fails | Move enqueue after transaction or omit it |
| T03 | Forced append/enqueue failure rolls entire comment mutation back | Commit comment before event |
| T04 | Real worker + two-user browser: comment appears in recipient inbox through live shape without reload/REST timer | Stop consumer or disconnect notification collection; inbox assertion times out |
| T05 | Crash before worker commit, restart, one notification/event/completion only | Commit notification separately from completion |
| T06 | Two concurrent consumers claim same pending workload without duplicate delivery | Remove job lock and delivery uniqueness |
| T07 | LISTEN-before-catch-up, lost wakeup/restart and retry deadline all eventually drain durable jobs | Rely solely on transient pg_notify |
| T08 | Poison job retries bounded then dead; healthy org drains; rollback and shutdown release locks | Infinite retry or commit lock-held partial result |
| T09 | Assignment only new eligible assignee, no old assignee/participants/self; agent actor excludes own underlying user | Use generic participant fanout for assignment |
| T10 | Mention+participant+assignee overlap yields one mention; invalid/cross-org/revoked recipients get none | Drop membership check or dedupe precedence |
| T11 | Historic activity participants and real STL-19 follower provider included once, actor excluded | Empty provider or derive participants from comments alone; blocked until follower dependency lands |
| T12 | Comment edit appends old content to history, optimistic conflict, author-only; delete removes live projection | Overwrite history or bypass author/version predicate |
| T13 | External/non-comment rows immutable through comment endpoint; caller actor/system type rejected | Reintroduce generic create-activity bypass |
| T14 | Snapshot/tail race, reconnect and deletion give exact activity/inbox rows and settle correct txids | Remove boundary or substitute producer txid for worker txid |
| T15 | Self-only snapshot/tail/old_value/REST and existing handles deny another user/org/revoked access | Filter snapshot only or key handles by table alone |
| T16 | Full unread count exceeds paginated list, grouped inbox and read-all/clear/single delete update across two clients | Count current page or omit deletion events |
| T17 | Replay after clear/delete does not resurrect a delivered notification | Delete completion/delivery identity when clearing |
| T18 | Preference defaults, optional/null clearing, encryption, masks and reopen persistence match DTO | Return stored ciphertext/raw token or use nullish fallback on explicit clear |
| T19 | Org selected-board validation, global-channel disable cascade and private live updates atomic | Allow foreign-board selection or skip cascade events |
| T20 | Workflow upsert concurrent uniqueness, status belongs to board, permission, shape update/delete | Remove composite validation or event emission |
| T21 | Workflow resolver returns configured target or none; pinned event pair validation; no general code execution | Ignore eventType or execute arbitrary expression |
| T22 | Import all six source table PK/value sets; activity split lossless, original IDs/history/external/null/type retained | Drop non-comment eventData or map all rows to comments |
| T23 | Identical import rerun changes no rows/events/jobs; zero outbound delivery for history | Enqueue imported comment-created events |
| T24 | Bad FK/duplicate/malformed history/undecryptable secret/unresolved notification org fails preflight atomically, read-only source | Partially commit before validation or guess org |
| T25 | Rebuild activity projection from event log exactly reproduces mixed history | Omit legacy upcaster or comment delete event |
| T26 | Canonical reconciliation #8 passes restored fixture and detects inventory-defined violation | Apply canonical offending-row sabotage; BLOCKED until exact SQL/violation supplied |
| T27 | Every §3 route validates real request/response and E, auth/permissions, error/no-op txid behavior | Unregister one handler or bypass schema decoder |
| T28 | Named path matrix asserts Effect.fn service spans, endpoint http/org/principal attrs, db.* without SQL, worker job linked to source trace, lag metric, append→shape txid trace | Remove instrumentation on each path one at a time; each associated assertion fails |
| T29 | Error/secret/import paths export no content/email/token/URL/SQL attributes or console output | Add comment content/db.statement to test exporter path |
| T30 | All frozen screens/states across four projects retain landmarks/baselines and real keyboard/touch interactions | Change row padding/omit unread badge; actual screenshot/landmark assertion fails |
| T31 | Org switch/logout removes old scopes; settings readback refresh one-shot, inbox has no periodic REST refetch | Reuse unscoped collection or restore refetchInterval |
| T32 | Root gates discover all new unit/PG/browser suites, real worker entrypoint is exercised | Introduce assertion failure in new suite; root gate must fail |

Owns reconciliation **#8 only**, not #1–#7 or #9–#14. T26 is blocked, not skippable evidence. T22–T25 are supplementary losslessness checks, not substitutes for the numbered inventory query. Request canonical SQL and its source/destination mapping before implement gate. No declaration 'all reconciliation green' while inventory absent.

Importer uses a restored source snapshot read-only, full preflight and atomic destination transaction under import lock; stable ledger digest over all columns. Derive notification org from referenced task/board/org or validated eventData; intrinsically user-global rows stay org_id null/private stream. Ambiguous/missing scope fails with sanitized report, never drops or guesses. Map legacy task/column IDs through STL-16 mappings; event sequences are destination commit order, original createdAt stays payload history order. Imported notifications emit projection seed events only, not jobs. Preserve encrypted secrets only through verified decryption/re-encryption (or fail); source rows are never changed. Repeated full imports on disposable destinations eventually feed STL-21's three-clean-run gate.

Review explicitly names SPANS, recipient semantics, private scope/counter design, outbox crash atomicity, history preservation, negative-control fidelity, and real screenshot/collection evidence. Current blockers are merged foundation/identity/ticket contracts, private counter compatibility, canonical #8, follower final parity, and assigned external-delivery scope. These are not fabricated as satisfied by the spec.

## 8. Suggested vertical build order

1. Resolve dependency readiness: merged T0/T1 interfaces and migration order; real T2 ticket/status contract; private user counter design; canonical #8; external-delivery ownership. Pin actual event adapters and inbox route/hook paths in this manifest before code review.
2. T01–T03 RED → minimal comment/event/projection/outbox SQL and Effect service → GREEN and rollback sabotage. Use isolated identity+ticket fixtures, no fake production ticket tables.
3. T04 RED → worker startup LISTEN/catch-up and transactional notification insert/event → private stock shape → existing recipient inbox. Exercise two-user browser end to end before preference/workflow expansion.
4. T05–T10/T14–T17 RED → crash/replay/concurrency/authorization/recipient controls → GREEN with one-variable sabotage for each. Add named span assertions alongside each service, not at the end.
5. T12–T13 RED → comment edit/history/delete and historical projection → actual thread states and txid settle. Integrate T2 supported event adapters without duplicate activity writes.
6. T18–T21 RED → preferences storage/private live DTOs, safe secret Layer and workflow CRUD/resolver → GREEN with frozen editor/settings states. Do not claim deferred channels operational.
7. T22–T26 RED → full importer/preflight/idempotency/rebuild and exact inventory reconciliation. Wire STL-19 provider and prove T11 when its owned schema lands; final parity cannot use empty seam.
8. Run T27–T32, full clean gates and four-project PNG/trace evidence; present actual RED/GREEN/sabotage assertion output to different-family adversarial reviewer. Orchestrator alone handles tracker, commits and merge. Spec stage ends with this persisted file, not implementation claims.
