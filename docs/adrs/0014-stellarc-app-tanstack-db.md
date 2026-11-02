# ADR 0014: Stellarc is its own app — new `apps/web`, TanStack DB, Kaneo as a one-shot import

Status: **proposed** (2026-11-02). Operator direction: "what we're trying to build
here is stellarc, it just need to be backward compatible with our kaneo fork. even
a simple migration is enough. we want to use effect.ts, bun, tanstack, and all the
best libraries there are … tanstackdb, so we have good optimistic updates."

Supersedes ADR 0012 (strangler). Amends ADR 0007 (sync transport) and ADR 0008
(drops the pixel freeze; the stack choices stand). ADR 0011 (BYO agents) stands
and continues on `effect/v4`.

## Problem

ADR 0012 makes Stellarc a wire-identical re-implementation of Kaneo, endpoint by
endpoint, behind Kaneo's frozen UI. That gets Effect running, but it defines the
product as "Kaneo, ported": every native group must reproduce Kaneo's response
shapes, the UI stays Kaneo's 909-file fetch/zustand app, and the new shell design
(views rail, tabs, Linear-style board views) can never land without breaking the
freeze. The operator wants Stellarc, not a port. Kaneo compatibility only means
"our existing data comes across".

## Decision

1. **Stellarc owns its schema and API.** Domain tables (org, board, ticket,
   status, label, project, milestone, repo, comment, activity) are designed for
   Stellarc in `packages/db` migrations, next to the existing identity and event
   log tables (0001–0003). The API is Effect `HttpApi` in `apps/stellarc-api`;
   the client is derived from the same `HttpApi` definition (`HttpApiClient`), so
   request and response types are shared, not duplicated.
2. **Kaneo compatibility is a one-shot import**, not wire parity.
   `stellarc import kaneo --from <postgres-url> [--org <slug>]` is an Effect CLI
   (`@effect/cli`) that reads a Kaneo fork database (schema at
   `IEatCodeDaily/kaneo@2504e645`, migrations through 0077) and writes Stellarc
   rows plus `identity_import` records. Requirements:
   - **Idempotent.** Re-running updates in place; keyed by the Kaneo row id
     stored on an `import_source` column.
   - **Lossless for what we model**, explicit about what we drop (logged as a
     summary table at the end).
   - **Stable links.** Kaneo ids, board keys (`board_key_alias`) and slugs
     (`project_slug_alias`, `organization_slug_alias`) are preserved so old
     `task.noovoleum.site` / `kaneo.entelechia.cloud` URLs can 301 to the new
     route.
   - **Proved** by a fixture test that loads a Kaneo dump, imports twice, and
     asserts counts and a sample of rows; negative control: dropping the
     `task_relation` step turns the relation-count assertion red.

   Mapping (first pass; the import ticket refines it):

   | Kaneo | Stellarc |
   |---|---|
   | user, account, session, apikey, organization, organization_member, organization_role, team, team_member, invitation | identity tables from 0002 (already shaped for this) |
   | project (Kaneo's board container), board, column | board, status |
   | task, task_relation, task_follower, label, milestone, flag_type/task_flag | ticket, ticket_relation, subscriber, label, milestone, ticket field |
   | project_* (project_board, project_milestone, project_ticket, project_update, project_repo) | project, project membership, project update |
   | comment, activity, notification | comment, activity, notification |
   | repo, repo_issue, repo_pull_request, github_integration, organization_github_installation | repo + integration (tokens re-authorised, not copied) |
   | resource_grant | grant |
   | time_entry, task_template, workflow_rule, data_table* , asset, external_link | **phase 2**: imported as-is into `legacy_*` JSON tables, surfaced later |
   | device_code, verification, trial_grant, task_reminder_sent, user_notification_* | dropped (transient or re-derivable) |

3. **New frontend: `apps/web`.** Built from the shell design in
   `/mnt/deepvault/dev/shell-mockups` (Graphite/Paper themes, one-row header,
   views rail, sidebar with pinned Recent, Linear-style board views, ticket peek).
   `apps/stellarc-ui` (the Kaneo UI) is not ported; it keeps running until
   `apps/web` covers boards, then it is deleted. The UI freeze ends. The frozen
   PRs against `apps/stellarc-ui` (#90, #91, #92, #108, #115, #118) are
   closed; their ideas are re-filed against `apps/web`. #110 (interrupt-safe
   transcripts) is backend-only and continues on the agent track.

4. **Stack (latest, per the always-newest policy).**

   | Layer | Choice |
   |---|---|
   | Runtime | Bun, Effect 4.1.x, `@effect/platform-bun`, `@effect/sql-pg` |
   | API | Effect `HttpApi` + `HttpApiClient`; better-auth mounted as a raw handler |
   | Client data | **TanStack DB 1.0** (`@tanstack/react-db`): collections, live queries, optimistic mutations |
   | Routing | TanStack Router (Vite SPA; TanStack Start stays rejected per ADR 0008) |
   | Forms / keys / lists | TanStack Form, TanStack Hotkeys, TanStack Virtual, TanStack Table |
   | UI | shadcn (Base UI variants), Tailwind v4, lucide, `@dnd-kit`, cmdk |
   | Desktop / mobile | Tauri 2 (desktop tabs; ADR 0013) / Expo later, sharing the collection layer |

5. **Sync: one collection layer, three transports, phased.** TanStack DB is the
   store; it does not move data. Each collection picks a sync adapter, and UI
   code never sees which one:

   | Phase | Collections | Adapter | Why |
   |---|---|---|---|
   | **A (now)** | everything | `@tanstack/query-db-collection` over `HttpApiClient`; existing WS push invalidates by collection | ships optimistic UI immediately; no engine dependency |
   | **B** | ticket, comment, activity, status, board | `@tanstack/electric-db-collection` → ADR 0007 engine (`/orgs/:org/v1/shape`) | streams row deltas, resumes, `awaitTxId` settles optimistic writes without flicker; mature adapter |
   | **C** | agent session, transcript, live progress | **Durable Streams** (`@durable-streams/state/db`) served from the event log | append-only by nature; resumable exactly-once tail; one pipe for transcripts and state |

   Real Electric (the Elixir service), PowerSync, Zero, RxDB, TrailBase and
   LiveStore stay rejected for the reasons in ADR 0007: each wants to own the
   write path, the storage, or adds a second runtime outside our permission
   chokepoint.

   Writes always go through the Effect API in one transaction that returns its
   `txid`. Phase A settles by refetch; phases B/C settle by `awaitTxId`.

6. **Agent features continue** on `effect/v4` per ADR 0011 (budgets, scoped
   permissions, attribution, attempt continuity, now on v4 Schema via PR #164, merged 2026-11-02).
   `apps/web` hides agent surfaces until their APIs are on the new schema; the
   layout reserves their places (the Agents view, live strips on cards, the
   ticket peek's "working on this").

## Rejected

| Option | Why not |
|---|---|
| Keep the strangler (ADR 0012) | Defines the product as Kaneo. Locks the UI. Parity work on 59 Kaneo tables buys compatibility nobody asked for beyond the data. |
| Port `apps/stellarc-ui` to TanStack DB in place | 909 files of fetchers and zustand; a rewrite in disguise, and the shell design replaces the IA anyway. |
| Build the sync engine before the app | Couples the app to a 2–3 week engine. Phase A gives the same optimistic UX now. |
| Durable Streams for everything | Beta (0.3.x); its TanStack DB layer is younger than the Electric adapter. Right for append-only streams, not yet for relational rows. |

## Sequence (each is a tracker ticket; see NEVR-tickets linked to this ADR)

1. **Schema**: Stellarc domain migrations (0004+) and Effect `Schema` models.
2. **Import**: `stellarc import kaneo`, fixture test, idempotency test, negative control.
3. **API**: `HttpApi` groups for org, board, status, ticket, label, project, comment, activity; txid on every mutation.
4. **apps/web scaffold**: Vite + Router + shadcn base + tokens from the mockup; shell (header, tabs on desktop, rail, sidebar, Recent).
5. **Collections (phase A)**: query-db-collection per resource; optimistic insert/update/delete; WS invalidation.
6. **Board views**: board, list, timeline, backlog, calendar, custom views; ticket peek.
7. **Cutover**: import NevrLabs and Noovoleum data on staging, redirect old URLs, retire `apps/stellarc-ui` and `packages/kaneo*`.
8. **Phase B**: ADR 0007 engine to production (compact known-ness, subset params) and move hot collections.
9. **Phase C spike**: Durable Streams over the event log for sessions and transcripts.

## Consequences

- `packages/kaneo`, `packages/kaneo-legacy`, `packages/kaneo-email` and the
  parity test are deleted after cutover. Until then they keep serving the old UI.
- The ui-purity gate (no changes to `apps/stellarc-ui`) stays until cutover, then
  is removed; `apps/web` is gated by typecheck, unit, and a live Playwright pass.
- One collection layer means desktop, web and mobile share data code; only the
  shell differs.
