# Bounded OpenAPI operation executor — R1

## Delivered scope

Working standalone executor + executable real-socket checks. Only owned repository
files were created/changed:

- `apps/stellarc-gateway/src/openapi-operation.ts`
- `apps/stellarc-gateway/src/openapi-operation-check.ts`
- this report

No changes to main/store/MCP/remote-MCP/provider-routing/audit/manifests/lock;
no live tool/provider/IdP/Cloudflare/Maple calls or writes, migrations,
deploy/restart/commit/push/subagents. Central audit fixtures were NOT rerun.
Existing shared dirty files were preserved. No Executor runtime dependency.

## Source evidence

Read `stellarc-replacement-map.md` and `stellarc-tools-replacement-r1.md` fully;
read existing MCP/store authorization + run/finish paths, audit export and remote
MCP custody seam, root/app manifests, TypeScript/Biome configuration.

Read deployed Executor source from
`~/.hermes/cache/scratch/executor-src/executor`, HEAD
`2dc399e51094fccd2a45103a38d77179c6d648ff`; read-only Docker revision-label inspection
matched that exact SHA. No authenticated Executor API/tool call was needed.

| Deployed source | Relevant behavior |
|---|---|
| `packages/plugins/openapi/src/sdk/invoke.ts:21-41` | Direct parameter names take precedence; aliases path/pathParams/params and query/queryParams/params; separate header/cookie containers. |
| same `:111-161`, `:924-1009`, `:1055` | Percent encoding, accepted-argument construction, unknown-key rejection, query serialization, `body ?? input`. |
| same `:1141`, `backing.ts:672-707` | Resolved server auth headers applied after operation parameters; server connection template renders private credentials. |
| `backing.ts:799-817` | Pre-approval validation reuses request construction without invoking network. |
| `invoke.ts:1425-1436` | POST/PUT/PATCH/DELETE require approval by plugin default. |
| `packages/core/sdk/src/policies.ts:201-254` | Most restrictive first match per owner; matching policy replaces plugin default. Thus mutation floor belongs outside that resolver. |

Actual inventory supplied by supervisor / established R1: Gmail3/Drive3/Calendar2
OAuth connections, Resend API-key1, expired Vantage remote MCP; zero configured
GraphQL. OpenAPI is prioritized. GraphQL and arbitrary-code sandbox omitted.
This is NOT the complete Executor argument dialect: callers currently supply
ONLY `{path, query, body}`. Flat names and aliases are deliberately rejected,
not silently reconciled. Compatibility adapter is a later explicit integration.

## Trust contract and execution

`createOperationExecutor(registry, bounds, hooks).execute(operationId, args, signal?)`
uses only server registry endpoint/method/template/credential handle/effect class.
No caller URL, header, credential handle, approval boolean or server selection.
Registry primitives/maps/bounds and callbacks are captured at construction;
validated request bytes are frozen before the first await. Installed Zod validates
an explicitly supplied JSON body schema; no new dependencies or OpenAPI parser.
Schema objects are trusted server code and must not be mutated after registration;
validators are synchronous and must remain bounded (no arbitrary caller code).

- Path/query allowlists and scalar length limits; unknown/missing values rejected.
  One decoded path segment per placeholder; reject dot/dotdot, percent input,
  slash/backslash, colon, query/fragment delimiters and control bytes. Encode once
  using RFC3986 escaping; assert URL origin and path did not normalize/change.
- No fixed endpoint query/path/userinfo/fragment. No arrays/object explode or
  duplicate query keys: scalar map only, URLSearchParams owns encoding.
- Production endpoints must be canonical HTTPS origins with public-shaped DNS
  names, not IP literals/local/internal names. HTTP is possible ONLY with explicit
  server `fixtureLoopback:true` AND literal 127.0.0.1/[::1]. No localhost lookup.
  **DNS is not pinned/resolved here:** deployment must enforce public-only egress
  and reviewed origin registry; HTTPS/name checks are not a DNS-rebinding defense.
- Bounded plain JSON traversal (depth16/nodes4096), UTF-8 argument/request bytes,
  URL+body+explicit-header total, response Content-Length and actual streamed
  bytes. Request cap covers application-owned URL/body/header bytes, NOT runtime
  HTTP framing/default headers. Network ingress still requires its own cap before
  parsing. Finite configurable ceilings: request<=1MiB, response<=4MiB,
  deadline<=60s. Fixture uses 1024B/1024B/500ms.
- Redirect `error`, credentials `omit`, no referrer, AbortController deadline
  shared across callbacks/fetch/body read. Callback race stops late resolution
  from dispatching; callbacks must honor signal for their own resource cleanup.
  Timers cannot preempt blocking synchronous server validators.
- Credential lookup yields a private printable bounded authorization/x-api-key
  value; nothing logs it. No request data or response headers returned. All
  thrown errors become fixed codes, with no upstream body/cause/schema detail.
  Successful JSON reflecting credential/token bytes (including JSON escapes) is
  refused. This is not a general data-loss-prevention filter for arbitrary
  transformed/exfiltrated secrets or upstream-sensitive business payloads.
- JSON responses only (empty success => null). No streaming/binary/multipart,
  generic spec loading, retries or provider-specific error parsing.

### Authority and approval

Every operation calls the server-owned `authorize(identity, "gate", signal)`
BEFORE credential resolution/network. `none` GET may use `allow`; every mutating
method, non-none effect, undeclared/unrecognized effect needs `approved`.
Unknown class normalizes to irreversible. POST mislabelled none still cannot use
`allow`. Explicit deny or mismatched binding fails closed. Defer returns typed
`requiresApproval {identity}` with NO dispatch and no invented execution ID,
queue record, in-memory suspended fiber or durable-approval claim.

Identity is frozen and includes operation/revision/method/effect class,
requestDigest and binding. Binding hashes captured configuration (including
credential handle and limits) plus exact URL/body digest, not a redacted argument
projection. Treat digests as potentially sensitive correlation values; do not log
request/response contents. Binding is not an authorization token or tenant key.

After private credential lookup a SECOND `authorize(..., "dispatch", ...)` checks
current rights immediately before fetch with no subsequent await. The callback
must bind verified actor/org/subject/delegation/run externally, re-evaluate grants,
connection ownership/scopes and current policy, validate the frozen binding, and
supply `approved` only from server-controlled authority/approval state. Never
implement it by echoing an agent boolean. Revocation after that decision remains
a defined dispatch linearization boundary, not atomicity with the remote service.

No claim/consume queue is implemented here. A failed/aborted mutating dispatch
returns `outcomeUnknown:true` conservatively once fetch is attempted; no automatic
retry even if redirect/HTTP failure suggests the effect did not occur. Successful
HTTP JSON completion is not read-after-write verification of a real side effect.

## RED → GREEN evidence

All heavy commands executed on fxbuilder only, serialized with
`flock -w 600 ~/.cache/stellarc-authgw-gate.lock` and `GATE_ACQUIRED` receipt.
Lane-private snapshots; donor
`/home/rpw/.local/share/stellarc-gates/full-v9/node_modules` read-only via symlink,
no installs or donor-source edits. Bun 1.4.0. Every final child command has a 30s
outer timeout and its exact `.exit` file; empty strict log is verified.

RED snapshot `fxbuilder:~/.cache/stellarc-openapi-r1-red-2dce6d0`:
check written before implementation, `red.exit=1`, error points at missing
`./openapi-operation` production module. Check SHA
`e733afee4b59b20e4f870ed8186d2f7a2f7fed16080010609fa6d61dce1d623b`.
Additional edge assertions were added during hardening; no claim of individual
RED execution for every final assertion or of mutation-testing every guard.

Intermediate green attempt had fixture handlers that never settled; bundled check
printed all assertions but did not exit, so that artifact run was killed and NOT
accepted. Fixture delayed handlers now settle after 1s (longer than 500ms deadline)
and the slow-body fixture closes. No forced process.exit masks cleanup. Initial
compile narrowing and Biome findings fixed. All final checks exit naturally.

Final frozen snapshot `fxbuilder:~/.cache/stellarc-openapi-r1-final-2dce6d0`:

| Receipt | Command / result |
|---|---|
| `format.exit=0` | `biome check --write src/openapi-operation{,-check}.ts` |
| `check.exit=0` | `bun src/openapi-operation-check.ts` — **18 groups pass** |
| `strict.exit=0` | `tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types bun src/openapi-operation.ts src/openapi-operation-check.ts` |
| `biome.exit=0` | `biome check` both source files, no findings |
| `build.exit=0` | `bun build src/openapi-operation.ts --target bun --outdir dist` |
| `bundle.exit=0` | `bun build src/openapi-operation-check.ts --target bun --outdir check-dist` |
| `artifact.exit=0` | `bun check-dist/openapi-operation-check.js` — same **18 groups pass** |

18 groups exercise Google-shaped read/encoding/header custody, mutation blocked
before credential/network, approved Resend-shaped POST, all effect classes +
unknown + POST-none, deny and binding/current-rights checks, registry/args await
mutation, identity binding changes, forbidden caller fields/duplicate query,
traversal/host/control input, schema/UTF8 request bounds, origin/fixture config
validation, redirect refusal (one request only), declared + chunked response caps,
raw/JSON-escaped secret echoes/upstream errors/invalid JSON, header/body deadlines,
barrier-driven in-flight cancellation/pre-abort, authorization errors/deadline,
credential failure/deadline/cancellation with no late dispatch, and uncertain
mutation timeout with exactly one socket request. No real email sent.

### Exact SHA-256

Final worktree source hashes match final snapshot (verified after formatter
readback; structured tool output had redacted a source fragment, corrected before
hash comparison):

| File | SHA-256 |
|---|---|
| `src/openapi-operation.ts` | `a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1` |
| `src/openapi-operation-check.ts` | `cf707a22e1660c8eaf33b660c76006998c021c4acbed991c022f04e3e861b573` |
| `dist/openapi-operation.js` | `e57e00b208f96aea13dbaa950b62bdcf358a9805c0763ce30a47895f77ef2ff2` |
| `check-dist/openapi-operation-check.js` | `6dc195ef0ba034fc3322df5405e359e67a7d47b8b806d10721410da1d045dd9b` |
| `gate.sh` | `b5d80fb518e18da7fd83ed41c4381dc45d9bc0e39b08c50901d493bba536612f` |
| `gate.log` | `40559b4d68f42956fe7f0abf6f9d9459950b6970f4b0782cc8fb9fb87af22e17` |
| `check.log` and `artifact.log` | `bbf00150f56002bbd0e78c621ab7a1c772c8eb968b070f0d4a514c0f6cc22b03` |
| `artifacts.sha256` | `885348ebe500ee249d671b1696f3e5ba12b70308eeaa5729f736212afd919e8f` |

These are standalone lane gates, not full-repository typecheck/build or integrated
MCP acceptance. Supervisor's frozen integration tree needs those complete gates.

## Next requirements, not implemented authentication/approval proof

1. Wire server registry through MCP tool discovery/call and existing admitted
   run/terminal/audit flow. No tools registered in this slice. Define consumer
   alias/flat-argument compatibility deliberately; never expose caller headers.
2. PostgreSQL queue: persist encrypted full frozen execution bytes separately
   from human/audit projections; bind identity AND verified context, TTL,
   human-only approval, transactional single-claim, current-rights recheck,
   durable dispatch/terminal/unknown states and reconciliation. No auto-replay of
   uncertain email effects. No queue atomicity is inferred from two callbacks.
3. Encrypted credential storage, tenant/connection ownership and scopes; Google
   OAuth refresh/revocation/concurrent refresh custody; Resend secret storage.
   Current callback is only a seam exercised with fixture markers, not auth proof.
4. Reviewed destination registry plus deployment egress controls for DNS/private
   networks; admission/concurrency limits; exact-byte response/audit privacy and
   real provider read/approved-effect verification only under explicit authority.
5. Independent council follows. No deployment or replacement completion claim.
