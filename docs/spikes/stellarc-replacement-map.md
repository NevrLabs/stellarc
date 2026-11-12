# Replace 9router and Executor with Stellarc — supervised execution map

## Destination
The spike delivers one app, **Stellarc Gateway** (`apps/stellarc-gateway`), which
owns everything gateway-shaped. The model gateway (`apps/llmgw`) and the tool
gateway (`apps/toolgw`) are subsystems of it, not separate apps; further
gateways join the same way. `core-auth` stays a core module that the gateway
consumes. Preserve shared authority/audit semantics without merging
subsystem-specific provider/tool policy into core-auth.

This supersedes the earlier destination (separate `llmgw` and `toolgw` apps,
with `apps/stellarc-gateway` as temporary scaffolding), which the dated R-series
documents in this folder still describe. The source already has this shape: the
gateway is the only process, and it imports both subsystems.

The user's actual clients can use Stellarc instead of the currently deployed
9router and Executor, with equivalent required provider/tool functionality,
server-owned credentials, current authorization, durable approvals/audit,
correlated telemetry and a verified reversible migration. A wrapper that still
requires either old product is an intermediate integration, not replacement.

## Authority and boundaries
- User explicitly requested continuing execution, supervisor ownership, parallel
  GLM/GPT agents and an ongoing review council. This supersedes the former
  no-replacement scope for implementation and migration preparation.
- Preserve working 9router, Executor, Kaneo and unrelated services. No destructive
  retirement, shared credential rotation, shared restart, Access bypass or paid
  inference is inferred. Credential movement stays private, host-to-host.
- Use existing provider permissions; protocol compatibility does not establish
  permission to forward a subscription. Flag genuine commercial/auth decisions.
- Supervisor owns integration and live deployment. Workers have disjoint files;
  no independent deployment, commits, pushes or shared dependency changes.
- Tests/builds run on fxbuilder with isolated data and serialized heavy gates.
  No edits into an actively verifying source snapshot.

## Current builder disposition — direct R3 supersedes access HOLD
Direct Proxmox console + now-responsive guest agent established actual guest OOM
kills, journal startup timeouts, 4.12 GiB RAM-backed verification artifacts and root
filesystem at 100% (579 MiB available). Authenticated `fxbuilder` SSH works again,
without restart/resource changes. Preserve gates paused for unsafe resource
headroom, not unavailable transport. Partial full2 reconciliation recovered the
same seam124/gate141; no new tests launched. Scope cleanup by artifact ownership,
preserve evidence and obtain the specific deletion decision before removing other
workers' RAM-backed trees or Docker volumes.
[Direct diagnosis R3](stellarc-builder-direct-r3.md).

R4 recovered RAM headroom through verified preservation of four inactive trees;
parent independently rehashed all four remote archives and confirmed source-tree
absence plus relocation receipts. The removed dangling image is absent. Root disk
still fails the heavy-gate budget. R5 now owns specifically scoped, archive-first
relocation of proven-inactive root scratch (no repositories/toolchains/volumes,
no restart/resource change). R5 recovered the root budget; parent fresh readback
verified six archive sizes/manifest hashes/relocation receipt presence and original
absence, root 5,296,246,784 bytes available, MemAvailable 4,223,401,984 bytes and
memory PSI avg10 zero. Release only serialized, capacity-preflighted fixture
execution, not deployment or blanket resource clearance. GLM approval R6 and GPT
LLM R6 now own disjoint RED/GREEN fixes using shared locks in fixed order
(authgw then ws); no old runner replay or parallel-heavy gate launches.
[Headroom R4](stellarc-builder-headroom-r4.md),
[Root recovery R5](stellarc-builder-root-r5.md).

## Host/core R8 executed delta
Parent read back all named host/core child receipts (zero), source/built CLI
startup and immutable pin denial logs, plus built artifact SHA
`28f4e9456243e660f002247fff063a5726add0af6d6fba43df578e4229ed08c9`.
Normal moved-core jose resolution genuinely fails (exit1); behavior checks used
a disclosed private overlay. Parent added existing pinned jose6.2.12 to root
manifest. R9 did not complete: parent read back gate exit1 after successful
lock-only generation; its Python JSON parser rejected Bun JSONC, and no install/
resolver/auth phase ran. Generated lock also deletes unrelated libc metadata, so
it is rejected for transfer. R10 closes the narrow dependency gate: root-jose-only
lock `3b32a80b105b93629e22e6efca3f47cc9b6a649fdbede4b9557d4595c7585b07`,
fresh frozen-install child0 with unchanged lock, normal jose import/resolution,
18 pinned paths and auth-memory10 pass. Parent verified all 57 mirrored receipt
hashes, actual child exits and the local lock; a fresh remote readback was blocked
by SSH banner timeout, so current builder availability is not established. Failed
capacity/lock runner exits remain separate, not rewritten green. Reusable install:
`/mnt/deepvault/stellarc-coredeps-r10-20261109T063221Z-root-only-c/source/node_modules`.
Frozen fullrepo R8 remains evidence for its pre-change revision. No production
activation or combined-source acceptance follows.
[Dependency closure R10](stellarc-core-deps-r10.md).
[Host gates R8](stellarc-host-gates-r8.md).

## LLM R6 executed delta
Parent matched final module/check hashes and read all 15 final child/aggregate
exit receipts (zero), seam/source and artifact logs (65 checks, matching hashes),
empty strict diagnostic log and warning-free Biome. A held cancel-hook defect
and exactly-once settlement/reader-cleanup regressions have executed RED/GREEN
closure. Unchanged historical source passed 48 checks now: full2 timeout cause
remains unproven. Cross-model GLM lifecycle council R8 and GPT split host/core
fixture gates R8 are running; serialized shared locks coordinate approval R7.
No whole-repo, real-provider or deployed acceptance follows from seam passes.
[LLM R6](stellarc-llm-redgreen-r6.md).

GLM lifecycle council R8 semantically PASSes the repair with no blocking source
defect. Consumer-cancel plus rejecting durable finish remains a narrow proof gap;
`control.abort()` must abort the supplied signal. Preserve the currently frozen
source while host/fullrepo gates run; add the missing regression and interface
contract in the next source revision, not by silently changing active inputs.
Host/runtime execution is still pending; source review does not clear it.
[Lifecycle council R8](stellarc-lifecycle-council-r8.md).

## Approval R6 executed delta
Supervisor read the current decision/claim/report/recovery paths, matched final
source hashes and read back remote receipts: initial six failing groups → four
→ two → all 20 passing, repeated on formatted source. F1–F3 behavioral regression
closure is supported; this is not integration/activation clearance. Raw strict tsc
still exits 2 with 11 errors; message-only baseline deduplication is not a clean
compile. Host build excludes the unwired approval implementation. GLM R7 owns
clean strict typing and actual standalone module/bundled-check verification;
shared gate locks serialize it with LLM R6. No approval endpoints enabled.
[Approval R6](stellarc-approval-redgreen-r6.md).

R7 supersedes the owned compiler blocker: parent matched both final source hashes,
read raw strict compiler exit0/diagnostics0, standalone module/check bundle exits0,
and source+artifact 20-group passing child receipts. Artifact hashes read back.
This clears scoped primitive typing/artifact checks, not authenticated dispatch
integration. R8 approval council confirms F1–F3 closure but identifies N1 HIGH:
`claim()` can cross expiry during its awaited recheck, then release the payload
because the winning update lacks a DB-time expiry predicate. Primitive integration
eligibility and deployment remain HOLD pending closure review. Expiry R9 now
has parent-read-back RED3/24 followed by source24/artifact24 child exits0, raw
strict0/diagnostics0, Biome0 and matching full source/artifact hashes. Both claim
and decision winning updates use DB-time expiry predicates; audit-denial rollback
and skew coverage are included. Donor jose overlay remains disclosed, not normal
install proof. GPT expiry council R10 confirms N1 repaired but identifies N2:
expired acceptance emits the same success-kind event as a real approval. GLM
approval-events R11 was cancelled in the outage. Owner recovery R12 reconciled
queue/jobs/source and implemented attempt/success separation: RED2/26, then
source26/artifact26 exits0, raw strict0 and Biome0 (13 inherited warnings). No
replacement delegates. N2 has scoped implementation/runtime closure; independent
review and integration HOLD remain. Cancelled core-authority extraction did not
land. Fullrepo R8 logs are runner bus failures, not executed product acceptance.
Local lock drift to rejected R9 metadata was restored to exact verified R10 lock.
[Owner recovery R12](stellarc-approval-events-recovery-r12.md). R9
RED proves old behavior, not an independently isolated winning-predicate mutation;
skew execution covers claim only and the audit-denial case is rollback coverage.
Owner R13 implements the shared tx-scoped `recheckRun`, with four source and
four bundled groups passing plus raw strict/Biome/build exits0. It binds original
run context, checks current authority and refuses terminal/overdue runs without
readmission or second budget spend. The inherited store regression launch remains
capacity-refused (root below 4GiB and CPU pressure), so integration eligibility
is still HOLD; Chief of Staff has received/read the blocker and is coordinating
safe compute. Source-side review identified the fullrepo runner's missing user-bus
environment; a new unexecuted runner candidate is staged, not acceptance evidence.
No approval/host wiring exists. [Blocker R14](stellarc-verification-blocker-r14.md). [Core recheck R13](stellarc-core-recheck-r13.md). Dependency R10 has narrow clean-install proof;
fullrepo R8 is an older freeze with runner failures, not passing gates.
[Expiry council R10](stellarc-approval-expiry-council-r10.md).
[Expiry repair R9](stellarc-approval-expiry-r9.md).
[Approval types R7](stellarc-approval-types-r7.md),
[Approval council R8](stellarc-approval-council-r8.md).

## App-structure extraction — current source, not deployed acceptance
- `packages/core-auth/src/`: nine moved authority/auth/audit/migration/check files.
- `apps/toolgw/src/`: seven moved MCP/OpenAPI/approval/check files.
- `apps/llmgw/src/`: four moved provider-routing/bounded-SSE/check files.
Supervisor verified all destination hashes against move manifests and old-path
absence; the current structural scan checked 53 relative imports, none missing.
Temporary host retains shared ingress/admission/lifecycle orchestration. No new
app manifests, process/role isolation, protocol parity or runtime acceptance is
claimed. GPT integrated source council R5 returned conditional source GO/runtime
HOLD. Supervisor applied a narrow CLI/check-only console lint exception, declared
host Turbo inputs for all source-only app/core trees plus telemetry, and fixed
current migration instructions. JSON/glob/path assertions passed; actual Biome,
Turbo invalidation and runtime checks still require execution. New explicit
`tools/spikes/auth-llmgw/split-checks.json` lists current fixture inputs; historical
runners remain immutable. Builder-headroom recovery continues independently.
Do not launch old path-pinned gate scripts.
[Core extraction R2](stellarc-core-auth-extraction-r2.md),
[Tool app R3](stellarc-toolgw-extraction-r3.md),
[LLM app R4](stellarc-llmgw-extraction-r4.md).

## Verified starting point
- Worktree spike/auth-llmgw-maple, base 2dce6d069db62ebf880ec0cb7c280f3a58a7034c.
- v84 candidate is running behind the unchanged Cloudflare Access gate.
- Human authentication is configured, but actual human callback/session remains
  unverified. Optional response issuer and auth headers have regressions.
- Agent identity/credentials/delegation/admission and durable terminal recovery
  have disposable PG/socket evidence. This is not complete product parity.
- LLM: one streaming fixture route; no real provider/inference acceptance.
- MCP: metadata-only tool; no external tool gateway or approval inbox acceptance.
- Real denied-call log and correlated Server span persisted in Maple. Missing
  bootstrap/login audit readback remains unresolved despite receiver ack.
- Latest individually recovered v84 gates are zero; 109 warnings/10 infos.
  No overall wrapper success is inferred from the timed-out outer wait.

## Startable workstreams — first parallel batch
1. **LLM replacement slice (GPT)**: inventory real 9router/client contracts without
   exposing secrets or generating inference; identify active requirements and
   implement a bounded provider-routing seam with disposable regressions where
   the source contract is established. Own new provider module/check files only.
2. **Tool replacement slice (GLM)**: inspect actual Executor source and configured
   integration metadata read-only; establish the required MCP/OpenAPI/GraphQL,
   credential, approval and client compatibility scope. Deliver code-grounded
   acceptance matrix and the smallest executable next slice; no live changes.
3. **Audit persistence closure (GPT)**: diagnose acknowledged-but-missing events
   against actual source and permitted live read-only evidence. Own audit.ts and
   audit-check.ts only if a sender root cause is demonstrated with RED/GREEN;
   otherwise report the exact owning layer and evidence, never clear the gap.

## Verified batch findings
- Audit lane R1: supervisor re-ran the captured-evidence reconciliation (exit0)
  and confirmed unchanged audit sender/check hashes. Ten acknowledged PG events
  reconcile to five stored and five missing IDs. Missing untraced INFO classes
  match the running Maple retention filter; this is not a sender patch target.
  [Audit closure R1](stellarc-audit-closure-r1.md) records exact provenance and
  limits. Audit acceptance remains OPEN. Prepare and council-review a narrow
  collector-owner correction offline; no Maple rollout or historical replay is
  authorized by this diagnosis. Do not fabricate traces or raise severity.

- LLM lane R1: direct-provider Chat/Messages/Responses seam and contract checks
  are present, not integrated or deployed. Required current aliases include
  OAuth and cross-wire translation; API-key pass-through does not replace them.
  Supervisor verified final local module/check hashes and recovered SSH. The
  interrupted wire-safety snapshot contains intermediate RED module bytes and
  final check bytes, with no surviving matching gate process. A fresh GPT
  council/verification task owns exact-final-source verification and the durable
  finalization integration contract. Do not deploy from the interrupted snapshot.
  [LLM replacement R1](stellarc-llm-replacement-r1.md).

- LLM council R2: supervisor reran the receipt validator (exit0) and checked
  unchanged source hashes. Standalone 35 checks, strict compile/build/Biome and
  three expected-RED mutations are verified. Integration remains HOLD: native
  terminal/finalizer ordering, post-finalizer authority, chunk-dependent complete
  SSE-event ceiling, invalid JSON success and required OAuth/client parity remain
  open. Source integration lane owns the next live-disabled stream-only slice;
  do not enable nonstreaming or infer replacement from standalone passes.
  [LLM council R2](stellarc-llm-council-r2.md).

- Audit council R2: supervisor independently parsed all 43 captured case IDs,
  exact expected/actual sets and unique log occurrences; baseline8/proposed31,
  patch/results hashes match. Proof uses Talos agent binary, NOT central image.
  Central-image fixture and approved rollout/fresh-persistence remain open.
  UUID-shaped labels are not authenticity and a per-org outbox ceiling is not
  a sender rate limit; these claims need explicit correction in next review.
  [Audit council R2](stellarc-audit-council-r2.md).

- Tool lane R1: remote MCP Effect-client wrapper and loopback regressions are
  present; supervisor read both files and verified local/remote snapshot hashes.
  Runtime report is lane evidence, not integrated approval. Actual inventory is
  primarily Google/Resend OpenAPI, not remote MCP; zero configured GraphQL means
  GraphQL work is deferred. Remote transport alone cannot replace Executor.
  Next council checks raw-error privacy, config/size bounds, cancellation and
  credential custody before policy/approval integration. No live tool call or
  deployed transport is claimed. [Tool replacement R1](stellarc-tools-replacement-r1.md).

- Audit central R3: supervisor verified results hash, exact expected occurrence
  counts and all captured child exits (only deliberate canary exit1). Exact
  loaded central executable proof is closed; agent-binary equivalence was not
  assumed. Reviewed patched full-config hash is 0d30e467a449ea37d00a97e3cbddfa1d03dfc6458a8cf3b597e6d321eab82b49,
  superseding the unreproduced R2 abbreviated claim. Stop repeating this gate.
  Collector-owner full-config validation/authorized rollout and fresh exact-ID
  persistence remain open; historical replay is separate. Security authenticity
  and rate bounds are not established by retention matching.
  [Audit central R3](stellarc-audit-central-r3.md).

- OpenAPI R1: supervisor read the executor end-to-end and verified matching
  local/frozen-build source hashes, gate-log hash and seven zero child receipts.
  Loopback-only read/mutation checks are standalone evidence, not MCP approval
  integration. Current-rights callbacks are seams, not durable approval claims.
  Next cross-model lane reviews this boundary and builds the bounded PG-backed
  approval/claim primitive; no real credentials or external dispatch authorized.
  [OpenAPI R1](stellarc-openapi-r1.md).

- LLM integration R3: supervisor verified all seven final local source hashes
  against the report. Shared bounded-SSE and durable stream integration exist;
  intermediate runtime passes are not final acceptance. Builder banner timeout
  reproduced (exit255), so final full2 source/jobs/receipts remain unconfirmed.
  GLM R4 owns independent semantic review and bounded recovery/adoption of the
  exact surviving snapshot; no deployment or speculative rerun authorized.
  [LLM integration R3](stellarc-llm-integration-r3.md).

- LLM council R4: recovered full2 seam.exit=124 and gate.exit=141;
  this is a real hung seam check plus runner SIGPIPE, not just lost SSH output.
  Six security/lifecycle areas passed semantic review; final execution remains
  HOLD. Awaited reader.cancel is a source-based suspect, NOT an executed root
  cause: require deterministic cancellation bisect before applying the proposed
  nonblocking cleanup change. No surviving snapshot work was reported.
  [LLM council R4](stellarc-llm-council-r4.md).

- LLM recovery R5: no remote runner or tests started; both configured builder
  aliases failed banner exchange (exit255). No source edits, cancellation root
  cause still unproven. Stop assigning identical blocked verification attempts;
  use the freed lane to diagnose existing transport read-only, with no shared
  restarts or SSH trust changes. T3 linked Talos/Zephyr answer, which does not
  establish builder reachability or authorize alternate compute.
  [LLM R5](stellarc-llm-r5.md).

- Builder transport R1: all three local builder aliases share one endpoint;
  independent Zephyr→Talos control works but Talos→builder SSH also failed.
  Reachable neighbor does not prove builder identity/health. LLM execution stays
  paused; next owner uses read-only PVE inventory/guest-agent management after
  verifying current guest placement, not repeated alias retries or blind restart.
  [Builder transport R1](stellarc-builder-transport-r1.md).

- Builder management R2: independent PVE access confirms VM6970 on
  thinkcentre-01 running, but guest agent and SSH unavailable. Current 8GiB
  balloon/16GiB maximum and binding two-core quota are observations, not repair
  authorization or proven cause. Existing guest-console inspection is required;
  no blind restart/resource increase. Pause further builder gate/retry dispatches.
  Use independent source-only parity work while runtime gates remain blocked.
  [Builder management R2](stellarc-builder-management-r2.md).

- Approval R1: source/check delivered; final GREEN/strict/format/build receipts
  are absent. Supervisor stopped and read back termination of recovery poller
  `proc_f1de4ffad4a1` (killed, exit -15); no automatic gate continuation.
  GPT council R2 completed source review: F1 expiry/denial receipts roll back,
  F2 recovery can audit stale non-transitions, F3 terminal idempotency skips
  claim-owner validation, F4 harness/provenance defects block proof. Supervisor
  inspected the corresponding production paths. GLM R3 delivered harness repairs
  and regression oracles, NOT execution: supervisor matched all eight manifest
  entries, current check SHA `1ead040406d30c3688b0d3e38152b1c712429d7be68727b55d236827fa364c23`,
  and the 20-group report inventory. Predicted six RED groups are expectations,
  not receipts. F2 uses observed advisory-lock queue order; barrier-failure cleanup
  and actual race reachability still require execution. Production is unchanged;
  fixes await an observed failing run after builder recovery. No retry poller or
  automatic gates. [Regression preparation R3](stellarc-tool-approval-regressions-r3.md).
  Integration HOLD.
  [Approval R1](stellarc-tool-approval-r1.md),
  [Council R2](stellarc-tool-approval-council-r2.md).

- Client parity R1: supervisor read the complete contract, structurally parsed
  all six synthetic JSON payloads and matched current main/provider source hashes.
  Pinned 9router registry independently confirms both required cx models select
  Responses Lite, not generic API-key Responses forwarding. Required next slices:
  bounded Chat↔native codecs at the existing lifecycle seam; authenticated client
  ingress/catalog plus account-bound transport. Claude CLI path capture, opaque
  reasoning continuity, nonstream lifecycle and every configured T3 favorite
  remain acceptance gaps. These vectors are specifications, not interoperability
  receipts; no provider permission, live traffic or deployment is inferred.
  [Client parity R1](stellarc-client-parity-r1.md).

- Remote MCP council R2 delayed result: supervisor read module/report and matched
  both final source hashes. Error sanitization, bounds/header/URL guards and
  discovery caps are present; intermediate 17-stage GREEN is worker-reported,
  not final-source consolidated acceptance. Strict/static/runtime gates remain
  open, no stale script or builder retries launched. Corrected unproven host-cause
  attribution and obsolete pending-state claim sketch in the report. Prioritize
  existing OpenAPI/OAuth + approval integration after defects and gates close;
  do not mistake remote-MCP hardening for Executor replacement.
  [Tools council R2](stellarc-tools-council-r2.md).

## Council and integration cadence
After each bounded batch, the supervisor reads the artifacts and reconciles
source/receipts. Dispatch fresh GLM and GPT council reviews over the integrated
contract/diff: security+durability and consumer/migration compatibility. Record
findings individually as fixed/open/rejected with evidence; no review-by-hash.
Implement the next independent slices while preserving file ownership. Run the
complete repository gates and real boundary tests on the frozen integration tree
before deployment. Do not treat a completed worker plan as the deliverable.

## Acceptance gates (not a completion percentage)
- Actual current client/provider/tool inventory and scoped parity matrix.
- Human Access → Zitadel → callback → local session; fail-closed denial.
- Existing client protocols, model catalogs/aliases and bounded streaming routes.
- Required provider credentials/refresh/routing/quota/usage semantics, no false
  provider-usage or billing claims; authorized runtime proof.
- Required real remote MCP/OpenAPI/GraphQL integrations with credential custody,
  discovery, current scopes, safe output and client compatibility.
- Durable human approval queue/UI and single-claim resume with current policy;
  unknown external effect never silently replayed.
- Stable authorized execution attribution, budgets and tenant isolation.
- Exact audit/trace/log persistence, privacy, outage and recovery evidence.
- Rehearsed client migration, rollback and user-visible usability acceptance.
- Only then recommend retiring the old products; no automatic deletion.

## Not yet specified
Exact active provider/auth/model combinations, active Executor integrations and
consumer-specific APIs must come from current source/runtime metadata. Full
catalog parity is not presumed necessary; every omission needs an explicit
inventory disposition. Native approval UI scope follows the actual workflows.
