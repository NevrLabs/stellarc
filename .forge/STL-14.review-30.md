# STL-14 — Adversarial Review (cycle 30)

**Verdict: PASS**

Gate check: latest `implement` entry = `pass` (cycle 30, head `a8575a43`, 2026-09-10T22:17:08Z). PR #28 draft=false, base `dev`.

Reviewed the DIFF at head `a8575a43` in an isolated worktree (`git worktree add` on detached HEAD). Re-ran every gate and two negative controls against the real head.

## Per-item audit

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Spec compliance | PASS (3 minor inventory gaps) | All §5e acceptance items present. No scope creep. Deviations: `packages/contracts/src/index.ts`, `packages/telemetry/package.json`, `apps/stellarc-ui/e2e/sync.spec.ts` are absent from the §5 inventory (see defects). |
| 2 | Tests that cannot fail | PASS | Every new test has a named red-maker. Replayed two spec negative controls live: (a) rename `stellarc.shape.snapshot` span → T01 "HTTP shape spans" RED, restore GREEN; (b) swap `isolation level repeatable read` → `read committed` → T01 "snapshot/reconnect retains the mutation" RED (timeout). Both restored, full suite GREEN. |
| 3 | Migrations | PASS | Only `0001_foundation.sql` added (`A`). No `M`/`D` on any migration. `git tag --contains` = none (never shipped). Checksum-verified, advisory-locked, transactional. No journal reformat. |
| 4 | Doctrine | PASS | No D12 bypass (all writes via `mutateProbesEffect`). Event always has `actor` (validated nonempty). Every mutation appends an event. No hardcoded tokens (`crypto.randomUUID`). No model calls. Authz fail-closed (`AuthzLive` denies all). |
| 5 | Worker debris | PASS | No stray files; `.pyc` deleted + gitignored (`__pycache__/`, `*.pyc`). No commented-out code or debug logs. `console.*` gated by Biome `noConsole` on api/worker/packages. |
| 6 | Screenshots | PASS | Four projects exactly (desktop 1440×900, tablet 1024×768 touch, mobile 390×844 touch/isMobile, mobile-small 360×640 touch/isMobile). 6 screens × 4 viewports = 24 baselines present. 15 §6 screens are explicit `test.fixme` naming the owning slice (STL-15/16/17/18/19), never silent. Mobile touch + 767/768 boundary asserted (`responsive.spec.ts`). Not desktop-only. |
| 7 | Spans (ADR 0010) | PASS | `Effect.fn` on domain/sync/db/worker/telemetry services. `db.*` spans carry `db.operation`/`db.sql.table`, never statement text (whitelist regex). `http.route`/`method`/`status_code`/`stellarc.org`/`stellarc.principal.kind` present; denied spans carry `error.type` and no principal attrs. Span assertions go red on sabotage (proven). |
| 8 | Gates re-run | PASS | `bun run lint` 0 · `bun run typecheck` 0 · `bun test` bridge exit 0 (unit 7, integration 43) · `bun run build` 3/3 · `bun run e2e` 24 passed + 60 fixme, exit 0. |

## DEFECTS (non-blocking)

1. `packages/contracts/src/index.ts` — absent. Spec §5 inventory lists it as CREATE. Nothing imports `@stellarc/contracts` by name (all relative), so no functional break, but the package has no entry barrel. Fix: add `packages/contracts/src/index.ts` re-exporting `api.ts` and `shape.ts`, or have the orchestrator amend §5 to record the split.

2. `packages/telemetry/package.json` — absent. `packages/telemetry` is not a workspace (glob `packages/*` skips it); its deps are hoisted at root, and it is imported only by relative path. Fix: add `{"name":"@stellarc/telemetry","version":"0.0.0","private":true,"type":"module"}` so the workspace includes it.

3. `apps/stellarc-ui/e2e/sync.spec.ts` — absent. Spec §5 lists it as CREATE; the stock `@electric-sql/client` round-trip lives instead in `tests/integration/foundation.test.ts` (T08/T09). §5e acceptance is satisfied, but the inventory is unmet. Fix: add a thin e2e smoke, or amend §5 to note the stock-adapter test is integration-level.

4. `.forge/ui-typecheck-budget.json` — missing the `console_sites` field mandated by §5f-Q2 (18 sites owned by STL-15–21; actual count is 19), and `"at": "1e5c990…"` is stale vs head `a8575a43`. Fix: add `"console_sites": 19` and refresh `"at"` to the merge SHA.

Note (not a defect): `packages/domain/src/index.ts` `runMutations` executes its transaction through the `postgres.js` driver rather than the Effect `SqlLive`/`PgClient`, so the event-append SQL does not emit `db.*` spans (§5f item 2). This is acknowledged at `apps/stellarc-api/src/main.ts:19` ("retain postgres.js adapter until the Effect conversion") and does not violate acceptance or doctrine; conversion belongs to a follow-up slice.
