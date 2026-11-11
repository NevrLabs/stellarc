# Approval event contract — owner recovery R12

## Outcome

N2 repaired by the same owner after outage reconciliation, without replacement
agents. Approval dispatch remains unwired/off and deployment remains HOLD.

`decide` now appends `tool.approval.decision_attempt` with explicit `action`, human
and approval identifiers before its awaited decision work. Only a winning DB-time
conditional transition appends the existing `tool.approval.accept|decline|cancel`
success event. Both appends and the transition share the existing transaction.
An expired attempt commits attempt + expiry, never a success event. Failure of
the success audit rolls back both the decision and the attempted-event append.

N1 still linearizes eligibility at the winning UPDATE, not payload delivery or
network send. No exactly-once external-effect claim is made.

## Recovery reconciliation

- Same owner/model; no new delegates, service restarts or deployment changes.
- Owner run 54 active; stale queued runs 52/53 contained cancelled-child notices,
  not new human instructions. Cancelled both and verified the queue empty.
- Approval module/check initially matched R9 hashes `5b529d48…` / `25948b1d…`.
  Core store remained `ee32a71c…`; cancelled authority extraction did not land.
- Builder readback: only the unrelated `/srv/stellarc-prod` process was present;
  no owned verification jobs, both gate locks free, no N2 fixture containers.
- Fullrepo R8 actually left lint/typecheck/test/build exits 1, each log containing
  `Failed to connect to bus: No medium found`. These are runner setup failures,
  not product failures or passes. Full-repository acceptance remains open.
- Found local lock at rejected R9 generated hash `f5b62ab1…`, despite historical
  R10 closure. Restored the exact R10 frozen-install-verified candidate through
  a scoped patch: 26 platform/libc metadata fields restored, no versions or
  checksums changed. Local lock is again
  `3b32a80b105b93629e22e6efca3f47cc9b6a649fdbede4b9557d4595c7585b07`.
  The writer of that intervening drift is not established.

## Executed RED → GREEN

All heavy work ran on authenticated `fxbuilder` / `fxcompute-01`, using the clean
R10 installed dependency tree by a disclosed node_modules donor link. No install,
donor mutation or private jose overlay was performed in this round. This is scoped
module verification, not a fresh full-repository install/build.

- RED: unchanged R9 production module + enlarged check, fresh restricted PG16:
  **2 RED / 26 groups, child exit 1**. Ordinary decisions lacked attempt events;
  held-audit expiry also lacked the distinct attempt event. Other 24 groups passed,
  including success-audit rollback coverage (not a differential defect detector).
- GREEN: **26/26 source groups, child exit 0**.
- Artifact: **26/26 groups, child exit 0**, with check source hidden while the
  bundled entry/self-spawned claim workers ran. Source restored afterward.
- Raw strict TypeScript: exit 0, empty diagnostic log. No baseline subtraction.
- Biome: exit 0, 13 inherited non-null assertion warnings, zero errors.
- Standalone module and check builds: exits 0.

New checks cover accept/decline/cancel event order and identity, success-audit
trigger denial rolling back state/attempt/events, and explicit audit-path entry
plus DB-observed expiry for the held decision. Existing claim/recovery races,
expiry, audit denial and crash classification checks still run.

## Exact receipts and source identity

- RED path is saved in private scratch `stellarc-n2-recovery-red-path`.
- Final builder snapshot:
  `/mnt/deepvault/stellarc-n2-recovery-green-693aea9d47e6`.
- Final parent readback:
  `/home/rpw/.hermes/cache/scratch/stellarc-n2-recovery-final.json`.
- Runnable gate:
  `/home/rpw/.hermes/cache/scratch/stellarc-n2-recovery-gate.py`.
- Module SHA: `9c60eeb5fbf791dad5abf41bcc2bc91bd075937f0f79d472673a909e6c686ebf`.
- Check SHA: `892fe79bdb3d05853c4b35c487403e5d1efe858af4e2e651e335870f883bb6b8`.
- Built module SHA: `4b5cc361451aa5d1a2d26ba93940c4860c095b80a322ca40a1927462f7002ca4`.
- Built check SHA: `cc80ce66d5f0f83bf053134d1f93baeb1d4ef0a616f890a2b79984111d0743c2`.

Every run hashes the six-file module/config closure before execution and after
cleanup. Heavy phases take authgw then workspace locks, close inherited lock FDs,
check root/memory/PSI capacity, bound children and use fresh owned 256MiB loopback
PostgreSQL containers. Final readback: zero owned processes/containers/hidden
source files; both locks reacquired/released; root free 4,453,175,296 bytes.

One pre-static CPU-PSI refusal and a static attempt with three fixture-string lint
errors occurred before final success. Their logs remain in the earlier snapshot;
no product test was represented as passing during those failures. The artifact
phase initially failed before producing child receipts; it was reconciled as
not launched, then executed separately. No already-passed product phase replayed.

## Evidence corrections and remaining gates

R9's RED compares old behavior, not an isolated winning-predicate mutation.
Its app-clock skew case dynamically tests claim only; decide's equivalent DB-time
logic is source evidence. Audit-denial variants are rollback coverage, not all
separate differential RED cases. Historical reports remain unchanged.

N2 now has implementation/runtime evidence, but no new independent review was
launched during recovery. Core transaction-aware authority extraction, run/approval
lifetime agreement, immutable operation preparation/dispatch wiring, authenticated
human/worker boundaries, restricted-PG/local-HTTP effect-count/crash-window checks,
combined full-repository gates and deployed acceptance remain open. Existing
candidate and old 9router/Executor are unchanged.
