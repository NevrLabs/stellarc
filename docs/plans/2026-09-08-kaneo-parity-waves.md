# Implementation plan — Kaneo database parity on Effect

Status: **proposed** 2026-09-08. Governs the first delivery phase of `dev`.
Companion: `docs/adrs/0007`, `0008`; tooling in `tools/forge/`.

## Goal

Every populated Kaneo table has a Stellarc destination that a real request
path exercises — schema → Effect service → HTTP API → event log → sync shape →
frozen UI. "Parity" is proven by the 14 reconciliation queries in the legacy
inventory, not by a checklist.

**38 populated tables · 7 vertical slices · 3 waves.** Slice boundaries and wave
order come from the FK graph, not from taste.

## Wave 0 — Foundation (serial, one ticket, blocks everything)

**T0 · Monorepo + Effect runtime + sync-engine spike**

- Bun + Turbo + Biome + Vitest; `apps/stellarc-api`, `apps/stellarc-worker`,
  `apps/stellarc-ui` (Vite SPA lifted from the fork, pixel-frozen), `packages/`
  `{contracts, domain, sync, db}`
- Effect runtime: config `Layer`, `SqlLive` (`@effect/sql-pg`), tagged-error →
  HTTP map in one file, `HttpApi` skeleton with `/health`
- **Event log**: `event(seq, org, plugin_type, actor, payload, schema_version)`
  with a **per-org single-row counter advanced inside the write tx** (ADR 0007
  contract 1). Migration runner.
- **Sync spike** (ADR 0007 open questions, resolved by prototype): shape server
  serving `GET /orgs/:org/v1/shape` from projection + event tail; long-poll
  behind Bun; `txid` round-trip. **First test written:** reconnecting client
  receives every event once. Must fail when the snapshot boundary is removed.
- CI: lint, typecheck, unit, integration on throwaway Postgres, Playwright smoke
  against a built UI

**Gate:** `/health` served by Effect in CI; sync negative-control suite green
and proven RED-able; frozen UI builds and renders its shell against a stubbed
API.

## Wave 1 — Identity (serial; everything else has an FK into it)

**T1 · S1 Identity** — `user, account, organization, organization_member,
organization_role, team, team_member, invitation, apikey, user_avatar`
(10 tables · 108 cols · 56 rows)

- better-auth as the first-party auth `Layer`; API-key verify = sha256
  base64url (verified against the live `Talos` key)
- Structural entities per D25: org, principal (human/agent), grant
- Schema-per-org routing seam **stubbed** (single schema, `org_id`, seam
  interface present) — D9 escalation is a later ticket, the seam is not
- Frozen UI surfaces: sign-in, org switcher, Settings → Members/Teams/Roles/API keys
- Importer: identity tables; reconciliation queries #1–#3

**Gate:** sign in → switch org → list members, live, through the sync shape;
importer reconciles 3/3; E2E screenshot of Members page matches the fork's
pixel-for-pixel (Playwright `toHaveScreenshot`, 0.1% threshold).

## Wave 2 — Core work surface (parallel ≤3 after T1)

**T2 · S2 Board + Ticket** — `board, board_key_alias, column→status, task→ticket,
label, task_template, flag_type, task_flag` (8 · 86 · 573)
- Board as resource; Status replaces Column as a domain object; Ticket key
  `PREFIX-seq` preserved
- Frozen UI: sidebar boards, Kanban, list, backlog, ticket detail
- Reconciliation #4–#6 (boards, tickets, zero orphan statuses)

**T3 · S4 Activity + Notification** — `activity, notification, workflow_rule`
(3 · 31 · 3592 — the bulk of the data)
- `activity.type='comment'` → one comment store; everything else → domain
  events (this is where D10's log stops being new and starts being *imported*)
- `stellarc-worker` outbox consumer: notifications
- Frozen UI: ticket activity thread, inbox, notification prefs
- Reconciliation #8

**T4 · S5 Repository** — `repo, repo_issue, repo_pull_request,
organization_github_installation, github_user_grant, integration` (6 · 88 · 119)
- Repository resource + Connection separation; GitHub mirror tables
- Frozen UI: sidebar repos, repo issues/PRs list
- Reconciliation #10

**Gate per ticket:** the slice's frozen screens render live data through the
shape; reconciliation queries green; adversarial review PASS; Playwright
screenshot parity.

## Wave 3 — Graph + files + projects (parallel ≤3 after Wave 2)

**T5 · S3 Ticket graph** — `task_relation, task_follower, external_link,
task_repo_item_link, milestone` (5 · 37 · 179). Directional relations with
cycle protection; unified `entity_link`. Reconciliation #7.

**T6 · S6 Files + grants** — `asset, resource_grant` (2 · 23 · 122). Internal S3
Container; every asset URL resolves 200 through the new file layer (#9);
grants apply to the same (principal, resource) (#11); **cross-org isolation
test** (#12).

**T7 · S7 Project** — `project` (1 · 21 · 1). Project as grouping resource per
D25 (context + resource refs). Frozen UI: Projects sidebar section. Minimal.

**Gate:** all 14 reconciliation queries green on a fixture restored from a
production snapshot; three consecutive clean full imports.

## Not in this plan

`session` (re-auth), `task_reminder_sent` (derivable), `github_delegation_state`
(transient) — dropped per `docs/research-2026-09-08-sync-engine.md` §1.
24 empty tables — designed fresh later, not imported.

## Wave gating summary

```
T0 ──► T1 ──┬──► T2 ──┬──► T5
            ├──► T3 ──┼──► T6
            └──► T4 ──┴──► T7
```

Each arrow is a **merged PR into `dev`**, not a claim. `T5`/`T6` need T2 and T4
both merged (FK edges into repo tables).

## Definition of done, every ticket

1. Spec reviewed and committed (`forge` S1)
2. RED tests pasted before GREEN; negative control proven
3. Adversarial review PASS from a different model family (S3)
4. Full gates green in a **clean worktree at HEAD** (S4)
5. Reconciliation queries for the slice green
6. Playwright screenshot parity vs fork baseline, committed under
   `apps/stellarc-ui/e2e/__screenshots__/`
7. PR merged to `dev` by the merge gate, squash, `Closes #N`
