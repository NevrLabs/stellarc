# Stellarc tool-approval — expiry round r9 (council R8 N1 closure)

Scope owned this round: `apps/toolgw/src/tool-approval.ts`,
`apps/toolgw/src/tool-approval-check.ts`, this report, private scratch under
`~/.hermes/cache/scratch/stellarc-approval-r9/`. No other files touched. The
concurrent GLM R9 dependency lane owns `bun.lock` + root `package.json`
(snapshot identity recorded in the freeze meta, unmodified by this lane).

## Defect (council R8 N1, HIGH)

`claim()` prechecked expiry with the application clock (`Date.now`), then
awaited the authority `recheck` callback, then ran the winning
`UPDATE ... WHERE state='approved'` with **no expiry guard**. A recheck that
crossed `expires_at` mid-transaction still committed `dispatching` and
released the sealed payload. `decide()` had the sibling flaw: its acceptance
UPDATE ran after an awaited audit append with no DB-time guard. The lazy
prechecks in both paths consulted the app clock, so a skewed host could
pre-expire a row the database still considered live.

## RED (real execution, unchanged production bytes)

- Production bytes at RED: `tool-approval.ts` = `615b871f…` (r7 final,
  identical to the r7 DeepVault freeze), check = `efe75bc8…` (24 groups:
  20 inherited + 4 new N1 groups).
- Deterministic deadline crossing: `dbPastExpiry(tx, id)` polls
  `SELECT (clock_timestamp() > expires_at) AS past` **on the claim's own
  transaction connection** (500 × 20 ms bounded) — the release is gated on
  the database observing its own clock past the deadline, never a guessed
  local sleep. The decide-window group gates the wrapped store's `audit` on
  an owner-side poll of the same predicate (the decide tx holds the global
  advisory lock, so the watch must not take it).
- Receipt `receipts-r9/red-n1.exit` — `child_exit=1 duration=21s`, fresh PG16
  container `stellarc-r9-red-n1-3032076` (loopback :53421, 256 MiB, removed
  on exit):
  - RED `reg-n1-held-recheck-crossing-expiry-refuses-and-releases-nothing`
    — "Missing expected rejection": payload released after DB-observed
    expiry.
  - RED `reg-n1-decide-audit-wait-window-never-accepts-after-deadline`
    — "Missing expected rejection": accepted after the deadline.
  - RED `reg-n1-skewed-app-clock-cannot-preexpire-live-row` — 410 `expired`
    from a patched app clock on a DB-live row.
  - PASS `reg-n1-expiry-crossing-audit-denial-rolls-back-nothing-released`
    (coverage-completion group: pins the audit-denial rollback of the fixed
    path; passes on buggy bytes by design).
  - All 20 inherited groups PASS on the new check file (F1–F3 invariants
    intact before any production edit).

## Fix (minimum, module pair only)

Four sites in `tool-approval.ts` — no timers, no engine, no schema, no
replay machinery:

1. `claim` winning UPDATE:
   `… WHERE id=$1 AND state='approved' AND expires_at>clock_timestamp()
   RETURNING id`. On miss (the row lock is held since `SELECT … FOR UPDATE`,
   so a miss means the deadline crossed mid-tx): `markExpired` persists one
   expired transition + audit **in the same tx** (committed-refusal
   sentinel, F1) and the claim refuses 410 `expired` with no payload. A
   genuine audit failure still rolls the whole tx back (pinned by the
   audit-denial group).
2. `decide` acceptance UPDATE: same `AND expires_at>clock_timestamp()`
   guard; audit-first order kept — the attempted-action audit stands as the
   honest record of the human's attempt, the miss persists the F1 expired
   transition and refuses 410.
3. + 4. Both lazy prechecks now read
   `(expires_at>clock_timestamp()) AS live` from the row SELECT under the
   lock instead of `new Date(row.expires_at) <= Date.now()`. Zero
   `Date.now` references remain in the production module.
5. `report` intentionally keeps no expiry branch: a worker that already
   holds authority may always report `failed`/`succeeded`/
   `outcome_unknown` after the deadline; the claim-lease sweeper covers
   crashed workers (F2, unchanged).

Sibling-path audit: `enqueue` computes `expires_at` as
`clock_timestamp()+ttl` (already DB time); `recover`/stale-lease sweeps were
already DB-time proof-first (F2); `queue`/`detail` are projections with no
expiry authority. Caller trace (r9): zero external consumers of
`claim`/`decide`/`createToolApprovals`/`toolApprovalSchema` — no
cross-module contract risk.

## GREEN receipts (all real executions on builder `fxcompute-01`)

| Phase | Receipt | Result |
| --- | --- | --- |
| static | `receipts-r9/static.exit` | `tsc=0 biome=0 module=0 checkbuild=0`; RAW strict tsc diagnostics **0** (no baseline/suppressions/config weakening); Biome **0 errors** (13 warnings = pre-existing r7-accepted non-null assertions, byte-identical rule set) |
| check source | `receipts-r9/green-source.exit` | `child_exit=0 duration=22s`, PG `stellarc-r9-green-source-3037957` (:37321) — **PASSED 24 groups** |
| check artifact | `receipts-r9/green-artifact.exit` | `child_exit=0 duration=20s`, PG `stellarc-r9-green-artifact-3039402` (:53229), check source **hidden** during run — **PASSED 24 groups** (self-spawned claim workers provably execute from the bundle) |

Static attempt 1 (`receipts-r9/attempt1/`) failed Biome on 2 format errors
in the new code; fixed exactly as the formatter specified and re-run. No
replay of completed phases; the failed attempt is preserved verbatim.

## Hashes

- Final `tool-approval.ts` = `5b529d48c8c1a5e651a21f6aae9f377fa8945b97a1ff6731535bbe781145a664`
- Final `tool-approval-check.ts` = `25948b1d9641cfaec87c7e6d25f7e70d0b2200787f21fe210cd526f9d59e1266`
- Module bundle `artifacts/module/tool-approval.js` (15.57 KB) = `232bba09d115aeca72fef6fc7fdb0d4927a751368a8695913707a87cd8df1ba5`
- Check bundle `artifacts/check/tool-approval-check.js` (137.32 KB) = `5a5393426cc6f5188355d24fd699d2b4fe32380844fd2fb841ec84d274b88d6d`
- RED production bytes = `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7` (r7 final)

## Isolation, drift, cleanup

- Run dir `/home/rpw/ws/stellarc-r9-20261109T0620Z/`; tree built by
  hardlink-clone of the r7 run tree, replaced owned files moved in as **new
  inodes** (r7 snapshot verified byte-identical before and after — receipts
  in setup output; r7 donor node_modules untouched, zero installs).
- DeepVault freeze `/mnt/deepvault/stellarc-approval-r9-20261109T0620Z-282a489b/`:
  initial tree.tar = `bf3a7736993fd0bb223f9283db9667f297b141ed1d07e3b99a59ba6405eb43de`
  (2303 files, 218,859,520 B, verified by independent stream re-hash), final
  manifest + meta + receipts/artifacts archive added post-GREEN.
  **Initial→final drift = exactly the two owned files.**
- Gate locks taken authgw → `~/ws/gate.lock` in fixed order, `flock -w 600`,
  children spawned with `9>&- 8>&-`; headroom recorded under lock before
  every phase (all passes ≥ 4 GiB root, ≥ 2 GiB MemAvailable, PSI < 5);
  post-headroom recorded after each phase.
- Cleanup verified: zero `stellarc-r9-*` containers remain, hidden source
  restored (`0` hidden files; tree hashes = final), no stray runner pids.
- Concurrent-lane snapshot recorded, not touched: worktree `bun.lock` =
  `79c905e9…`, `package.json` = `0cf16845…` (GLM R9 dependency lane).

## Untestable-branch disclosure

None — every N1 branch (held-recheck crossing, audit-denial rollback,
decide audit-wait window, app-clock skew, missing winning predicate via the
RED run itself) is exercised by a real DB-observed crossing. The
`expires_at>clock_timestamp()` predicate omission is *independently*
detected: the RED run failed against bytes lacking it while all other
assertions held, so the regression detects a missing DB-time winning
predicate, not just its symptoms.

## Notes / ceilings / HOLDs

- **HOLD (integration)**: the module still ships nowhere — host build
  excludes `apps/toolgw` (r6 decision); wiring into the gateway binary is a
  later lane. Contracts unchanged and minimal:
  `createToolApprovals(store, sealKey, bounds)`;
  `claim(id, org, worker, recheck)` → `ClaimedPayload | Denied(410 expired |
  403 claim_denied | 409 not_claimable | 500 integrity_failure)`;
  `decide(id, org, human, accept|decline|cancel)`; refusal of expired
  authority is always committed-first (F1).
- **HOLD (dependency lane)**: the r9 tree runs on the donor `full-v9`
  node_modules, whose root `jose` symlink is a **private pinned overlay**
  (not normal `bun.lock` resolution). This lane does not present the
  primitive gate as dependency-resolution proof; the separate GLM R9 lane
  owns that reconciliation (`jose@6.2.12` direct).
- Exactly-once external effects are **not** claimed: `claim` proves
  single-winner dispatch handoff only; the worker's external side effects
  remain bound by the report/outcome_unknown protocol (F2/F3).
- The audit-wait window in `decide` commits the attempted-action audit even
  when acceptance is refused as expired — deliberate: the human's attempt is
  a fact; erasing it would be worse. State machine and payload authority
  never move (pinned by `reg-n1-decide-audit-wait-window…`).
- Skew ceiling: the fix removes the app clock from every authority
  decision, but the DB clock itself is now a trust dependency (single
  `clock_timestamp()` source of truth per row evaluation).
