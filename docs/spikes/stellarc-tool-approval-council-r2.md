# Tool approval council R2 — independent GPT source-only review

## Verdict and scope

**Integration HOLD. No GREEN or runtime acceptance.** The single-claim and encrypted-payload mechanisms are plausible source mechanisms, not exercised guarantees. The delivered primitive has confirmed transaction/audit defects and its supplied check has definite control-flow/oracle defects. No implementation files were changed.

- **Standards: NOT APPROVED** for integration: denial/transition audit integrity is broken (F1/F2), and the purported owner-only report contract has a bypass (F3). No style-only findings or new frameworks requested.
- **Spec: PARTIAL / HOLD:** R1's durable expiry, truthful recovery audit and owner-only reporting claims do not match the source. Single claim, tenant scoping and no automatic redispatch have identifiable mechanisms, but are unverified at runtime. Authentication, current-rights enforcement and actual executor dispatch remain integration obligations, not delivered end-to-end features.
- Read the complete R1 report, `tool-approval.ts`, `tool-approval-check.ts` and `openapi-operation.ts`; traced `store.ts` transaction/audit/authorize and owner migration/runtime grant boundaries in `migrate.ts` / `database.ts`. Read `main.ts:1-110` only for runtime connection bounds and startup binding. Review basis: dirty worktree HEAD `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`; the implementation is untracked, so HEAD alone does not identify it.
- Only owned artifact: `docs/spikes/stellarc-tool-approval-council-r2.md`. No code edits, tests, typecheck, formatter, builds, DB calls, builder access/retries, compute switching, polling/sleep/background jobs, agents, deployments, credentials or service actions. The supervisor's stopped recovery poller is reported context, not independently re-probed here. No auto recovery/resumption was armed.

## Actionable findings (source-confirmed; not runtime reproductions)

### F1 — HIGH: lazy expiry and claim-denial audit are rolled back

**Evidence:** `apps/stellarc-gateway/src/tool-approval.ts:366-368`, `:409-417`, `:448-459`; `apps/stellarc-gateway/src/store.ts:76-90`.

`markExpired` writes an audit and updates the row, then `decide` / `claim` throw inside `sql.begin`. The rejection rolls back both writes. Expired requests are refused, but remain `pending` / `approved`, consume queue capacity and lack the promised expiry receipt. Likewise `tool.approval.claim_denied` is appended then rolled back on every false recheck. This contradicts R1 `:89-90` ("transitioned to expired + audited, then denied 410") and the structured denial-audit contract. The existing store already demonstrates the correct pattern at `store.ts:342-354,378-380`.

**Minimum fix:** return a refusal sentinel from the successful transaction, then throw `Denied` after commit, reusing that existing pattern for these three paths. Real audit failures must still reject inside the transaction and roll everything back. Keep exact post-refusal row **and audit** assertions; the expiry assertions at `tool-approval-check.ts:410-419` would expose this if reached and run.

### F2 — HIGH: recovery audits stale candidates without proving a transition

**Evidence:** `apps/stellarc-gateway/src/tool-approval.ts:525-554`, especially `:543-553`; `:258-269`.

Candidates are read outside the lock/transaction. Another report or recovery may commit before the per-row transaction acquires the global lock. Recovery then appends `tool.approval.outcome_unknown` before a conditional UPDATE that can affect zero rows. A successfully reported row can therefore acquire a contradictory unknown-effect audit; two concurrent recoveries can append duplicate unknown events. Expiry recovery has the same audit-before-zero-row-update flaw. The lock serializes transactions, not the earlier candidate selection. Sequential `recover()` calls at `tool-approval-check.ts:577-580` cannot exercise this race. R1 `:105-107,115-117` promises classification and lifecycle audit, not speculative candidate events.

**Minimum fix:** within each existing transaction, re-read/lock and recheck the state plus DB-time deadline, or use a conditional UPDATE with deadline and `RETURNING`; append the audit **only if a row transitioned**, in that same transaction. An audit failure must roll back the update. Add a barrier-held candidate-selection/report race and concurrent recoveries with exact event-count/state assertions; do not add replay or another recovery framework.

### F3 — MEDIUM: idempotent report bypasses claim-owner validation

**Evidence:** `apps/stellarc-gateway/src/tool-approval.ts:500-508`; R1 `:102-104` says "only the claiming worker".

`if (row.state === outcome) return` precedes `claimed_by` validation. Any worker string can receive successful acknowledgement for another worker's terminal result, including `outcome_unknown` produced by recovery. It cannot change a terminal result or release arguments, but it makes the owner-only completion contract false and can hide incorrect completion correlation. A worker string is itself only an internal identifier, not authenticated authority.

**Minimum fix:** validate the server-bound worker against `claimed_by` before the same-outcome no-op. Preserve same-owner/same-outcome idempotency; keep conflicting results after recovery refused (never reinterpret unknown as success or reclaim the payload). Cover same-outcome replay by a different worker explicitly.

### F4 — HIGH proof blocker: supplied check cannot substantiate its advertised groups

**Evidence:** `apps/stellarc-gateway/src/tool-approval-check.ts:351-389`, `:403-405`, `:551`, `:583-604`; R1 `:124-141`.

- `unlock` is declared inside the `try` block (`:354`) but referenced in sibling `finally` (`:386`). It is out of scope; optional chaining does not make an undeclared identifier safe. The check can throw there even after a successful race assertion (and strict typecheck should reject it).
- After reporting `failed` at `:403`, the other-worker `succeeded` report at `:404` encounters terminal-state `not_reportable` before the owner check, not the asserted `claim_owner` (`tool-approval.ts:504-508`). Exercise wrong-owner reporting while still dispatching, then report the terminal result.
- The `PASS ... every-mutation` label at `:551` only covers denied enqueue, decide and claim; it does not check report or recovery rollback. The rights test at `:483-500` checks one subject's `mcp:status`, not credential/delegation/run/operation authorization. Queue assertions do not prove complete pagination under equal/sub-millisecond timestamps. No group has a final execution receipt.
- R1 `:133-135` calls the RED check hash `78a97d...eaf0a` "byte-identical to the final worktree copy"; this review's complete current check hashes to `a34dba6dfc73048b63915c7f7fd619e3ee1a5a21cee419fb3b7be2018577ca1b`. The RED receipt is historical and cannot be attributed to these final bytes. The supplied missing-module result proves neither assertion reachability nor GREEN behavior.

**Minimum fix:** move the unlock handle into the enclosing scope, correct report-test ordering, add the omitted exact state/audit oracles for F1-F3 and narrow any uncovered claims. Reconcile RED provenance and obtain final check/strict-tsc/format/build receipts against one frozen source manifest when execution is separately authorized. Do not infer or fabricate a result now.

## Integration obligations / proof gaps (not additional confirmed exploits)

### Authority, frozen bytes and dispatch linearization

- `tool-approval.ts:21-27,272-287,354-361` trusts server-provided context and a human **ID**, then verifies that ID is an enabled same-org human. This is a database eligibility check, not proof the requester is that human. `queue`/`detail` similarly accept org strings, not credentials. Bind org and human exclusively from the authenticated server session; protect cookie-authorized decisions against CSRF and never accept actor/human/org/worker assertions from body/headers. No exposed approval endpoint was delivered here, so this is an activation obligation, not a demonstrated public impersonation exploit. R1's "no caller boolean" must not be read as authenticated principal binding.
- `tool-approval.ts:161-240,307-320,422-437` binds ciphertext to row ID, org, actor, subject, delegation, run, operation, binding and request digest, and checks inner identity against those columns. This prevents undetected ciphertext/context substitution under an uncompromised key. It does **not** authenticate plaintext projection, expiry or lifecycle state, recompute executor request digests from arguments, or sanitize projection content. The plaintext projection is trusted caller-produced data; "no args or secrets" (`R1:118-119`) is a policy, not an enforced redactor. Integration must create the human view from the same immutable server snapshot and keep sensitive fields out; rederive/compare executor identity against the claimed payload and full verified context before any send. Do not treat GCM as whole-row immutability or protection from a compromised runtime with table UPDATE rights.
- `tool-approval.ts:438-447` only requires a boolean from trusted `recheck(tx, record)`; no production recheck is supplied. Revalidate actor/subject/org, active credential policy, delegation chain/audience/resource/actions/expiry, run binding and current operation policy using **that transaction**. Do not call `store.authorize()` from inside it: that method starts another transaction acquiring the same global lock (`store.ts:294`), so it is not a transaction-aware callback. Reuse the existing checks through a minimal tx-aware seam when integration is built, rather than nested authorization/admission or a second grant engine.
- `openapi-operation.ts:368-395,420-432` computes identity over the actual frozen request/config and runs a second gate immediately before fetch. Its principal closure is captured at `:165`. Construct/bind it per verified principal, require the stored context AND binding to match, and consume the claim only at the dispatch gate; losing claims must return deny, not a new pause. Claim commit and network send are separate boundaries. Explicitly define revocation linearization at dispatch authorization (a committed revocation after that point need not cancel an already-authorized send), and exercise held-credential and held-dispatch barriers. No source-only review can establish no-send-on-revocation or single external effect.

### Lease, terminal truth and no replay

`tool-approval.ts:420-421,461-487,539-554` has no route back to approved, and recovery never decrypts or calls the executor. This supports **at most one committed payload claim**, not exactly-once external effects. A crash after claim but before send is conservatively unknown; a lost commit acknowledgement is likewise not grounds to resend. Persist/report `outcome_unknown` for executor `outcomeUnknown: true` (`openapi-operation.ts:484-496`), including ambiguous upstream failures, rather than blindly mapping all errors to failed. Size the lease above the actual claim-to-completion/report budget, not merely the 60-second executor cap; late known reports after unknown classification remain rejected by design. Key rotation currently strands old envelopes; retain a compatible key until pending rows settle/expire or explicitly invalidate and audit them before activation.

### Global lock, deadlines, capacity and pagination

- Single claim uses the existing global advisory lock, row lock and guarded UPDATE; audit failure precedes payload return and rolls back the claim. No runtime contention or commit-failure evidence was observed. Global capacity counts for pending/approved are serialized (`tool-approval.ts:322-325`) but include expired rows until successful recovery; neither dispatching backlog nor total historical storage is bounded by that count.
- A slow `recheck` holds the global authorization lock (`tool-approval.ts:438`); the callback has no signal/deadline parameter. Existing startup supplies statement/lock timeouts (`main.ts:33-38`), which do not interrupt arbitrary JS waits or pool queues. Keep recheck DB-only, short and transaction-aware; preserve bounded server admission/deadlines and cancellation/settlement before exposing it. A response-only timeout must not be mistaken for releasing the transaction.
- `recover()` limits each candidate query to 64, not total latency, and stops on the first failure. A permanently unauditable earliest row can starve later rows/orgs. Before enabling scheduled recovery, reuse the existing store's bounded failure-rotation/continue pattern (`store.ts:428-447`) or equivalent minimal fairness; do not arm it in this review.
- `queue()` at `tool-approval.ts:565-578` uses only `created_at < Date` as cursor. Equal timestamps, or PostgreSQL microseconds truncated to JS Date milliseconds, can omit rows permanently between pages. Use an exact timestamp plus ID keyset `(created_at,id)`, deterministic ordering, and a tied-timestamp complete-ID oracle before the required inbox ships. This is a concrete source limitation of pagination, not evidence of an existing deployed UI failure.

### Owner migration and runtime grant boundary

`toolApprovalSchema` is exported only; `migrate.ts:15,49-55` neither applies it nor grants its table. That omission is explicitly deferred by R1 `:167-169`, not an unauthorized runtime migration. The disposable check installs schema/roles directly (`tool-approval-check.ts:74-82`) but does not run `assertRuntimeDatabase` or the immutable issuer/client binding. Existing `database.ts:23-40` checks effective runtime privileges and `main.ts:41-42` checks runtime role/identity pins, but those checks do not establish approval-column immutability. Apply the owner migration and exact required runtime grants, then exercise startup under the actual restricted role and a real authenticated human before activation. No migration, privilege or deployed-role proof was executed here.

## Evidence ledger and snapshot integrity

| Gate | Disposition |
|---|---|
| Full named source/report/check reading and adjacent boundary tracing | Completed; source-only |
| RED missing-module receipt | Reported in R1, not independently fetched; different current check hash |
| Final approval check / strict typecheck / formatting / build | **Not executed / no final receipts** |
| Restricted-role DB, contention, audit failure, crash/recovery, actual dispatcher | **Not executed** |
| Human authentication / approval UI / CSRF / production integration | **Not delivered or accepted by this slice** |
| Builder recovery / poller / automatic continuation | **Not attempted or armed** |

Frozen SHA-256 manifest: `/home/rpw/.hermes/cache/scratch/stellarc-approval-council-r2-freeze.json`. The seven initial files were hashed before reading and rechecked unchanged after tracing; `main.ts` is a supplemental dependency hashed after its focused read. Final comparison against this manifest confirmed all eight reviewed file hashes unchanged and HEAD unchanged before handoff. Hashes identify source, not test receipts:

| Path | SHA-256 |
|---|---|
| `docs/spikes/stellarc-tool-approval-r1.md` | `cccd3a3ec859a42aef61bc22373813e70272231b5616ab19d48d49176e80c29f` |
| `apps/stellarc-gateway/src/tool-approval.ts` | `8bbd1132de638877cccecd3422e582cc4333163827736806e49e18f87fffc299` |
| `apps/stellarc-gateway/src/tool-approval-check.ts` | `a34dba6dfc73048b63915c7f7fd619e3ee1a5a21cee419fb3b7be2018577ca1b` |
| `apps/stellarc-gateway/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `apps/stellarc-gateway/src/openapi-operation.ts` | `a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1` |
| `apps/stellarc-gateway/src/migrate.ts` | `b2819a149f5fa380cbcaeefb08d437aa2c6757786517f7346cb98da65d8ff9bc` |
| `apps/stellarc-gateway/src/database.ts` | `a254325dbb20cda499ace8a8c3edcd773c3ef4824881e6281ad7fadce7362b4c` |
| `apps/stellarc-gateway/src/main.ts` | `24c76609991b68c19c1abc80e555de7f437b29977de78d646d5ca3f4630925ab` |

**Release condition:** fix the confirmed defects, reconcile check/provenance claims and obtain separately authorized, exact-source execution receipts plus the listed integration proofs. Source review does not authorize recovery, execution or activation. Ownership and the integration decision remain with the Terminus supervisor.
