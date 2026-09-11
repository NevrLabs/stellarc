# STL-14 Review (cycle 29) — Adversarial

**REWORK**

Head audited: `83d69e2d` (PR #28, `forge/stl-14-c4` → `dev`). Diff reviewed, not the implementer summary.

## Per-item table

| # | Audit item | Verdict |
|---|---|---|
| 1 | Spec compliance | **FAIL** — core engine/health/shape/migration correct, but: ADR 0010 deleted, ADR 0009 edited (both forbidden by §5 "Do not modify ADRs"); T08 test absent; only 6 of ~21 mandatory §6 evidence screens shipped. |
| 2 | Tests that cannot fail | **PASS (with gap)** — replayed the T01 span negative control myself: renaming `"stellarc.shape.snapshot"` in `packages/sync/src/index.ts` turned `T01 HTTP shape spans remain inside the inbound request trace` RED (`expected [] to have a length of 1`), revert → GREEN. T01 boundary test (foundation.test.ts:1561) forces a concurrent commit between projection read and counter read and asserts exactly-one tail delivery. No decorative tests found. Gap: T08's "remove electric-schema" control has no home. |
| 3 | Migrations | **PASS (minor)** — `0001_foundation.sql` is greenfield (no shipped migration touched), advisory-lock + checksum runner correct, journal appended not reformatted. Minor: `grantRuntime` (append-only grants) is exported but wired into no production provisioning entrypoint; runtime denial rests only on `REVOKE … FROM PUBLIC` in the migration. |
| 4 | Doctrine | **PASS (minor)** — no raw-SQL-bypass, no event-without-actor, no mutation-without-event, no hardcoded token, no model calls. Minor: test-principal parsing `principalFrom` (`apps/stellarc-api/src/http.ts:154`) lives in production code (inert only because `AuthzLive` deny-all). |
| 5 | Worker debris | **FAIL (minor)** — `tools/forge/__pycache__/forge.cpython-311.pyc` is tracked (not gitignored; `.gitignore` lacks `__pycache__/`); 3 lint warnings remain (non-null assertions in tests). `.forge/*` churn is orchestrator-owned, not counted against the implementer. |
| 6 | Screenshots | **FAIL** — 6/21 §6 mandatory screens (sign-in, org-shell, repo-issues, repo-pull-detail, projects, project-detail) × 4 viewports; touch Sheet + 767/768 boundary exercised; 5d-Q1 provenance respected. But the ~15 missing screens are neither captured nor `test.fixme`'d with an owning ticket, violating §5e.3. |
| 7 | Spans (ADR 0010) | **PASS (instrumentation) / FAIL (doctrine doc)** — `Effect.fn` spans, `db.*` span with statement text stripped, http.route/principal/error.type attrs all present; span assertions red on removal (verified). But the ADR 0010 authority itself is deleted. |
| 8 | Re-run gates | **PASS** — `bun install --frozen-lockfile` OK; `bun run lint` exit 0 (3 warnings); `bun run typecheck` exit 0; `bun test` bridge → unit **7 passed**, real-PG integration **41 passed**, bridge **2 pass / 0 fail** exit 0. (`build`/`e2e` not re-run here; PR reports build 3/3, e2e 24 passed.) |

## DEFECTS

1. **`docs/adrs/0010-opentelemetry-native.md` deleted** — §5 forbids modifying ADRs; this is the doctrine authority §5f cites. Fix: restore the file byte-for-byte from `origin/dev`.

2. **`docs/adrs/0009-development-workflow.md` edited (lines 79–91)** — the "two kinds of screenshot" section was rewritten to claim baselines are "captured from the Kaneo fork at all four viewports", directly contradicting 5d-Q1 (fork provenance is never a `toHaveScreenshot` target; baselines come from the lifted UI + synthetic fixture). Fix: restore the original "fork provenance vs Playwright baselines" text.

3. **`docs/otel-local.md` deleted** — §5f references the local OTLP sink documented here. Fix: restore.

4. **T08 test missing** — §5e.4 acceptance requires "T08/T09 … green"; no test exercises stock `@electric-sql/client` `ShapeStream` protocol decode (initial/continuation/live/up-to-date, text+bigint `electric-schema`) or its "remove electric-schema" negative control. `@electric-sql/client` is declared but never imported in src/tests (only transitively via the collection). Fix: add the T08 test.

5. **Mandatory evidence screens incomplete** — only 6 of ~21 §6 screens captured; the missing ~15 (my-tickets, inbox, kanban, list, backlog, calendar, gantt, milestones, ticket-detail, repo-list, repo-pulls, members, teams, roles, developer) are neither captured nor `test.fixme`'d with owning ticket names (§5e.3 requires fixme, not silent absence). Fix: add `test.fixme` entries naming the owning STL ticket, or capture the screens.

6. **Shape 200 content-type unasserted and likely text/plain** — `apps/stellarc-api/src/http.ts:127` serves the shape body via `HttpServerResponse.text(...)` (default `text/plain`) although the engine (`packages/sync/src/index.ts:210`) set `application/json`; §3 requires `application/json` for 200 and no test asserts it. Fix: return the JSON response without re-encoding through `.text()`, and add a content-type assertion.

7. **Test principal parsing in production** — `apps/stellarc-api/src/http.ts:154` (`principalFrom`) parses `Bearer <org> <id>` in the production handler; §3 says test principals exist only in the test-composed server. Fix: move `principalFrom` into the test server, or make it a test-injected dependency.

8. **Tracked bytecode debris** — `tools/forge/__pycache__/forge.cpython-311.pyc` is committed and not gitignored. Fix: add `__pycache__/` (and `*.pyc`) to `.gitignore` and `git rm --cached` the file.
