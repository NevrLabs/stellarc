# STL-21 review — cycle 4 (PR #44, forge/stl-21-c4 @ 94912aa)

**REWORK**

Reviewer: adversarial, diff-audited (5,605-line diff), tests replayed in an isolated
worktree (`/tmp/stl21-review`, disposable Postgres per suite, bun 1.4.0).

Context the orchestrator must internalize: **dev carries only migrations
0001–0002** — STL-16/18/20 (task/board/repo FK targets, STL-20 grants chokepoint)
are NOT merged. The spec's premise ("MODIFY after T0–T6 merge", "wave DAG already
orders T7 after Wave 2") was violated by running this slice now. The implementer
self-scoped around the gap ("wave-2-gated") instead of the spec. That is not
theirs to decide, and 4 of the spec's hard requirements are absent.

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | Spec compliance | **DEVIATED/MISSING.** Delivered: `project` (21 cols, exact checks/indexes — verified in 0008), `project_slug_alias`, `project_milestone` (completion-pair check), `project_update`; CRUD/slug-alias/archive/unarchive service+HTTP (20 handleRaw routes); milestones + updates lifecycle; transactional one-row importer (preflight 21-col, satellites-empty, verbatim ids/timestamps, ledger digest, idempotent rerun); 4 of 6 sync collections; telemetry test; sidebar/overview/detail UI live- parity (2 surfaces × 4 viewports). Missing: `project_ticket`, `project_board`, `project_repo`, `project_table_link` tables (defect 1); resource-links API + `project-links.ts` (defect 2, spec calls T08 "the gate item"); project-tickets API (defect 3); grants extension/chokepoint baseline (defect 4); T17 final all-14 gate + three-clean-imports (defect 5); 2 sync collections + privilege predicates (defect 6); 4 event types never emitted (defect 7). Scope creep: none. |
| 2 | Tests that cannot fail | **Mixed.** T09 negative control REPLAYED by reviewer: dropped `project_milestone_completion_pair_check` from 0008 → `T09/T11…` RED (`1 failed \| 5 skipped`); restored → GREEN (`1 passed`). Pasted below. T02c atomic-rollback genuinely red-able (cross-cluster ghost-lead). T13d unknown-key 404 red-able. T15a fails if `requestTelemetry` annotation or `timed()` spans removed (asserts org/principal.kind/db.\* counts). BUT `T01b blocked satellite tables are absent pending wave-2` *asserts the gap into correctness* — a test that forbids the spec's own tables; also FLAKED (30s timeout in full-suite run, green in isolation). |
| 3 | Migrations | **CLEAN.** 0008 appended to the explicit ordered list (`packages/db/src/migrate.ts:12`); 0001/0002 bytes untouched; no journal reformat; no tagged/shipped migration modified (`git tag --contains` empty). 0003–0007 numbering gap reserved for wave-2 — acceptable only under the (invalid) self-gating premise. |
| 4 | Doctrine | **ONE VIOLATION.** Duplicate plain-SQL `appendEvent` at `packages/domain/src/project-milestones.ts:44` (re-exported into project-updates.ts) bypasses the instrumented `Effect.fn("stellarc.event.append")` at `packages/domain/src/index.ts:54` — event.type/seq/txid span annotations lost, doctrine copy drifts. Events carry actor everywhere ✅. No hardcoded hex, no D4 model calls, no direct-SQL-beyond-house-pattern, no console.\* (T15b static check) ✅. |
| 5 | Worker debris | Minor: unused `tagOf` at `apps/stellarc-api/src/http.ts:230` (new biome noUnusedVariables warning). No debug logs, no commented-out blocks, no giant generated diffs. |
| 6 | Screenshots | **REWORK.** 8 new PNGs = 2 surfaces (projects overview, project detail overview) × 4 Playwright projects — desktop/tablet/mobile/mobile-small all present, `maxDiffPixelRatio 0.001`, mobile configs carry `hasTouch:true, isMobile:true`, and the interception-proof counter (`projectRequests() > hitsBefore`) is genuinely strong. But §6 also names: tickets tab (impossible — feature missing), create-project modal, archive/unarchive dialogs, rename-slug dialog — none screenshotted. |
| 7 | Spans (ADR 0010) | **PARTIAL.** Endpoints: `http.route` (incl. `/api/project/:projectId/sub` collapsing), method, `stellarc.org` (from query for /api routes), `principal.kind`, `error.type` ✅, asserted by T15a. db.\* spans present (`db.projects.*` via `timed()`), no statement text (asserted) ✅. NO PII ✅. **But every new service function is plain `async`, not `Effect.fn("Module.name")`** — spec §2 and ADR 0010 require it; repo precedent exists (`index.ts:54`, `sync/src/index.ts:92`). |
| 8 | Re-runs (reviewer-executed) | `tsc --noEmit` **exit 0**; unit **23/23 passed**; biome **1 new warning** (tagOf); UI `tsc -p tsconfig.app.json` errors **pre-exist on dev** (activity/index.tsx resolveNote etc. — not chargeable). Integration full suite: **72/74 passed, 2 failed** (`foundation.test.ts T06`, `identity-migration.test.ts I3`) — both 30s+ initdb-under-load timeouts; **both files pass green in isolation** (43/43 and 8/8, rerun by reviewer). Verdict: environment flake, not regression — but T01b flake is this PR's to fix. |

### Negative-control replay (pasted)

```
# sabotage: remove project_milestone_completion_pair_check from 0008_projects.sql
$ vitest run tests/integration/projects.test.ts -t 'T09'
Tests  1 failed | 5 skipped (6)        ← RED

# git checkout -- 0008_projects.sql
$ vitest run tests/integration/projects.test.ts -t 'T09'
Tests  1 passed | 5 skipped (6)        ← GREEN
```

## DEFECTS

1. `packages/db/migrations/0008_projects.sql` — `project_ticket`, `project_board`, `project_repo`, `project_table_link` absent. Spec §2 requires all 8 tables (verbatim fork 0073–0076 constraints, `data_table` FK deferred). Fix: add all four; requires STL-16/18 FK targets on dev first. If dev cannot host them, the slice was sequenced prematurely — orchestrator decision, not implementer self-gating.
2. `apps/stellarc-api/src/http.ts` + `packages/domain/src/project-links.ts` (file absent) — T08 resource links entirely missing: no GET/POST/PUT/DELETE `/:id/resources`, no relationship picklist, no safe-summary union (`ResourceLinkPublic.resource`), no `resourceType='table'` → 409 `InvalidReference`, no `project:resource-link-upserted/-deleted` emission. Fix: implement per spec §3 rows 7–10 and §5 manifest.
3. `packages/domain/src/project-tickets.ts` (absent) + no `/api/project/:id/tickets` routes — T10 missing: add/remove/assign/reorder, `(project,task)` + global `task_id` uniques, progress `{completed,eligible,percent|null}`. Fix: implement §3 rows 13–16; `project.progress` in `toProjectPublic` is hardcoded `{completed:0,eligible:0,percent:null}` today.
4. T14 grants extension absent — no `resourceType=project` grant/org-privilege routes (STL-20 seam not on dev), no chokepoint project-baseline step, and list/get authorize on org membership only; the T03 "accessible-ids filter" the spec's sabotage targets does not exist. Fix: land after STL-20, extend seam + chokepoint, privilege-filter list/shape.
5. `tests/fixtures/projects-reconciliation.sql:1-4` — T17 final gate punted in prose ("once wave-2 slices land"). STL-21 owns all-14 execution + three consecutive clean full imports. Fix: execute for real on a production-snapshot fixture with STL-27's #13/#14 canon when wave-2 lands.
6. `packages/sync/src/projects-shapes.ts` — registers 4 of 6 collections; `project_resource_link`, `project_ticket` missing; no privilege predicates on snapshot/tail (spec §4: resolved-privilege filtering, revocation drops rows + invalidates handles). Fix: add collections + predicates tied to the chokepoint.
7. `project:resource-link-upserted/-deleted`, `project:ticket-linked/-unlinked` — defined in upcasters/contracts only, emitted nowhere (consequence of defects 2–3). Fix: emit atomically in the new write paths.
8. `packages/domain/src/projects.ts`, `project-milestones.ts:44`, `project-updates.ts` — all service functions plain `async`; duplicate uninstrumented `appendEvent` shadows `Effect.fn("stellarc.event.append")` (`index.ts:54`), losing `stellarc.event.type/seq/txid` span annotations. Fix: wrap in `Effect.fn("Projects.*")` etc.; reuse the existing instrumented appender (or port its annotations).
9. `apps/stellarc-ui/e2e/projects.spec.ts` — §6 surfaces uncovered: create-project modal, archive/unarchive dialog, rename-slug dialog, tickets tab. Fix: add tests + 8+ baselines (each × 4 viewports).
10. `tests/integration/projects.test.ts` T01b — flaky (30s timeout under full-suite load; initdb per test). Fix: raise `testTimeout` for disposable-PG tests or reuse one cluster; and delete the asserts-absence test once defect 1 lands.
11. `apps/stellarc-api/src/http.ts:230` — unused `tagOf` introduces a biome warning. Fix: remove.

Not chargeable to this PR: pre-existing UI `tsc` errors and remaining biome warnings (verified identical on dev); integration full-suite timeout flakes in T06/I3 (green in isolation).
