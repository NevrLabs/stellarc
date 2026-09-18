VERDICT: REWORK

Reviewed PR #59 head 7a4ddc4 (base dev). All c5 defects (D1–D8) verified fixed by re-execution: generator rebound to merged 0002 migrations with a drift guard; live mode restores the snapshot, detects/invokes the importer via a real seam, and blocks naming STL-15 when absent; R23 CLI exit/report contract tested (exit codes reproduced: canon-proof=0, live=1); #9/#12 HTTP arms declared + load-bearing + live-blocking; sabotage headers complete and validator-enforced; README carries the full reissue-event contract; R19 fixture linkage pinned; R03 timeouts explicit. My replays: R01 delete-file RED confirmed; Q6/06.sql sabotage RED→sabotage-stripped-detection RED (decorative-test check) confirmed; R22 span-stripping RED confirmed; bun test 2/2 pass (873s); lint+typecheck clean; CI foundation pass at head. Bytes verified clean of DISPLAY-filter artifacts.

## Per-item audit

### 1. SPEC COMPLIANCE

| Spec item | Verdict | Evidence |
|---|---|---|
| 14 canon SQL files with complete headers | implemented | R01 green + delete-file replay red; headers carry Owner/Semantics/Preconditions/Blocked-if |
| README with provenance + supersession | implemented | README:23-60 (supersession table, per-query provenance) |
| make-legacy-fixture.ts deterministic | implemented | R03 regen comparison green + tamper negative control |
| make-destination-golden.ts bound to merged migrations | implemented | migrate() + assertIdentityMirror drift guard (D1 fixed) |
| canon.ts loader/validator | implemented | unique contiguous ids, 16 sabotages, sabotage header validation |
| run.ts canon-proof mode | implemented | 14 queries, blocked semantics, spans, report, exit codes |
| run.ts live mode (real importers from snapshot) | implemented | detectIdentityImporter seam; snapshot restored; blocked naming STL-15 (D2 fixed) |
| 16-file sabotage corpus | implemented | all headers complete (D5 fixed) |
| Event contract in README | implemented | README:61-77 (D6 fixed) |
| R01–R23 test rows | implemented | 52 integration + 5 unit, all green |
| R24 gate discovery | **DEVIATED — thin** | No R24-labelled test and no in-repo record of the R24 negative control ("intentional assertion failure fails root gate", "remove suite from glob"). The suites DO execute under bun test (I ran the root gate: 2/2 pass), but the spec's RED evidence for discovery was never produced. See D3. |
| 40 CREATE, no unexpected MODIFY | implemented | 43 files = 40 spec CREATE + live-identity-seed.ts (test double, justified by D2) + gates.test.ts timeout raise + ci.yml PGDG (both conditional MODIFYs the spec permits) |
| HTTP arms #9/#12 | implemented | registry + load-bearing + live-block semantics (D4 fixed) |

Scope creep: none material. `live-identity-seed.ts` is a test double required by the D2 fix — acceptable.

### 2. TESTS THAT CANNOT FAIL

Every named sabotage replayed green→red by the suite (R05–R20 loop) and spot-checked by me (06.sql). Decorative-test probe: stripping Q6's detection SQL turned its test red (AssertionError expected 'green' to be 'red'); stripping the withSpan instrumentation turned R22 red (expected [] to have length 14). Negative controls are load-bearing.

**Gap:** R05b-style fidelity arms exist only for the columns the c5 review named. My independent column-coverage audit (every value-mismatch arm vs legacy DDL) found uncompared columns that stayed GREEN under live drift probes — see D1/D2. Those are holes in the CANON (detection), which no test guards because no test enumerates column coverage programmatically.

### 3. MIGRATIONS

None touched. `git diff origin/dev...HEAD -- packages/db/migrations` = empty (merge commit only). No shipped migration modified or deleted. Journal untouched.

### 4. DOCTRINE

- D12 direct SQL: harness-only (fixtures/tests), reads restored copies; no domain-table writes in service code. OK.
- Events: golden pre-materialized in canon-proof; R20b tests contract strictness (wrong reason/principalId red; both-arms red). No actor-less mutations.
- Hardcoded hex: none; #14 uses the fork base64url algorithm with known-answer + manifest linkage (R19, D7 fixed).
- Model calls: none in control plane. OK.

### 5. WORKER DEBRIS

None. No TODO/FIXMY/console.*; tmp dirs cleaned in finally-blocks; my own probes removed (tree byte-identical to 7a4ddc4 at end).

### 6. SCREENSHOTS

Spec §6: zero UI surfaces, no UI file in diff — nothing to screenshot, baselines untouched. Correct.

### 7. SPANS (ADR 0010)

runQuery/preconditionMissing/loadQuery/loadSabotage/canonProof/live/detectImporter/invokeImporter all Effect.fn("Reconcile*"); stellarc.reconcile.query span carries id/mode/verdict/violations; db.* spans exist without statement text; R22 asserts attributes and its negative control goes red on instrumentation removal (verified by my replay). No console.*, no PII in attributes. One nuance: blocked-early paths annotate then return without the withSpan wrapper? No — runQuery pipes withSpan around the whole gen including blocked branches; verified by the 14-span assertion over a green run. Compliant.

### 8. RE-RUN RESULTS

- unit reconcile-canon: 5/5 pass (611ms)
- integration reconciliation: 52/52 pass (250s)
- lint (biome): clean; typecheck (tsc --noEmit): clean
- root gate `bun test`: 2/2 pass (873s)
- CLI: canon-proof exit 0 (report: 14 green), live exit 1 (all-blocked)
- CI at PR head: foundation pass (3m51s); ui-typecheck-budget fail = documented inherited dev noise, zero UI files touched

## DEFECTS

1. **[MAJOR] Q1 omits four fidelity columns that exist on both sides.** `docs/legacy/reconciliation/queries/01-identity-core.sql`: `user.ban_expires` (after :29), `organization.created_at` (after :74), `organization_role.created_at`,`organization_role.updated_at` (after :104) are absent from every value-mismatch arm, though legacy DDL (canon.ts:35-58) and merged 0002 both declare them. Live probe on the restored golden: `UPDATE public."user" SET ban_expires=…; UPDATE public.organization SET created_at=…; UPDATE public.organization_role SET created_at=…, updated_at=…` → Q1 violations 0→0 (stays green). The canon claims "all-column fidelity" (spec §5 row 1). Expected fix: add the four `IS DISTINCT FROM` comparisons; extend the R05b cases table with mutations for each so the coverage is negative-control-guarded.
2. **[MAJOR] Q7 external-link/repo-item arms match on keys but never compare payload columns.** `docs/legacy/reconciliation/queries/07-relations.sql:51-76`: `external_link.url/title/metadata/integration_id/resource_type` and `task_repo_item_link.sync_enabled/sync_broken_at/sync_broken_reason` are never compared (arms join on task_id/external_id/repo ids only). Live probe: `UPDATE public.entity_link SET url='https://drifted.example/x' WHERE id='el-ext-1'; UPDATE public.entity_link SET sync_enabled=true WHERE id='el-repo-1'` → Q7 violations 0→0. Spec §5 row 7 demands fidelity for these tables. Expected fix: add value-mismatch arms comparing the payload columns (url, title, metadata, sync_enabled, sync_broken_at, sync_broken_reason) + R05b mutations.
3. **[MINOR] R24 gate-discovery negative control never evidenced.** Spec §7 R24 requires RED proof that (a) an intentional assertion failure fails the root gate and (b) removing the suite from the glob is detected. No R24-labelled test or recorded run exists in the repo/README. The suites do execute under `bun test` (I verified 2/2 pass), so this is an evidence gap, not a discovery break. Expected fix: either a committed R24 evidence block in the README (commands + red output) or a unit test asserting the glob includes the reconciliation suite and fails on a thrown assertion through the bridge.

4. **[MINOR] Stale TODO-class comment contradicts fixed code.** `tools/reconciliation/run.ts:283` ("defect 2: live runs against the real legacy state") narrates the fix history inline; harmless but the phrasing "The legacy snapshot IS restored (defect 2…)" reads as worker debris. Expected fix: drop the defect narration, keep the behavioral statement.

No blockers. D1/D2 are real detection holes in the canon this ticket exists to author — exactly the class of defect the wave cannot afford to discover at STL-21's production-snapshot gate — hence REWORK rather than note-and-merge.
