# STL-16 review — cycle 4 (PR #43, head 463f3a2469f3addb68386113954b0da3634ee70b)

**VERDICT: REWORK**

Reviewed the diff (27 files, +6222/−32), not the summary. Gates re-run in an
isolated worktree at `/tmp/stl16-review` (detached HEAD = PR head). Orchestrator
churn (`.forge/*.json`, `driver.log`, forge.py, blocker deletions) excluded from
the implementer's bill.

## Per-item audit

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | SPEC COMPLIANCE | **FAIL (partial)** | Backend services/HTTP/importer largely per spec; but §4 sync collections are NOT reachable through the shape endpoint, §5 `work.spec.ts` + reconciliation fixture absent, §6 five frozen screens unwired, §7 T23/T28–T34 missing. Migration named `0003_work.sql` not `0002_work.sql` — legitimate (STL-15 landed `0002_identity`); recorded, not billed. T28–T34 deferral was asked in `.forge-question.md` but **never answered by the orchestrator** (zero PR comments); unapproved scope cut hidden behind PR body "Closes #16". Scope creep: `tests/integration/work-http.test.ts`, `tests/unit/work-unit-postgres.ts` not in manifest (harmless but unlisted). |
| 2 | TESTS THAT CANNOT FAIL | **FAIL (3 weak)** | Strong: T04–T17, T21, importer T18–T20 (assertion-level). Weak: T22 (`work.test.ts:475`) asserts only `id !== undefined` — passes with the snapshot/boundary machinery deleted; spec's snapshot-race row untested (and untestable — see D1). T27 (`work-http.test.ts:232`) asserts `txid > 0` on a create only; the spec sabotage "omit txid on deletes" cannot redden it. T01 scaffold (`work.test.ts:179`) drops the constraint itself then asserts the count is 0 — tautology, proves nothing about T01's oracle. Reviewer negative-control replay (full-file run, sabotage = disable validation predicate in `setTicketStatus`): RED `× T10 / × T11 / × T12 (3 failed)`; restore → `17 passed` GREEN. Behavioral (no compile break). Note: `work.test.ts` is order-dependent (running `-t T10` alone fails for missing fixtures). |
| 3 | MIGRATIONS | **PASS** | `0003_work.sql` is new; no shipped migration modified (`git tag --contains` n/a — no tags contain; `migrate.ts` appends to the ordered list, journal appended not reformatted). |
| 4 | DOCTRINE | **FAIL** | All writes go through domain services on one tx with event append + actor — good. But: cross-org holes — `assignLabelTask`/`deleteLabel` (work.ts:1302–1339) mutate any label id with no org predicate; `listLabels`/`listTemplates` (work-http.ts:406–470, domain `_org` ignored) honor caller-supplied `organizationId` → cross-org reads. No hardcoded hex, no model calls, events always carry actor. |
| 5 | WORKER DEBRIS | **MINOR FAIL** | `.forge-question.md` committed although `.gitignore:9` ignores it (force-add); `tests/unit/work-unit-postgres.ts` reimplements `tests/helpers/postgres.ts`; `PROJECTIONS.where` (work-shapes.ts) is dead code and its `task_flag` clause references an undefined alias `t` (`b2.id = t.task_id`) — would error if ever executed; `electricFor()` returns an identical stub schema for all 8 collections. No console.* outside `tools/import-work.ts` (CLI — acceptable). |
| 6 | SCREENSHOTS | **FAIL — REWORK per brief** | Zero screenshots: no UI surface touched, no Playwright project run, `apps/stellarc-ui/e2e/work.spec.ts` does not exist. The brief's rule "a PR that only regenerated desktop PNGs is REWORK" applies a fortiori to no PNGs at all. |
| 7 | SPANS (ADR 0010) | **FAIL** | `Effect.fn` count in `packages/domain/src/work.ts` (1628 lines, ~40 service fns), `work-import.ts`, `work-http.ts`: **0** (T0 precedent: `index.ts` uses `Effect.fn("stellarc.event.append")` etc.). Only the shared HTTP request span (via `requestTelemetry`) carries route/method/org/principal — that part works (T25/T26 pass, verified locally). "≥1 span assertion per new path" not met (3 telemetry tests vs 41 endpoints). No statement text/PII in attributes (T25 green). |
| 8 | GATES RE-RUN | **PASS (local) / CI red-for-infra** | `bun run lint` ✓ (1 warning, unused-import `createHash` guard region, pre-existing shape), `bun run typecheck` ✓, unit `work.test.ts` 13/13 ✓, integration `work.test.ts` 17/17, `work-http` 6/6, `work-import` 6/6, `work-telemetry` 3/3, full `bun test` bridge ✓ (336s, 2 pass). PR CI `foundation` fails at "Install disposable PostgreSQL binaries" — pre-existing PGDG infra failure, identical on dev HEAD; `ui-typecheck-budget` 429==429 inherited ratchet noise. Not the implementer's, but it means **CI never exercised the suite on this PR** — my local runs are the only verification. |

## Reviewer probes (behavioral, replayed myself)

- **Importer events are malformed (proof):** scratch integration test on a real
  disposable PG — `importWork` then `WorkUpcasterRegistry.decode` over every
  emitted event: `AssertionError: expected [Function] to not throw … 'Error:
  Unsupported event schema'` — RED. Importer emits `{id}`-only payloads; every
  upsert schema in `work-events.ts` requires `{id,row}`. T18's event test never
  decodes, so the suite stays green over broken events.
- **T10 negative control:** sabotage `if (!valid.includes(status))` →
  `if (false && …)` in `setTicketStatus`; full-file run RED (T10/T11/T12);
  revert GREEN (17/17). Genuine oracle.

## DEFECTS

1. `packages/sync/src/index.ts:176` + `apps/stellarc-ui/src/lib/work-collections.ts:60` — work collections never registered with the ShapeEngine: the shape endpoint rejects every `table` except `sync_probe`; `tailMessages`/`PROJECTIONS`/`workElectricSchema` have zero production consumers; the UI factories point at a 404ing handle. **Fix:** register the 8 work projections in the engine allowlist with org-scoped snapshot + reauthorized tail (§4), then make T22 exercise snapshot+tail through the stock adapter.
2. `packages/domain/src/work-import.ts:330–352` (EMITTERS) — upsert events emitted as `{id}` only; violates §2 contracts and provably fails the slice's own upcaster (probe above). **Fix:** emit `{id, row: <Public mapper>}` per table.
3. T28–T34 absent: five frozen screens still on T0 stubs, no `apps/stellarc-ui/e2e/work.spec.ts`, no screenshots for any surface or viewport. **Fix:** wire the screens to `workCollections` (needs D1 first), produce 5×4 parity evidence against fork-provenance baselines — or get an explicit orchestrator comment approving deferral; none exists.
4. `packages/domain/src/work.ts:1302–1339` — `assignLabelTask` and `deleteLabel` accept any label id with no org predicate → cross-org mutation. **Fix:** scope like `updateLabel` (join task→board organization check / `organization_id = org`).
5. `apps/stellarc-api/src/work-http.ts:406–470` — `listLabels`/`listTemplates` use caller-supplied `organizationId` verbatim (domain ignores the caller org) → cross-org reads. **Fix:** 404 unless `organizationId === s.org`.
6. SPANS: no `Effect.fn` anywhere in the new domain/import/HTTP code (ADR 0010, T26 "every service method is Effect.fn"). **Fix:** wrap service functions (`Effect.fn("Work.createTicket")` …) and add ≥1 span assertion per new endpoint path.
7. `packages/domain/src/work.ts:995` — `work:ticket-status-changed` emitted even when `from === to` (no-op PUT); conversely `bulkPatchTickets` (work.ts:1147) and `reorderTickets` write status without the transition pair. **Fix:** emit only on real transitions and on every status-writing path (T3 parity).
8. `packages/domain/src/work.ts:529` — `resolveBoardRef` has no HTTP consumer; no endpoint resolves slug or `KEY-seq`/alias URLs (T07/T29 "old URLs keep resolving"). **Fix:** expose slug/alias resolution on the board read routes and test over HTTP.
9. Missing mandatory tests: T23 (non-member/revoked membership shape access) nowhere; T37-supplementary `deleteStatus` `StatusInUse` guard untested (no test references `deleteStatus`). **Fix:** add both.
10. `tests/integration/work.test.ts:475` (T22) and `work-http.test.ts:232` (T27) — decorative as written (see item 2 of the table); `work.test.ts` is also order-dependent (`-t` filtering fails on missing fixtures). **Fix:** strengthen assertions (delete txid; snapshot-race exactly-once) once D1 lands; make fixtures self-seeding.
11. `packages/sync/src/work-shapes.ts:100` — `task_flag` `where` clause references undefined alias `t` (`b2.id = t.task_id`); dead code that would 500 if wired. **Fix:** correct aliases when wiring D1; `electricFor()` stub must derive real per-table metadata.
12. `apps/stellarc-api/src/work-http.ts:119` — `publicRateBuckets` Map never evicts (unbounded growth, one key per board·minute). **Fix:** prune expired windows.
13. Hygiene: `.forge-question.md` force-added despite `.gitignore:9`; `tests/unit/work-unit-postgres.ts` duplicates `tests/helpers/postgres.ts` (manifest named `work-fixture.ts`). **Fix:** untrack the question file (leave it untracked for the orchestrator), fold the duplicate helper into `tests/helpers/`.

Not billed: `0003_work.sql` numbering (T1 merged first); CI `foundation` PGDG
infra failure (identical on dev); `ui-typecheck-budget` 429==429 inherited
ratchet; `.forge/*` orchestrator churn.

Reviewer sign-off items from §7: number-claim concurrency ✓ (T08/T09 genuine),
orphan-status invariant ✗ (T37-supplementary untested), key-alias resolution ✗
(no HTTP surface), import fidelity ✓-but-events-broken (D2), live-collection
screenshot evidence ✗ (none), SPANS coverage ✗.
