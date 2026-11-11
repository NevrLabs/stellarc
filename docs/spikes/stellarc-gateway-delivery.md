# Stellarc gateway delivery — active owner, OPEN

## Destination (Raisal, 2026-11-08)
A running authenticated Stellarc at `https://stellarc.entelechia.cloud` with
human sign-in, scoped LLM gateway and MCP gateway. This supersedes the earlier
local-only deployment restriction for this workstream, not the Kaneo freeze,
paid-inference prohibition, Maple config restriction or alert-routing gate.
No production-completeness claim from a fixture or successful HTTP send.

## Current development activation (supersedes older inactive/pending notes)

Review delta deployed as `v84-88d1b0ac9d4b`: callback response `iss` is optional,
but foreign/duplicate values reject before exchange; signed ID-token issuer,
state, PKCE and nonce checks remain required. Auth responses now receive common
security headers without losing cookies or redirects. Regressions were observed
RED then GREEN; all individual v84 fixture/typecheck/lint/build phase receipts are
zero (109 lint warnings, 10 infos). Exact artifact/unit/version readback and live
auth-header checks passed; API1437/web5273 stayed200. Human callback/session and
the prior auth-audit persistence gap remain open. Receipt:
`auth-llmgw-receipts/oidc-boundary-v84.json`.

The dedicated confidential Zitadel client is created and management-readback
verified. Owner migration pinned the real issuer/client and selected human subject;
the restricted gateway is active and enabled on Talos loopback1438, separate PG18
55438. Only `stellarc.entelechia.cloud` tunnel ingress changed from local8801 to
local8802 transport; sibling ingress and existing Cloudflare Access are unchanged.
The edge still redirects to Google sign-in. Human callback/session is NOT verified.
Live login initiation reached actual Zitadel loginname with exact callback,
openid/code/S256 and Secure transaction cookies. Live anonymous and forged-identity
management/LLM/MCP requests were refused. Maple contains the exact MCP denial log
and correlated Server span. Existing API1437/web5273 remain200. Source v81 gates
passed; inference remains local fixture only and MCP remains metadata only.
See `auth-llmgw-receipts/talos-v81-activated.json` for receipts and open limits.
Additional live gap: PG delivery cursors acknowledged `auth.login.begin` and
`principal.bootstrap`, but exact Maple log queries did not find those two events;
other INFO `management.deny` and WARN `call.deny` events were found. Receiver
acknowledgment is not persistence proof. Investigate downstream filtering and
missing trace context without changing Maple configuration or claiming login
audit completeness. A later Talos SSH transport failure interrupted that read-only
investigation; the existing SSH forward had already been verified separately.

Rollback configuration is private at
`/home/rpw/.hermes/cache/scratch/stellarc-route-pre-v79.json`. Restore only this
hostname's prior origin (`http://127.0.0.1:8801`), preserving any newer sibling
configuration, and GET-readback the exact target before stopping the transport.
That prior route was observed unbound locally; rollback restores prior routing,
not a promise of a healthy old public origin. No Kaneo/shared service changes.

## Observed source and deployment
- Canonical NevrLabs/stellarc worktree, branch spike/auth-llmgw-maple, base
  2dce6d069db62ebf880ec0cb7c280f3a58a7034c; uncommitted spike files retained.
- Talos existing API/web in /mnt/deepvault/dev/deploy/stellarc-dev at
  fa3603102e55e42f0987904c83f17d4433985934, clean detached revision.
  API1437 health200; web5273 root200. Existing implementation includes the
  frozen Kaneo domain. Do not modify or restart it for gateway development.
- Public hostname currently redirects to Cloudflare Access. Preserve gate
  until independently authenticated machine routes are verified.

## Candidate boundary — design GO-WITH-CHANGES; cutover gated
The deployment design review permits implementation, not public activation.
The first independent implementation review completed HOLD; dispositions are
in `stellarc-candidate-security-r1.md`. A follow-up source review is active.
1. New `apps/stellarc-gateway` entrypoint in its own Effect/Bun process:
   auth, LLM and MCP gateway, no auth sidecar. Separate candidate loopback
   port/service and isolated database, then switch only this hostname after
   candidate checks. Preserve existing API/web and rollback route.
2. Reuse pinned Better Auth + genericOAuth upstream Zitadel, no new auth
   dependency. Dedicated confidential web client, exact HTTPS callback derived
   from installed plugin routes. Closed local user/membership bootstrap;
   verified issuer/sub not email or client headers grants authority.
   Native spike public client was cleaned up and is not reused.
3. PostgreSQL owner migration vs restricted runtime. Append-only event/outbox
   with stable installation/org/sequence event identity, state changes and audit
   atomic. Fail closed on privileged audit failure; bounded exporter/backlog,
   independent telemetry-gap state. Root-owned ordinary OTel plus durable
   cursor-driven OTLP audit delivery to existing Maple receiver only.
4. Human cookie session + CSRF/Origin controls for management. Agent-as-self
   uses its own hashed rotating credentials and grants, not creator rights.
   Delegation references authenticated actor + explicit current server grant:
   tenant/audience/actions/resources/time/budget intersection, subdelegation
   narrowing, bounded chain, ancestor revocation, audited actor/subject/run.
   Do not accept OBO/tenant identity headers. Sensitive checks query current DB.
5. LLM route: server-configured allowlisted provider and model; credentials
   stay server-side. Bounded body/admission/backpressure/deadline; streaming
   cancellation aborts upstream. No retry after response bytes; conservative
   no automatic POST inference retry until provider idempotency is established.
   Automated proof uses local fixture; real paid route disabled until approved.
   Raw provider usage vs estimates labelled separately; no fabricated usage.
6. MCP: reuse the installed Effect MCP transport, never handwritten JSON-RPC
   or the Kaneo registry. Support explicit protocol revisions with one bounded
   metadata tool initially. Authenticate every request and authorize every tool
   invocation against current DB state. Bind sessions to principal/org/subject/
   delegation; session IDs are not authority. Require exact configured Origin.
   External upstream proxying remains disabled until server/tool allowlists and
   server-owned credential injection are proven. Never forward gateway bearers
   upstream or infer permission from upstream tool annotations.
7. Minimal gateway console: authentication and mode/status, credential issue/
   revoke controls with explicit bounds, fixture route and MCP status. Clearly
   distinguish configured/disabled/fixture/live verification. Preserve existing
   Stellarc app as separate origin, not a Kaneo rewrite.

## Admission and revocation contract
- The candidate serializes authority changes, delegation issuance, admission,
  call-budget reservation and durable admission audit under one short PG
  transaction lock. Its commit is the admission linearization point; no
  transaction remains open over provider I/O or streaming.
- A later revocation cannot undo an admitted external effect. Recheck current
  credential, principal rights and delegation ancestors before every future
  stream pull and immediately before MCP tool invocation. A pending upstream
  read must also be rechecked before releasing its result. Already released
  chunks cannot be recalled. A cancellation/deadline aborts upstream work.
- No inference POST retries are enabled. Deterministic concurrent admission/
  revoke and pending-read tests remain cutover requirements, not claims proven
  by sequential revocation checks.
- Per-invocation runs now persist server-derived principal/org/subject/delegation
  and terminal audit with usage unavailable. These are not reusable cross-request
  harness execution bindings. Cancellation/finalization and restart recovery
  remain acceptance gates; caller-supplied run identity has no authority.

## Execution gates
- Review first, then implementation/test on fxbuilder, candidate on Talos.
- Verify real network socket stream/cancel, isolation/revoke/expiry/audit outages,
  malformed OTel context/privacy, MCP protocol+tool deny and source accounting.
- Full repo lint/typecheck/build; attribute pre-existing failures honestly.
  First frozen install rejected the missing candidate workspace lock entry.
  The candidate now pins the repository's existing jose 6.2.12 and adds only
  its workspace registration to the local lockfile (no unrelated package
  upgrades). The subsequent remote install timed out at 600 seconds while
  installer threads waited on NFS I/O; full gates did not run. Preserve the
  setup failure separately from application results. Docker's missing default
  bridge also blocked test setup; the next candidate PG runner uses host
  networking with an explicit loopback-only listener, without daemon changes.
  A fresh local-ext4 gate snapshot subsequently installed successfully and full
  repository typecheck passed. Full build failed in apps/web prerender with
  `_getRenderedMatches` missing from router-core resolved outside the gate tree;
  the generated server bare imports climbed to a home-directory dependency
  symlink. Bundling SSR dependencies fixes that boundary without shared-host
  edits: v28 full build exits 0, six of six tasks including web prerender.
  Candidate build copies and byte-verifies its three console assets. v26 full
  typecheck and lint exit 0; lint retains 68 warnings and 10 infos. Latest auth
  cleanup changes were checked in v31. v37 now passes all fixture phases,
  candidate build, full typecheck/lint/build on read-back matching source.
  Full lint retains 73 warnings and 10 infos; full build reports six successful
  tasks, five cached. v37 stream checks include abort during terminal persistence
  and shutdown draining a held terminal audit. See `auth-llmgw-receipts/v37-completed.json`.
  v47 subsequently passes full fixture/typecheck/lint/build gates, including
  provider EOF/error rejection, fixed-lifetime sessions and MCP post-admission
  cancellation with a first-write fault. Lint retains 81 warnings and 10 infos;
  all six build tasks pass. v48 verifies real audit-permission rollback plus
  explicit fresh-store retry. v49 verifies real PG write-failure recovery in
  the stream. v50 verifies sustained audit denial exhausts three attempts,
  withholds success and leaves a running row: automatic recovery is still OPEN.
  See `auth-llmgw-receipts/v47-completed.json`, `v48-completed.json`,
  `v49-real-pg-terminal-retry.json` and `v50-sustained-audit-outage.json`.
- Browser real Zitadel sign-in can require user passkey/MFA; do not substitute
  management PAT or synthetic identity. Keep building other slices meanwhile.
- Read back actual Maple records; delivery != full SIEM. Email/Discord alert
  routing requires separate approval; do not change it automatically.
- No auth bypass, shared-client edits, 9router replacement, Kaneo writes or
  inference subscription canary. Dedicated app/route/service writes limited to
  this explicitly requested deployment. Back up and verify exact rollback.

## Verified candidate evidence (not deployment)
- Pinned Better Auth endpoint fixtures exercise signed identity validation,
  browser binding, replay denial, closed routes and no upstream-token storage.
- Disposable PG store receipt covers stable independent principals, rotation,
  narrowing/ancestor revocation, budgets, runtime audit immutability and atomic
  rollback. Both concurrent revoke/admit orders now pass using observed PG
  lock barriers, not sleeps; ten store groups pass. Receipt:
  `auth-llmgw-receipts/candidate-store-concurrent-green.json`.
- Initial real-socket checks passed fixture streaming, correlated headers,
  tenant denial, Effect MCP initialize/list/tool/unknown-tool denial and current
  credential revocation. Expanded session binding, exact-origin and modern
  stateless wire checks passed before a new durable-denial regression failed.
  Invalid MCP bearers bypassed audit in the preliminary identity lookup. The
  candidate now resolves identity through the shared audited authorization
  transaction; RED receipt: `auth-llmgw-receipts/mcp-denial-red.log`. The updated
  socket run now passes all nine named groups, including durable anonymous
  denial and credential revocation. Source-hashed GREEN receipt:
  `auth-llmgw-receipts/candidate-http-expanded-green.json`. Concurrent store
  checks passed independently. A deterministic pending-upstream-read test
  then failed: a chunk arriving after revocation was still released. RED:
  `auth-llmgw-receipts/pending-read-revocation-red.json`. The candidate now
  rechecks current authorization after each upstream read and before releasing
  bytes. The deterministic local-upstream regression now passes: no output
  after the committed revoke, upstream cancelled, one attempt and no retry.
  GREEN: `auth-llmgw-receipts/pending-read-revocation-green.json`. v47 repeats
  the socket and stream regressions with all full gates passing. Subsequent
  v48-v50 extend failure-path tests; they do not establish automatic recovery.
- Candidate audit exporter passed five check groups: invalid acknowledgements,
  timeout-after-acceptance replay, acceptance-before-checkpoint-failure replay,
  normal capacity/gap/revoke reserve, and emergency exhaustion rollback.
  Targeted candidate TypeScript exited zero. Source-hashed receipts:
  `auth-llmgw-receipts/candidate-audit.json` and adjacent logs. Capacity checks
  use artificial counter positioning, not a full backlog/load exercise.

## Candidate artifact staging
The v37 gateway artifact is staged, byte-verified, but not started at
`talos:/mnt/deepvault/dev/deploy/stellarc-gateway/releases/v37-47212b913a2d`.
No candidate database, OIDC application, unit, listener or route was created.
Talos Bun is 1.4.4; build-host checks used 1.4.0, so deployed runtime checks
remain necessary. Receipt: `auth-llmgw-receipts/talos-v37-staged.json`.
This staged v37 artifact predates the follow-up security fixes and MUST NOT be
activated. A v47 artifact is now staged separately and byte-verified at
`talos:/mnt/deepvault/dev/deploy/stellarc-gateway/releases/v47-822a9675c1f8`.
Its source hashes matched the v47 archive at staging; unconfigured startup
failed at missing GATEWAY_ORIGIN without dependency-resolution errors. Both
staged versions predate current auth-drain/durable-recovery/DB validation fixes
and MUST NOT be activated. Current v66 passes all local fixture, full repository
typecheck/lint/build gates (100 warnings, 10 infos), with source hashes verified
against its archive and remote gate tree. Receipts:
`auth-llmgw-receipts/talos-v47-staged.json` and
`auth-llmgw-receipts/v66-completed.json`. Neither is live cutover evidence.

## Current candidate staging — v79

The current source-verified artifact is staged inactive at
`talos:/mnt/deepvault/dev/deploy/stellarc-gateway/releases/v79-d88ca67d6f84`.
All four deployable files were hashed on the build host and read back byte-for-byte
on Talos. Talos Bun 1.4.4 loads the bundle and fails closed at missing
`GATEWAY_ORIGIN`; no dependency-resolution error. No candidate DB, OIDC client,
unit, listener or route was created. Existing API :1437 and web :5273 remain
healthy; candidate :1438 is unused. Receipt:
`auth-llmgw-receipts/talos-v79-staged.json`.

The replacement semantic source review found no blockers within shutdown and
immutable-database validation scope. Recovery review's export-coupling blocker
has actual-loop RED/GREEN evidence, including saved-choice and expired-orphan
recovery during local OTLP rejection without provider replay. Full v79 fixture,
typecheck, lint and build gates pass (109 warnings, 10 infos); this is not live
Zitadel, deployed-role or Maple evidence. Public cutover remains HOLD.

## Isolated candidate database preparation

After inactive staging, a separate PostgreSQL 18 cluster was initialized on
Talos at `/home/rpw/.local/share/stellarc-gateway/postgres`, loopback :55438,
private socket `/home/rpw/.local/share/stellarc-gateway/socket`. It does not use
the shared :5432 cluster containing Kaneo databases. Its user unit is
`stellarc-gateway-postgres.service` (active, not enabled at boot); measured
MemoryCurrent was 33808384 bytes. No gateway application service is running.

The new `stellarc_gateway_candidate` database has a separate owner login and
`stellarc_gateway_runtime` login. Owner-applied gateway schema is present;
the runtime connection passed the actual source's effective-privilege query,
including immutable tables and search-path checks. Independent readback confirms
zero identity/principal/run rows and no effective prohibited audit/table/column
mutation rights. No OIDC client pin, human bootstrap or Better Auth tables were
initialized. This is deployed database-role preparation, not authenticated
application acceptance. Credential handles (values never printed):
`/home/rpw/.config/stellarc-gateway/owner.env` and `runtime.env` (0600 in 0700
directory). Receipt: `auth-llmgw-receipts/talos-v79-database-prepared.json`.

Continue by registering/verifying the dedicated confidential web client and
actual issuer/subject, then apply owner auth migration/pin/bootstrap and start
only the candidate gateway. Do not initialize a placeholder issuer/client or
synthetic human. Keep :1438 and public routing unchanged until these prerequisites
are real. For an operational pause, stop only the new PostgreSQL unit with
`systemctl --user stop stellarc-gateway-postgres`; preserve its data and private
configuration. Do not remove the database or touch the shared PostgreSQL unit.
Existing API :1437 and web :5273 health remain 200; shared database names are
unchanged and :1438 remains unused. Read-only Zitadel management discovery found
no Stellarc-named project among 11 listed projects. The earlier temporary native
client approval/cleanup does not authorize reusing another app or fabricating
client/subject bindings. Dedicated public-web registration remains a separately
scoped IdP action. Source-only provisioning review `deleg_9ad6c38b` completed:
no blockers identified within its stated boundary, not deployed acceptance.
Exact proposed registration is in `stellarc-web-oidc-registration.md`.
Native decision creation is not callable in this session; attempting to relay
that exact decision to chief-of-staff failed with `parent_not_active` (calling
provider no longer owns an active T3 thread run). No approval is inferred from
this interface failure, and no new OIDC resources were created. On the user's
next continuation, retry succeeded: exact decision was delivered to chief-of-staff
and read back at position1093, message
`stellarc-web-oidc-scope-decision-v79-retry`. Decision remains pending; successful
message delivery is not approval.
This is database/process separation under the existing host user, not OS-user
isolation from other code running as that same user.

Actual-runtime negative checks now pass on Talos: identity UPDATE, installation
DELETE, audit UPDATE/DELETE/TRUNCATE, SET ROLE owner and CREATE SCHEMA are denied.
Each mutation probe runs inside a rolled-back transaction. The candidate runtime
credential is rejected by the shared :5432 cluster. Identity/principal/run/audit
row counts remain zero afterward. Nine unique checks are recorded in
`auth-llmgw-receipts/talos-v79-database-negative.json`; runnable check:
`tools/spikes/auth-llmgw/check-candidate-postgres.py`. This adds deployed database
boundary evidence only; it does not prove app login, session cleanup or Maple.

## Telemetry receiver preflight

Read-only empty-envelope probes distinguish Talos Tempo :4318 (traces 200,
logs/metrics 404) from the existing loopback :14318 receiver (all three 200).
Do not configure the candidate against Tempo as if it were the full OTLP path.
Setup Health executed successfully: 37 pass, 7 existing recommendations; no
clear-baseline claim. No candidate event was emitted and no Maple config was
changed. Forwarding destination and actual candidate Maple persistence remain
OPEN. Receipt: `auth-llmgw-receipts/talos-telemetry-preflight.json`.

The forwarding path was subsequently verified privately: existing
`otelcol-maple-agent` application pipelines on :14318 forward all three signals
to the existing Maple ingest endpoint. No collector configuration changed.
A labelled metadata-only preflight used the actual candidate restricted PG
connection, store.securityEvent and auditExporter, plus the shared telemetry
root. Maple exact-ID readback confirms one `deployment.preflight` event and
its correlated trace/log; PG cursor advanced to sequence1. Identity/principal/run
counts remain zero. This is neither human login nor a full gateway request.
Receipt: `auth-llmgw-receipts/talos-candidate-metadata-maple.json`.
Setup Health remains 37 pass/7 fail; STAT-04 affected-service count increased
from 2 to 3 for this Internal-only preflight. No false Server span was added.

v80 full runtime/types/build passed but lint failed two receipt-format errors;
scoped formatting fixed them. v81 all fixture/full typecheck/lint/build exits
are zero, 109 warnings/10 infos; source hashes and disposable cleanup verified.
Receipt: `auth-llmgw-receipts/v81-completed.json`.

## Pending
Whole-daemon/pre-choice process-kill recovery proof, isolated candidate
deployment, real human login, cross-request execution
binding, visible UI acceptance, candidate Maple
readback, public route/rollback and persistence readback. Existing Talos app,
Kaneo and public routing remain unchanged.
