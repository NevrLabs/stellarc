# Tool approval regression repair R3 — GLM test-only slice

Status: **PREPARED, NOT EXECUTED.** Builder and all runtime gates remain PAUSED.
No check/tsc/format/build/DB/network execution was performed on Terminus or any
other host; no builder probes or retries; no installs, credential or config
reads; no live side effects, deployments, commits or pushes; no other agents;
nothing armed or polling. Only source reads, `sha256sum`, `git status`,
`git rev-parse` and `git diff --check` were run (all reads).

Owned artifacts (only these edited/created):

- `apps/stellarc-gateway/src/tool-approval-check.ts` — F4 harness repairs + regression groups
- this report

`tool-approval.ts` was NOT edited. Per the assignment and TDD discipline, no
production fix is applied without an observed failing regression — and with
gates paused, no regression can be observed. All `reg-*` groups below are
therefore **RED pending builder recovery**, by construction against the source
defects the council confirmed (and the parent independently re-confirmed).

## F1–F4 disposition

| Finding | Disposition in this slice |
|---|---|
| F1 (HIGH) lazy-expiry + claim-denial audit rolled back | Regression assertions prepared, NOT EXECUTED. `lease-expiry-blocks-decision-and-claim` extended with exact single-`tool.approval.expired`-audit persistence after decide- and claim-refusal; new `reg-f1-claim-denied-audit-persists-row-stays-approved` proves the `claim_denied` audit survives the refused recheck while the row stays `approved`. Both RED on current source (rollback erases audit + transition). |
| F2 (HIGH) recovery audits stale candidates without a proven transition | Two deterministic barrier groups prepared, NOT EXECUTED. `reg-f2-reported-row-never-gains-contradictory-unknown-audit` (competing report vs recovery) and `reg-f2-concurrent-recovery-records-single-unknown-event` (concurrent recoveries) assert exact no-duplicate / no-contradictory event counts. Both RED on current source. |
| F3 (MEDIUM) idempotent report bypasses claim-owner validation | `reg-f3-terminal-replay-requires-claim-owner` and `reg-f3-unknown-replay-requires-claim-owner` (council's exact `outcome_unknown`-from-recovery case) prepared, NOT EXECUTED, preserving same-owner idempotency. Both RED on current source (different worker silently acks). |
| F4 (HIGH) check cannot substantiate its groups | REPAIRED in the check (details below). Unlock scope fixed; wrong-owner report ordering fixed; per-group RED collection added so one deferred run yields the full defect manifest; overbroad PASS labels narrowed/extended; report+recover audit-rollback coverage added. |

### F4 harness repairs applied

1. **Unlock scope** (was `check.ts:354/386`): `unlock` was declared inside the
   `try` and referenced from the sibling `finally` — a ReferenceError on every
   run even after a successful race. Now declared as
   `(() => void) | undefined` in the enclosing scope and released with
   `unlock?.()` in `finally`.
2. **Wrong-owner report ordering** (was `:403-404`): the `claim_owner`
   assertion ran after a terminal report, where `not_reportable` fires before
   the owner check. The wrong-worker report now runs while the row is still
   `dispatching`; the winner reports the terminal outcome afterwards.
3. **Per-group runner (`attempt`)**: a failing group records `RED <name>` and
   execution continues; the run prints a manifest and exits 1 if any group is
   RED. Without this, the first F1 assertion would abort the script and F2/F3
   would have zero receipts even on defect-present source. Groups that mutate
   security state (audit grants, principal enablement) restore it in `finally`
   so a RED cannot poison later groups.
4. **Test hygiene**: the serialized-claim race group now reports its winner
   terminal, so no group leaves a `dispatching` row that later recovery groups
   would classify through their barriers.
5. **Label narrowing** (council F4): `current-rights-recheck-revocation-blocks-release`
   → `recheck-false-fails-closed-revoked-subject-blocks-release` with a comment
   stating it proves the recheck SEAM only (subject-permission probe), not
   credential/delegation/run/operation revalidation.
   `audit-insert-failure-rolls-back-every-mutation-fail-closed` →
   `audit-denial-rolls-back-enqueue-decide-claim-report-recover` and the group
   now actually covers report + both recovery loops (expiry and stale-dispatch),
   each with revoke/GRANT restored in `finally` and per-row state+audit
   assertions. The queue group carries an explicit comment that
   tied-timestamp pagination completeness is NOT proven (source limitation).
6. **`waiting()` hoisted** from the claim-race group to module scope for reuse
   by the F2 barrier groups. It polls `pg_stat_activity`/`pg_locks` — DB-state
   observation, not a sleep.

### Group manifest (20 groups, in run order)

Expected outcome **on current (unfixed) source** vs **after production fixes**:

| # | Group | Council | Current source | After fix |
|---|---|---|---|---|
| 1 | enqueue-encrypts-frozen-args-separately-from-projection | — | PASS | PASS |
| 2 | enqueue-bounds-payload-projection-ttl-context | — | PASS | PASS |
| 3 | human-only-decision-foreign-org-agent-refused | — | PASS | PASS |
| 4 | single-claim-single-release-idempotent-report | — | PASS | PASS |
| 5 | serialized-concurrent-connection-claim-exactly-one-winner | F4-repaired | PASS | PASS |
| 6 | cross-process-claim-contention-one-winner-owner-only-report | F4-repaired | PASS | PASS |
| 7 | lease-expiry-blocks-decision-and-claim | **F1** | **RED** (state stays pending/approved; expiry audits rolled back) | PASS |
| 8 | decline-and-cancel-block-claim | — | PASS | PASS |
| 9 | tampered-envelope-binding-wrong-key-fail-closed-no-release | — | PASS | PASS |
| 10 | recheck-false-fails-closed-revoked-subject-blocks-release | F4-narrowed | PASS | PASS |
| 11 | reg-f1-claim-denied-audit-persists-row-stays-approved | **F1** | **RED** (audit count 0) | PASS |
| 12 | audit-denial-rolls-back-enqueue-decide-claim-report-recover | F4-extended | PASS (expected — rollback is already correct on these paths; this is coverage, not a defect) | PASS |
| 13 | crash-recovery-classifies-unknown-never-redispatches | — | PASS | PASS |
| 14 | reg-f2-reported-row-never-gains-contradictory-unknown-audit | **F2** | **RED** (1 contradictory `outcome_unknown` audit on a `succeeded` row) | PASS |
| 15 | reg-f2-concurrent-recovery-records-single-unknown-event | **F2** | **RED** (2 events) | PASS (1) |
| 16 | reg-f3-terminal-replay-requires-claim-owner | **F3** | **RED** (different worker silently acks) | PASS (`claim_owner`) |
| 17 | reg-f3-unknown-replay-requires-claim-owner | **F3** | **RED** | PASS |
| 18 | bounded-queue-detail-projections-tenant-isolated | F4-narrowed | PASS | PASS |
| 19 | bounded-pending-queue-capacity | — | PASS | PASS |
| 20 | no-args-or-secrets-in-audit-or-projection | — | PASS | PASS |

Expected-RED on current source: groups 7, 11, 14, 15, 16, 17 (F1×2, F2×2,
F3×2). Expected-PASS everywhere else — group 12 is deliberately
expected-GREEN: the council named report/recover audit rollback as a coverage
gap, not a proven defect, and the assertions verify fail-closed behavior that
the source already exhibits (audit failure genuinely rejects and rolls back;
the F1/F2 defects are about audits that should persist or should not exist,
not about rollback on denial).

## Determinism contract

- **Barriers**: owner-held `pg_advisory_xact_lock(719324821)` (the same global
  lock `store.transaction` takes) plus `pg_stat_activity`/`pg_locks`
  observation via `waiting()` — the pre-existing race-group seam. Every holder
  gate is released in `finally`; all spawned promises are settled with
  `.then(v,e)` capture and awaited; dedicated pools are `end()`ed in `finally`.
  No sleep-based synchronization anywhere.
- **Remaining wall-clock waits are semantic only** (waiting for actual TTL/lease
  expiry): 1.3 s waits with `ttlSeconds: 1` / `claimLeaseSeconds: 1`
  (`tightApprovals`, new); the pre-existing 1.3 s/3.3 s waits in groups 7/13
  are untouched.
- **F2 queue-order reliance**: the report-vs-recovery race relies on PostgreSQL
  granting same-lock exclusive waiters in FIFO queue order (report transaction
  queued before the recovery transaction, observed via `pg_locks` before the
  holder releases). This is long-standing PostgreSQL heavyweight-lock
  behavior, relied on deliberately and documented here; if it ever changed, the
  group fails loudly (`report must win the queue`) rather than flapping green.
- **Candidate-window guarantee**: both F2 groups and the audit-denial
  recover sub-tests `DELETE` stale `pending`/`approved` expired rows first, so
  each recovery's expiry loop is empty and its stale-dispatch candidate SELECT
  provably runs while the barrier holds (otherwise the expiry loop's queued
  transactions would defer candidate selection past the release and the race
  would not be exercised).
- **No test seam added to production.** All new seams are test-owned: separate
  `postgres()` pools with `application_name`, owner-held advisory-lock holder,
  and a 1 s-lease instance of the existing factory. No production helper,
  export, or parameter was added.

## Deferred execution (exact commands and prerequisites — no secrets)

When the builder is recovered and the supervisor separately authorizes
execution (mirror of the R1 RED gate):

1. Builder host with Bun ≥ 1.4, worktree at HEAD `2dce6d0…` with this check,
   donor `node_modules` symlink (read-only; no installs).
2. Disposable `postgres:16` (e.g. published on a loopback port such as `:5551`);
   nothing else may point at it — the check installs schema and the
   `gateway_runtime` role itself.
3. Environment:
   - `SPIKE_OWNER_DSN` — owner/superuser DSN of the disposable instance.
   - `SPIKE_RUNTIME_DSN` — DSN using role `gateway_runtime` with password
     `disposable-only` (the check creates the role itself; both DSNs must
     target the same disposable database).
4. Shared gate flock receipt per the R1 pattern
   (`~/.cache/stellarc-authgw-gate.lock`, `GATE_ACQUIRED … GATE_DONE`).
5. Command (expect ~15–20 s runtime: semantic TTL/lease waits dominate):

   ```bash
   cd apps/stellarc-gateway && bun src/tool-approval-check.ts
   ```

   - Exit 1 with a `TOOL APPROVAL CHECK RED …` manifest = defect groups still
     present (expected on current source: groups 7, 11, 14, 15, 16, 17).
   - Exit 0 with `TOOL APPROVAL CHECK PASSED 20 groups` = all regressions green
     after production fixes.
6. After the check: strict `tsc`, Biome, and build receipts against this
   report's frozen manifest (separately authorized; do not infer results).

## Hash provenance / frozen source manifest

Review basis: dirty worktree HEAD `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`
(same as council R2); the implementation lane remains untracked, so HEAD alone
does not identify it. `git status --short` at handoff: pre-existing
` M apps/web/vite.config.ts`, ` M bun.lock`, and untracked
`apps/stellarc-gateway/`, `docs/spikes/`, `tools/spikes/` lanes.
`git diff --check`: clean (exit 0).

Production sources are byte-identical to the council R2 manifest (verified
pre-edit by `sha256sum`):

| Path | SHA-256 |
|---|---|
| `apps/stellarc-gateway/src/tool-approval.ts` | `8bbd1132de638877cccecd3422e582cc4333163827736806e49e18f87fffc299` |
| `apps/stellarc-gateway/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `apps/stellarc-gateway/src/openapi-operation.ts` | `a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1` |
| `apps/stellarc-gateway/src/migrate.ts` | `b2819a149f5fa380cbcaeefb08d437aa2c6757786517f7346cb98da65d8ff9bc` |
| `apps/stellarc-gateway/src/database.ts` | `a254325dbb20cda499ace8a8c3edcd773c3ef4824881e6281ad7fadce7362b4c` |
| `apps/stellarc-gateway/src/main.ts` | `24c76609991b68c19c1abc80e555de7f437b29977de78d646d5ca3f4630925ab` |
| `docs/spikes/stellarc-tool-approval-r1.md` | `cccd3a3ec859a42aef61bc22373813e70272231b5616ab19d48d49176e80c29f` |
| `docs/spikes/stellarc-tool-approval-council-r2.md` | `c32c25ba93d2b3b7fde90a47f86be1f38b53cf3c87d97bcfcab7394228c7dbd8` |

Check file lineage (three distinct hashes now exist — keep them separate):

| Bytes | SHA-256 | Meaning |
|---|---|---|
| R1's RED receipt | `78a97dd82bbc48d0f7885efa6b7d8144124ca70a9b7e5bea7f4945ea026eaf0a` | **Historical only.** The check that produced the missing-module RED on 2026-11-08. It is not the delivered bytes and not these bytes. |
| Delivered check (council-reviewed, pre-repair) | `a34dba6dfc73048b63915c7f7fd619e3ee1a5a21cee419fb3b7be2018577ca1b` | The check whose F4 defects the council confirmed. |
| This repair | `1ead040406d30c3688b0d3e38152b1c712429d7be68727b55d236827fa364c23` | Current `tool-approval-check.ts` (963 lines). All future receipts must be taken against this hash. |

**Provenance correction (R1 left unedited, per assignment):** R1 §3 calls the
RED check "byte-identical to the final worktree copy" — that claim was already
false at council time (delivered bytes hash `a34dba…`) and is superseded by
this repair. The R1 RED receipt remains valid only as evidence that a check
with that historical hash once failed on the then-missing module; it cannot
substantiate assertion reachability, GREEN behavior, or any current bytes.
Final check/strict-tsc/format/build receipts must be re-taken against this
report's manifest when execution is authorized.

## Separation of concerns

**Proven-by-source defects awaiting RED receipts** (regressions prepared here,
production fixes NOT applied):

- F1 — expiry transition + audit and `claim_denied` audit rolled back with the
  refusal (`tool-approval.ts:366-368,409-417,448-459`).
- F2 — recovery appends `outcome_unknown` audits for stale candidates without a
  proven transition; duplicates under concurrency (`tool-approval.ts:525-554`).
- F3 — same-outcome no-op precedes `claimed_by` validation in `report`
  (`tool-approval.ts:500-508`).

**Genuinely untested integration obligations** (unchanged from council R2 §"Integration
obligations"; not claimable as covered by this check): authenticated principal
binding and CSRF, projection trust/redaction at the human view, a production
tx-aware `recheck` (credential/delegation/run/operation policy), dispatch
linearization and held-dispatch/revocation barriers at `openapi-operation.ts`,
lease sizing against the real executor, key rotation, `(created_at,id)` keyset
pagination, owner migration + restricted-role runtime grants, contention/
commit-failure/crash-recovery evidence beyond the sequential group here.

**Unresolved test-seam limits:**

- FIFO advisory-lock grant order reliance in the F2 groups (documented above).
- Sequential-only crash/recovery coverage (single-process `recover()` calls);
  no fresh-process finalization race is exercised.
- The recheck callback remains test-supplied; no production recheck exists to
  exercise (integration obligation).
- Tied-timestamp pagination completeness is unproven and uncommented-upon as a
  pass condition (source limitation, fix owed).

No waiting jobs, pollers or auto-resumption were armed. Ownership of the
production fixes and the integration decision remains with the Terminus
supervisor.
