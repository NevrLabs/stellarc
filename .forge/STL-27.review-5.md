VERDICT: REWORK

Reviewed PR #59 (head 0994c3b, base dev@493e74c) as the adversarial stage-5 reviewer. Diff = 41 files, +3159/−0 (spec's 40 CREATEs + one conditional CI MODIFY). All findings below verified by re-execution, not by reading the implementer's summary.

## Per-item audit

### 1. SPEC COMPLIANCE

| Spec item | Verdict | Evidence |
|---|---|---|
| 14 canon SQL files with headers (owner/semantics/preconditions/blocked-if) | implemented | R01 green (4/4 unit); header fields present in all 14 |
| Canon README with provenance + supersession table | implemented | docs/legacy/reconciliation/README.md:28-60 mirrors wave-plan supersession list |
| `make-legacy-fixture.ts` deterministic generator | implemented | Deterministic seeds; `RECON_FIXTURE_DIR` override; regenerates cleanly standalone |
| `make-destination-golden.ts` bound to merged migrations | **DEVIATED — broken** | D1: crashes on the PR merge commit (see below) |
| `canon.ts` loader/validator | implemented | Unique contiguous ids, 16 sabotages validated |
| `run.ts` canon-proof mode | implemented | 14 queries, blocked semantics, spans, report, exit codes |
| `run.ts` live mode = real merged importers from restored snapshot | **DEVIATED — hollow** | D2: `runLiveEffect` (run.ts:136-150) is byte-identical to canon-proof except the mode label; no importer integration point exists anywhere in the tree |
| R01–R22 test rows | mostly implemented | 43 integration + 4 unit tests; exceptions: R23 (D3), HTTP arms of #9/#12 (D4) |
| R23 report/exit contract test | **MISSING** | D3 |
| #9/#12 HTTP hooks (asset URL 200; cross-org HTTP probe) | **MISSING** | D4: grep for "hook" across tools/docs = zero hits; SQL headers defer to a hook that does not exist |
| Zero HTTP endpoints / sync shapes / UI diff | implemented | No apps/, no packages/ files in diff; §3/§4/§6 zeros hold |
| CI file edit only if bridge/pg_restore absent | deviated, justified | dev CI red with `E: Unable to locate package postgresql-15` (run on 493e74c); PGDG repo addition is the sanctioned conditional MODIFY. Not scope creep. |
| Scope creep | none | 41 files = 40 spec CREATEs + sanctioned ci.yml MODIFY |

### 2. TESTS THAT CANNOT FAIL

- R22 span test: I replayed the REAL negative control — removed `Effect.withSpan("stellarc.reconcile.query")` from runQuery, ran `-t 'spans carry'`: **RED** at `expect(spans).toHaveLength(14)` (line 586). Restored. Genuine.
- R01: deleted `06-status.sql`, corpus test went **RED** ("query file count 13 != canon_count 14"). Restored. Genuine.
- In-suite "R22 negative control" test (integration.test.ts:621-666) rebuilds a stripped pipeline inline instead of re-running the instrumented one — semi-decorative, but the real control passes (proven above). Acceptable with note.
- R21 "all-blocked" test line 526: `expect(red > 0 || allBlocked).toBe(true)` is a tautology after line 524 asserts `allBlocked === true`. Decorative line; the exit-contract it illustrates is untested (D3).
- R02 negative control (lines 451-468) manually recomputes actual≠expected instead of re-running the R02 count assertion — proves the mismatch exists, not that the assertion fires. Marginal; acceptable.
- Per-query sabotage tests: all 16 replayed red in CI (foundation job log lines 430-476, 0994c3b). Genuine.

### 3. MIGRATIONS

No migration files touched (diff contains zero `packages/db/` modifications). No shipped-migration edits, no journal reformat. `git tag --contains` n/a — nothing to contain. CLEAN.

### 4. DOCTRINE

- D12: harness writes only disposable test clusters; no domain-table writes outside fixtures. CLEAN.
- Events: `identity:apikey-reissued` contract defined (payload `{id, principalId, reason:"legacy-reissue"}`), emission correctly deferred to STL-15. But the full contract (schema_version 1, org-scoped, not browser-visible) is only in the spec, partially in query 14's header — not recorded in the README where STL-15 will look (D6).
- Hardcoded hex: `decode('89504e47','hex')` = synthetic PNG magic bytes in seed data. Fine.
- D4 model calls: none. CLEAN.

### 5. WORKER DEBRIS

None. No TODO/FIXME/debugger/console.* in new code (only a comment mentioning the console.* ban). Diffs are clean generated fixtures + sources. CLEAN.

### 6. SCREENSHOTS

Spec §6: zero UI surfaces, baselines must not be regenerated. Diff touches no UI file, no PNGs. N/A — compliant.

### 7. SPANS (ADR 0010)

- `Effect.fn("ReconcileCanon.*")` / `Effect.fn("ReconcileRunner.*")` on every service function. ✓
- `stellarc.reconcile.query` span carries query_id/mode/verdict/violations; attributes contain no SQL text/PII (test asserts, and I verified red-ability by stripping the wrapper). ✓
- db.* spans via `@effect/sql` SqlLive; test asserts absence of `db.query.text`/`db.statement`. ✓
- No `console.*` outside the fatal `main().catch` stderr write. ✓

### 8. RE-RUN RESULTS (mine, not the implementer's)

| Gate | Result |
|---|---|
| `vitest.config.ts tests/unit/reconcile-canon.test.ts` | 4/4 passed |
| `vitest.integration.config.ts tests/integration/reconciliation.test.ts` (isolated) | 43/43 passed |
| `vitest.integration.config.ts` (full, background) | 1 failed (R03 timeout 30s) / 85 passed — exit 1 |
| PR CI foundation job (run 35053659153 @ 0994c3b) | **failure** — R03: `PostgresError: relation "user" already exists` in make-destination-golden |
| Simulated merge commit (`git merge-tree origin/dev HEAD` → commit d6df423) + `make-destination-golden.ts` | **`PostgresError: relation "user" already exists`** — root cause reproduced locally |
| `bun run lint` / `bun run typecheck` | both clean |
| R22 sabotage replay (withSpan stripped) | RED as required, then restored |
| R01 sabotage replay (canon file deleted) | RED as required, then restored |
| Generator idempotency standalone (2× runs, branch HEAD) | OK — fails only post-merge with dev |

## DEFECTS

1. **[BLOCKER] Golden generator ignores merged migrations — branch CI is red at head.** `tools/reconciliation/make-destination-golden.ts:20-22` runs `migrate()` then unconditionally executes `DESTINATION_SCHEMA_SQL` (`CREATE TABLE public."user"` etc.). dev already merged STL-15's `packages/db/migrations/0002_identity.sql`, which creates `user`/`account`/`organization`/`organization_member`/`organization_role`/`team`/`team_member`/`invitation`/`apikey`/`user_avatar`/`principal`/`identity_grant`/`identity_import`. PR CI (which tests the merge commit) fails R03 with `relation "user" already exists`; reproduced on my locally constructed merge commit (d6df423). Expected fix: rebind the generator to merged code per spec §1 — source identity-table DDL from the merged migrations (drop duplicated DDL from `DESTINATION_SCHEMA_SQL`, or guard with existence checks that FAIL on column drift rather than silently skipping), regenerate and commit both dumps, R03 green on the merge commit.
2. **[BLOCKER] Live mode runs no importer and fakes live-green over the canon-proof golden pair.** `run.ts:136-150` (`runLiveEffect`) differs from canon-proof only by the mode label; `main()` live branch (run.ts:255-257) migrates but never restores the legacy snapshot and never invokes any importer — no integration point exists for a merged STL-15 importer to plug into. Test "R21 live mode: restored golden pair driven through the live runner is green" (integration.test.ts:533-549) hands-labels pre-materialized canon-proof data as `live` green — exactly the conflation the spec forbids ("canon-proof … never reported as wave reconciliation PASS"; live = "real merged importers run from the restored snapshot"). Expected fix: live mode must restore the legacy snapshot into the destination cluster, detect/invoke the merged identity importer (absent ⇒ identity queries `blocked` with reason naming STL-15), and the golden-pair-live-green test must be deleted or relabelled canon-proof.
3. **[MAJOR] R23 unimplemented.** No test anywhere covers the report/exit contract (JSON report written to artifacts dir, nonzero exit on any red or all-blocked, no PII). `writeReport`/`aggregate`/`main`'s `process.exitCode` logic are completely unexercised; flipping verdict aggregation would stay green. Expected fix: add an R23 test driving `run.ts` main (or extracting its aggregation) asserting report file contents and exit code 1 under a red result and under all-blocked, with the R21-tautology line (integration.test.ts:526) removed or made load-bearing.
4. **[MAJOR] #9/#12 HTTP arms missing.** Spec §5 rows 9 and 12 require "SQL + declared harness hook" (asset URL resolves 200; cross-org HTTP probe). No hook mechanism exists in `tools/reconciliation/` (grep: zero). STL-20 cannot consume an HTTP arm from this canon. Expected fix: implement the declared harness hook interface (even as a registered-but-blocked arm reporting `blocked` until STL-20's object store exists) or record the omission as a supersession entry in the README — silence is not an option.
5. **[MINOR] Sabotage headers incomplete.** Spec §5: every canon/sabotage file carries number, owner, semantics source, precondition tables, blocked-if. All 16 files under `tests/fixtures/reconciliation/sabotage/` lack "Precondition tables:" and "Blocked if:" lines (they carry Sabotage/Owner/Semantics source/Named violation). Expected fix: add the two missing header lines to all 16 files (validator currently only checks canon files' headers — extend it).
6. **[MINOR] #14 event contract not recorded in the README.** Spec §2 defines `identity:apikey-reissued` (pluginId `identity`, schema_version 1, payload `{id, principalId, reason}`, org-scoped, not browser-visible) as this ticket's deliverable for STL-15 to implement; only the payload/plugin_type fragments appear in query 14's SQL header. Expected fix: full contract block in `docs/legacy/reconciliation/README.md`.
7. **[MINOR] R19 known-answer never touches the fixture.** `tests/unit/reconcile-canon.test.ts:50-66` verifies `hashApiKey` against a hand-rolled reimplementation — both sides come from the same tree, and the manifest's `reference_id` linkage (raws ↔ stored hashes) is never asserted against the restored fixture. A generator switched to any other 43-char hash (e.g. truncated sha512) stays green everywhere. Expected fix: integration test that restores the golden fixture and asserts `public.apikey.key WHERE reference_id = <manifest reference_id>` equals `hashApiKey(manifest raw)` for every known-answer row.
8. **[MINOR] R03 brittleness.** Even with D1 fixed, R03 spawns two full initdb clusters via child processes under the config's 30s `testTimeout`; my full-suite background run timed out at exactly 30000ms under load. Expected fix: explicit per-test timeout (≥120s) for the freshness test.

Defect count: 8 (2 blockers, 2 major, 4 minor).
