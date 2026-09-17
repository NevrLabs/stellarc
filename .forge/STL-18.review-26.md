# STL-18 review c26 — VERDICT: REWORK

PR #56 @ `aaadb93e` (forge/stl-18), base dev. 20 commits, 27 files, +5487/−46.
Gate: implement=pass @ 2026-09-17T13:02:04Z (cycle 26). Reviewer re-ran gates at PR head.

**Headline: cycle 26 is a null cycle.** PR headRefOid `aaadb93ed2240f555192c929bff8cf8e9ee0243f` is byte-identical to the commit c25 reviewed and rejected (c25 review @ 12:49:58Z; last PR commit 12:17:29Z). The c26 "implement pass" landed without pushing a single commit. All four c25 defects verified still present by independent inspection, not by trusting c25.

## Per-item audit

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Spec compliance | **REWORK** | §2 ✓ six tables exact (columns/uniques/nullability match spec; A1 `0003_repository.sql` ✓; A3 SECRET markers at migration lines 95/113 ✓). §3 routes exist in `repository-http.ts` but unmounted in prod (D2). A4 receiver endpoint absent (D3). §4 shapes implemented but unregistered in prod (D2). §5: 10/17 CREATE files present; 3 UI files absent (D4). §6 absent (D4). §7: T01–T11,T14 ✓; T12 ✗, T13 ✗ (D5). Scope creep (benign): `packages/contracts/src/repository-http.ts`, `tests/helpers/repository-http-server.ts`, `tests/fixtures/kaneo-src-schema.sql` — test infra. |
| 2 | Tests that cannot fail | **PASS** | Assertions are behavioral (row/event/txid counts, 401/403/404 paths, span attrs). Reviewer replayed T01 sabotage: `is_private boolean NOT NULL DEFAULT false` → `NOT NULL` ⇒ `1 failed` (catalog exactness RED); revert ⇒ `3 passed` (GREEN). Pasted under evidence. Note: manual `"http.route"` annotation is redundant with `@effect/platform`'s own — only whole-middleware removal reddens T11 (c25 verified; suite also asserts trace-join and `stellarc.principal.id`, which the platform does not emit). |
| 3 | Migrations | **PASS** | `0003_repository.sql` new, append-only (numstat 123/0); `MIGRATIONS` list appended in order (migrate.ts:12); no shipped migration touched (`git diff dev...HEAD -- packages/db/migrations/` = new file only); no journal reformat. |
| 4 | Doctrine | **PASS** | Mutations transactional with same-tx event append; actor guard `if (!org \|\| !actor) throw "Invalid principal"` (repository.ts:30); `assertNoSecrets` on every event payload; `GrantPublic` schema rejects token fields; no grant collection in shapes; telemetry test asserts no `gho_` marker/PII/SQL text in spans, events, responses; no model calls; `console.*` only in `tools/import-repository.ts` CLI (mirrors `migrate.ts` convention). |
| 5 | Worker debris | **PASS** | No stray files; probe-repo.spec.ts added c24 then removed c24 (net zero); lint clean over 974 files; no debug logs, no generated noise. |
| 6 | Screenshots | **FAIL** (D4) | `git diff origin/dev...HEAD --stat -- apps/stellarc-ui/` → **empty**. Zero UI files across 26 cycles. `__screenshots__/{desktop,tablet,mobile,mobile-small}/repo-issues.png,repo-pull-detail.png` all pre-exist on dev (fork baselines); this PR regenerated nothing, exercised no touch, added no `repo-list` evidence outside fork-provenance. T12 unmet. |
| 7 | Spans (ADR 0010) | **PASS w/ note** | 19 `Effect.fn` sites (Domain.*, stellarc.event.append, stellarc.http.request, stellarc.github.*); route/method/status/org/principal.kind present; DB spans carry no `db.query.text` (asserted); secret/PII absence asserted. Note D6 (hardening only). |
| 8 | Gates re-run | **PASS** | Pasted under evidence. Full integration suite exceeds 900 s under host load (each file boots disposable Postgres); repository files run per c25 precedent — 36/36 green. |

## DEFECTS

1. **[BLOCKING] Null cycle — c25 defects untouched.** PR head `aaadb93e` = c25-reviewed commit; implement c26 passed at 13:02:04Z with zero new commits (last PR commit 12:17:29Z, before c25 review). Orchestrator must not read c26's pass as remediation. **Fix:** re-open implement against the c25/c26 defect list; do not merge until PR head ≠ `aaadb93e`.
2. **[BLOCKING] Repository routes + shapes never mounted in production.** `apps/stellarc-api/src/main.ts:10` imports only `foundationHandler`; `grep -rn repository apps/stellarc-api/src/main.ts apps/stellarc-api/src/http.ts` → 0 hits. `repositoryHandler` (repository-http.ts:303) and `registerRepositoryShapes` (repository-shapes.ts:226) are imported **only** by `tests/helpers/repository-http-server.ts:8-17`. A running API 404s every §3 route and serves no repository tables on `/v1/shape`. Spec §5 MODIFY list names `http.ts`/`main.ts`. All green HTTP tests prove the test harness, not the shipped artifact. **Fix:** compose `repositoryHandler` + `registerRepositoryShapes(engine)` into `main.ts` (mirror T0 wiring) and add one integration test that boots the production composition and hits `/api/identity/orgs/:org/repos`.
3. **[BLOCKING] A4 webhook receiver endpoint missing.** A4: "T4 owns the GitHub webhook *receiver* endpoint (signature verify → event append)". Only the domain service exists (`githubWebhookEffect`, repository-webhook.ts:47); `ROUTES` (repository-http.ts:35-57) has no webhook path. **Fix:** add `POST /api/identity/orgs/:org/github/webhook` (raw body + `x-hub-signature-256` + delivery id) mounting `githubWebhookEffect`, wired in prod per D2, tested through the real server.
4. **[BLOCKING] Entire UI deliverable absent.** §5 CREATE `apps/stellarc-ui/src/lib/repository-collections.ts`, `repository-client.ts`, `e2e/repository.spec.ts`; §6 four-viewport parity; §7 T12. `git diff dev...HEAD -- apps/stellarc-ui/` → empty. §1's "thinnest live path" (discovery → sidebar list → live issues/PRs) unmet end to end. **Fix:** implement collections/client against the live shape API, lift the fork's repository surfaces per manifest, capture four-viewport Playwright baselines with built API + real isolated Postgres + imported rows, no request interception.
5. **[MAJOR] T13 org-switch/logout disposal untested.** §4 requires disposal of old handles/caches and no prior-org leakage; §7 T13 sabotage = "reuses an unscoped collection key". Zero references across the repository suites (grep org-switch/disposal → 0). **Fix:** shape-level test — snapshot org A, switch to org B on the same engine, assert no A rows and that an unscoped reused key fails; sabotage the org scoping out of a collection key → RED.
6. **[NOTE, non-blocking] Span-attribute redundancy.** Manual `"http.route"` in `repositoryTelemetry` duplicates `@effect/platform` (HttpLayerRouter.js:111); per-attribute sabotage cannot redden T11. Hardening: assert a repository-owned attribute the platform never emits (suite already asserts `stellarc.principal.id` — keep and prefer that).

## Test-run evidence (reviewer-executed, pristine tree @ aaadb93e)

- `bun run lint` → `Checked 974 files in 9s. No fixes applied.`
- `bun run typecheck` → clean (tsc --noEmit, no output)
- `bun run test:unit` → `Test Files 3 passed (3), Tests 22 passed (22)` (24.43 s)
- Integration, six repository files: `Test Files 6 passed (6), Tests 36 passed (36)` (333.62 s)
- Full `bun run test:integration` → timed out at 900 s under host load (exit 143); per-file runs used instead, matching c25 precedent
- Negative control replay (T01, reviewer-executed): sabotage `is_private boolean NOT NULL DEFAULT false` → `NOT NULL` ⇒ `Test Files 1 failed (1), Tests 1 failed | 2 passed (3)`; revert ⇒ `1 passed (1), 3 passed (3)`

**Verdict: REWORK — 6 defects (4 blocking, 1 major, 1 note).**
