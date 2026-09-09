# STL-14 — T0 foundation implementation spec

## 1. Scope and premise audit

Build the Bun/Turbo workspace, an Effect HttpApi running on Bun with configuration and SqlLive Layers, a PostgreSQL transactional event log and an embedded Electric-compatible snapshot/tail spike exercised by the stock TanStack adapter, plus the fork UI lifted intact against deterministic browser stubs. Establish reproducible CI and four-viewport screenshot baselines; do not implement the business-domain rewrite. All paths below are relative to `/home/rpw/repos/stellarc-dev` unless explicitly absolute. This is a specification, not evidence that implementation or tests have run. Only the orchestrator commits or changes tracker/gate state.

### Premise audit (code wins)

- Gate read: latest triage entry in `.forge/STL-14.json` is `pass` at `2026-09-09T01:18:00+00:00`.
- Inspected `dev` at `dcbf007`: 31 tracked files, documentation and forge only; no package.json, apps, packages, migrations, or tests. This is genuinely greenfield infrastructure, not repair of an existing Effect server.
- Mirror source: `/home/rpw/repos/kaneo`, commit `2504e64512b84b9b739d4d4fb0d4ceaefdb14783`. Use committed blobs at this revision, not dirty files, dist directories, node_modules, environment files, or live credentials. Its `apps/web/package.json` uses Vite, React 19, React Query, Hono, Base UI ^1.6.0, retained Radix dependencies and sonner. ADR 0008's target stack is not already implemented. Preserve these compatibility dependencies in the frozen lift; only the spike collection uses TanStack DB in T0. Never replace all fetchers with invented business APIs.
- ADR 0002 still says Hono/zod and Effect as a library, contradicting the ticket's Effect HttpApi runtime and the later wave plan. This slice follows the explicit ticket plus ADR 0007; annotate this discrepancy rather than editing the ADR silently.
- ADR 0007 offers alternate sequencing strategies; this ticket explicitly selects the per-org transactional row counter. BIGSERIAL is not a substitute.
- Fork `apps/web/src/hooks/use-mobile.ts` uses `innerWidth < 768` and a max-width 767 media query. Exactly 768 is desktop behavior, not mobile. Tablet width 1024 must keep the desktop sidebar.
- `.forge/config.json` runs `bun test`, not Vitest, and lacks an explicit integration gate. Supply a Bun test bridge that actually runs Vitest unit + real-PG integration suites, failing on either child exit, so the existing orchestrator gate cannot miss them. CI invokes the same bridge.
- The local wave plan references but does not contain the 14 legacy SQL query definitions; it assigns only #1–#12 explicitly. Do not invent #13/#14 or report 14/14. T0 owns none of the legacy queries. This missing inventory is a handoff issue for the final wave, not a reason to fake reconciliation.

### Explicit OUT of scope and owners

- STL-15/T1: real BetterAuth sessions/API keys, users/orgs/roles/teams, grants-backed authorization and org-routing seam, identity import, #1–#3. T0 provides fail-closed Authz Layer interface and test-only implementation, not a publicly usable fake login.
- STL-16/T2: boards/statuses/tickets/labels/templates/flags, domain collections and mutation APIs, #4–#6; broad business fetcher conversion starts with each owning slice.
- STL-17/T3: comments/activity import, inbox/notification/workflow domain behavior and worker outbox, #8. T0 worker only acquires/releases runtime resources and handles termination; no polling placeholder pretending to process notifications.
- STL-18/T4: repositories/connections/GitHub mirroring and corresponding collections, #10.
- STL-19/T5: relations/followers/external links/milestones, graph collections, #7.
- STL-20/T6: assets/S3/resource grants and production cross-org reconciliation, #9/#11/#12. T0 isolation tests are engine tests, not fulfillment of #12.
- STL-21/T7: projects and final all-14/three-import gate; obtain canonical #13/#14 definitions from the orchestrator before that gate.
- Tauri packaging, Maestro, arclet/tunnel deployment, SSE through Cloudflare, HTTP/1.1 multiplexing, schema-per-org escalation and design-system token migration: no sibling ticket number exists in `.forge/wave-map.json`; ownership is explicitly UNASSIGNED, orchestrator must create/name the respective follow-up tickets. Do not falsely assign these to STL-15–21. T0 measures direct Bun long-poll only; it makes no proxy-readiness claim.

## 2. Exact tables, columns, events

New shared PostgreSQL schema `public` only. No legacy business table is changed. Use SQL migrations with advisory locking and transactional application. SQL identifiers below are exact. All columns NOT NULL unless marked nullable.

| Table | Columns and constraints |
|---|---|
| `stellarc_migration` | `version text PRIMARY KEY`, `checksum text`, `applied_at timestamptz DEFAULT now()`; bootstrap metadata created by runner before numbered migrations |
| `org_event_counter` | `org text PRIMARY KEY`, `seq bigint DEFAULT 0 CHECK (seq >= 0)` |
| `event` | `org text`, `seq bigint CHECK (seq > 0)`, `plugin_type text`, `actor text`, `payload jsonb`, `schema_version integer CHECK (schema_version > 0)`, `txid bigint`, `created_at timestamptz DEFAULT now()`, PRIMARY KEY `(org,seq)`, FK `org` → `org_event_counter.org`; no global sequence |
| `sync_probe` | `org text`, `id text`, `value text`, `last_seq bigint`, PRIMARY KEY `(org,id)`, FK `(org,last_seq)` → `event(org,seq)`; projection for this spike only |

`org`/`actor` are opaque nonempty IDs, not UUID assumptions; identity FK migration belongs to STL-15. All bigint cursors are decimal strings at JSON boundaries; txid is checked as a JS-safe positive integer for the pinned adapter, rejecting overflow rather than rounding. This spike uses PostgreSQL transaction IDs from `pg_current_xact_id()`; `seq` is not a txid.

Mutation transaction order: insert counter on conflict do nothing; `UPDATE org_event_counter SET seq=seq+1 WHERE org=$org RETURNING seq` (holds row lock through commit); obtain txid; append event; upsert/delete projection; commit; only then return `{txid}`. Multi-event transactions reserve a contiguous range under the same lock. Rollback rolls back counter, events and projection. Different orgs must not share a serialization lock. Event rows are append-only: deny UPDATE/DELETE to runtime role; migration owner is separate. No org row deletion API.

Events emitted by the test-only mutation fixture:

| pluginId:type | schema_version | payload Effect Schema |
|---|---|---|
| `foundation:probe-upserted` | 1 | `Struct({id: NonEmptyString, value: String})` |
| `foundation:probe-deleted` | 1 | `Struct({id: NonEmptyString})` |

Upcaster registry is keyed by plugin_type, validates version, and runs before projection/emit. Unknown/newer version fails closed (503), not silently dropped. For v1 the chain is identity; a synthetic v0 fixture registered only in tests proves nonidentity upcasting. No production v0 emitter. Health/startup do not emit domain events.

## 3. HTTP API and Schemas

Use Effect Schema declarations shared by server and tests; one tagged-error mapper. No Hono server for these routes. Same-origin UI/API default; no wildcard credentialed CORS. Auth checked before shape/cursor lookup and again after long-poll wakeup. Production default Authz Layer denies every org request until STL-15 wires real grants. Test principals/tokens exist only in a test-composed server; environment flags cannot enable them in the production entrypoint.

Common `Error = Struct({_tag: Literal(tag), message: String})` with sanitized messages. Union: `BadRequest` 400, `Unauthenticated` 401, `Forbidden` 403, `NotFound` 404, `Conflict` 409 (fixture only), `Unavailable` 503, `InternalError` 500. DB details, credentials and stack traces never appear. Decode failures → BadRequest; missing authentication → 401, wrong org/capability → 403 without disclosing handle existence; database outage or unsupported event schema → 503; unexpected defect → 500. Unknown route → 404. No generic catch that converts failures to HTTP 200.

### GET `/health`

No body/query/auth. 200 `Struct({status: Literal('ok')})`, returned by Effect handler after SqlLive `SELECT 1`. Errors: Unavailable/InternalError. Startup invalid config exits nonzero before binding; never return `ok` without the DB dependency. Health schema has no timestamp to destabilize tests.

### GET `/orgs/:org/v1/shape`

Path `org: NonEmptyString` (bounded 128 characters). Query: `table: Literal('sync_probe')`; `offset: '-1' | opaque cursor string` (required); `handle?: NonEmptyString`; `live?: Literal('true','false')` default false. Live requires a handle and noninitial offset. Unsupported `where`, columns, table, SSE or arbitrary query options → 400; never interpolate client SQL. Pagination cap is server-side 100 changes/page. Live timeout 20 seconds; Bun idle timeout must exceed it. Client abort cancels timers/listeners and releases SQL resources.

200 body is the pinned Electric client's message array, NOT `{events:[...]}`:
- Change: `{key: string, value: {org:string,id:string,value:string,last_seq:string}, headers:{operation:'insert'|'update', relation:['public','sync_probe'], txids?: number[]}}`.
- Delete: `{key:string,value:{org:string,id:string},headers:{operation:'delete',relation:['public','sync_probe'],txids:number[]}}`.
- Control: `{headers:{control:'up-to-date'}}`; stale handle response 409 `[{headers:{control:'must-refetch'}}]` plus replacement location/handle as required by the pinned client. This protocol 409 is deliberately distinct from JSON Error.
- Include `snapshot-end` metadata only in the exact shape required by the pinned client; obtain real xmin/xmax/xip_list from the database snapshot, never made-up constants. Capture the definitive wire schema in `packages/contracts/src/shape.ts` after inspecting installed adapter/client declarations; ADR 0007's probe versions are evidence, not an excuse to guess a different protocol.

Headers: `Content-Type: application/json` for 200; `electric-handle`, `electric-offset`, `electric-schema` (column metadata, including text identifiers and bigint last_seq), `electric-up-to-date` where the pinned client expects it; `Cache-Control: no-store`; expose Electric headers if explicit cross-origin development is enabled. Empty live timeout → 204, no body, retains handle/offset. Errors: BadRequest/Unauthenticated/Forbidden/Unavailable/InternalError, plus protocol 409. A handle is org+table+snapshot scoped; never authorize based on possession of it. Unknown/expired handle after authorization → must-refetch. Retain immutable materialized snapshot pages for five minutes; on process restart invalidate old handles rather than reconstructing them at a new boundary.

Boundary algorithm: in one REPEATABLE READ transaction read counter N (0 if absent) and projection rows for org, ordered by id; materialize those rows for all initial pages and commit promptly. Tail begins strictly at `seq > N` only after last snapshot page. Cursor encodes phase plus snapshot index or last scanned org seq; treat it as opaque/validated and bound to handle. Page resumes never re-read a fresh projection. A tail batch advances across unrelated event types as well as probe events. Database events are truth; optional NOTIFY is only a wakeup hint, with requery on timeout/reconnect. No open DB transaction during a long poll.

"Exactly once" means no omitted/duplicated committed event application across the persisted cursor boundary; transport retries may redeliver an unacknowledged page. Client must persist state/cursor atomically or use stable-key idempotent application. Do not promise impossible exactly-once network delivery. Tests assert both event identity accounting and final collection state, not just row count.

### Test-server-only POST `/orgs/:org/__test/probes`

Not registered by production main, no `/debug` endpoint. Requires injected test authz. Request `Struct({id: bounded NonEmptyString, value: String})`, returns 200 `Struct({txid: safe positive integer})` after transaction commits. Errors BadRequest/Unauthenticated/Forbidden/Unavailable/InternalError. This is the end-to-end write path for proving adapter `awaitTxId`, not a new business API.

### Test-server-only DELETE `/orgs/:org/__test/probes/:id`

Same path constraints/auth; no body. 200 `{txid: safe positive integer}`; nonexistent projection → NotFound, no event/counter advance. Other errors same as POST. Multiple-event transaction tests invoke the same domain transaction service directly. Production requests to either fixture route return 404.

Browser legacy stubs are Playwright interception handlers, not additional production HTTP endpoints. Their methods/paths/responses must be recorded from pinned fork fetchers and the shared deterministic fixture; unexpected requests fail the test. Do not invent a blanket `{}` fallback. No real user or production data in fixtures.

## 4. Sync collections

One new experimental collection `sync_probe`, primary key `[org,id]`, uses stock `@tanstack/electric-db-collection` and `@electric-sql/client` without monkeypatches. Org is present in URL and collection identity; switch org disposes old subscriptions. Snapshot rows and upsert/delete tail messages feed this collection; mutation settles only on its actual transaction ID. Wire decimals decode explicitly, never coerce bigint through Number for cursors. No identity, tickets, boards, inbox, repositories, files or project collection changes in T0. The fork's existing hooks remain fixture-backed compatibility code until sibling slices replace them. The spike is test-driven infrastructure, not a visible new product screen.

## 5. File inventory and mirrors

No existing application file exists in dev to mirror. Infrastructure implementations are NEW designs constrained by the cited existing documents, not claimed copies of nonexistent Effect code. Concrete source mirrors below are pinned Kaneo files; semantic reference files for novel Effect code are labeled as such. Preserve attribution/licenses.

CREATE inventory: **1078 files** (1059 + 19 i18n per §5a) (84 baseline PNGs included). Every entry is an exact destination with its existing source/reference; generated files are labeled.

| Destination | Specific mirror / existing reference |
|---|---|
| `apps/stellarc-ui/components.json` | Kaneo `apps/web/components.json` (exact production-source mirror) |
| `apps/stellarc-ui/index.html` | Kaneo `apps/web/index.html` (exact production-source mirror) |
| `apps/stellarc-ui/package.json` | Kaneo `apps/web/package.json` (exact production-source mirror) |
| `apps/stellarc-ui/postcss.config.js` | Kaneo `apps/web/postcss.config.js` (exact production-source mirror) |
| `apps/stellarc-ui/public/apple-touch-icon.png` | Kaneo `apps/web/public/apple-touch-icon.png` (exact production-source mirror) |
| `apps/stellarc-ui/public/embed.html` | Kaneo `apps/web/public/embed.html` (exact production-source mirror) |
| `apps/stellarc-ui/public/embed.js` | Kaneo `apps/web/public/embed.js` (exact production-source mirror) |
| `apps/stellarc-ui/public/favicon-96x96.png` | Kaneo `apps/web/public/favicon-96x96.png` (exact production-source mirror) |
| `apps/stellarc-ui/public/favicon.ico` | Kaneo `apps/web/public/favicon.ico` (exact production-source mirror) |
| `apps/stellarc-ui/public/favicon.svg` | Kaneo `apps/web/public/favicon.svg` (exact production-source mirror) |
| `apps/stellarc-ui/public/logo-dark.svg` | Kaneo `apps/web/public/logo-dark.svg` (exact production-source mirror) |
| `apps/stellarc-ui/public/logo-light.svg` | Kaneo `apps/web/public/logo-light.svg` (exact production-source mirror) |
| `apps/stellarc-ui/public/site.webmanifest` | Kaneo `apps/web/public/site.webmanifest` (exact production-source mirror) |
| `apps/stellarc-ui/public/web-app-manifest-192x192.png` | Kaneo `apps/web/public/web-app-manifest-192x192.png` (exact production-source mirror) |
| `apps/stellarc-ui/public/web-app-manifest-512x512.png` | Kaneo `apps/web/public/web-app-manifest-512x512.png` (exact production-source mirror) |
| `apps/stellarc-ui/src/assets/fonts/CalSans-SemiBold.woff2` | Kaneo `apps/web/src/assets/fonts/CalSans-SemiBold.woff2` (exact production-source mirror) |
| `apps/stellarc-ui/src/assets/fonts/CalSansUI[wght,GEOM]-s.p.c2e3469d.woff2` | Kaneo `apps/web/src/assets/fonts/CalSansUI[wght,GEOM]-s.p.c2e3469d.woff2` (exact production-source mirror) |
| `apps/stellarc-ui/src/assets/fonts/PaperMono-Regular.woff2` | Kaneo `apps/web/src/assets/fonts/PaperMono-Regular.woff2` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/account/notification-preferences-settings.tsx` | Kaneo `apps/web/src/components/account/notification-preferences-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/comment-card.tsx` | Kaneo `apps/web/src/components/activity/comment-card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/comment-editor.tsx` | Kaneo `apps/web/src/components/activity/comment-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/comment-input.tsx` | Kaneo `apps/web/src/components/activity/comment-input.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/compact-activities.ts` | Kaneo `apps/web/src/components/activity/compact-activities.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/index.tsx` | Kaneo `apps/web/src/components/activity/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/unflag-control.tsx` | Kaneo `apps/web/src/components/activity/unflag-control.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/activity/utils.ts` | Kaneo `apps/web/src/components/activity/utils.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ai/ai-chat-bubble.tsx` | Kaneo `apps/web/src/components/ai/ai-chat-bubble.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/app-sidebar.tsx` | Kaneo `apps/web/src/components/app-sidebar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/layout.tsx` | Kaneo `apps/web/src/components/auth/layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/otp-sign-in-form.tsx` | Kaneo `apps/web/src/components/auth/otp-sign-in-form.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/sign-in-form-skeleton.tsx` | Kaneo `apps/web/src/components/auth/sign-in-form-skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/sign-in-form.tsx` | Kaneo `apps/web/src/components/auth/sign-in-form.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/sign-up-form.tsx` | Kaneo `apps/web/src/components/auth/sign-up-form.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/sso-providers.tsx` | Kaneo `apps/web/src/components/auth/sso-providers.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/toggle.tsx` | Kaneo `apps/web/src/components/auth/toggle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/auth/turnstile.tsx` | Kaneo `apps/web/src/components/auth/turnstile.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/backlog-list-view/backlog-task-row.tsx` | Kaneo `apps/web/src/components/backlog-list-view/backlog-task-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/backlog-list-view/index.tsx` | Kaneo `apps/web/src/components/backlog-list-view/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-default-assignee.tsx` | Kaneo `apps/web/src/components/board/board-default-assignee.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-milestones-section.tsx` | Kaneo `apps/web/src/components/board/board-milestones-section.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-properties-panel.tsx` | Kaneo `apps/web/src/components/board/board-properties-panel.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-sync-indicator.tsx` | Kaneo `apps/web/src/components/board/board-sync-indicator.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-toolbar.tsx` | Kaneo `apps/web/src/components/board/board-toolbar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-view-options.tsx` | Kaneo `apps/web/src/components/board/board-view-options.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/board-view-tabs.tsx` | Kaneo `apps/web/src/components/board/board-view-tabs.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/boards-timeline-sections.ts` | Kaneo `apps/web/src/components/board/boards-timeline-sections.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/boards-timeline.tsx` | Kaneo `apps/web/src/components/board/boards-timeline.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/column-editor.tsx` | Kaneo `apps/web/src/components/board/column-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/discord-integration-settings.tsx` | Kaneo `apps/web/src/components/board/discord-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/generic-webhook-integration-settings.tsx` | Kaneo `apps/web/src/components/board/generic-webhook-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/gitea-integration-settings.tsx` | Kaneo `apps/web/src/components/board/gitea-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/gitea-repository-browser-modal.tsx` | Kaneo `apps/web/src/components/board/gitea-repository-browser-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/github-integration-settings.tsx` | Kaneo `apps/web/src/components/board/github-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/milestones-view.tsx` | Kaneo `apps/web/src/components/board/milestones-view.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/repository-browser-modal.tsx` | Kaneo `apps/web/src/components/board/repository-browser-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/slack-integration-settings.tsx` | Kaneo `apps/web/src/components/board/slack-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/tasks-import-export.tsx` | Kaneo `apps/web/src/components/board/tasks-import-export.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/telegram-integration-settings.tsx` | Kaneo `apps/web/src/components/board/telegram-integration-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/board/workflow-editor.tsx` | Kaneo `apps/web/src/components/board/workflow-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/bulk-selection/backlog-bulk-toolbar.tsx` | Kaneo `apps/web/src/components/bulk-selection/backlog-bulk-toolbar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/bulk-selection/bulk-toolbar.tsx` | Kaneo `apps/web/src/components/bulk-selection/bulk-toolbar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/command-palette/index.tsx` | Kaneo `apps/web/src/components/command-palette/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/board-icon-picker.tsx` | Kaneo `apps/web/src/components/common/board-icon-picker.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/board-layout.tsx` | Kaneo `apps/web/src/components/common/board-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/board-skeleton.tsx` | Kaneo `apps/web/src/components/common/board-skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/entity-icon.tsx` | Kaneo `apps/web/src/components/common/entity-icon.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/header/board-crumb-select.tsx` | Kaneo `apps/web/src/components/common/header/board-crumb-select.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/header/mobile-board-nav.tsx` | Kaneo `apps/web/src/components/common/header/mobile-board-nav.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/header/organization-crumb-select.tsx` | Kaneo `apps/web/src/components/common/header/organization-crumb-select.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/header/task-crumb-select.tsx` | Kaneo `apps/web/src/components/common/header/task-crumb-select.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/layout.tsx` | Kaneo `apps/web/src/components/common/layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/logo.tsx` | Kaneo `apps/web/src/components/common/logo.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/mobile-user-fab.tsx` | Kaneo `apps/web/src/components/common/mobile-user-fab.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/organization-layout.tsx` | Kaneo `apps/web/src/components/common/organization-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/pending-sync-indicator.tsx` | Kaneo `apps/web/src/components/common/pending-sync-indicator.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/repo-layout.tsx` | Kaneo `apps/web/src/components/common/repo-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/sidebar-resize-handle.tsx` | Kaneo `apps/web/src/components/common/sidebar-resize-handle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/sort-control.tsx` | Kaneo `apps/web/src/components/common/sort-control.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/task-layout.tsx` | Kaneo `apps/web/src/components/common/task-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/task-view-controls.tsx` | Kaneo `apps/web/src/components/common/task-view-controls.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/common/view-tabs.tsx` | Kaneo `apps/web/src/components/common/view-tabs.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/connections/account-github-connection.tsx` | Kaneo `apps/web/src/components/connections/account-github-connection.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/connections/github-permissions.ts` | Kaneo `apps/web/src/components/connections/github-permissions.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/connections/organization-github-connection.tsx` | Kaneo `apps/web/src/components/connections/organization-github-connection.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/data-table/data-table-grid.tsx` | Kaneo `apps/web/src/components/data-table/data-table-grid.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/demo-alert.tsx` | Kaneo `apps/web/src/components/demo-alert.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/error-boundary.tsx` | Kaneo `apps/web/src/components/error-boundary.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/flag/flag-badge.tsx` | Kaneo `apps/web/src/components/flag/flag-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/flag/flag-icon.ts` | Kaneo `apps/web/src/components/flag/flag-icon.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/flag/task-flag-badges.tsx` | Kaneo `apps/web/src/components/flag/task-flag-badges.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/flag/task-flag-picker.tsx` | Kaneo `apps/web/src/components/flag/task-flag-picker.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/flag/task-flag-section.tsx` | Kaneo `apps/web/src/components/flag/task-flag-section.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-dependency-arrows.tsx` | Kaneo `apps/web/src/components/gantt/gantt-dependency-arrows.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-milestone-row.tsx` | Kaneo `apps/web/src/components/gantt/gantt-milestone-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-milestones.ts` | Kaneo `apps/web/src/components/gantt/gantt-milestones.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-scheduling.ts` | Kaneo `apps/web/src/components/gantt/gantt-scheduling.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-sections.ts` | Kaneo `apps/web/src/components/gantt/gantt-sections.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-task-bar.tsx` | Kaneo `apps/web/src/components/gantt/gantt-task-bar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-task-rail-dnd.ts` | Kaneo `apps/web/src/components/gantt/gantt-task-rail-dnd.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-timeline.ts` | Kaneo `apps/web/src/components/gantt/gantt-timeline.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/gantt/gantt-unscheduled-track.tsx` | Kaneo `apps/web/src/components/gantt/gantt-unscheduled-track.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/inbox-unread-badge.tsx` | Kaneo `apps/web/src/components/inbox-unread-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/board-view-context.tsx` | Kaneo `apps/web/src/components/kanban-board/board-view-context.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/column/column-dropzone.tsx` | Kaneo `apps/web/src/components/kanban-board/column/column-dropzone.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/column/column-header.tsx` | Kaneo `apps/web/src/components/kanban-board/column/column-header.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/column/index.tsx` | Kaneo `apps/web/src/components/kanban-board/column/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/index.tsx` | Kaneo `apps/web/src/components/kanban-board/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/task-card-context-menu/task-card-context-menu-content.tsx` | Kaneo `apps/web/src/components/kanban-board/task-card-context-menu/task-card-context-menu-content.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/task-card.tsx` | Kaneo `apps/web/src/components/kanban-board/task-card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/task-hover-preview.tsx` | Kaneo `apps/web/src/components/kanban-board/task-hover-preview.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/kanban-board/task-labels.tsx` | Kaneo `apps/web/src/components/kanban-board/task-labels.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/keyboard-shortcuts-help.tsx` | Kaneo `apps/web/src/components/keyboard-shortcuts-help.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/list-view/index.tsx` | Kaneo `apps/web/src/components/list-view/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/list-view/list-bulk-actions-toggle.tsx` | Kaneo `apps/web/src/components/list-view/list-bulk-actions-toggle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/list-view/list-grouping.ts` | Kaneo `apps/web/src/components/list-view/list-grouping.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/list-view/list-nest-hint.tsx` | Kaneo `apps/web/src/components/list-view/list-nest-hint.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/list-view/task-row.tsx` | Kaneo `apps/web/src/components/list-view/task-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/my-tasks-count-badge.tsx` | Kaneo `apps/web/src/components/my-tasks-count-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-boards.tsx` | Kaneo `apps/web/src/components/nav-boards.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-hidden-items.tsx` | Kaneo `apps/web/src/components/nav-hidden-items.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-main.tsx` | Kaneo `apps/web/src/components/nav-main.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-projects.tsx` | Kaneo `apps/web/src/components/nav-projects.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-repos.tsx` | Kaneo `apps/web/src/components/nav-repos.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/nav-tables.tsx` | Kaneo `apps/web/src/components/nav-tables.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/notification/notification-dropdown.tsx` | Kaneo `apps/web/src/components/notification/notification-dropdown.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/onboarding/onboarding-flow.tsx` | Kaneo `apps/web/src/components/onboarding/onboarding-flow.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/organization-switcher.tsx` | Kaneo `apps/web/src/components/organization-switcher.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/page-title.tsx` | Kaneo `apps/web/src/components/page-title.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/permission-denied.tsx` | Kaneo `apps/web/src/components/permission-denied.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/presence/board-access-avatars.tsx` | Kaneo `apps/web/src/components/presence/board-access-avatars.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/principal-picker-list.tsx` | Kaneo `apps/web/src/components/principal-picker-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/principal-selector.tsx` | Kaneo `apps/web/src/components/principal-selector.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/profile-setup/profile-setup-flow.tsx` | Kaneo `apps/web/src/components/profile-setup/profile-setup-flow.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/archive-project-dialog.tsx` | Kaneo `apps/web/src/components/project/archive-project-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/create-project-modal.tsx` | Kaneo `apps/web/src/components/project/create-project-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-contextual-resources.tsx` | Kaneo `apps/web/src/components/project/project-contextual-resources.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-header.tsx` | Kaneo `apps/web/src/components/project/project-header.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-health-badge.tsx` | Kaneo `apps/web/src/components/project/project-health-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-list.tsx` | Kaneo `apps/web/src/components/project/project-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-milestones-section.tsx` | Kaneo `apps/web/src/components/project/project-milestones-section.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-overview.tsx` | Kaneo `apps/web/src/components/project/project-overview.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-properties-form.tsx` | Kaneo `apps/web/src/components/project/project-properties-form.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-resource-link-dialog.tsx` | Kaneo `apps/web/src/components/project/project-resource-link-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-resource-row.tsx` | Kaneo `apps/web/src/components/project/project-resource-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-resource-unlink-dialog.tsx` | Kaneo `apps/web/src/components/project/project-resource-unlink-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-row.tsx` | Kaneo `apps/web/src/components/project/project-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-staleness-indicator.tsx` | Kaneo `apps/web/src/components/project/project-staleness-indicator.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-tabs.tsx` | Kaneo `apps/web/src/components/project/project-tabs.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-ticket-picker.tsx` | Kaneo `apps/web/src/components/project/project-ticket-picker.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-ticket-row.tsx` | Kaneo `apps/web/src/components/project/project-ticket-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-ticket-view-model.ts` | Kaneo `apps/web/src/components/project/project-ticket-view-model.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-tickets.tsx` | Kaneo `apps/web/src/components/project/project-tickets.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-update-composer.tsx` | Kaneo `apps/web/src/components/project/project-update-composer.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-update-delete-dialog.tsx` | Kaneo `apps/web/src/components/project/project-update-delete-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-update-edit-dialog.tsx` | Kaneo `apps/web/src/components/project/project-update-edit-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-update-list.tsx` | Kaneo `apps/web/src/components/project/project-update-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-update-row.tsx` | Kaneo `apps/web/src/components/project/project-update-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/project-updates-panel.tsx` | Kaneo `apps/web/src/components/project/project-updates-panel.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/project/projects-overview.tsx` | Kaneo `apps/web/src/components/project/projects-overview.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/providers/auth-provider/hooks/use-auth.ts` | Kaneo `apps/web/src/components/providers/auth-provider/hooks/use-auth.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/providers/auth-provider/index.tsx` | Kaneo `apps/web/src/components/providers/auth-provider/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/providers/theme-provider/index.tsx` | Kaneo `apps/web/src/components/providers/theme-provider/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/copy-url-button.tsx` | Kaneo `apps/web/src/components/public-board/copy-url-button.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/error-view.tsx` | Kaneo `apps/web/src/components/public-board/error-view.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/kanban-view.tsx` | Kaneo `apps/web/src/components/public-board/kanban-view.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/kaneo-branding.tsx` | Kaneo `apps/web/src/components/public-board/kaneo-branding.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/list-view.tsx` | Kaneo `apps/web/src/components/public-board/list-view.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/loading-skeleton.tsx` | Kaneo `apps/web/src/components/public-board/loading-skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/markdown-renderer.tsx` | Kaneo `apps/web/src/components/public-board/markdown-renderer.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/public-pr-badge.tsx` | Kaneo `apps/web/src/components/public-board/public-pr-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/public-task-labels.tsx` | Kaneo `apps/web/src/components/public-board/public-task-labels.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/task-card.tsx` | Kaneo `apps/web/src/components/public-board/task-card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/task-detail-modal.tsx` | Kaneo `apps/web/src/components/public-board/task-detail-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/task-row.tsx` | Kaneo `apps/web/src/components/public-board/task-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/public-board/theme-toggle.tsx` | Kaneo `apps/web/src/components/public-board/theme-toggle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/add-repo-dialog.tsx` | Kaneo `apps/web/src/components/repo/add-repo-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/link-ticket-candidate-row.tsx` | Kaneo `apps/web/src/components/repo/link-ticket-candidate-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/pull-request-file-tree.tsx` | Kaneo `apps/web/src/components/repo/pull-request-file-tree.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/pull-request-live-details.tsx` | Kaneo `apps/web/src/components/repo/pull-request-live-details.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/pull-request-reviews.tsx` | Kaneo `apps/web/src/components/repo/pull-request-reviews.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-avatar.tsx` | Kaneo `apps/web/src/components/repo/repo-avatar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-description-editor.tsx` | Kaneo `apps/web/src/components/repo/repo-description-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-detail-management.tsx` | Kaneo `apps/web/src/components/repo/repo-detail-management.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-diff-delta.tsx` | Kaneo `apps/web/src/components/repo/repo-diff-delta.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-issue-history.tsx` | Kaneo `apps/web/src/components/repo/repo-issue-history.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-issue-relations.tsx` | Kaneo `apps/web/src/components/repo/repo-issue-relations.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-item-actions.tsx` | Kaneo `apps/web/src/components/repo/repo-item-actions.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-item-detail-layout.tsx` | Kaneo `apps/web/src/components/repo/repo-item-detail-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-label-list.tsx` | Kaneo `apps/web/src/components/repo/repo-label-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-list-row.tsx` | Kaneo `apps/web/src/components/repo/repo-list-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-master-detail.tsx` | Kaneo `apps/web/src/components/repo/repo-master-detail.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-state-badge.tsx` | Kaneo `apps/web/src/components/repo/repo-state-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/repo/repo-task-links.tsx` | Kaneo `apps/web/src/components/repo/repo-task-links.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/resource-grant-editor.tsx` | Kaneo `apps/web/src/components/resource-grant-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/search-command-menu/index.tsx` | Kaneo `apps/web/src/components/search-command-menu/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/search.tsx` | Kaneo `apps/web/src/components/search.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings-layout.tsx` | Kaneo `apps/web/src/components/settings-layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/agent-manager.tsx` | Kaneo `apps/web/src/components/settings/agent-manager.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/ai-settings.tsx` | Kaneo `apps/web/src/components/settings/ai-settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/api-key-created-modal.tsx` | Kaneo `apps/web/src/components/settings/api-key-created-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/api-key-table.tsx` | Kaneo `apps/web/src/components/settings/api-key-table.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/avatar-crop-dialog.tsx` | Kaneo `apps/web/src/components/settings/avatar-crop-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/create-api-key-dialog.tsx` | Kaneo `apps/web/src/components/settings/create-api-key-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/settings-org-header.tsx` | Kaneo `apps/web/src/components/settings/settings-org-header.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/settings/settings-section-nav.tsx` | Kaneo `apps/web/src/components/settings/settings-section-nav.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/archive-tasks-modal.tsx` | Kaneo `apps/web/src/components/shared/modals/archive-tasks-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/create-board-modal.tsx` | Kaneo `apps/web/src/components/shared/modals/create-board-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/create-data-table-modal.tsx` | Kaneo `apps/web/src/components/shared/modals/create-data-table-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/create-organization-modal.tsx` | Kaneo `apps/web/src/components/shared/modals/create-organization-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/create-task-modal.tsx` | Kaneo `apps/web/src/components/shared/modals/create-task-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/shared/modals/title-token-suggestions.tsx` | Kaneo `apps/web/src/components/shared/modals/title-token-suggestions.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/sidebar-sort.tsx` | Kaneo `apps/web/src/components/sidebar-sort.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/attachment-context-menu.tsx` | Kaneo `apps/web/src/components/task/attachment-context-menu.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/create-task-action.tsx` | Kaneo `apps/web/src/components/task/create-task-action.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/create-task-topbar.tsx` | Kaneo `apps/web/src/components/task/create-task-topbar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/description-resources.ts` | Kaneo `apps/web/src/components/task/description-resources.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/attachment-card.tsx` | Kaneo `apps/web/src/components/task/extensions/attachment-card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/details-block.ts` | Kaneo `apps/web/src/components/task/extensions/details-block.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/embed-block.ts` | Kaneo `apps/web/src/components/task/extensions/embed-block.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/kaneo-issue-link.tsx` | Kaneo `apps/web/src/components/task/extensions/kaneo-issue-link.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/kaneo-mention.tsx` | Kaneo `apps/web/src/components/task/extensions/kaneo-mention.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/mention-list.tsx` | Kaneo `apps/web/src/components/task/extensions/mention-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/mention-suggestion.tsx` | Kaneo `apps/web/src/components/task/extensions/mention-suggestion.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/mermaid-block.ts` | Kaneo `apps/web/src/components/task/extensions/mermaid-block.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/reference-list.tsx` | Kaneo `apps/web/src/components/task/extensions/reference-list.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/reference-suggestion.tsx` | Kaneo `apps/web/src/components/task/extensions/reference-suggestion.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/resizable-image.tsx` | Kaneo `apps/web/src/components/task/extensions/resizable-image.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/shiki-code-block.ts` | Kaneo `apps/web/src/components/task/extensions/shiki-code-block.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/task-item-with-checkbox.tsx` | Kaneo `apps/web/src/components/task/extensions/task-item-with-checkbox.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/extensions/url-safety.ts` | Kaneo `apps/web/src/components/task/extensions/url-safety.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/label-source.ts` | Kaneo `apps/web/src/components/task/label-source.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/milestone-badge.tsx` | Kaneo `apps/web/src/components/task/milestone-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/parent-task-options.ts` | Kaneo `apps/web/src/components/task/parent-task-options.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/relation-direction.ts` | Kaneo `apps/web/src/components/task/relation-direction.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/resource-picker-row.tsx` | Kaneo `apps/web/src/components/task/resource-picker-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/resource-sync-badge.tsx` | Kaneo `apps/web/src/components/task/resource-sync-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/slash-trigger.ts` | Kaneo `apps/web/src/components/task/slash-trigger.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/subtask-assignee-popover.tsx` | Kaneo `apps/web/src/components/task/subtask-assignee-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/subtask-of-badge.tsx` | Kaneo `apps/web/src/components/task/subtask-of-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/subtask-priority-popover.tsx` | Kaneo `apps/web/src/components/task/subtask-priority-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/subtask-row.tsx` | Kaneo `apps/web/src/components/task/subtask-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/subtask-status-popover.tsx` | Kaneo `apps/web/src/components/task/subtask-status-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-assignee-avatar.tsx` | Kaneo `apps/web/src/components/task/task-assignee-avatar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-assignee-popover.tsx` | Kaneo `apps/web/src/components/task/task-assignee-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-description-editor.tsx` | Kaneo `apps/web/src/components/task/task-description-editor.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-description-history.tsx` | Kaneo `apps/web/src/components/task/task-description-history.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-description.tsx` | Kaneo `apps/web/src/components/task/task-description.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-details-content.tsx` | Kaneo `apps/web/src/components/task/task-details-content.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-details-sheet.tsx` | Kaneo `apps/web/src/components/task/task-details-sheet.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-due-date-badge.tsx` | Kaneo `apps/web/src/components/task/task-due-date-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-due-date-popover.tsx` | Kaneo `apps/web/src/components/task/task-due-date-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-follow-toggle.tsx` | Kaneo `apps/web/src/components/task/task-follow-toggle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-labels-popover.tsx` | Kaneo `apps/web/src/components/task/task-labels-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-labels-row.tsx` | Kaneo `apps/web/src/components/task/task-labels-row.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-markdown.ts` | Kaneo `apps/web/src/components/task/task-markdown.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-milestone-picker.tsx` | Kaneo `apps/web/src/components/task/task-milestone-picker.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-move-popover.tsx` | Kaneo `apps/web/src/components/task/task-move-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-page-skeleton.tsx` | Kaneo `apps/web/src/components/task/task-page-skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-priority-popover.tsx` | Kaneo `apps/web/src/components/task/task-priority-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-properties-sidebar.tsx` | Kaneo `apps/web/src/components/task/task-properties-sidebar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-relations.tsx` | Kaneo `apps/web/src/components/task/task-relations.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-repo-label-visibility.ts` | Kaneo `apps/web/src/components/task/task-repo-label-visibility.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-resource-indicators.tsx` | Kaneo `apps/web/src/components/task/task-resource-indicators.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-resource-links.ts` | Kaneo `apps/web/src/components/task/task-resource-links.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-resources.tsx` | Kaneo `apps/web/src/components/task/task-resources.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-start-date-popover.tsx` | Kaneo `apps/web/src/components/task/task-start-date-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-status-popover.tsx` | Kaneo `apps/web/src/components/task/task-status-popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-subtasks.tsx` | Kaneo `apps/web/src/components/task/task-subtasks.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-synced-issue-property.tsx` | Kaneo `apps/web/src/components/task/task-synced-issue-property.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-template-menu.tsx` | Kaneo `apps/web/src/components/task/task-template-menu.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-title.tsx` | Kaneo `apps/web/src/components/task/task-title.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-topbar-controls.tsx` | Kaneo `apps/web/src/components/task/task-topbar-controls.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/task-topbar-milestone.tsx` | Kaneo `apps/web/src/components/task/task-topbar-milestone.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/task/todo-progress-badge.tsx` | Kaneo `apps/web/src/components/task/todo-progress-badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team-view-selector.tsx` | Kaneo `apps/web/src/components/team-view-selector.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/delete-team-member-modal.tsx` | Kaneo `apps/web/src/components/team/delete-team-member-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/invite-team-member-modal.tsx` | Kaneo `apps/web/src/components/team/invite-team-member-modal.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/members-table.tsx` | Kaneo `apps/web/src/components/team/members-table.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/organization-members-groups.tsx` | Kaneo `apps/web/src/components/team/organization-members-groups.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/resolve-team-members-result.ts` | Kaneo `apps/web/src/components/team/resolve-team-members-result.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/team/team-member-count.tsx` | Kaneo `apps/web/src/components/team/team-member-count.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/theme-toggle-dropdown.tsx` | Kaneo `apps/web/src/components/theme-toggle-dropdown.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ticket/ticket-page.tsx` | Kaneo `apps/web/src/components/ticket/ticket-page.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/accordion.tsx` | Kaneo `apps/web/src/components/ui/accordion.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/alert-dialog.tsx` | Kaneo `apps/web/src/components/ui/alert-dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/alert.tsx` | Kaneo `apps/web/src/components/ui/alert.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/autocomplete.tsx` | Kaneo `apps/web/src/components/ui/autocomplete.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/avatar.tsx` | Kaneo `apps/web/src/components/ui/avatar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/badge.tsx` | Kaneo `apps/web/src/components/ui/badge.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/breadcrumb.tsx` | Kaneo `apps/web/src/components/ui/breadcrumb.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/button.tsx` | Kaneo `apps/web/src/components/ui/button.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/calendar.tsx` | Kaneo `apps/web/src/components/ui/calendar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/card.tsx` | Kaneo `apps/web/src/components/ui/card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/checkbox-group.tsx` | Kaneo `apps/web/src/components/ui/checkbox-group.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/checkbox.tsx` | Kaneo `apps/web/src/components/ui/checkbox.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/circular-progress.tsx` | Kaneo `apps/web/src/components/ui/circular-progress.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/collapsible.tsx` | Kaneo `apps/web/src/components/ui/collapsible.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/combobox.tsx` | Kaneo `apps/web/src/components/ui/combobox.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/command.tsx` | Kaneo `apps/web/src/components/ui/command.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/context-menu.tsx` | Kaneo `apps/web/src/components/ui/context-menu.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/dialog.tsx` | Kaneo `apps/web/src/components/ui/dialog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/empty.tsx` | Kaneo `apps/web/src/components/ui/empty.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/error-boundary.tsx` | Kaneo `apps/web/src/components/ui/error-boundary.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/error-display.tsx` | Kaneo `apps/web/src/components/ui/error-display.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/error-fallback.tsx` | Kaneo `apps/web/src/components/ui/error-fallback.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/error-test.tsx` | Kaneo `apps/web/src/components/ui/error-test.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/field.tsx` | Kaneo `apps/web/src/components/ui/field.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/fieldset.tsx` | Kaneo `apps/web/src/components/ui/fieldset.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/form.tsx` | Kaneo `apps/web/src/components/ui/form.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/frame.tsx` | Kaneo `apps/web/src/components/ui/frame.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/group.tsx` | Kaneo `apps/web/src/components/ui/group.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/input-group.tsx` | Kaneo `apps/web/src/components/ui/input-group.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/input-otp.tsx` | Kaneo `apps/web/src/components/ui/input-otp.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/input.tsx` | Kaneo `apps/web/src/components/ui/input.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/kbd.tsx` | Kaneo `apps/web/src/components/ui/kbd.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/label.tsx` | Kaneo `apps/web/src/components/ui/label.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/loading-skeleton.tsx` | Kaneo `apps/web/src/components/ui/loading-skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/menu.tsx` | Kaneo `apps/web/src/components/ui/menu.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/menubar.tsx` | Kaneo `apps/web/src/components/ui/menubar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/meter.tsx` | Kaneo `apps/web/src/components/ui/meter.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/number-field.tsx` | Kaneo `apps/web/src/components/ui/number-field.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/pagination.tsx` | Kaneo `apps/web/src/components/ui/pagination.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/popover.tsx` | Kaneo `apps/web/src/components/ui/popover.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/preview-card.tsx` | Kaneo `apps/web/src/components/ui/preview-card.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/progress.tsx` | Kaneo `apps/web/src/components/ui/progress.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/radio-group.tsx` | Kaneo `apps/web/src/components/ui/radio-group.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/scroll-area.tsx` | Kaneo `apps/web/src/components/ui/scroll-area.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/select.tsx` | Kaneo `apps/web/src/components/ui/select.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/separator.tsx` | Kaneo `apps/web/src/components/ui/separator.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/sheet.tsx` | Kaneo `apps/web/src/components/ui/sheet.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/shortcut-number.tsx` | Kaneo `apps/web/src/components/ui/shortcut-number.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/sidebar.tsx` | Kaneo `apps/web/src/components/ui/sidebar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/skeleton.tsx` | Kaneo `apps/web/src/components/ui/skeleton.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/slider.tsx` | Kaneo `apps/web/src/components/ui/slider.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/spinner.tsx` | Kaneo `apps/web/src/components/ui/spinner.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/switch.tsx` | Kaneo `apps/web/src/components/ui/switch.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/table.tsx` | Kaneo `apps/web/src/components/ui/table.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/tabs.tsx` | Kaneo `apps/web/src/components/ui/tabs.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/textarea.tsx` | Kaneo `apps/web/src/components/ui/textarea.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/timeline.tsx` | Kaneo `apps/web/src/components/ui/timeline.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/toast.tsx` | Kaneo `apps/web/src/components/ui/toast.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/toggle-group.tsx` | Kaneo `apps/web/src/components/ui/toggle-group.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/toggle.tsx` | Kaneo `apps/web/src/components/ui/toggle.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/toolbar.tsx` | Kaneo `apps/web/src/components/ui/toolbar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/ui/tooltip.tsx` | Kaneo `apps/web/src/components/ui/tooltip.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/user-avatar.tsx` | Kaneo `apps/web/src/components/user-avatar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/components/version-display.tsx` | Kaneo `apps/web/src/components/version-display.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/board-icons.ts` | Kaneo `apps/web/src/constants/board-icons.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/column-icons.ts` | Kaneo `apps/web/src/constants/column-icons.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/columns.ts` | Kaneo `apps/web/src/constants/columns.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/label-colors.ts` | Kaneo `apps/web/src/constants/label-colors.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/priority-colors.ts` | Kaneo `apps/web/src/constants/priority-colors.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/shortcuts.ts` | Kaneo `apps/web/src/constants/shortcuts.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/task-statuses.ts` | Kaneo `apps/web/src/constants/task-statuses.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/constants/urls.ts` | Kaneo `apps/web/src/constants/urls.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/account-authentication.ts` | Kaneo `apps/web/src/fetchers/account-authentication.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/activity/create-activity.ts` | Kaneo `apps/web/src/fetchers/activity/create-activity.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/activity/get-activites-by-task-id.ts` | Kaneo `apps/web/src/fetchers/activity/get-activites-by-task-id.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/agent/create-agent.ts` | Kaneo `apps/web/src/fetchers/agent/create-agent.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/agent/delete-agent.ts` | Kaneo `apps/web/src/fetchers/agent/delete-agent.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/agent/get-agents.ts` | Kaneo `apps/web/src/fetchers/agent/get-agents.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/ai/get-ai-settings.ts` | Kaneo `apps/web/src/fetchers/ai/get-ai-settings.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/archive-board.ts` | Kaneo `apps/web/src/fetchers/board/archive-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/create-board.ts` | Kaneo `apps/web/src/fetchers/board/create-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/delete-board.ts` | Kaneo `apps/web/src/fetchers/board/delete-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/get-board.ts` | Kaneo `apps/web/src/fetchers/board/get-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/get-boards.ts` | Kaneo `apps/web/src/fetchers/board/get-boards.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/get-public-board.ts` | Kaneo `apps/web/src/fetchers/board/get-public-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/resolve-board-slug.ts` | Kaneo `apps/web/src/fetchers/board/resolve-board-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/board/update-board.ts` | Kaneo `apps/web/src/fetchers/board/update-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/column/create-column.ts` | Kaneo `apps/web/src/fetchers/column/create-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/column/delete-column.ts` | Kaneo `apps/web/src/fetchers/column/delete-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/column/get-columns.ts` | Kaneo `apps/web/src/fetchers/column/get-columns.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/column/reorder-columns.ts` | Kaneo `apps/web/src/fetchers/column/reorder-columns.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/column/update-column.ts` | Kaneo `apps/web/src/fetchers/column/update-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/comment/create-comment.ts` | Kaneo `apps/web/src/fetchers/comment/create-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/comment/delete-comment.ts` | Kaneo `apps/web/src/fetchers/comment/delete-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/comment/update-comment.ts` | Kaneo `apps/web/src/fetchers/comment/update-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/config/get-config.ts` | Kaneo `apps/web/src/fetchers/config/get-config.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/data-table/data-table.ts` | Kaneo `apps/web/src/fetchers/data-table/data-table.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/discord-integration/create-discord-integration.ts` | Kaneo `apps/web/src/fetchers/discord-integration/create-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/discord-integration/delete-discord-integration.ts` | Kaneo `apps/web/src/fetchers/discord-integration/delete-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/discord-integration/get-discord-integration.ts` | Kaneo `apps/web/src/fetchers/discord-integration/get-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/discord-integration/update-discord-integration.ts` | Kaneo `apps/web/src/fetchers/discord-integration/update-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/external-link/create-resource-link.ts` | Kaneo `apps/web/src/fetchers/external-link/create-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/external-link/delete-resource-link.ts` | Kaneo `apps/web/src/fetchers/external-link/delete-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/external-link/get-external-links.ts` | Kaneo `apps/web/src/fetchers/external-link/get-external-links.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/flag/create-task-flag.ts` | Kaneo `apps/web/src/fetchers/flag/create-task-flag.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/flag/get-board-flag-types.ts` | Kaneo `apps/web/src/fetchers/flag/get-board-flag-types.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/flag/get-my-flags.ts` | Kaneo `apps/web/src/fetchers/flag/get-my-flags.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/flag/get-task-flags.ts` | Kaneo `apps/web/src/fetchers/flag/get-task-flags.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/flag/resolve-task-flag.ts` | Kaneo `apps/web/src/fetchers/flag/resolve-task-flag.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/generic-webhook-integration/create-generic-webhook-integration.ts` | Kaneo `apps/web/src/fetchers/generic-webhook-integration/create-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/generic-webhook-integration/delete-generic-webhook-integration.ts` | Kaneo `apps/web/src/fetchers/generic-webhook-integration/delete-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/generic-webhook-integration/get-generic-webhook-integration.ts` | Kaneo `apps/web/src/fetchers/generic-webhook-integration/get-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/generic-webhook-integration/update-generic-webhook-integration.ts` | Kaneo `apps/web/src/fetchers/generic-webhook-integration/update-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/get-api-url.ts` | Kaneo `apps/web/src/fetchers/get-api-url.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/get-ws-url.ts` | Kaneo `apps/web/src/fetchers/get-ws-url.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/create-gitea-integration.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/create-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/delete-gitea-integration.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/delete-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/get-gitea-integration.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/get-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/import-gitea-issues.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/import-gitea-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/list-gitea-repositories.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/list-gitea-repositories.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/update-gitea-integration.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/update-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/gitea-integration/verify-gitea-access.ts` | Kaneo `apps/web/src/fetchers/gitea-integration/verify-gitea-access.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-delegation.ts` | Kaneo `apps/web/src/fetchers/github-delegation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/create-github-integration.ts` | Kaneo `apps/web/src/fetchers/github-integration/create-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/delete-github-integration.ts` | Kaneo `apps/web/src/fetchers/github-integration/delete-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/get-app-info.ts` | Kaneo `apps/web/src/fetchers/github-integration/get-app-info.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/get-github-integration.ts` | Kaneo `apps/web/src/fetchers/github-integration/get-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/import-github-issues.ts` | Kaneo `apps/web/src/fetchers/github-integration/import-github-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/list-repositories.ts` | Kaneo `apps/web/src/fetchers/github-integration/list-repositories.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/update-github-integration.ts` | Kaneo `apps/web/src/fetchers/github-integration/update-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/github-integration/verify-github-installation.ts` | Kaneo `apps/web/src/fetchers/github-integration/verify-github-installation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/instance/get-instance-status.ts` | Kaneo `apps/web/src/fetchers/instance/get-instance-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/invitation/get-invitation-details.ts` | Kaneo `apps/web/src/fetchers/invitation/get-invitation-details.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/invitation/get-pending-invitations.ts` | Kaneo `apps/web/src/fetchers/invitation/get-pending-invitations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/label/create-label.ts` | Kaneo `apps/web/src/fetchers/label/create-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/label/delete-label.ts` | Kaneo `apps/web/src/fetchers/label/delete-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/label/get-label-by-organization.ts` | Kaneo `apps/web/src/fetchers/label/get-label-by-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/label/get-labels-by-task.ts` | Kaneo `apps/web/src/fetchers/label/get-labels-by-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/label/update-label.ts` | Kaneo `apps/web/src/fetchers/label/update-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/mcp/get-authorization-request.ts` | Kaneo `apps/web/src/fetchers/mcp/get-authorization-request.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/mcp/submit-authorization-decision.ts` | Kaneo `apps/web/src/fetchers/mcp/submit-authorization-decision.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/assign-milestone-to-task.ts` | Kaneo `apps/web/src/fetchers/milestone/assign-milestone-to-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/create-milestone.ts` | Kaneo `apps/web/src/fetchers/milestone/create-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/delete-milestone.ts` | Kaneo `apps/web/src/fetchers/milestone/delete-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/get-milestone.ts` | Kaneo `apps/web/src/fetchers/milestone/get-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/get-milestones-by-board.ts` | Kaneo `apps/web/src/fetchers/milestone/get-milestones-by-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/milestone/update-milestone.ts` | Kaneo `apps/web/src/fetchers/milestone/update-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification-preferences/delete-notification-organization-rule.ts` | Kaneo `apps/web/src/fetchers/notification-preferences/delete-notification-organization-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification-preferences/get-notification-preferences.ts` | Kaneo `apps/web/src/fetchers/notification-preferences/get-notification-preferences.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification-preferences/update-notification-preferences.ts` | Kaneo `apps/web/src/fetchers/notification-preferences/update-notification-preferences.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification-preferences/upsert-notification-organization-rule.ts` | Kaneo `apps/web/src/fetchers/notification-preferences/upsert-notification-organization-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/clear-notifications.ts` | Kaneo `apps/web/src/fetchers/notification/clear-notifications.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/delete-notification.ts` | Kaneo `apps/web/src/fetchers/notification/delete-notification.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/get-notifications.ts` | Kaneo `apps/web/src/fetchers/notification/get-notifications.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/get-unread-notification-count.ts` | Kaneo `apps/web/src/fetchers/notification/get-unread-notification-count.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/mark-all-notifications-as-read.ts` | Kaneo `apps/web/src/fetchers/notification/mark-all-notifications-as-read.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/notification/mark-notification-as-read.ts` | Kaneo `apps/web/src/fetchers/notification/mark-notification-as-read.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/oauth/get-id-token.ts` | Kaneo `apps/web/src/fetchers/oauth/get-id-token.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-github/organization-github.ts` | Kaneo `apps/web/src/fetchers/organization-github/organization-github.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-member/delete-organization-member.ts` | Kaneo `apps/web/src/fetchers/organization-member/delete-organization-member.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-member/get-active-organization-members.ts` | Kaneo `apps/web/src/fetchers/organization-member/get-active-organization-members.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-member/get-organization-members.ts` | Kaneo `apps/web/src/fetchers/organization-member/get-organization-members.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-member/get-organization-principals.ts` | Kaneo `apps/web/src/fetchers/organization-member/get-organization-principals.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization-member/invite-organization-member.ts` | Kaneo `apps/web/src/fetchers/organization-member/invite-organization-member.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization/create-organization.ts` | Kaneo `apps/web/src/fetchers/organization/create-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization/delete-organization.ts` | Kaneo `apps/web/src/fetchers/organization/delete-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization/get-organizations.ts` | Kaneo `apps/web/src/fetchers/organization/get-organizations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/organization/update-organization.ts` | Kaneo `apps/web/src/fetchers/organization/update-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/add-project-ticket.ts` | Kaneo `apps/web/src/fetchers/project/add-project-ticket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/archive-project.ts` | Kaneo `apps/web/src/fetchers/project/archive-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/assign-project-ticket-milestone.ts` | Kaneo `apps/web/src/fetchers/project/assign-project-ticket-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/complete-project-milestone.ts` | Kaneo `apps/web/src/fetchers/project/complete-project-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/create-project-milestone.ts` | Kaneo `apps/web/src/fetchers/project/create-project-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/create-project-resource-link.ts` | Kaneo `apps/web/src/fetchers/project/create-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/create-project-update.ts` | Kaneo `apps/web/src/fetchers/project/create-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/create-project.ts` | Kaneo `apps/web/src/fetchers/project/create-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/delete-project-milestone.ts` | Kaneo `apps/web/src/fetchers/project/delete-project-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/delete-project-resource-link.ts` | Kaneo `apps/web/src/fetchers/project/delete-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/delete-project-update.ts` | Kaneo `apps/web/src/fetchers/project/delete-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/get-project-milestones.ts` | Kaneo `apps/web/src/fetchers/project/get-project-milestones.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/get-project-resources.ts` | Kaneo `apps/web/src/fetchers/project/get-project-resources.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/get-project-tickets.ts` | Kaneo `apps/web/src/fetchers/project/get-project-tickets.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/get-project.ts` | Kaneo `apps/web/src/fetchers/project/get-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/get-projects.ts` | Kaneo `apps/web/src/fetchers/project/get-projects.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/list-project-updates.ts` | Kaneo `apps/web/src/fetchers/project/list-project-updates.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/remove-project-ticket.ts` | Kaneo `apps/web/src/fetchers/project/remove-project-ticket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/rename-project-slug.ts` | Kaneo `apps/web/src/fetchers/project/rename-project-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/reopen-project-milestone.ts` | Kaneo `apps/web/src/fetchers/project/reopen-project-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/resolve-project-slug.ts` | Kaneo `apps/web/src/fetchers/project/resolve-project-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/unarchive-project.ts` | Kaneo `apps/web/src/fetchers/project/unarchive-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/update-project-milestone.ts` | Kaneo `apps/web/src/fetchers/project/update-project-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/update-project-resource-link.ts` | Kaneo `apps/web/src/fetchers/project/update-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/update-project-update.ts` | Kaneo `apps/web/src/fetchers/project/update-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/project/update-project.ts` | Kaneo `apps/web/src/fetchers/project/update-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/delete-repo.ts` | Kaneo `apps/web/src/fetchers/repo/delete-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-pull-request-checks.ts` | Kaneo `apps/web/src/fetchers/repo/get-pull-request-checks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-pull-request-commits.ts` | Kaneo `apps/web/src/fetchers/repo/get-pull-request-commits.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-pull-request-files.ts` | Kaneo `apps/web/src/fetchers/repo/get-pull-request-files.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-pull-request-reviews.ts` | Kaneo `apps/web/src/fetchers/repo/get-pull-request-reviews.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-contents.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-contents.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-github-metadata.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-github-metadata.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-issue.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-issue.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-issues.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-pull-request.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-pull-request.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-pull-requests.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-pull-requests.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo-tree.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo-tree.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repo.ts` | Kaneo `apps/web/src/fetchers/repo/get-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/get-repos.ts` | Kaneo `apps/web/src/fetchers/repo/get-repos.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/repo/update-repo.ts` | Kaneo `apps/web/src/fetchers/repo/update-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/search/global-search.ts` | Kaneo `apps/web/src/fetchers/search/global-search.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/slack-integration/create-slack-integration.ts` | Kaneo `apps/web/src/fetchers/slack-integration/create-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/slack-integration/delete-slack-integration.ts` | Kaneo `apps/web/src/fetchers/slack-integration/delete-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/slack-integration/get-slack-integration.ts` | Kaneo `apps/web/src/fetchers/slack-integration/get-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/slack-integration/update-slack-integration.ts` | Kaneo `apps/web/src/fetchers/slack-integration/update-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task-relation/create-task-relation.ts` | Kaneo `apps/web/src/fetchers/task-relation/create-task-relation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task-relation/delete-task-relation.ts` | Kaneo `apps/web/src/fetchers/task-relation/delete-task-relation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task-relation/get-board-task-relations.ts` | Kaneo `apps/web/src/fetchers/task-relation/get-board-task-relations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task-relation/get-task-relations.ts` | Kaneo `apps/web/src/fetchers/task-relation/get-task-relations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/bulk-operation.ts` | Kaneo `apps/web/src/fetchers/task/bulk-operation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/create-image-upload.ts` | Kaneo `apps/web/src/fetchers/task/create-image-upload.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/create-task.ts` | Kaneo `apps/web/src/fetchers/task/create-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/delete-task.ts` | Kaneo `apps/web/src/fetchers/task/delete-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/export-tasks.ts` | Kaneo `apps/web/src/fetchers/task/export-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-my-tasks.ts` | Kaneo `apps/web/src/fetchers/task/get-my-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-task-following.ts` | Kaneo `apps/web/src/fetchers/task/get-task-following.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-task-repo-links.ts` | Kaneo `apps/web/src/fetchers/task/get-task-repo-links.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-task.ts` | Kaneo `apps/web/src/fetchers/task/get-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-tasks.ts` | Kaneo `apps/web/src/fetchers/task/get-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/get-trashed-tasks.ts` | Kaneo `apps/web/src/fetchers/task/get-trashed-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/import-tasks.ts` | Kaneo `apps/web/src/fetchers/task/import-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/move-task.ts` | Kaneo `apps/web/src/fetchers/task/move-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/permanently-delete-task.ts` | Kaneo `apps/web/src/fetchers/task/permanently-delete-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/reorder-tasks.ts` | Kaneo `apps/web/src/fetchers/task/reorder-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/restore-task.ts` | Kaneo `apps/web/src/fetchers/task/restore-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/set-task-archived.ts` | Kaneo `apps/web/src/fetchers/task/set-task-archived.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/set-task-following.ts` | Kaneo `apps/web/src/fetchers/task/set-task-following.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-assignee.ts` | Kaneo `apps/web/src/fetchers/task/update-task-assignee.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-description.ts` | Kaneo `apps/web/src/fetchers/task/update-task-description.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-due-date.ts` | Kaneo `apps/web/src/fetchers/task/update-task-due-date.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-priority.ts` | Kaneo `apps/web/src/fetchers/task/update-task-priority.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-status.ts` | Kaneo `apps/web/src/fetchers/task/update-task-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task-title.ts` | Kaneo `apps/web/src/fetchers/task/update-task-title.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/task/update-task.ts` | Kaneo `apps/web/src/fetchers/task/update-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/team/team-hierarchy.ts` | Kaneo `apps/web/src/fetchers/team/team-hierarchy.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/telegram-integration/create-telegram-integration.ts` | Kaneo `apps/web/src/fetchers/telegram-integration/create-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/telegram-integration/delete-telegram-integration.ts` | Kaneo `apps/web/src/fetchers/telegram-integration/delete-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/telegram-integration/get-telegram-integration.ts` | Kaneo `apps/web/src/fetchers/telegram-integration/get-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/telegram-integration/update-telegram-integration.ts` | Kaneo `apps/web/src/fetchers/telegram-integration/update-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/ticket/resolve-ticket-identity.ts` | Kaneo `apps/web/src/fetchers/ticket/resolve-ticket-identity.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/time-entry/create-time-entry.ts` | Kaneo `apps/web/src/fetchers/time-entry/create-time-entry.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/time-entry/get-time-entries.ts` | Kaneo `apps/web/src/fetchers/time-entry/get-time-entries.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/time-entry/update-time-entry.ts` | Kaneo `apps/web/src/fetchers/time-entry/update-time-entry.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/user/delete-avatar.ts` | Kaneo `apps/web/src/fetchers/user/delete-avatar.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/user/upload-avatar.ts` | Kaneo `apps/web/src/fetchers/user/upload-avatar.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/workflow-rule/delete-workflow-rule.ts` | Kaneo `apps/web/src/fetchers/workflow-rule/delete-workflow-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/workflow-rule/get-workflow-rules.ts` | Kaneo `apps/web/src/fetchers/workflow-rule/get-workflow-rules.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/fetchers/workflow-rule/upsert-workflow-rule.ts` | Kaneo `apps/web/src/fetchers/workflow-rule/upsert-workflow-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/data-table/use-data-tables.ts` | Kaneo `apps/web/src/hooks/data-table/use-data-tables.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/agent/invalidate-agent-membership-queries.ts` | Kaneo `apps/web/src/hooks/mutations/agent/invalidate-agent-membership-queries.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/agent/use-create-agent.ts` | Kaneo `apps/web/src/hooks/mutations/agent/use-create-agent.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/agent/use-delete-agent.ts` | Kaneo `apps/web/src/hooks/mutations/agent/use-delete-agent.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/api-key/use-create-api-key.ts` | Kaneo `apps/web/src/hooks/mutations/api-key/use-create-api-key.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/api-key/use-delete-api-key.ts` | Kaneo `apps/web/src/hooks/mutations/api-key/use-delete-api-key.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/board/use-archive-board.ts` | Kaneo `apps/web/src/hooks/mutations/board/use-archive-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/board/use-create-board.ts` | Kaneo `apps/web/src/hooks/mutations/board/use-create-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/board/use-delete-board.ts` | Kaneo `apps/web/src/hooks/mutations/board/use-delete-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/board/use-update-board.ts` | Kaneo `apps/web/src/hooks/mutations/board/use-update-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/column/use-create-column.ts` | Kaneo `apps/web/src/hooks/mutations/column/use-create-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/column/use-delete-column.ts` | Kaneo `apps/web/src/hooks/mutations/column/use-delete-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/column/use-reorder-columns.ts` | Kaneo `apps/web/src/hooks/mutations/column/use-reorder-columns.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/column/use-update-column.ts` | Kaneo `apps/web/src/hooks/mutations/column/use-update-column.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/comment/use-create-comment.ts` | Kaneo `apps/web/src/hooks/mutations/comment/use-create-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/comment/use-delete-comment.ts` | Kaneo `apps/web/src/hooks/mutations/comment/use-delete-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/comment/use-update-comment.ts` | Kaneo `apps/web/src/hooks/mutations/comment/use-update-comment.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/discord-integration/use-discord-integration.ts` | Kaneo `apps/web/src/hooks/mutations/discord-integration/use-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/flag/use-create-task-flag.ts` | Kaneo `apps/web/src/hooks/mutations/flag/use-create-task-flag.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/flag/use-resolve-task-flag.ts` | Kaneo `apps/web/src/hooks/mutations/flag/use-resolve-task-flag.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/generic-webhook-integration/use-generic-webhook-integration.ts` | Kaneo `apps/web/src/hooks/mutations/generic-webhook-integration/use-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/gitea-integration/use-create-gitea-integration.ts` | Kaneo `apps/web/src/hooks/mutations/gitea-integration/use-create-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/gitea-integration/use-import-gitea-issues.ts` | Kaneo `apps/web/src/hooks/mutations/gitea-integration/use-import-gitea-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/gitea-integration/use-update-gitea-integration.ts` | Kaneo `apps/web/src/hooks/mutations/gitea-integration/use-update-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/github-delegation/use-github-delegation.ts` | Kaneo `apps/web/src/hooks/mutations/github-delegation/use-github-delegation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/github-integration/use-create-github-integration.ts` | Kaneo `apps/web/src/hooks/mutations/github-integration/use-create-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/github-integration/use-import-github-issues.ts` | Kaneo `apps/web/src/hooks/mutations/github-integration/use-import-github-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/github-integration/use-update-github-integration.ts` | Kaneo `apps/web/src/hooks/mutations/github-integration/use-update-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/invalidate-user-profile-queries.ts` | Kaneo `apps/web/src/hooks/mutations/invalidate-user-profile-queries.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/label/sync-task-labels-cache.ts` | Kaneo `apps/web/src/hooks/mutations/label/sync-task-labels-cache.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/label/use-create-label.ts` | Kaneo `apps/web/src/hooks/mutations/label/use-create-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/label/use-delete-label.ts` | Kaneo `apps/web/src/hooks/mutations/label/use-delete-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/label/use-update-label.ts` | Kaneo `apps/web/src/hooks/mutations/label/use-update-label.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/mcp/use-authorization-decision.ts` | Kaneo `apps/web/src/hooks/mutations/mcp/use-authorization-decision.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/milestone/use-assign-milestone-to-task.ts` | Kaneo `apps/web/src/hooks/mutations/milestone/use-assign-milestone-to-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/milestone/use-create-milestone.ts` | Kaneo `apps/web/src/hooks/mutations/milestone/use-create-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/milestone/use-delete-milestone.ts` | Kaneo `apps/web/src/hooks/mutations/milestone/use-delete-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/milestone/use-update-milestone.ts` | Kaneo `apps/web/src/hooks/mutations/milestone/use-update-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/notification-preferences/use-notification-preferences.ts` | Kaneo `apps/web/src/hooks/mutations/notification-preferences/use-notification-preferences.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/notification/use-clear-notifications.ts` | Kaneo `apps/web/src/hooks/mutations/notification/use-clear-notifications.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/notification/use-delete-notification.ts` | Kaneo `apps/web/src/hooks/mutations/notification/use-delete-notification.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/notification/use-mark-all-notifications-as-read.ts` | Kaneo `apps/web/src/hooks/mutations/notification/use-mark-all-notifications-as-read.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/notification/use-mark-notification-as-read.ts` | Kaneo `apps/web/src/hooks/mutations/notification/use-mark-notification-as-read.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-github/use-organization-github-installations.ts` | Kaneo `apps/web/src/hooks/mutations/organization-github/use-organization-github-installations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-accept-invitation.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-accept-invitation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-cancel-invitation.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-cancel-invitation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-delete-organization-member.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-delete-organization-member.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-invite-organization-member.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-invite-organization-member.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-reject-invitation.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-reject-invitation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization-member/use-update-organization-member-role.ts` | Kaneo `apps/web/src/hooks/mutations/organization-member/use-update-organization-member-role.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-create-organization-role.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-create-organization-role.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-delete-organization-role.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-delete-organization-role.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-delete-organization.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-delete-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-transfer-organization-ownership.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-transfer-organization-ownership.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-update-organization-role.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-update-organization-role.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-update-organization-slug.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-update-organization-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/organization/use-update-organization.ts` | Kaneo `apps/web/src/hooks/mutations/organization/use-update-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-add-project-ticket.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-add-project-ticket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-archive-project.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-archive-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-assign-project-ticket-milestone.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-assign-project-ticket-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-create-project-resource-link.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-create-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-create-project-update.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-create-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-create-project.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-create-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-delete-project-resource-link.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-delete-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-delete-project-update.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-delete-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-project-milestone-mutations.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-project-milestone-mutations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-remove-project-ticket.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-remove-project-ticket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-rename-project-slug.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-rename-project-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-unarchive-project.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-unarchive-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-update-project-resource-link.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-update-project-resource-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-update-project-update.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-update-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/project/use-update-project.ts` | Kaneo `apps/web/src/hooks/mutations/project/use-update-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/repo/use-delete-repo.ts` | Kaneo `apps/web/src/hooks/mutations/repo/use-delete-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/repo/use-update-repo.ts` | Kaneo `apps/web/src/hooks/mutations/repo/use-update-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/slack-integration/use-slack-integration.ts` | Kaneo `apps/web/src/hooks/mutations/slack-integration/use-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task-relation/use-create-task-relation.ts` | Kaneo `apps/web/src/hooks/mutations/task-relation/use-create-task-relation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task-relation/use-delete-task-relation.ts` | Kaneo `apps/web/src/hooks/mutations/task-relation/use-delete-task-relation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-bulk-operations.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-bulk-operations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-create-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-create-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-delete-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-delete-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-export-tasks.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-export-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-import-tasks.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-import-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-move-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-move-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-permanently-delete-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-permanently-delete-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-reorder-tasks.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-reorder-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-restore-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-restore-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-set-task-archived.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-set-task-archived.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-set-task-following.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-set-task-following.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-assignee.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-assignee.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-description.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-description.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-due-date.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-due-date.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-status-priority.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-status-priority.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-status.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task-title.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task-title.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/task/use-update-task.ts` | Kaneo `apps/web/src/hooks/mutations/task/use-update-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/telegram-integration/use-telegram-integration.ts` | Kaneo `apps/web/src/hooks/mutations/telegram-integration/use-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/time-entry/use-create-time-entry.ts` | Kaneo `apps/web/src/hooks/mutations/time-entry/use-create-time-entry.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/time-entry/use-update-time-entry.ts` | Kaneo `apps/web/src/hooks/mutations/time-entry/use-update-time-entry.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-change-password.ts` | Kaneo `apps/web/src/hooks/mutations/use-change-password.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-delete-account.ts` | Kaneo `apps/web/src/hooks/mutations/use-delete-account.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-remove-user-avatar.ts` | Kaneo `apps/web/src/hooks/mutations/use-remove-user-avatar.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-send-password-reset.ts` | Kaneo `apps/web/src/hooks/mutations/use-send-password-reset.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-sign-in.ts` | Kaneo `apps/web/src/hooks/mutations/use-sign-in.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-sign-out.ts` | Kaneo `apps/web/src/hooks/mutations/use-sign-out.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-sign-up.ts` | Kaneo `apps/web/src/hooks/mutations/use-sign-up.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-update-user-avatar.ts` | Kaneo `apps/web/src/hooks/mutations/use-update-user-avatar.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/use-update-user-profile.ts` | Kaneo `apps/web/src/hooks/mutations/use-update-user-profile.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/workflow-rule/use-delete-workflow-rule.ts` | Kaneo `apps/web/src/hooks/mutations/workflow-rule/use-delete-workflow-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/mutations/workflow-rule/use-upsert-workflow-rule.ts` | Kaneo `apps/web/src/hooks/mutations/workflow-rule/use-upsert-workflow-rule.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/account-authentication/use-linked-authentication-identities.ts` | Kaneo `apps/web/src/hooks/queries/account-authentication/use-linked-authentication-identities.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/activity/use-get-activities-by-task-id.ts` | Kaneo `apps/web/src/hooks/queries/activity/use-get-activities-by-task-id.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/agent/use-get-agents.ts` | Kaneo `apps/web/src/hooks/queries/agent/use-get-agents.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/ai/use-get-ai-settings.ts` | Kaneo `apps/web/src/hooks/queries/ai/use-get-ai-settings.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/board/use-get-board.ts` | Kaneo `apps/web/src/hooks/queries/board/use-get-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/board/use-get-boards.ts` | Kaneo `apps/web/src/hooks/queries/board/use-get-boards.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/board/use-get-public-board.ts` | Kaneo `apps/web/src/hooks/queries/board/use-get-public-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/column/use-get-columns.ts` | Kaneo `apps/web/src/hooks/queries/column/use-get-columns.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/config/use-get-config.ts` | Kaneo `apps/web/src/hooks/queries/config/use-get-config.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/discord-integration/use-get-discord-integration.ts` | Kaneo `apps/web/src/hooks/queries/discord-integration/use-get-discord-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/external-link/use-external-links.ts` | Kaneo `apps/web/src/hooks/queries/external-link/use-external-links.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/flag/use-get-board-flag-types.ts` | Kaneo `apps/web/src/hooks/queries/flag/use-get-board-flag-types.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/flag/use-get-my-flags.ts` | Kaneo `apps/web/src/hooks/queries/flag/use-get-my-flags.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/flag/use-get-task-flags.ts` | Kaneo `apps/web/src/hooks/queries/flag/use-get-task-flags.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/generic-webhook-integration/use-get-generic-webhook-integration.ts` | Kaneo `apps/web/src/hooks/queries/generic-webhook-integration/use-get-generic-webhook-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/gitea-integration/use-get-gitea-integration.ts` | Kaneo `apps/web/src/hooks/queries/gitea-integration/use-get-gitea-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/github-delegation/use-github-delegation-status.ts` | Kaneo `apps/web/src/hooks/queries/github-delegation/use-github-delegation-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/github-integration/use-get-github-integration.ts` | Kaneo `apps/web/src/hooks/queries/github-integration/use-get-github-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/instance/use-instance-status.ts` | Kaneo `apps/web/src/hooks/queries/instance/use-instance-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/invitation/use-get-invitation-details.ts` | Kaneo `apps/web/src/hooks/queries/invitation/use-get-invitation-details.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/invitation/use-pending-invitations.ts` | Kaneo `apps/web/src/hooks/queries/invitation/use-pending-invitations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/label/use-get-labels-by-organization.ts` | Kaneo `apps/web/src/hooks/queries/label/use-get-labels-by-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/label/use-get-labels-by-task.ts` | Kaneo `apps/web/src/hooks/queries/label/use-get-labels-by-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/mcp/use-authorization-request.ts` | Kaneo `apps/web/src/hooks/queries/mcp/use-authorization-request.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/milestone/use-get-milestone.ts` | Kaneo `apps/web/src/hooks/queries/milestone/use-get-milestone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/milestone/use-get-milestones-by-board.ts` | Kaneo `apps/web/src/hooks/queries/milestone/use-get-milestones-by-board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/milestone/use-milestones-by-board-ids.ts` | Kaneo `apps/web/src/hooks/queries/milestone/use-milestones-by-board-ids.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/notification-preferences/use-get-notification-preferences.ts` | Kaneo `apps/web/src/hooks/queries/notification-preferences/use-get-notification-preferences.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/notification/use-get-notifications.ts` | Kaneo `apps/web/src/hooks/queries/notification/use-get-notifications.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/notification/use-get-unread-notification-count.ts` | Kaneo `apps/web/src/hooks/queries/notification/use-get-unread-notification-count.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-github/use-organization-github-installations.ts` | Kaneo `apps/web/src/hooks/queries/organization-github/use-organization-github-installations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-active-organization-member.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-active-organization-member.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-active-organization-members.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-active-organization-members.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-invitation.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-invitation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-organization-invites.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-organization-invites.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-organization-members.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-organization-members.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-organization-principals.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-organization-principals.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization-members/use-get-user-invitations.ts` | Kaneo `apps/web/src/hooks/queries/organization-members/use-get-user-invitations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-active-organization.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-active-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-create-organization.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-create-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-get-full-organization.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-get-full-organization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-get-organizations.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-get-organizations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-identity-aliases.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-identity-aliases.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/organization/use-organization-roles.ts` | Kaneo `apps/web/src/hooks/queries/organization/use-organization-roles.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-latest-project-update.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-latest-project-update.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-project-milestones.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-project-milestones.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-project-resources.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-project-resources.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-project-tickets.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-project-tickets.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-project-updates.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-project-updates.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-project.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-project.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/project/use-get-projects.ts` | Kaneo `apps/web/src/hooks/queries/project/use-get-projects.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-pull-request-checks.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-pull-request-checks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-pull-request-commits.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-pull-request-commits.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-pull-request-files.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-pull-request-files.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-pull-request-reviews.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-pull-request-reviews.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-contents.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-contents.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-github-metadata.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-github-metadata.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-issue.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-issue.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-issues.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-issues.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-pull-request.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-pull-request.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-pull-requests.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-pull-requests.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo-tree.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo-tree.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repo.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repo.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/repo/use-get-repos.ts` | Kaneo `apps/web/src/hooks/queries/repo/use-get-repos.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/search/use-global-search.ts` | Kaneo `apps/web/src/hooks/queries/search/use-global-search.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/slack-integration/use-get-slack-integration.ts` | Kaneo `apps/web/src/hooks/queries/slack-integration/use-get-slack-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task-relation/use-get-board-task-relations.ts` | Kaneo `apps/web/src/hooks/queries/task-relation/use-get-board-task-relations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task-relation/use-get-task-relations.ts` | Kaneo `apps/web/src/hooks/queries/task-relation/use-get-task-relations.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-my-tasks.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-my-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-task-following.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-task-following.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-task-repo-links.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-task-repo-links.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-task.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-tasks.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-get-trashed-tasks.ts` | Kaneo `apps/web/src/hooks/queries/task/use-get-trashed-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/task/use-infinite-my-tasks.ts` | Kaneo `apps/web/src/hooks/queries/task/use-infinite-my-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/telegram-integration/use-get-telegram-integration.ts` | Kaneo `apps/web/src/hooks/queries/telegram-integration/use-get-telegram-integration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/time-entry/use-get-time-entries.ts` | Kaneo `apps/web/src/hooks/queries/time-entry/use-get-time-entries.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/use-get-api-keys.ts` | Kaneo `apps/web/src/hooks/queries/use-get-api-keys.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/queries/workflow-rule/use-get-workflow-rules.ts` | Kaneo `apps/web/src/hooks/queries/workflow-rule/use-get-workflow-rules.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-board-slug.ts` | Kaneo `apps/web/src/hooks/use-board-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-board-sort.ts` | Kaneo `apps/web/src/hooks/use-board-sort.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-board-websocket.ts` | Kaneo `apps/web/src/hooks/use-board-websocket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-keyboard-shortcuts.ts` | Kaneo `apps/web/src/hooks/use-keyboard-shortcuts.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-locale.ts` | Kaneo `apps/web/src/hooks/use-locale.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-mobile.ts` | Kaneo `apps/web/src/hooks/use-mobile.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-numbered-shortcuts.ts` | Kaneo `apps/web/src/hooks/use-numbered-shortcuts.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-organization-permission.ts` | Kaneo `apps/web/src/hooks/use-organization-permission.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-project-slug.ts` | Kaneo `apps/web/src/hooks/use-project-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-remembered-view.ts` | Kaneo `apps/web/src/hooks/use-remembered-view.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-task-filters-with-labels-support.ts` | Kaneo `apps/web/src/hooks/use-task-filters-with-labels-support.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-task-filters.ts` | Kaneo `apps/web/src/hooks/use-task-filters.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-user-preferences-effects.ts` | Kaneo `apps/web/src/hooks/use-user-preferences-effects.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/hooks/use-user-websocket.ts` | Kaneo `apps/web/src/hooks/use-user-websocket.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/index.css` | Kaneo `apps/web/src/index.css` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/ai-chat-size.ts` | Kaneo `apps/web/src/lib/ai-chat-size.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/archive-display.ts` | Kaneo `apps/web/src/lib/archive-display.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/auth-client.ts` | Kaneo `apps/web/src/lib/auth-client.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/avatar-crop.ts` | Kaneo `apps/web/src/lib/avatar-crop.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/avatar-tone.ts` | Kaneo `apps/web/src/lib/avatar-tone.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/board-nest-drop.ts` | Kaneo `apps/web/src/lib/board-nest-drop.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/board-view.ts` | Kaneo `apps/web/src/lib/board-view.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/branch-name.ts` | Kaneo `apps/web/src/lib/branch-name.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/cn.ts` | Kaneo `apps/web/src/lib/cn.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/column.tsx` | Kaneo `apps/web/src/lib/column.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/comment-blank-lines.ts` | Kaneo `apps/web/src/lib/comment-blank-lines.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/debounce.ts` | Kaneo `apps/web/src/lib/debounce.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/due-date-status.ts` | Kaneo `apps/web/src/lib/due-date-status.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-comment-draft.ts` | Kaneo `apps/web/src/lib/editor-comment-draft.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-image-resize.ts` | Kaneo `apps/web/src/lib/editor-image-resize.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-overlay-position.ts` | Kaneo `apps/web/src/lib/editor-overlay-position.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-reference-query.ts` | Kaneo `apps/web/src/lib/editor-reference-query.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-task-list-paste.ts` | Kaneo `apps/web/src/lib/editor-task-list-paste.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/editor-url-utils.ts` | Kaneo `apps/web/src/lib/editor-url-utils.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/error-handler.ts` | Kaneo `apps/web/src/lib/error-handler.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/format-duration.ts` | Kaneo `apps/web/src/lib/format-duration.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/format.ts` | Kaneo `apps/web/src/lib/format.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/generate-board-id.ts` | Kaneo `apps/web/src/lib/generate-board-id.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/generate-link.ts` | Kaneo `apps/web/src/lib/generate-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/get-click-coordinates.ts` | Kaneo `apps/web/src/lib/get-click-coordinates.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/get-initials.ts` | Kaneo `apps/web/src/lib/get-initials.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/group-inbox-notifications.ts` | Kaneo `apps/web/src/lib/group-inbox-notifications.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/group-subtasks.ts` | Kaneo `apps/web/src/lib/group-subtasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/i18n/domain.ts` | Kaneo `apps/web/src/lib/i18n/domain.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/i18n/index.ts` | Kaneo `apps/web/src/lib/i18n/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/i18n/provider.tsx` | Kaneo `apps/web/src/lib/i18n/provider.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/kanban-virtualization.ts` | Kaneo `apps/web/src/lib/kanban-virtualization.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/link-ticket-candidates.ts` | Kaneo `apps/web/src/lib/link-ticket-candidates.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/milestone-progress.ts` | Kaneo `apps/web/src/lib/milestone-progress.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/my-tasks-view.ts` | Kaneo `apps/web/src/lib/my-tasks-view.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/navigation-prefetch.ts` | Kaneo `apps/web/src/lib/navigation-prefetch.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/parse-invite-emails.ts` | Kaneo `apps/web/src/lib/parse-invite-emails.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/permissions.ts` | Kaneo `apps/web/src/lib/permissions.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/picker-group-cap.ts` | Kaneo `apps/web/src/lib/picker-group-cap.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/prepare-avatar-image.ts` | Kaneo `apps/web/src/lib/prepare-avatar-image.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/principal-picker-options.ts` | Kaneo `apps/web/src/lib/principal-picker-options.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/priority.tsx` | Kaneo `apps/web/src/lib/priority.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/project-sync-invalidation.ts` | Kaneo `apps/web/src/lib/project-sync-invalidation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/project-update-staleness.ts` | Kaneo `apps/web/src/lib/project-update-staleness.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/reconcile-task-details.ts` | Kaneo `apps/web/src/lib/reconcile-task-details.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/reorder-board-task.ts` | Kaneo `apps/web/src/lib/reorder-board-task.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/repo-issue-relation-link.ts` | Kaneo `apps/web/src/lib/repo-issue-relation-link.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/repo-sync-invalidation.ts` | Kaneo `apps/web/src/lib/repo-sync-invalidation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/resolve-assignee.ts` | Kaneo `apps/web/src/lib/resolve-assignee.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/resolve-avatar-src.ts` | Kaneo `apps/web/src/lib/resolve-avatar-src.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/resolve-icon.ts` | Kaneo `apps/web/src/lib/resolve-icon.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/search-references.ts` | Kaneo `apps/web/src/lib/search-references.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/shiki-highlighter.ts` | Kaneo `apps/web/src/lib/shiki-highlighter.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/sidebar-width.ts` | Kaneo `apps/web/src/lib/sidebar-width.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/sort-tasks.ts` | Kaneo `apps/web/src/lib/sort-tasks.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/status.tsx` | Kaneo `apps/web/src/lib/status.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/task-archival.ts` | Kaneo `apps/web/src/lib/task-archival.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/task-drawer-width.ts` | Kaneo `apps/web/src/lib/task-drawer-width.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/task-nesting-projection.ts` | Kaneo `apps/web/src/lib/task-nesting-projection.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/task-template-date-offset.ts` | Kaneo `apps/web/src/lib/task-template-date-offset.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/task-title-save.ts` | Kaneo `apps/web/src/lib/task-title-save.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/title-token-autocomplete.ts` | Kaneo `apps/web/src/lib/title-token-autocomplete.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/to-kebab-case.ts` | Kaneo `apps/web/src/lib/to-kebab-case.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/toast.ts` | Kaneo `apps/web/src/lib/toast.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/todo-progress.ts` | Kaneo `apps/web/src/lib/todo-progress.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/upload-repo-media.ts` | Kaneo `apps/web/src/lib/upload-repo-media.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/upload-task-image.ts` | Kaneo `apps/web/src/lib/upload-task-image.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/use-section-open-state.ts` | Kaneo `apps/web/src/lib/use-section-open-state.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/utils.ts` | Kaneo `apps/web/src/lib/utils.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/utils/create-organization-slug.ts` | Kaneo `apps/web/src/lib/utils/create-organization-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/lib/utils/create-slug.ts` | Kaneo `apps/web/src/lib/utils/create-slug.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/main.tsx` | Kaneo `apps/web/src/main.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/query-client/index.ts` | Kaneo `apps/web/src/query-client/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/routeTree.gen.ts` | Kaneo `apps/web/src/routeTree.gen.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/__root.tsx` | Kaneo `apps/web/src/routes/__root.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout.tsx` | Kaneo `apps/web/src/routes/_layout.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/$organizationSlug/tickets/$ticketKey.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/$organizationSlug/tickets/$ticketKey.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/admin.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/admin.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/invitations.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/invitations.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/backlog.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/backlog.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/board.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/board.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/calendar.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/calendar.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/gantt.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/gantt.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/milestones.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/milestones.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId_.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/board/$boardSlug/task/$taskId_.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/inbox.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/inbox.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/members.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/members.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/my-tasks.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/my-tasks.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/tickets.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/tickets.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/updates/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/$projectSlug/updates/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/projects/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/code.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/code.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/issues.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/issues.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/issues/$number.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/packages.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/packages.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/pulls/$number.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/releases.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/$repoId/releases.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/index.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/repo/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/search.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/search.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/table/$tableId.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/table/$tableId.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/trash.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/$organizationSlug/trash.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/organization/create.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/organization/create.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/authentication.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/authentication.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/connections.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/connections.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/developer.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/developer.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/github.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/github.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/information.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/information.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/notifications.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/notifications.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/account/preferences.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/account/preferences.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/boards.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/boards.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/general.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/general.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/integrations.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/integrations.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/visibility.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/visibility.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/workflow.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/boards/$boardId/workflow.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/connections.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/connections.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/agents.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/agents.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/ai.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/ai.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/connections.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/connections.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/features.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/features.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/general.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/general.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/github.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/github.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/labels.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/labels.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/roles.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/roles.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/teams.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/teams.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/templates.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/templates.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/organization/visibility.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/organization/visibility.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/repos.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/repos.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/dashboard/settings/repos/$repoId/visibility.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/dashboard/settings/repos/$repoId/visibility.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/invitations.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/invitations.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/onboarding.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/onboarding.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/_layout/_authenticated/profile-setup.tsx` | Kaneo `apps/web/src/routes/_layout/_authenticated/profile-setup.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/auth.tsx` | Kaneo `apps/web/src/routes/auth.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/auth/check-email.tsx` | Kaneo `apps/web/src/routes/auth/check-email.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/auth/sign-in.tsx` | Kaneo `apps/web/src/routes/auth/sign-in.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/auth/sign-up.tsx` | Kaneo `apps/web/src/routes/auth/sign-up.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/auth/verify-otp.tsx` | Kaneo `apps/web/src/routes/auth/verify-otp.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/device.tsx` | Kaneo `apps/web/src/routes/device.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/device/approve.tsx` | Kaneo `apps/web/src/routes/device/approve.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/device/index.tsx` | Kaneo `apps/web/src/routes/device/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/index.tsx` | Kaneo `apps/web/src/routes/index.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/invitation/accept.$inviteId.tsx` | Kaneo `apps/web/src/routes/invitation/accept.$inviteId.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/mcp.authorize.tsx` | Kaneo `apps/web/src/routes/mcp.authorize.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/public-board.$boardId.tsx` | Kaneo `apps/web/src/routes/public-board.$boardId.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/routes/test-error.tsx` | Kaneo `apps/web/src/routes/test-error.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/backlog-bulk-selection.ts` | Kaneo `apps/web/src/store/backlog-bulk-selection.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/board-layout.ts` | Kaneo `apps/web/src/store/board-layout.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/board.ts` | Kaneo `apps/web/src/store/board.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/bulk-selection.ts` | Kaneo `apps/web/src/store/bulk-selection.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/list-nest-hint.ts` | Kaneo `apps/web/src/store/list-nest-hint.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/navigation.ts` | Kaneo `apps/web/src/store/navigation.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/task-draft.ts` | Kaneo `apps/web/src/store/task-draft.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/team-view.ts` | Kaneo `apps/web/src/store/team-view.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/store/user-preferences.ts` | Kaneo `apps/web/src/store/user-preferences.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/tanstack/router.tsx` | Kaneo `apps/web/src/tanstack/router.tsx` (exact production-source mirror) |
| `apps/stellarc-ui/src/test/setup.ts` | Kaneo `apps/web/src/test/setup.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/api-key.ts` | Kaneo `apps/web/src/types/api-key.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/api-response.ts` | Kaneo `apps/web/src/types/api-response.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/board/index.ts` | Kaneo `apps/web/src/types/board/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/data-table.ts` | Kaneo `apps/web/src/types/data-table.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/external-link/index.ts` | Kaneo `apps/web/src/types/external-link/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/notification.ts` | Kaneo `apps/web/src/types/notification.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/organization-member/index.ts` | Kaneo `apps/web/src/types/organization-member/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/organization/index.ts` | Kaneo `apps/web/src/types/organization/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/repo/index.ts` | Kaneo `apps/web/src/types/repo/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/task/index.ts` | Kaneo `apps/web/src/types/task/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/time-entry/index.ts` | Kaneo `apps/web/src/types/time-entry/index.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/types/user.ts` | Kaneo `apps/web/src/types/user.ts` (exact production-source mirror) |
| `apps/stellarc-ui/src/vite-env.d.ts` | Kaneo `apps/web/src/vite-env.d.ts` (exact production-source mirror) |
| `apps/stellarc-ui/tsconfig.app.json` | Kaneo `apps/web/tsconfig.app.json` (exact production-source mirror) |
| `apps/stellarc-ui/tsconfig.json` | Kaneo `apps/web/tsconfig.json` (exact production-source mirror) |
| `apps/stellarc-ui/tsconfig.node.json` | Kaneo `apps/web/tsconfig.node.json` (exact production-source mirror) |
| `apps/stellarc-ui/vite.config.ts` | Kaneo `apps/web/vite.config.ts` (exact production-source mirror) |
| `apps/stellarc-ui/vitest.config.ts` | Kaneo `apps/web/vitest.config.ts` (exact production-source mirror) |
| `packages/contracts/src/legacy/libs/api-url.ts` | Kaneo `packages/libs/src/api-url.ts` (exact production-source mirror) |
| `packages/contracts/src/legacy/libs/hono.ts` | Kaneo `packages/libs/src/hono.ts` (exact production-source mirror) |
| `packages/contracts/src/legacy/libs/index.ts` | Kaneo `packages/libs/src/index.ts` (exact production-source mirror) |
| `packages/contracts/src/legacy/permissions/index.ts` | Kaneo `packages/permissions/src/index.ts` (exact production-source mirror) |
| `package.json` | Kaneo package.json; replace pnpm commands with Bun workspace scripts |
| `bun.lock` | generated from new package.json, not a copied lockfile |
| `bunfig.toml` | new; .forge/config.json gate compatibility reference |
| `.gitignore` | new; Kaneo .gitignore reference, exclude artifacts/secrets not baselines |
| `biome.json` | Kaneo biome.json |
| `turbo.json` | Kaneo turbo.json |
| `tsconfig.json` | Kaneo apps/web/tsconfig.app.json strict compiler reference |
| `vitest.config.ts` | Kaneo apps/api/vitest.config.ts |
| `vitest.integration.config.ts` | Kaneo apps/api/vitest.integration.config.ts |
| `.github/workflows/ci.yml` | Kaneo .github/workflows/ci.yml; use Bun and disposable PG |
| `playwright.config.ts` | Kaneo playwright.config.ts; replace projects/baseline paths |
| `tests/gates.test.ts` | new; .forge/config.json executable gate bridge reference |
| `tests/integration/foundation.test.ts` | new; docs/adrs/0007-embedded-sync-engine.md contracts 1–6 |
| `tests/integration/test-server.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md T0 |
| `tests/unit/foundation.test.ts` | new; docs/adrs/0007-embedded-sync-engine.md |
| `tests/helpers/postgres.ts` | Kaneo apps/api/vitest.integration.config.ts lifecycle reference |
| `apps/stellarc-api/package.json` | Kaneo apps/api/package.json workspace structure only |
| `apps/stellarc-api/src/main.ts` | new; docs/adrs/0007-embedded-sync-engine.md embedded Layer reference |
| `apps/stellarc-api/src/config.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md config Layer reference |
| `apps/stellarc-api/src/http.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md HttpApi reference |
| `apps/stellarc-api/src/errors.ts` | Kaneo apps/web/src/lib/error-handler.ts sanitized error reference; new Effect map |
| `apps/stellarc-worker/package.json` | Kaneo apps/api/package.json workspace structure only |
| `apps/stellarc-worker/src/main.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md runtime reference |
| `packages/contracts/package.json` | Kaneo packages/libs/package.json |
| `packages/contracts/src/index.ts` | new; docs/adrs/0007-embedded-sync-engine.md contracts reference |
| `packages/contracts/src/shape.ts` | new; docs/adrs/0007-embedded-sync-engine.md protocol reference; validate installed declarations |
| `packages/contracts/src/api.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md HttpApi reference |
| `packages/contracts/src/legacy/api.ts` | Kaneo apps/web/src/lib/auth-client.ts boundary reference plus pinned UI fetcher call sites |
| `packages/domain/package.json` | Kaneo packages/libs/package.json |
| `packages/domain/src/index.ts` | new; docs/adrs/0007-embedded-sync-engine.md write transaction reference |
| `packages/domain/src/authz.ts` | new; docs/adrs/0007-embedded-sync-engine.md contract 4 |
| `packages/db/package.json` | Kaneo packages/libs/package.json |
| `packages/db/src/index.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md SqlLive reference |
| `packages/db/src/migrate.ts` | new; docs/plans/2026-09-08-kaneo-parity-waves.md migration runner reference |
| `packages/db/migrations/0001_foundation.sql` | new; docs/adrs/0007-embedded-sync-engine.md persistence contract reference |
| `packages/sync/package.json` | Kaneo packages/libs/package.json |
| `packages/sync/src/index.ts` | new; docs/adrs/0007-embedded-sync-engine.md Layer reference |
| `packages/sync/src/upcasters.ts` | new; docs/adrs/0007-embedded-sync-engine.md contract 6 |
| `apps/stellarc-ui/e2e/fork-manifest.json` | new; docs/adrs/0009-development-workflow.md screenshot provenance reference |
| `apps/stellarc-ui/e2e/fixtures.ts` | Kaneo tests/e2e/global-setup.ts fixture setup reference; no copied credentials |
| `apps/stellarc-ui/e2e/frozen.spec.ts` | Kaneo tests/e2e/specs/01-route-smoke.spec.ts |
| `apps/stellarc-ui/e2e/responsive.spec.ts` | Kaneo tests/e2e/specs/sidebar-regression-smoke.spec.ts |
| `apps/stellarc-ui/e2e/sync.spec.ts` | new; docs/adrs/0007-embedded-sync-engine.md stock adapter reference |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/sign-in.png` | pinned fork rendered sign-in at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/org-shell.png` | pinned fork rendered org-shell at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/my-tickets.png` | pinned fork rendered my-tickets at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/inbox.png` | pinned fork rendered inbox at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/kanban.png` | pinned fork rendered kanban at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/list.png` | pinned fork rendered list at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/backlog.png` | pinned fork rendered backlog at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/calendar.png` | pinned fork rendered calendar at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/gantt.png` | pinned fork rendered gantt at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/milestones.png` | pinned fork rendered milestones at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/ticket-detail.png` | pinned fork rendered ticket-detail at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/repo-list.png` | pinned fork rendered repo-list at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/repo-issues.png` | pinned fork rendered repo-issues at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/repo-pulls.png` | pinned fork rendered repo-pulls at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/repo-pull-detail.png` | pinned fork rendered repo-pull-detail at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/projects.png` | pinned fork rendered projects at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/project-detail.png` | pinned fork rendered project-detail at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/members.png` | pinned fork rendered members at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/teams.png` | pinned fork rendered teams at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/roles.png` | pinned fork rendered roles at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/desktop/developer.png` | pinned fork rendered developer at desktop; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/sign-in.png` | pinned fork rendered sign-in at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/org-shell.png` | pinned fork rendered org-shell at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/my-tickets.png` | pinned fork rendered my-tickets at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/inbox.png` | pinned fork rendered inbox at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/kanban.png` | pinned fork rendered kanban at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/list.png` | pinned fork rendered list at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/backlog.png` | pinned fork rendered backlog at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/calendar.png` | pinned fork rendered calendar at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/gantt.png` | pinned fork rendered gantt at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/milestones.png` | pinned fork rendered milestones at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/ticket-detail.png` | pinned fork rendered ticket-detail at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/repo-list.png` | pinned fork rendered repo-list at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/repo-issues.png` | pinned fork rendered repo-issues at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/repo-pulls.png` | pinned fork rendered repo-pulls at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/repo-pull-detail.png` | pinned fork rendered repo-pull-detail at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/projects.png` | pinned fork rendered projects at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/project-detail.png` | pinned fork rendered project-detail at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/members.png` | pinned fork rendered members at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/teams.png` | pinned fork rendered teams at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/roles.png` | pinned fork rendered roles at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/tablet/developer.png` | pinned fork rendered developer at tablet; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/sign-in.png` | pinned fork rendered sign-in at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/org-shell.png` | pinned fork rendered org-shell at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/my-tickets.png` | pinned fork rendered my-tickets at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/inbox.png` | pinned fork rendered inbox at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/kanban.png` | pinned fork rendered kanban at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/list.png` | pinned fork rendered list at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/backlog.png` | pinned fork rendered backlog at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/calendar.png` | pinned fork rendered calendar at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/gantt.png` | pinned fork rendered gantt at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/milestones.png` | pinned fork rendered milestones at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/ticket-detail.png` | pinned fork rendered ticket-detail at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/repo-list.png` | pinned fork rendered repo-list at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/repo-issues.png` | pinned fork rendered repo-issues at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/repo-pulls.png` | pinned fork rendered repo-pulls at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/repo-pull-detail.png` | pinned fork rendered repo-pull-detail at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/projects.png` | pinned fork rendered projects at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/project-detail.png` | pinned fork rendered project-detail at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/members.png` | pinned fork rendered members at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/teams.png` | pinned fork rendered teams at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/roles.png` | pinned fork rendered roles at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile/developer.png` | pinned fork rendered developer at mobile; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/sign-in.png` | pinned fork rendered sign-in at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/org-shell.png` | pinned fork rendered org-shell at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/my-tickets.png` | pinned fork rendered my-tickets at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/inbox.png` | pinned fork rendered inbox at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/kanban.png` | pinned fork rendered kanban at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/list.png` | pinned fork rendered list at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/backlog.png` | pinned fork rendered backlog at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/calendar.png` | pinned fork rendered calendar at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/gantt.png` | pinned fork rendered gantt at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/milestones.png` | pinned fork rendered milestones at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/ticket-detail.png` | pinned fork rendered ticket-detail at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/repo-list.png` | pinned fork rendered repo-list at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/repo-issues.png` | pinned fork rendered repo-issues at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/repo-pulls.png` | pinned fork rendered repo-pulls at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/repo-pull-detail.png` | pinned fork rendered repo-pull-detail at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/projects.png` | pinned fork rendered projects at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/project-detail.png` | pinned fork rendered project-detail at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/members.png` | pinned fork rendered members at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/teams.png` | pinned fork rendered teams at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/roles.png` | pinned fork rendered roles at mobile-small; generated baseline, not new design |
| `apps/stellarc-ui/e2e/__screenshots__/mobile-small/developer.png` | pinned fork rendered developer at mobile-small; generated baseline, not new design |

UI lift rule: the inventory appended here enumerates committed production `apps/web/src/**`, `apps/web/public/**`, selected web configuration files, and production `packages/libs/src/**` and `packages/permissions/src/**`. Preserve relative layout; compatibility source is housed under `packages/contracts/src/legacy/{libs,permissions}` and TS/Vite aliases retain `@kaneo/libs` and `@kaneo/permissions`. Do not copy Kaneo API implementation or import its server AppType: replace the UI client's type-only API coupling with fixture-backed compatibility contracts derived from the existing fetcher calls. No blanket any or typecheck exclusions. Preserve route tree generation and all shipped route modules; tests from the old backend are not silently presented as Stellarc integration tests.

MODIFY existing dev files: `.gitignore` only if present at implementation start (otherwise listed CREATE), `README.md` for exact setup/gates and limitations. Do not modify `.forge/config.json`, state JSON, ADRs, tracker, or licenses. Lifted files requiring adaptation (created by this slice, not preexisting dev modifications): UI package.json/Vite/TS config, entrypoint to support test fixtures, client type boundary, alias imports resolving old workspace packages. Keep visual components, CSS, assets, labels, navigation and responsive logic unchanged. Create a committed mirror manifest identifying source SHA, source→destination paths and actual fixture endpoint contracts before implementation review.


### 5a. Orchestrator amendment — i18n resources (2026-09-09)

Implementer c1 correctly identified that the inventory omitted the fork's root `i18n/` tree, which `apps/web/src/lib/i18n/index.ts` imports as `@i18n/resources`. Authorised destinations, mirrored 1:1 from the pinned commit (2504e64512b8):

| Destination | Mirror |
|---|---|
| `i18n/de-DE.json` | Kaneo `i18n/de-DE.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/el-GR.json` | Kaneo `i18n/el-GR.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/en-US.json` | Kaneo `i18n/en-US.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/es-ES.json` | Kaneo `i18n/es-ES.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/fr-FR.json` | Kaneo `i18n/fr-FR.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/hi-IN.json` | Kaneo `i18n/hi-IN.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/id-ID.json` | Kaneo `i18n/id-ID.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/it-IT.json` | Kaneo `i18n/it-IT.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/ko-KR.json` | Kaneo `i18n/ko-KR.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/mk-MK.json` | Kaneo `i18n/mk-MK.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/nl-NL.json` | Kaneo `i18n/nl-NL.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/pt-BR.json` | Kaneo `i18n/pt-BR.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/resources.ts` | Kaneo `i18n/resources.ts` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/ru-RU.json` | Kaneo `i18n/ru-RU.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/schema.json` | Kaneo `i18n/schema.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/tr-TR.json` | Kaneo `i18n/tr-TR.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/uk-UA.json` | Kaneo `i18n/uk-UA.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/vi-VN.json` | Kaneo `i18n/vi-VN.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |
| `i18n/zh-CN.json` | Kaneo `i18n/zh-CN.json` (exact production-source mirror; consumed via `@i18n/resources` alias by `apps/stellarc-ui/vite.config.ts` and `tsconfig.app.json`) |

Alias resolution: `apps/stellarc-ui/vite.config.ts` and `apps/stellarc-ui/tsconfig.app.json` resolve `@i18n` → `../../i18n` exactly as the fork does. Locale JSON is copied byte-exact; `schema.json` is copied byte-exact. No translation may be emptied, stubbed, or referenced from the external Kaneo checkout. CREATE inventory total becomes **1078 files**.

Bun is at `/home/rpw/.bun/bin/bun` (1.4.0); if it is absent from PATH, use the absolute path — do not treat PATH as a blocker.


### 5b. Orchestrator amendment — undeclared fork dependencies (2026-09-09)

Implementer c2 found `apps/web/src/components/task/extensions/mermaid-block.ts` imports `mermaid` (dynamic, line 72) and `dompurify` (static, line 6); **neither is declared in any fork manifest or lockfile at the pinned commit.** The fork builds only because Vite defers the dynamic import and the fork's installed tree happened to satisfy it. This is a latent defect in the frozen surface, not a spec choice.

Ruling — authorised additions to `apps/stellarc-ui/package.json` `dependencies`:

| Package | Pin | Rationale |
|---|---|---|
| `mermaid` | `11.17.2` | not installed anywhere in the fork; current npm release |
| `dompurify` | `3.4.15` | not installed anywhere in the fork; current npm release |
| `@types/dompurify` | latest compatible | typecheck only, devDependency |

Behavioural contract unchanged: `securityLevel: "strict"`, `htmlLabels: false`, SVG sanitised with `USE_PROFILES: {svg: true, svgFilters: true}`. Add a unit test that renders one flowchart through `renderMermaid` and asserts the output is sanitised SVG — this is the one place the lift adds a test the fork lacks, because the fork never exercised this path in CI.

**Exhaustive sweep (orchestrator, 1122 source files, 59 packages):** `mermaid` and `dompurify` are the ONLY undeclared imports at the pinned commit. No further dependency blockers exist.

**General rule for the remainder of T0:** any other import in the pinned `apps/web/src/**` that resolves to no manifest entry is a **fork defect**. Add the dependency at the version present in `/home/rpw/repos/kaneo/node_modules/.pnpm` if installed there, else current npm; log each in `.forge/STL-14.deps-added.md` with file:line evidence. Do not stop for these — this ruling pre-authorises them. Stop only for gaps that change behaviour or scope.

The `.forge/STL-14.blocker.md` write was denied because `.forge/` under the main checkout is outside the worktree allowance. Corrected: blocker files go in the **worktree** as `.forge-blocker.md` at its root.


### 5c. Orchestrator ruling — shape query contract vs stock client (2026-09-09)

Implementer c3 proved from the `@electric-sql/client@1.5.27` tarball that the stock client unconditionally sends `log` (`src/client.ts:1347`) and, on recovery paths, `expired_handle`, `cache-buster`, and the live `cursor`. §3's four-parameter allowlist contradicts §§4/7's "stock client unchanged." **§§4/7 win; §3 is amended.**

Permitted query parameters on `GET /orgs/:org/v1/shape`:

| Param | Semantics | Validation |
|---|---|---|
| `table` | logical shape name (spike: `sync_probe`) | must be a registered shape for the org; else 404 (not 400 — do not disclose registry shape) |
| `offset` | `-1` for snapshot, else the opaque cursor we issued | `-1` or a cursor we can parse; else 400 |
| `handle` | shape handle we issued | required when `offset != -1`; unknown/rotated handle → `409` with `must-refetch` control message, per protocol |
| `live` | `true` to long-poll the tail | boolean |
| `log` | `full` \| `changes_only` | accept both; spike serves `full` semantics for either; requested mode is recorded in server-side telemetry only — **never on the wire**. `electric-schema` carries only the parser-defined column→ColumnInfo map. Unknown value → 400 |
| `cursor` | live-mode cache buster from the client's previous `electric-cursor` | opaque; echo back a fresh `electric-cursor` on every live response; never used for authz |
| `expired_handle` | the handle the client believes expired | accepted, logged, ignored for routing |
| `cache-buster` | retry-path nonce | accepted and ignored |

**Any other parameter → 400.** Specifically still rejected: `where`, `columns`, `replica`, `subset__*`, `live_sse`, `params[*]`. T0 serves whole-shape only; filtering is a later ticket. The negative-control test for this section: a request with `where=` must return 400, and a request with `log=changes_only` must return 200 — both assertions must exist and both must be shown failing before the handler exists.

Response headers the stock client requires (verified against the same tarball, `src/client.ts` header constants): `electric-handle`, `electric-offset`, `electric-schema`, `electric-up-to-date` (on the last page), `electric-cursor` (live responses). Control messages: `{headers:{control:"up-to-date"}}` at tail; `{headers:{control:"must-refetch"}}` on handle rotation. Long-poll timeout returns **204** with `electric-cursor` set.

This ruling closes the protocol surface for T0. No further parameter questions are open; anything not in the table above is rejected and the implementer does not need to ask.


### 5d. Orchestrator amendment — baselines delivered, salvage, gate facts (2026-09-09)

**Fork provenance captures are committed** (84 PNGs + manifest + capture script). Per question-1 ruling (5d-Q1): they are PROVENANCE at `e2e/__screenshots__/fork-provenance/`, never a `toHaveScreenshot` target — they contain production data and the lifted UI runs on a synthetic fixture. Playwright baselines are generated ONCE by the implementer from the lifted UI + synthetic fixture (`--update-snapshots`, that cycle only) and asserted thereafter. Frozen-UI parity against the fork is proven structurally: per screen × project, the same landmark set (sidebar/Sheet per viewport, kanban column count, table headers, …) derived from the provenance manifest + lifted components. Synthetic fixture minimum: 1 org, 2 members, 1 board/4 statuses/≥3 tickets, 1 repo/≥1 issue/≥1 PR, 1 project; deterministic ids and dates; under `e2e/fixtures/`. `teams` is provenance-only (fork route depended on unseeded client state).

**Branch head is `f1b2b70`** and carries: c4 thin path, c6 delete, c9's batch/rollback (salvaged as `acdc1ea`), orchestrator fixes (`4798ed1`: cluster reaping on exit, gate bridge 300s, lockfile refreshed), baselines (`f1b2b70`). Read `git log dev..HEAD` before anything.

**Gate facts you must not fight:**
- `bun install --frozen-lockfile` is what the merge gate runs. If you add a dependency, commit the regenerated `bun.lock` in the same commit.
- `bun run lint` currently reports 17 findings in 16 lifted files (16 `suppressions/unused` + 1 format), all inherited from the fork (which has 74 under the same rules). **Fix them** — they are mechanical (`biome check --write .` for the format one; delete the unused `// biome-ignore` comments for the rest). A red lint gate blocks merge regardless of provenance.
- Integration tests use disposable PG clusters; a timed-out test used to leak its cluster and slow every later run. Fixed in the helper. If you see T05 > 10s, look for stray `stellarc-test-*` dirs first.
- Vitest is the real runner; `bun test` only runs `tests/gates.test.ts`, which spawns both Vitest configs and asserts exit 0.

**Remaining scope (authoritative, replaces the PR body's stale list):** T02, T03, T07–T09, T11, T12, T14–T23 test matrix per §7; production `Config`/`SqlLive`/`Authz` Layers with sanitized error map (§3); worker lifecycle (acquire/release/terminate only); runtime append-only grants on `event`; opaque authenticated cursors + long-poll wake/cancel; server-side log-mode telemetry (§5c ruling); Playwright config with four projects + `toHaveScreenshot` against the committed baselines; CI workflow running lint/typecheck/unit/integration/e2e. Update the PR body's Remaining list to this and keep it current.


### 5e. Orchestrator ruling — UI typecheck boundary and the definition of T0-done (2026-09-09)

c12 reported the truth: explicit UI typecheck (`tsc -p apps/stellarc-ui/tsconfig.app.json`) exits with 429 errors, dominated by TS2339 "property does not exist on type '{}'" — every one traces to `hc<AppType>` where `AppType` came from the fork's `@kaneo/api`, which does not exist here. **129 UI files import that client; 121 call sites across 88 route paths.** That surface IS the data-layer rewrite ADR 0008 names ("pixels frozen, hooks rewritten"). It is delivered slice by slice in T1–T7 as each domain's Effect API + TanStack DB collections land. **It is not T0 scope, and T0 must not fake it.**

Rulings:

1. **Root `typecheck` excluding `apps/stellarc-ui` is correct for T0 and stays.** The merge gate for STL-14 runs root lint/typecheck/unit/integration/build + the UI *build* (Vite) + Playwright smoke. It does not run UI tsc.
2. **Add `apps/stellarc-ui` typecheck as a tracked, expected-red gate**: script `typecheck:ui`, wired into CI as a non-blocking job that publishes the error count. `.forge/ui-typecheck-budget.json` records `{ "count": 429, "at": "<sha>" }`. Each T1–T7 slice must lower it and update the file; the merge gate for those tickets fails if the count rose. T7's gate is `count == 0` and the job becomes blocking.
3. **`e2e:screens` does not exist — create it** as the Playwright project runner that captures all four projects for the screens whose routes resolve on the synthetic fixture. Per 5d-Q1 it generates baselines on first run (`--update-snapshots` once) and asserts after. Screens whose fixture is not yet served by the stub API are `test.fixme` with the owning ticket named — not skipped silently.
4. **T0 acceptance (authoritative, closes the ticket):**
   - root lint/typecheck/unit/integration/build green; UI Vite build green
   - `bun run e2e` green on the four projects for: `sign-in`, `org-shell` (with the stub API serving the minimum fixture), plus structural landmark assertions for those two
   - sync engine: T01 (reconnect exactly-once with boundary-removal negative control), T04, T05, T06, T07, T10, T12, T13, T23 green; T08/T09 (stock `@electric-sql/client` round-trip incl. `awaitTxId`) green; T11 long-poll wake/cancel green
   - worker process starts, acquires, releases, terminates cleanly (no domain behaviour)
   - `ui-typecheck-budget.json` committed with the honest count
   - PR body Remaining list is EMPTY or names only items explicitly deferred to a numbered ticket
   Everything else in the T02–T23 matrix that is not listed above is **deferred to the slice that owns the domain** (see §1 OUT-of-scope owners) and must be named in that ticket's spec by the orchestrator.
5. When (4) holds: `gh pr ready 28`. Not before.

## 6. Pixel-frozen UI surfaces

Capture fork baseline and compare built Stellarc with the SAME synthetic fixture, locale en-US, timezone UTC, theme, fonts, fixed clock and disabled animations. No production account, shared server mutation, baseline captured from Stellarc, or automatic snapshot acceptance in CI. Baseline root `apps/stellarc-ui/e2e/__screenshots__/<project>/`; `maxDiffPixelRatio: 0.001`. Preserve the complete imported fork screen set, not a replacement toy shell.

Mandatory T0 evidence screens: sign-in; authenticated org landing with full app sidebar/org switcher; My Tickets; Inbox; board Kanban, list (the actual existing view affordance, not an invented route), backlog, calendar, Gantt, milestones; ticket detail/activity drawer; repository list, issues, PR list/detail; Projects list/detail; Settings organization Members, Teams, Roles and account Developer/API keys. Resolve URLs from pinned TanStack route modules and query state; path nomenclature remains the fork's (`my-tasks`, `task`, organization slug routes). Additional imported routes remain navigable under fixtures, and route smoke enumerates all non-test route modules. UI parity here proves fixture rendering only; sibling gates must later prove live data.

Four projects exactly: desktop 1440×900 Chromium; tablet 1024×768 touch; mobile 390×844 iPhone 14 touch/isMobile; mobile-small 360×640 touch/isMobile. Pin browser engine/version identically for baseline and candidate; explicitly override device defaults where necessary. Each evidence screen runs in all four projects. Mobile interactions use `page.tap`, never mouse click; desktop uses keyboard focus assertions. Both mobile projects additionally resize to 767 and 768 to prove strict breakpoint behavior, then restore original viewport. Assert Sheet opens/closes with touch and rail is absent when closed; desktop/tablet rail remains visible. Keep frozen CSS tokens verbatim; no IBM Plex/token redesign or general Base UI cleanup.

## 7. TEST PLAN

Numbered rows are logical test cases; parameterized executions and screenshot files are counted separately in the manifest. Write T01 FIRST before implementation, run RED, then implement the thin path. Every test must execute the shipped service/component, not search source text. Each row lists the preimplementation RED and a post-GREEN sabotage that MUST produce a behavioral failure (compile errors do not count). Restore sabotage and rerun GREEN. No claimed test execution in this spec.

| ID | Test and RED condition | Negative control |
|---|---|---|
| T01 | Deterministic snapshot/reconnect race: initial projection read, barrier, concurrent committed mutation, cursor read, paginate, disconnect/reconnect. Track emitted event identities and stock collection state. RED: event committed in the interleaving is missing/duplicated or collection not updated. | Remove shared REPEATABLE READ boundary and read N after concurrent commit; same barrier forces omission and suite red. |
| T02 | Two same-org writers: pause A after reservation, begin B, release A; stream commit order. RED: B commits/passes A and cursor skips A. | Replace locked counter with independently allocated sequence. |
| T03 | Concurrent different-org writer proceeds while A holds counter. RED: B blocks on org A. | Replace per-org lock with global advisory lock. |
| T04 | Exception after event append rolls back counter/event/projection; next write usable. RED: any partial state persists. | Move projection or counter update outside transaction. |
| T05 | Multi-event transaction produces all events with one txid and ordered seq. RED: lost event or different txids. | Fetch txid on a different connection/transaction. |
| T06 | Restart/migration twice, checksum mismatch refusal, concurrent runners and runtime UPDATE/DELETE denial. RED: drift accepted, duplicate migration or event mutable. | Disable checksum verification and runtime write restriction, separately. |
| T07 | Snapshot >100 rows, concurrent updates/deletes between pages, no omissions and correct tail. RED: paging reads inconsistent projection. | Requery projection on page two under new snapshot. |
| T08 | Stock ShapeStream initial/continuation/live/up-to-date/schema decoding with text and bigint columns. RED: protocol parse failure or collection never ready. | Remove electric-schema or emit ad-hoc response wrapper. |
| T09 | POST through real test HttpApi returns committed txid; stock collection awaitTxId resolves and final value matches. RED: timeout, premature resolution or rounded ID. | Strip headers.txids or substitute seq for txid (fixture ensures different values). |
| T10 | DELETE and two updates preserve stable keys and final projection; missing delete 404 leaves log unchanged. RED: ghost rows or incorrect update merge. | Encode delete as insert. |
| T11 | Bun live poll returns 204 at bounded timeout; committed write wakes/requeries, disconnect releases resources; lost notification still found. RED: idle kill, hang, leaked listener or missed event. | Rely only on notification with no query fallback. |
| T12 | Expired/restarted/mismatched cursor+handle yields refetch and client recovers; no stale snapshot reused. RED: 500, stuck stream or skipped rows. | Accept stale handle with new boundary. |
| T13 | Missing auth 401, wrong-org/capability 403, revoked during poll denied; no rows/handle leakage. RED: any unauthorized data. | Replace chokepoint authorization with allow-all. |
| T14 | Two org collections with same row id remain isolated; switch disposes prior stream. RED: keys collide or old data appears. | Remove org from URL/collection identity. |
| T15 | Test v0 upcaster converts payload before emit; unknown future version errors, not skips. RED: old payload escapes or corrupt event disappears silently. | Bypass upcaster registry. |
| T16 | Real Effect /health + database outage + sanitized unexpected failure. RED: route absent or returns ok without DB. | Return hardcoded ok without SqlLive. |
| T17 | Invalid config prevents bind; scoped API and worker runtimes release resources on termination. RED: listener starts with missing DB config or process/pool hangs. | Supply silent DB fallback or drop scope finalizers. |
| T18 | Query/body/cursor invalid inputs and SQL injection table rejected; only documented routes mounted, fixture endpoints 404 in production. RED: unsafe query or production fixture available. | Mount test router in main or interpolate table. |
| T19 | Four-project frozen screenshots for every named evidence screen, real rendered populated fixtures and no unexpected requests. RED: missing screen/baseline or >0.1% diff. | Change visible sidebar width/token without updating baseline. |
| T20 | Mobile touch Sheet + 767/768 boundary in both mobile projects, desktop/tablet rail and keyboard focus. RED: wrong boundary, touch unavailable or lost focus. | Change hook boundary to <=768 or replace Sheet with permanently hidden panel. |
| T21 | Clean install/workspace graph, lint/typecheck/build, every non-test imported route smoke; built artifact only. RED: unresolved legacy package/API types or blank route. | Break an exported legacy alias used by a nonlanding route. |
| T22 | CI/Bun bridge executes real Vitest unit + throwaway-PG integration and forwards child nonzero; baseline/project presence checked. RED: false green when underlying test fails or PG unavailable. | Inject an assertion failure into an executed integration test; bridge must fail. |
| T23 | Retry identical tail page with persisted cursor/state uses stable event identity; unrelated plugin events advance cursor; bigint cursor above 2^53 stays exact. RED: duplicate application, spin, or cursor rounding. | Convert cursor to Number or advance only for matching plugin rows. |

Reconciliation ownership: **none of #1–#14**. Record T0 legacy reconciliation as N/A (zero legacy tables imported), never PASS. Engine invariants are separate assertions: projection replay equals current projection, max event seq <= org counter, all projection last_seq references exist in same org, and all events in a mutation carry returned txid. T04/T05/T07/T10 cover these with real SQL. Mapping from wave plan: #1–3 STL-15, #4–6 STL-16, #7 STL-19, #8 STL-17, #9 STL-20, #10 STL-18, #11–12 STL-20; #13–14 unassigned definitions, final gate coordinated by STL-21.

Execution: `bun install --frozen-lockfile`; `bun run lint`; `bun run typecheck`; `bun test` (bridge with timeout and propagated exit status); `bun run build`; `bun run e2e`. Dedicated scripts `test:unit` and `test:integration` invoke Vitest with explicit configs. PG provisioned as disposable CI service/database; never point tests at Patroni/live Kaneo. `bun run e2e:screens` compares by default; explicit fork-only capture mode is required to create missing baselines. Report RED/GREEN/control exit codes and exact test names as implementation evidence. Reviewer must differ in model family; clean-HEAD rerun and merge remain orchestrator duties.

## 8. Suggested vertical build order

1. Materialize mirror manifest/source pin and define fixture contract; write T01 first against the intended real API/DB services. Capture its RED; missing imports are initial bootstrap evidence only, then get a runnable behavioral RED before claiming the boundary proof.
2. Minimal workspace/contracts/SqlLive/migration/domain write → Effect health and test-only write → one snapshot/tail → real client reconnect. GREEN T01, sabotage boundary, behavioral RED, restore GREEN before expanding.
3. Counter concurrency/rollback, txid adapter settlement, immutable snapshot pagination, upcasting, authz and expiration. Each row RED → implementation → GREEN → isolated sabotage → restored GREEN. Pin tested protocol dependency versions in lockfile and finalize exact message Schema against installed declarations.
4. Bun long-poll cancellation/timeout/restart and worker resource lifecycle; run integration suite with actual sockets and throwaway PG.
5. Lift committed fork UI plus compatibility source, preserve all visual assets, build against fixtures, capture fork baselines at all four projects, run route smoke and parity/touch/boundary tests. No native shell or business migration.
6. Wire CI and Bun bridge; prove intentional integration failure propagates, then run full gates. Persist reconciliation N/A, unresolved inventory/ownership notes, protocol version evidence and screenshot provenance in implementation PR evidence. Hand off for adversarial review; do not self-merge.
