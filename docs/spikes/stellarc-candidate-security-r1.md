# Candidate security implementation review R1 — HOLD public cutover

Source-only independent review. No tests, probes, builds or secret reads by
reviewer. Parent owns fixes and runtime evidence. Original review task:
`stellarc-candidate-security-r1-20261108`.

| Finding | Required change | Current disposition |
|---|---|---|
| 1 HIGH slow request bodies | Cancel reads on deadline/disconnect; bound auth routes too; authenticate before LLM buffering; socket recovery check | VERIFIED on v14: eight slow auth/LLM socket bodies hit deadline and all slots recover; ten socket groups pass. Later auth lifecycle changes require fresh regression. |
| 2 HIGH revoke during pending upstream read | Recheck after read before enqueue; state cancellation delay | FIXED in current source; barrier-controlled local-upstream RED/GREEN receipts plus nine socket checks pass. No immediate push-based cancellation claim: stalled upstream is cancelled by the overall 30-second deadline; no newly read chunk passes a failed current-authority check. Already released bytes cannot be recalled. |
| 3 HIGH effective runtime privileges | Fail closed on inherited audit mutation/ownership/schema privileges; actual deployed-role readback | VERIFIED on v15: direct/inherited audit mutation, owner membership and schema/database creation are rejected in disposable PG. Actual deployed runtime-role readback remains OPEN. |
| 4 HIGH lifecycle/denial audit | Metadata-only login/callback/logout and management denial audit; fail-closed session policy | PARTIAL: invalid MCP bearer now resolves through shared audited authorization; nine socket checks pass including durable anonymous denial. v20 signed local-IdP fixture passes lifecycle callback events and audit-failure withholding of new session/cookie. Management denial hook and real login remain independently unproven. |
| 5 MEDIUM issuer binding | Immutable installation issuer/client pin or issuer/subject membership key | VERIFIED in disposable PG: owner initializes one binding; runtime reads only and startup/migration reject issuer/client mismatch. v16 readback recovered: immutable binding and contaminated-role checks both pass; v16 HTTP timed out with empty log. Latest v20 database checks also pass. |
| 6 MEDIUM run and terminal attribution | Server-owned principal/org/delegation run binding; terminal audit; no invented usage | PARTIAL, UNVERIFIED: candidate now persists per-invocation run records and terminal audit with usage unavailable; fixture assertions added. This is not a reusable cross-request harness execution binding. Cancellation/finalizer races, crash recovery and runtime receipts remain OPEN. |

## Evidence limits

Real Zitadel callback, deployed runtime isolation and candidate Maple persistence
remain unproven. Local signed IdP/PG/OTLP/provider fixtures are labelled fixtures.
No public routing, existing Talos API/web or Kaneo changes are justified by this
review. Full-repository build remains failed pending attribution. Candidate
build now passes byte-identical console asset verification; updated full
repository typecheck timed out; slow-body RED and subsequent v14 GREEN were recovered. No current test run is claimed. Full lint
failed with 78 errors, 47 warnings and 9 infos; not a clean gate.

## Verification interruption

The build host subsequently became unreachable: bounded SSH preflight returned
255 with `Connection timed out during banner exchange`. The slow-body RED run
result was subsequently recovered as RED and fixed; v14 GREEN is stored in
`auth-llmgw-receipts/body-and-db-green.json`. The v12 updated full typecheck
returned 124 (timeout), not a pass. Reconcile their
existing jobs and receipts before relaunching; do not treat this interruption
as an application test result. The database validator and slow-body mitigation
were executed successfully before the next transport interruption. The later
issuer-binding and auth-lifecycle changes are not covered by those receipts.
Transport subsequently recovered. v16 database checks passed and HTTP timed
out; no surviving candidate test job was found. v20 now runs from a new frozen
archive: auth fixture, candidate artifact build, database, store and audit
checks have exit 0, as do HTTP (ten named groups) and the pending-read stream
regression. Full-repository typecheck exits 0 on v20. Lint exits 1 with
84 errors, 69 warnings and 10 infos before formatting. Scoped formatting now
clears errors: full lint exits 0 with 68 warnings and 10 infos. v20 full build
failed in web prerender: missing top-level router-core in the isolated tree
resolves through `/home/rpw/node_modules` into an unrelated checkout. No shared
path or web dependency changed. v21 logout and durable management-denial
assertions pass. Formatted-source v26 fixtures, candidate build, full typecheck
and full lint all exit 0 (lint retains warnings/infos). A direct router-core
trial exposed the same leak for history and was removed. v28 instead bundles
SSR dependencies via `ssr.noExternal: true`; frozen install passes and full
build now exits 0 (six of six build tasks; shell routes prerendered). A stronger
post-create callback audit-failure regression found an orphan session; v29 RED
was fixed by tracking the exact newly created session, deleting it through the
resolved auth adapter and verifying absence before returning the failed callback.
v30 signed local-IdP fixture and v31 runtime/full typecheck/full build pass.
v31 lint failed only receipt JSON formatting, subsequently corrected; the full
post-v32 lint exits 0 with warnings/infos retained. v32 additionally passes the
deterministic abort-during-terminal-persistence check without releasing DONE.
A later expanded v35 run exposed a reentrant finalization race; v36 fixes it
with a registered deferred finalizer and a post-write abort check. All three
stream groups pass, including shutdown awaiting a deliberately held terminal
audit before pool closure. v37 full gates subsequently all exit 0 on matching
source hashes: signed IdP/auth, database, store, audit, HTTP, stream, candidate
build, full typecheck, full lint and full build. Lint retains 73 warnings and
10 infos; build reports six successful tasks (five cached). Disposable v37 PG
containers are absent on readback. See `auth-llmgw-receipts/v37-completed.json`.
v33 repeats the actual Better Auth callback, failed admission/acceptance audit
cleanup and logout using a fresh PostgreSQL database with restricted runtime
credentials; all seven named groups pass. This cleanup is not a cross-database
atomicity or real-login claim.
See `auth-llmgw-receipts/candidate-v20-runtime.json`; public cutover remains HOLD.

## Follow-up review: run outcomes and refresh

Source-only follow-up `deleg_d9236601` identified four blockers. Reconciled
against the newer source, not treated as cleared by v37:

| Finding | Disposition |
|---|---|
| Provider EOF/error falsely completes | FIXED with the installed Effect SSE parser: premature EOF and error frames fail; only parsed `[DONE]` completes, emitted once after durable completion. v38 RED, v40 five stream groups GREEN, including split frames and revoke-during-read. |
| Rejected finalizer strands running row | PARTIAL: v43 RED -> v44 stream/typecheck GREEN proves one-off terminal write recovery, exactly one terminal event, and shutdown drain. Three bounded attempts preserve one chosen outcome. Sustained failure and process-interruption reconciliation remain OPEN. |
| MCP admission lacks cancellation/failure terminal path | PARTIAL: v45 RED left a running row; v46 HTTP GREEN proves cancellation immediately after durable admission persists one cancelled terminal event. Outer handler now retains MCP run ID and shares guarded finalization. v47 adds first-write failure to that barrier regression and all full gates pass. Sustained failure/recovery remains OPEN. |
| Sliding session refresh lacks audit | FIXED by disabling refresh. v41 RED, v42 PG and memory fixtures GREEN: refresh-eligible session reads through public and internal APIs do not advance expiry/update time. Full typecheck exits 0. |

Receipts: `auth-llmgw-receipts/provider-eof-v38-red.json`,
`auth-llmgw-receipts/session-refresh-v41-red.json`, and
`auth-llmgw-receipts/provider-and-session-v40-v42-green.json`.
These remain local fixtures, not real provider or Zitadel evidence. The staged
Talos v37 artifact predates these fixes and must not be activated.
Further RED/GREEN: `auth-llmgw-receipts/terminal-retry-v43-red.json`,
`auth-llmgw-receipts/mcp-cancellation-v45-red.json`, and
`auth-llmgw-receipts/terminal-and-mcp-v44-v46-green.json`.
The formatted v47 snapshot now passes all fixture phases plus candidate build,
full typecheck, lint and full build (exit-ledger readback). The MCP cancellation
barrier also injects one terminal-write failure and proves two attempts leave
one cancelled event. v48 separately revokes actual PG audit INSERT, requires
terminal update rollback, restores permission and retries using a fresh store,
leaving exactly one event. This is explicit retry, not automatic restart recovery.
Receipts: `auth-llmgw-receipts/v47-completed.json` and `auth-llmgw-receipts/v48-completed.json`.
v49 strengthens the stream retry proof: actual runtime audit INSERT is revoked
for the first terminal write and restored before retry; six stream groups and
full typecheck pass. Two attempts leave one completion event, without releasing
DONE before persistence. Receipt: `auth-llmgw-receipts/v49-real-pg-terminal-retry.json`.
A bounded durable-recovery design review is active; automatic restart recovery
and sustained-outage reconciliation are still OPEN.
v50 now proves sustained audit INSERT denial across all three bounded terminal
attempts withholds success and leaves no terminal event. Seven stream groups
and full typecheck pass; the running row requires explicit fixture cleanup
after permission restoration, demonstrating rather than closing the recovery
gap. Receipt: `auth-llmgw-receipts/v50-sustained-audit-outage.json`.

## Delayed cleanup review reconciliation

`deleg_0b0cf404` reviewed an older source snapshot. Its missing post-persistence
abort guard and missing terminal-write drain are superseded by the v36-v50
checks. Its distinct underlying-auth shutdown finding remained valid: a timed
out response did not join the auth operation and compensating session deletion.
v51 RED now exposes that missing drain while holding the real adapter after
session insertion; v52 PG and memory auth groups plus full typecheck pass after
tracking underlying auth promises and abort controllers. Gateway dispose calls
`auth.drain()` before closing pools. This is graceful-drain evidence, not crash
atomicity. v53 full fixture/typecheck/lint/build gates now all exit 0.
v54 strengthens the barrier: drain itself initiates abort without prior caller
cancellation; held insertion cleans up, no session cookie escapes, and new auth
work receives 503. Both PG/memory groups and full typecheck exit 0.
Receipts: `auth-llmgw-receipts/v53-completed.json` and `auth-llmgw-receipts/v54-completed.json`.
Receipts: `auth-llmgw-receipts/auth-drain-v51-red.json` and
`auth-llmgw-receipts/auth-drain-v52-green.json`. The inactive Talos v47 artifact
predates this change and is not eligible for activation.

## Durable terminal choice — implementation in progress

The completed read-only recovery review `deleg_9e296e70` recommends retaining
PostgreSQL and separating durable terminal choice from terminal audit publish.
v55 RED proves an audit failure previously allowed a fresh store to replace a
cancelled choice with completed. v56 store GREEN persists `terminal_choice`
before the second transaction atomically appends the terminal event and updates
outcome. A bounded recovery batch handles pending choices and expired orphan
runs; unknown interrupted work is `interrupted`, `externalEffect: unknown`,
never replayed or inferred successful. The fixture artificially ages one run;
it is not SIGKILL evidence. Concurrent recovery checks leave one event and do
not change the unexpired run.

The fixed two-minute orphan grace is a deliberate ceiling for the current
30-second request limit and metadata-only MCP tool; fenced execution leases are
required before long-running tools. v57 connects recovery to the existing
five-second export loop and runs full gates. No v57 pass or crash-recovery
closure is claimed yet. All staged artifacts predate these changes.
Receipts: `auth-llmgw-receipts/terminal-choice-v55-red.json` and
`auth-llmgw-receipts/terminal-choice-v56-green.json`.
v57 runtime, typecheck and full build pass; full lint fails four formatting
errors, subsequently formatted without unrelated edits. v58 adds actual SIGKILL
after terminal-choice persistence while audit INSERT is denied. A fresh worker
process after permission restoration recovers exactly one cancelled event;
store checks and full typecheck exit 0. This proves that specific kill window,
not whole-daemon/pre-choice kill recovery. Receipts: `auth-llmgw-receipts/v57-completed.json`
and `auth-llmgw-receipts/v58-completed.json`. Formatted v59 full gates are running;
source-only durable-recovery delta review `deleg_27fffb27` is active.
v59 now passes all fixture/typecheck/lint/build gates; v60 additionally observes
the actual background recovery loop after sustained audit permission outage
without directly invoking recover. Stream checks and full typecheck pass.
Receipts: `auth-llmgw-receipts/v59-completed.json` and `auth-llmgw-receipts/v60-completed.json`.
These do not prove whole-daemon or pre-choice kill recovery; independent review
and deployed identity/Maple evidence remain OPEN.

## Broader review reconciliation — deleg_36992db5

The review's main.ts hash predates durable recovery, MCP cancellation wiring,
fixed-lifetime sessions and auth drain. Its findings 1/3/4 have newer local
regression evidence above, not live-deployment clearance. Finding 2 exposed a
remaining late-admission shutdown window: v64 RED observes disposal finishing
while a committed admission is held before returning. Tracking request promises
separately from stream finalizers fixes it; v65 stream and full typecheck pass,
including persisted late-admission cancellation before pool close.

Finding 6 exposed effective mutation rights on identity/installation tables.
v61 RED accepts contaminated INSERT; v62 GREEN rejects INSERT/UPDATE/DELETE/
TRUNCATE/TRIGGER on both immutable tables and rejects a shadow-schema search
path. Deployed runtime-role readback is still required. Receipts:
`auth-llmgw-receipts/immutable-role-v61-red.json`,
`auth-llmgw-receipts/shutdown-admission-v64-red.json`, and
`auth-llmgw-receipts/immutable-and-shutdown-v62-v65-green.json`.

Finding 5 (trusted cross-request execution binding) and finding 7 (live human
Zitadel, deployed isolation and Maple readback) remain OPEN. Full v66 gates
passed on the combined formatted changes: all fixture groups, full repository
typecheck, lint and build exit zero. Lint retains 100 warnings and 10 infos.
Current gateway source matches both the v66 archive and remote gate tree;
receipt: `auth-llmgw-receipts/v66-completed.json`. Independent delta review
`deleg_e744600d` is pending; this is not deployed enforcement or cutover clearance.

## Recovery design reconciliation — deleg_9e296e70

The delayed design recommendation already informed the two-transaction terminal
choice and bounded recovery implementation (v55-v60). Current schema includes
idempotent ALTERs and a partial recovery index; no existing-installation upgrade
receipt is claimed. The recommendation's fairness concern remained valid:
v67 RED showed 16 audit-exhausted alpha runs monopolizing two recovery batches
while an eligible beta run stayed running. Failed rows now move behind untouched
work without changing terminal choice. v68 GREEN recovers beta on the second
batch; this uses artificial audit counter positioning, not sustained load.

v69 repeats every fixture plus full repository typecheck, lint and build with
zero exits; lint retains 103 warnings and 10 infos. Current gateway source hashes
match its archive and remote gate tree. Receipts:
`auth-llmgw-receipts/recovery-fairness-v67-red.json`,
`auth-llmgw-receipts/recovery-fairness-v68-green.json`, and
`auth-llmgw-receipts/v69-completed.json`.
Recovery/export failure coupling, backlog admission bounds, database-wait bounds
and expiry fencing remain review/verification concerns, not cleared by fairness.
Whole-daemon/pre-choice kill and live cutover gates remain OPEN.

## Recovery independent of OTLP delivery

v70 RED reproduced export/recovery coupling: the local OTLP sink returned 503,
PostgreSQL audit INSERT was restored, but the saved completion stayed running.
The loop now catches export and recovery failures independently while remaining
sequential and non-overlapping. v71 GREEN observes a real local OTLP rejection
and exactly one recovered completion through the actual background loop.

v72 repeats all fixtures and full repository typecheck/lint/build: every exit
is zero, with 103 lint warnings and 10 infos. Current source hashes match the
archive and remote gate tree; own disposable v72 containers are absent.
Receipts: `auth-llmgw-receipts/recovery-export-v70-red.json`,
`auth-llmgw-receipts/recovery-export-v71-green.json`, and
`auth-llmgw-receipts/v72-completed.json`. This does not prove prolonged database
outage, admission backlog limits, whole-daemon recovery or live deployment.

## Admission pressure while bookkeeping is pending

v73 RED accepted a new invocation despite a saved unpublished terminal choice.
The shared authorization transaction now refuses new admission for an org with
pending terminal choice or overdue runs, and enforces a global 64-running-row
ceiling under the existing advisory lock. Authority-only checks, finalization,
revocation and recovery remain available. v74 GREEN verifies pending and overdue
refusal, unchanged authority-only checks, global capacity refusal and recovery.
Capacity rows are positioned directly; this is not a 64-request load test.

v75 repeats all fixtures and full repository typecheck/lint/build with zero
exits; lint retains 105 warnings and 10 infos. Current source hashes match its
archive and remote gate tree; own disposable v75 containers are removed.
Receipts: `auth-llmgw-receipts/admission-backlog-v73-red.json`,
`auth-llmgw-receipts/admission-backlog-v74-green.json`, and
`auth-llmgw-receipts/v75-completed.json`.

Recovered completed review `deleg_17823ff9` identified export/recovery coupling
on the older shared-tryPromise loop; v70-v72 above provide its RED/GREEN fix.
The complete delayed `deleg_27fffb27` result is now delivered: its sole blocker
is the same export/recovery coupling, fixed with v70 RED → v71 GREEN and full
v72/v77 gates. Its source-only assessment found no additional blocker in the
two-transaction choice/concurrency boundary, accepted the two-minute cutoff
for current 30-second requests and metadata-only MCP, and correctly limited
SIGKILL proof to post-choice/failed-audit recovery. The actual-loop OTLP-outage
fixture proves saved-choice recovery; an expired orphan during that same outage
is not separately exercised. This review is not live-deployment clearance.
Review `deleg_e744600d` completed without semantic source inspection; it supplies
no clearance. Replacement bounded review `deleg_254d1e53` semantically inspected
`database.ts`, `main.ts` and `auth.ts` and found no blockers in the requested
shutdown/immutable-database scope. It did not execute tests or establish deployed
enforcement. Public HOLD and cross-request execution/live evidence gates remain.

## Legacy-shape schema upgrade proof

v76 exercises the existing owner schema against a disposable legacy-shaped
`gw_run` lacking terminal-choice/recovery columns and interrupted outcome.
The migration preserves admitted actor/request identity and running state,
adds a fresh grace period without inventing completion, tolerates repeated
application, and later classifies the deliberately expired row interrupted
with external effect unknown. No production implementation change was needed;
this verifies existing behavior, not a bug-fix RED/GREEN claim.

v77 repeats all fixture groups and full repository typecheck/lint/build: every
exit zero, 105 lint warnings and 10 infos. Store check inventory contains 17
unique checks. Current source hashes match its archive and remote gate tree;
own disposable v77 containers are removed. Receipts:
`auth-llmgw-receipts/legacy-upgrade-v76-green.json` and
`auth-llmgw-receipts/v77-completed.json`. No deployed migration proof is claimed.

## Complete OTLP-outage recovery check

v78 adds the remaining review check without production changes: an artificially
expired, unchosen admitted run and a saved completion both recover through the
actual background loop while the local OTLP sink rejects exports with 503.
The orphan has exactly one call.interrupted event with externalEffect unknown;
provider invocation count is unchanged, so no effect replay occurred.

v79 passes all fixture groups and full repository typecheck/lint/build, with
109 warnings and 10 infos. Its stream inventory contains 10 unique checks.
Gateway source hashes match the archive and remote gate tree; own disposable
v79 containers are removed. Receipts: `auth-llmgw-receipts/orphan-export-v78-green.json`
and `auth-llmgw-receipts/v79-completed.json`. This supersedes the earlier
unexercised-orphan caveat, not whole-daemon/pre-choice crash or deployment gates.
