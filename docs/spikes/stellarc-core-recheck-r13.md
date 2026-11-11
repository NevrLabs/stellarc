# Core transaction-scoped run recheck R13

Implemented `gatewayStore.recheckRun(tx, raw, expected)` using the same authority
implementation as public `authorize`. No nested transaction, admission, budget
spend, schema change or tool policy. Caller must supply the transaction from
`store.transaction`; an arbitrary transaction is not claimed to hold the lock.

Expected run identity is server-owned: org, actor, subject, delegation, action,
request and run ID. Missing/mismatched, terminal-choice, completed and overdue
runs are refused. Current credential, principal and delegation checks are reused;
remaining calls may be zero for an already admitted invocation. The two-minute
orphan deadline remains unchanged; long-pending approval lifetime is unresolved.

## Executed evidence

Builder `fxcompute-01`, clean R10 dependency donor link, fresh restricted PG16:
- RED: original production bytes fail at missing `store.recheckRun` inside the
  production transaction callback (not fixture setup), child exit 1.
- GREEN source: four groups, child exit 0.
- GREEN bundled entry with check source hidden: four groups, child exit 0.
- Raw scoped strict TypeScript exit 0, empty diagnostics; Biome exit 0 (inherited
  non-null assertion warnings); module/check bundles exit 0.
- Single-connection runtime pool proves no nested acquisition. Tests assert no
  additional runs/admission events and no second budget spend, context mismatch,
  terminal/overdue/finished refusal, committed credential/delegation/subject/
  permission revocation and credential expiry. These are scoped proofs, not every
  ancestor-race schedule or integrated external dispatch.

Public authorize retains commit-before-denial behavior. `recheckRun` throws on
refusal; its enclosing transaction rolls back the helper's attempted denial audit
unless the caller catches and records/commits its own refusal. Approval integration
must preserve this distinction and may not claim a durable denial merely from a
thrown helper. Audit failures propagate; nothing here authorizes sending.

## Identity and gates still open

Snapshot `/mnt/deepvault/stellarc-core-recheck-final-a1d03a1065ff`.
Readback `/home/rpw/.hermes/cache/scratch/stellarc-core-recheck-final-readback.json`.
- Store `026f4ecbd04a884fc3a47f0d2b8314afd0b87bf57b1266d3d628ba6dedd36b47`.
- New check `963e36d937a24649dc640e92a0b801ac83620bd99eabb325dd71af2d8add20c1`.
- Module bundle `aa95273d9ca6a8635ceeb8156be2f81b9c5f6cc0490e3b2ed2ab0a933b5f233e`.
- Check bundle `3e94a144ff958f3fa2d85a25d4c4050548a0e6efbc3b205257f920b6902cf9ec`.

Initial static attempt found return-union narrowing plus formatting errors; fixed
with an explicit helper result type and formatting, no compiler weakening. CPU
capacity refusals prevented some phases; a runner-finally NameError masked two
pre-child refusals, repaired only in a new continuation runner. No successful
product phase replayed. Ordered authgw/workspace locks, bounded children and
own-container cleanup; final readback both locks free, no owned containers or
hidden source. No new delegates, deployments or service changes.

Inherited 17-group store suite has not yet executed on these bytes because the
capacity guard refused its launch. Full-repo and current approval/host regression,
independent review, approval lifetime/dispatch integration and deployment remain
HOLD. Existing store-check source is unchanged; historical green is not inherited.
