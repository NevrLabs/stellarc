VERDICT: PASS

Review method: adversarial, diff-first. PR 60 head `3edafb8a` (18 commits), fetched as `origin/pr-60`, audited in a disposable worktree `/tmp/stl25-review` (removed after; main tree untouched). Gate check: latest implement = cycle 10 `pass` (2026-09-18T09:27:57Z) with real pushed commits this time — review-9's phantom-pass defect is resolved (new commits `3edafb8a`, `b92aea37`, `8ac4b4f4` beyond review-9's head `a9a0c876`).

## Per-item audit

| # | Item | Verdict |
|---|---|---|
| 1 | SPEC COMPLIANCE | **PASS.** Every §5 CREATE present (`packages/sync/src/sse.ts`, `tests/integration/shape-sse.test.ts`, `tests/unit/shape-sse.test.ts`, `tests/helpers/proxy-fixture.ts`, `tests/integration/shape-proxy.test.ts`, `tools/measure-edge-sse.ts`, `tools/measure-shape-concurrency.mts`, `docs/adrs/0012-sync-transport-hardening.md`); every MODIFY done (`index.ts` allowlist+SSE branch+metrics, `http.ts` streaming branch with no `response.text()` on the SSE path, `test-server.ts` sseTiming/revokeAll, T18 sibling edit drops `live_sse` only). §3 negotiation rule, strict-boolean allowlist, 20s cycle/15s ka, `X-Accel-Buffering: no`, error-union mapping (409 JSON pre-stream, must-refetch frame mid-stream), revocation at cycle+ka — all implemented. S01–S16 covered (S12/S13 now real: snapshot-minted held SSE harness + `--self-check`, S12 integration legs, edge-verdict units). Review-9 D1/D2/D5 fixed and pushed. Scope creep (carried, minor): `.forge-blocker.md` deleted, `.forge-deps-added.md` repurposed, root `playwright@1.62.0` + bun.lock fsevents churn (documented under the pre-authorised deps rule). Zero UI files touched. |
| 2 | TESTS THAT CANNOT FAIL | **PASS.** Every new suite reddens under a named sabotage — replayed myself at head (worktree, one variable per run, reverted clean each time): **A** (S01/S11 spec control) remove `live_sse`/`experimental_live_sse` from allowlist → `× S02 × S11 … Tests 2 failed \| 7 passed (9)`; restored → `Tests 9 passed (9)`. **B** (S02 control) force SSE on `live_sse=true` regardless of Accept/offset → `× S01 … 1 failed`. **C** (S14) replace `Effect.makeSpan("stellarc.shape.sse")` with a stub → **7 integration tests RED** (S03/S01/S04/S06/S15/S05/S07). **D** (S16 control) 204→200 at long-poll deadline → `× T11 … 1 failed`. S12's lying-harness mode (all-live without measuring) turns the cap-2 leg red by construction (`ceiling` must equal exactly 2, stall exactly at 3). No decorative tests found. |
| 3 | MIGRATIONS | **PASS.** `git diff origin/dev...HEAD -- packages/db` empty; no migration files in diff; journal untouched. §2 NONE honored (transport-only). |
| 4 | DOCTRINE | **PASS.** No SQL outside the engine (page path is SELECT-only); no direct writes, no new events, no mutations; no model calls from control plane; no hardcoded hex tokens (issued tokens remain random BigInt); span attrs limited to table/org/principal.kind/offsets/events_sent/close — no statement text, no PII; `console.*` only inside tools (orchestrator-run, test-exempt class). Long-poll path byte-compatible (foundation suite green unmodified). |
| 5 | WORKER DEBRIS | **PASS.** No stray files, no commented-out code, no debug logs in shipped paths; test worktree cleaned up. Carried minors: `.forge-blocker.md` deletion + `.forge-deps-added.md` rewrite (orchestrator confirmation), bun.lock fsevents 2.3.2↔2.3.3 churn. |
| 6 | SCREENSHOTS | **N/A-PASS.** Zero files under `apps/stellarc-ui` in the diff — no PNG deltas expected; frozen/responsive suites unmodified per §6. Carried caveat: no run evidence of the Playwright S16 umbrella leg on this branch; coverage rests on zero-UI-diff + proven long-poll byte-compat. |
| 7 | SPANS (ADR 0010) | **PASS.** `sseEffect = Effect.fn("Sync.sseEffect")`; per-connection `stellarc.shape.sse` span with table/offset_from/org/principal.kind/events_sent/close; page spans parented via `Tracer.ParentSpan` (S15 asserts `parentSpanContext.spanId`); principal.kind handler-derived (`principalKindFrom`) — S15 asserts `anonymous` for principal-less connections; span assertion goes red when instrumentation is removed (my control C: 7 tests). No `console.*` outside tools; no statement text/PII in attributes. |
| 8 | RE-RUN GATES (at head `3edafb8a`, clean worktree) | **PASS.** `tsc --noEmit` exit 0. `biome check .` — `Checked 963 files … No fixes applied`, exit 0 (review-9's 4 lint errors fixed). Unit: `Test Files 5 passed (5), Tests 27 passed (27)` (17.8s). Integration: `Test Files 4 passed (4), Tests 65 passed (65)` (503s). PR CI checks red but **proven inherited/environmental**: `foundation` dies at `sudo apt-get install postgresql-15` → `E: Unable to locate package postgresql-15` (runner repo issue; zero tests executed) and the Foundation workflow has **never** passed on `dev` — fails identically on `.forge`-only commit `6cafc62f`; `ui-typecheck-budget` also fails on that same dev commit. Not PR-caused. |

## DEFECTS (all minor; none block)

1. **[MINOR — carried]** `.forge-blocker.md` deleted by this PR (not in §5 manifest). **Fix:** orchestrator confirms the deletion or restores the file from merge-base.
2. **[MINOR — inherited]** `tests/gates.test.ts:16` kills the integration leg at 300 s; the suite now needs ~503 s, so the gates wrapper can never pass it. **Fix:** raise the timeout or split the integration config (orchestrator action, pre-existing on dev).
3. **[MINOR — carried]** No run evidence for the frozen+responsive Playwright S16 umbrella leg (all four viewports). **Fix:** orchestrator runs `bun run e2e` once pre-merge or formally accepts the zero-UI-diff argument.
4. **[MINOR — inherited/environmental]** PR CI red (`foundation` apt `postgresql-15` unavailable; `ui-typecheck-budget`) — fails identically on dev's own head. **Fix:** infra/orchestrator; not attributable to this PR.
5. **[MINOR]** Root `playwright@1.62.0` dependency + bun.lock fsevents churn — collateral of the pre-authorised deps rule, documented in `.forge-deps-added.md`. **Fix:** none required; recorded.

## Appendix — replayed evidence (clean worktree at 3edafb8a)

- `bun run typecheck` → exit 0.
- `bun x biome check .` → `Checked 963 files in 6s. No fixes applied.` exit 0.
- Unit (`vitest.config.ts`): `Tests 27 passed (27)`.
- Integration (`vitest.integration.config.ts`): `Tests 65 passed (65)` — includes S01–S08, S10, S11, S14, S15 (shape-sse), S08–S10 + both S12 self-check legs (shape-proxy), foundation + identity suites.
- Negative controls (each reverted clean, `git status` 0 dirty after):
  - A allowlist minus the two params → `× S02 × S11 … Tests 2 failed | 7 passed (9)`; restored → `Tests 9 passed (9)`.
  - B negotiation ignores Accept/offset → `× S01 … Tests 1 failed | 8 passed (9)`.
  - C span stub → integration `Tests 7 failed | 2 passed (9)`; reverted → green.
  - D 204→200 long-poll deadline → `× T11 … 1 failed | 3 passed`.
- CI forensics: job 105547689077 fails at step "Install disposable PostgreSQL binaries" (`E: Unable to locate package postgresql-15`); Foundation workflow run history on `dev` shows zero successes since creation, including on `.forge`-only commits; `ui-typecheck-budget` also red on dev commit `6cafc62f`.
