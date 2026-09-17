REWORK

## Verdict

The canon corpus and harness are structurally complete (all 40 files, 14 queries, 16 sabotages, 2 dumps, README, manifest, 4 tools, 2 tests), but **query #3 is unparseable SQL** — a hard crash in the harness that no test can survive — and **CI is red**, so the reconciliation suites have never actually run green. Adversarial proof below.

---

## Per-item table

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | SPEC COMPLIANCE | DEVIATED | 40 CREATE files present (matches §5). 14 queries, 16 sabotages, 2 committed dumps, README, manifest, 4 tools, 2 tests. **But query #3 (`03-apikey.sql`) is broken SQL** and does not implement its own invariant. Query #14 labels garbled. No HTTP (§3) / UI (§6) / tables-events (§2) / sync-shape (§4) added — all zeros honored. Live mode does not invoke the merged importer (blocked-by STL-15, documented; see D4). |
| 2 | TESTS THAT CANNOT FAIL | FAIL (they fail for the wrong reason) | Negative controls are structurally sound (R02 row-drop, R04 drop→blocked, per-query sabotage, R17 13a/13b, R18/R20 14a/14b, R21 live 13b). But the "golden green" test calls `verdicts(pg)` which runs all 14 queries in order and **crashes at query #3** (unterminated string) — the suite is RED, not decorative. Sabotage 03 can never be exercised. |
| 3 | MIGRATIONS | PASS | Zero migration files in the diff; no modified/deleted shipped migration; no journal rewrite. |
| 4 | DOCTRINE | PASS | No production SQL writes (harness + sabotage target the disposable DB only). No hardcoded tokens (synthetic fixture values; span test rejects `sk-a`/`gh-token`/`bcrypt-hash`). `Effect.fn` used throughout. No `console.*` in service code (grep: only doc-comments). |
| 5 | WORKER DEBRIS | FAIL | Query #3 literal `***` redaction marker; query #14 literal `...` ellipses in violation labels; query #10 duplicate `created_at`/`updated_at` OR conditions. |
| 6 | SCREENSHOTS | N/A (PASS) | §6 declares zero UI diff; confirmed no `apps/stellarc-ui`, `.png`, `.tsx`, or `.css` files changed. No Playwright baselines regenerated. |
| 7 | SPANS (ADR 0010) | PARTIAL | `Effect.fn("ReconcileCanon.*")`/`ReconcileRunner.*` present; span `stellarc.reconcile.query` carries id/mode/verdict/violations; db.* spans asserted without `db.query.text`/`db.statement`; no PII in attributes (asserted). **Missing: no negative-control test that removes an `Effect.fn` wrapper (or adds `console.*`) and observes the span assertion go red** — R22's own RED condition is unimplemented. Live-path spans also unasserted. |
| 8 | RE-RUN GATES | FAIL | CI RED on this PR. `foundation` fails at `sudo apt-get install -y postgresql-15` (`E: Unable to locate package postgresql-15`, jammy runner) → `bun test`/vitest never executes. `ui-typecheck-budget` exits 2 (429 diagnostics, within budget but step still exits nonzero). Local re-run blocked: no `bun`/`node` on review host. Direct `psql` proof of the crash in D1 below. |

---

## DEFECTS

1. **BLOCKING — `docs/legacy/reconciliation/queries/03-apikey.sql:9,12,15`** — unparseable SQL. The three violation labels are the spec's `***` redaction marker copied verbatim: `SELECT 'apikey:*** AS violation, s.id, 'apikey' AS tbl` (and `'apikey:*** d.id, 'apikey'`, `'apikey:*** s.id, 'apikey'`). `psql` returns `ERROR: unterminated quoted string`. This makes `ReconcileRunner.runQuery` (`tools/reconciliation/run.ts:148`, `sql.unsafe(text)`) throw for query #3, crashing the whole `runCanonProofEffect` so no canon-proof run or sabotage-03 negative control can pass. **Fix:** author real labels mirroring queries #1/#2: `'apikey:missing-in-dest' AS violation`, `'apikey:missing-in-src'`, `'apikey:value-mismatch'` (third arm keeps the existing `s.col IS DISTINCT FROM d.col` WHERE clause).

2. **BLOCKING — CI is red; reconciliation suites never execute.** `gh pr checks 36` → `foundation: fail` and `ui-typecheck-budget: fail`. The `foundation` job dies at the postgresql-15 install step before reaching `bun test`, so R24 ("new suites execute under the gate") is unproven and the summary's "green in CI" is false. The install failure is pre-existing on `dev` (all recent dev commits are also red), but the spec charged the implementer to "verify binaries at rebind" and add a CI edit if needed. **Fix:** add the PGDG apt repository (or equivalent) to `.github/workflows/ci.yml` so `postgresql-15` resolves, then re-run `bun test` and confirm the reconciliation suites are green.

3. **`docs/legacy/reconciliation/queries/14-apikey-hash-audit.sql:34,37,40`** — violation labels are truncated with literal ellipses: `'apikey:invali...ent'`, `'apikey:reissu...nt'`, `'apikey:preser...nt'`. Not parse-breaking, but the "named violation" contract (§5, one named violation per file) is corrupted and no longer matches the sabotage comments (`14a.sql`/`14b.sql` reference `apikey:invali...vent`). **Fix:** restore full labels — `apikey:invalid-hash-no-event`, `apikey:reissue-no-event`, `apikey:preserved-with-event`.

4. **`tests/integration/reconciliation.test.ts` (R22 span test, ~L2116)** — no negative control. The span assertion verifies spans exist with correct attributes but never removes an `Effect.fn` wrapper (or adds a `console.*`) and observes the assertion go red, which R22 requires as its RED condition. **Fix:** add a test that runs the runner with instrumentation stripped (or a `console.log` injected) and asserts the span count/absence assertion fails.

5. **MINOR — `docs/legacy/reconciliation/queries/10-repository.sql:751-757`** — `s.created_at` / `s.updated_at` appear twice in the repo value-mismatch OR list (redundant). **Fix:** delete the duplicated two OR terms.

---

## Adversarial proof (item 2 / item 8)

Direct reproduction of query #3's first SELECT against disposable PostgreSQL 15:

```
$ psql -h /tmp/... -U stellarc_owner -d postgres \
    -c "SELECT 'apikey:*** AS violation, s.id, 'apikey' AS tbl;"
ERROR:  unterminated quoted string at or near "' AS tbl;"
LINE 1: SELECT 'apikey:*** AS violation, s.id, 'apikey' AS tbl;
                                                    ^
```

CI check results (PR head `d5b2fb3`):

```
$ gh pr checks 36 -R NevrLabs/stellarc
foundation             fail    16s
ui-typecheck-budget    fail    35s
```

`foundation` failure is at `Install disposable PostgreSQL binaries`: `E: Unable to locate package postgresql-15` (exit 100).
