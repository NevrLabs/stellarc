# STL-16 review — cycle 6 (PR #43, head 463f3a2469f3addb68386113954b0da3634ee70b)

**VERDICT: REWORK**

## Cycle-6 delta: NONE

PR #43 head `463f3a24` (2026-09-14T21:24) is **byte-identical** to the head
adjudicated REWORK in `.forge/STL-16.review-4.md` (deleted from dev by the
driver, recovered from `origin/dev` history and the PR comment). Cycle 6
(2026-09-15T15:25:42, "pass", PR 43, branch `forge/stl-16-c4`) pushed **zero
new commits**. The only rework work that exists — cycle 5's D2 fix
(`b7b74bb6` on `forge/stl-16-c5`: import emitters carry `{id,row}`, alias
event, +86 lines of importer tests) — sits abandoned on an unmerged branch;
`git merge-base` proves it is not an ancestor of the PR head. The cycle-6
"pass" is vacuous: same bytes, same defects. The orchestrator still has not
answered `.forge-question.md` (T28–T34 deferral; canonical #4–#6 SQL) — no
PR or issue comment does anything but log driver state, so the unapproved
scope cut stands.

## Independent re-verification (my own runs, isolated worktree `/tmp/stl16-review6`, detached HEAD = PR head)

- `bun install --frozen-lockfile` ✓ (747 pkgs); `bun run typecheck` ✓ exit 0;
  `bun run lint` ✓ exit 0 (1 warning, pre-existing shape).
- Focused suites, sequential: integration `work.test.ts` 17/17 ✓,
  `work-http` 6/6 ✓, `work-import` 6/6 ✓, `work-telemetry` 3/3 ✓,
  unit `work.test.ts` 13/13 ✓. (Parallel co-run of work-import flaked once
  1/6 under my own load — scheduling artifact, green in isolation both times.)
- **Negative control replay (spec §7 T10):** sabotage
  `if (!valid.includes(status))` → `if (false && …)` in `setTicketStatus`
  (work.ts:969), full-file integration run:
  `× T10 / × T11 / × T12 — Tests 3 failed | 14 passed (17)` RED;
  `git checkout` restore → `Tests 17 passed (17)` GREEN. Behavioral, no
  compile break. The validation oracle is genuine — which makes the missing
  pieces below failures of coverage, not of the core write path.

## Per-item audit

| # | Item | Verdict | Evidence (re-checked at head this cycle) |
|---|---|---|---|
| 1 | SPEC COMPLIANCE | **FAIL** | Backend services/HTTP/importer present; §4 sync collections unreachable (D1), §5 `work.spec.ts` + `tests/fixtures/work-reconciliation.sql` absent (`tests/fixtures/` does not exist), §6 five frozen screens unwired (`work-collections.ts` has zero consumers under `apps/stellarc-ui/src/`), §7 T23/T28–T34/T37-supp missing. Deferral asked in `.forge-question.md`, never approved (D3). Scope creep (unlisted files): `tests/integration/work-http.test.ts`, `tests/unit/work-unit-postgres.ts`, `work-upcasters.ts` split. Migration `0003_work.sql` vs manifest `0002` — legitimate (STL-15 landed 0002), not billed. |
| 2 | TESTS THAT CANNOT FAIL | **FAIL (3 weak)** | T22 (`work.test.ts:475`) asserts `id !== undefined` only — survives deletion of the snapshot/boundary machinery; spec's snapshot-race row untestable until D1. T27 (`work-http.test.ts:232`) asserts `txid > 0` on create only; spec sabotage "omit txid on deletes" cannot redden it. T01 scaffold tautological. My T10 replay above: genuinely red/green. `work.test.ts` order-dependent (`-t` filtering fails on missing fixtures). |
| 3 | MIGRATIONS | **PASS** | `0003_work.sql` new; no shipped migration touched; `migrate.ts` appends to the ordered list; journal appended, not reformatted. |
| 4 | DOCTRINE | **FAIL** | Single-tx service writes + event append + actor: good. Cross-org holes re-verified live: `assignLabelTask`/`deleteLabel` (work.ts:1302/1326) mutate any label id with no org predicate; `listLabels`/`listTemplates` (work-http.ts:406–470) honor caller-supplied `organizationId`. No hardcoded hex, no model calls, no post-commit second connection. |
| 5 | WORKER DEBRIS | **FAIL (minor)** | `.forge-question.md` force-added despite `.gitignore`; `tests/unit/work-unit-postgres.ts` reimplements `tests/helpers/postgres.ts`; `PROJECTIONS.where` dead code with a broken `task_flag` alias (D11); `electricFor()` identical stub for all 8 tables; `publicRateBuckets` unbounded (D12). No `console.*` outside `tools/import-work.ts` CLI. |
| 6 | SCREENSHOTS | **FAIL — REWORK** | Zero screenshots, zero Playwright projects run. `__screenshots__/fork-provenance/` untouched since T0 (`cef9c5f`). No `work.spec.ts`. "Only desktop PNGs" is rework; none at all is worse. |
| 7 | SPANS (ADR 0010) | **FAIL** | `grep -c 'Effect.fn'` across `work.ts` (1628 lines, ~40 service fns), `work-import.ts`, `work-http.ts` = **0**. Only shared request telemetry carries route/method/org/principal (T25 green — no PII/statement text). ≥1 span assertion per new path: 3 tests vs 41 endpoints. |
| 8 | GATES RE-RUN | **PASS (local)** | All green locally (above). CI `foundation` still fails at PGDG apt step — pre-existing on dev, not billed, but CI never exercised this suite; local runs remain the only verification. |

## DEFECTS (unchanged from review-4 — nothing was fixed; line numbers re-verified at head)

1. `packages/sync/src/index.ts:176` + `apps/stellarc-ui/src/lib/work-collections.ts` — work collections never registered with the ShapeEngine (`q.get("table") !== "sync_probe"` rejects all eight); `tailMessages`/`PROJECTIONS`/`workElectricSchema` have zero production consumers. **Fix:** register the 8 projections with org-scoped snapshot + reauthorized tail (§4); make T22 exercise snapshot+tail through the stock adapter.
2. `packages/domain/src/work-import.ts:330–352` (EMITTERS) — upsert events emitted `{id}`-only; every upsert schema in `work-events.ts:19–37` requires `{id,row}`; fails the slice's own upcaster (proved RED by cycle-4 probe; c5's fix exists on `forge/stl-16-c5` but was never merged). **Fix:** merge/re-implement `{id,row: Public}` emitters.
3. T28–T34 absent: five frozen screens on T0 stubs, no `apps/stellarc-ui/e2e/work.spec.ts`, no 5×4 viewport parity evidence. **Fix:** wire screens to `workCollections` (after D1), produce parity evidence — or obtain an explicit orchestrator approval of deferral (none exists).
4. `packages/domain/src/work.ts:1302,1326` — `assignLabelTask`/`deleteLabel` accept any label id, no org predicate → cross-org mutation. **Fix:** scope by `organization_id`/task→board join like `updateLabel`.
5. `apps/stellarc-api/src/work-http.ts:406–470` — `listLabels`/`listTemplates` use caller-supplied `organizationId` verbatim → cross-org reads. **Fix:** 404 unless `organizationId === s.org`.
6. SPANS: zero `Effect.fn` in new domain/import/HTTP code (ADR 0010, T26). **Fix:** wrap every service function; add ≥1 span assertion per new endpoint path; prove one assertion red when instrumentation is removed.
7. `packages/domain/src/work.ts:993` — `work:ticket-status-changed` emitted unconditionally, even `from === to`; `bulkPatchTickets`/`reorderTickets` write status without the transition pair. **Fix:** emit only on real transitions, on every status-writing path.
8. `packages/domain/src/work.ts:529` — `resolveBoardRef` has no HTTP consumer; no endpoint resolves slug/alias/`KEY-seq` (T07/T29). **Fix:** expose on board read routes, test over HTTP.
9. Missing mandatory tests: T23 (non-member/revoked shape access), T37-supplementary `deleteStatus` `StatusInUse` guard (no test references `deleteStatus`). **Fix:** add both.
10. `tests/integration/work.test.ts:475` (T22), `work-http.test.ts:232` (T27) — decorative as written. **Fix:** strengthen (delete txid; snapshot-race exactly-once) once D1 lands; make fixtures self-seeding.
11. `packages/sync/src/work-shapes.ts:100` — `task_flag` where-clause references undefined alias `t` (`b2.id = t.task_id`); dead code that would 500 if wired. **Fix:** correct aliases when wiring D1; derive real per-table electric metadata.
12. `apps/stellarc-api/src/work-http.ts:119` — `publicRateBuckets` never evicts (unbounded growth, one key per board·minute). **Fix:** prune expired windows.
13. Hygiene: `.forge-question.md` committed despite `.gitignore`; `tests/unit/work-unit-postgres.ts` duplicates `tests/helpers/postgres.ts`. **Fix:** untrack the question file; fold the helper into `tests/helpers/`.

Not billed: `0003` numbering; CI PGDG infra failure (identical on dev); `ui-typecheck-budget` ratchet noise; `.forge/*` orchestrator churn.

## Process defects (for the orchestrator, not the implementer's bill)

- Cycle-6 implement `pass` recorded a PR head identical to the REWORKed head — the gate should diff PR head against the last reviewed head and reject no-op passes.
- Cycle 5's real fix (`b7b74bb6`) was discarded by resetting cycle 6 onto c4; salvage it.
- `.forge/STL-16.escalation` and the unanswered `.forge-question.md` need an explicit orchestrator ruling on T28–T34 before the next implement cycle, or this loops forever.

Reviewer sign-off items (§7): number-claim concurrency ✓ (T08/T09 genuine), orphan-status invariant ✗ (untested), key-alias resolution ✗ (no HTTP surface), import fidelity ✓-but-events-broken (D2), live-collection screenshot evidence ✗ (none), SPANS coverage ✗.
