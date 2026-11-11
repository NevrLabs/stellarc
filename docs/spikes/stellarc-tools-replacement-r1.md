# Stellarc tools replacement — round 1 (tool-gateway lane, GLM)

Bounded slice executed 2026-11-08 on worktree `spike/auth-llmgw-maple` (HEAD
`2dce6d069db62ebf880ec0cb7c280f3a58a7034c`). Owned files (new, nothing else
edited): `apps/stellarc-gateway/src/remote-mcp.ts`,
`apps/stellarc-gateway/src/remote-mcp-check.ts`. No dependency, manifest or
lock changes; no deploys; no live tool calls; no secrets printed.

## 1. Actual Executor inventory (read-only metadata + deployed source)

**Running instance**: docker `executor-selfhost` (ghcr.io/rhyssullivan/executor-selfhost),
healthy 12 days, image revision label `2dc399e51094fccd2a45103a38d77179c6d648ff`
(built 2026-09-10, source github.com/UsefulSoftwareCo/executor).

**Source of record**: historical scratch checkout was pruned; re-cloned and
fetched the DEPLOYED revision for reading (clone HEAD `2f4c398f` is newer;
`2dc399e5` fetched explicitly so every citation below is the deployed code).

**Live metadata API** (loopback `127.0.0.1:4788`, org API key from
`~/.config/noov/executor-gmail-api-key` passed in-header only, never printed):

- `GET /api/connections` → 10 connections, 1 owner:
  google_calendar×2, google_drive×3, google_gmail×3 (OAuth, provider
  `encrypted`), resend_com_openapi×1 (apikey, healthy), vantage×1 (MCP
  header-auth, `lastHealth.status="expired"`, HTTP 401 "Failed connecting via
  streamable-http" — the only remote-MCP integration is currently failing
  upstream auth).
- `GET /api/integrations` → 9 catalog entries: built-in×1 (executor),
  mcp×2 (onshape_mcp oauth, vantage apikey), openapi×6 (google_calendar,
  google_drive, google_gmail, resend, teams_channels, amazonaws migrationhub).
  GraphQL plugin exists in source (`packages/plugins/graphql`) but **zero
  graphql integrations are configured** — no GraphQL parity work is required
  for current use.
- `GET /api/policies` → **0 tool_policy rows**. Current authorization is
  entirely plugin defaults (side-effecting tools pause for approval).

**Not done (recorded gap, not inferred)**: no live MCP handshake or
`tools/call` against `/mcp` (prohibited as live tool call). The meta-tool
surface (`execute`, `artifacts`, `skills`, `resume`) is taken from deployed
source `packages/hosts/mcp/src/tool-server.ts` + operating skill, previously
E2E-verified.

### Behavior read from deployed source (2dc399e5)

| Concern | Evidence (deployed rev) |
|---|---|
| Policy resolution | `packages/core/sdk/src/policies.ts:201` `resolveToolPolicy` = most-restrictive first match per owner; `:247` `resolveEffectivePolicy` — a user match **replaces** the plugin default entirely, so approval floors must be enforced outside the resolver. |
| Durable approval | `packages/core/sdk/src/pending-approval.ts:34` `PENDING_APPROVAL_TTL_MS = 15 min`; single-use; `:94-108` consume = separate `blobs.get` then `blobs.delete` (not atomic). Applies to artifact single-tool pauses only. |
| General pause | `packages/core/execution/src/engine.ts:54` suspended in-memory fiber map; `:552-559` daemon fibers so a pause can outlive the request — still process-local, lost on restart. |
| Elicitation default | `packages/hosts/mcp/src/tool-server.ts:1145-1148` `elicitationMode ?? {mode:"model"}` — model-managed resume is the upstream default; a human-only approval design must reject it explicitly. |
| Credential custody | `packages/plugins/encrypted-secrets/src/index.ts:19-21` AES-256-GCM at rest, master key from `EXECUTOR_SECRET_KEY` or persisted `/data` key; MCP remote headers injected from server-held connection config (`packages/plugins/mcp/src/sdk/connection.ts` — `headers`/`authenticationTemplate`/`remoteTransport`), callers never see credentials. |
| MCP transport | `packages/plugins/mcp/src/sdk/invoke.ts:6-10` streamable-http keyed by `Mcp-Session-Id`, per-identity connection pool leased exclusively per invoke; official `@modelcontextprotocol/client`. |

### Parity requirements this establishes (code-grounded)

1. Client compatibility: current consumer is Hermes as MCP client (API key
   auth on `/mcp`). Replacement must keep an MCP streamable-http server
   surface with equivalent meta-tool shape, or migrate the client — that is a
   consumer decision, flagged not assumed.
2. Active integration surface today = OpenAPI-with-server-side-credentials
   (Google OAuth×8, Resend apikey×1) plus one header-auth remote MCP server
   (vantage, currently 401). GraphQL: none.
3. Credential custody must stay server-side (encrypted at rest, injected at
   call time, one connection per (integration, identity), OAuth
   auto-refresh).
4. Policy: pattern/action rows resolved most-restrictive-first per owner,
   with an enforced approval floor independent of resolver defaults.
5. Durable approval: paused-result + executionId + accept|decline|cancel
   resume, single-claim, TTL, frozen server-built arguments (resume cannot
   widen the grant). Executor's 15-min TTL and non-atomic consume are known
   ceilings to improve on, per the stellarc-architecture decision (PG-backed
   rows, lease-length TTL).

## 2. Implemented bounded slice — `remote-mcp.ts`

Decision: the installed `effect@4.1.2` already ships
`McpClient.layerHttp` (streamable HTTP client with `maxMessageBytes`,
per-op `timeout`, session handling, SSE+JSON responses — read from
`node_modules/effect/dist/ai/McpClient.{d.ts,js}` in the isolated snapshot).
Per instruction, the module **wraps the library with guards** instead of
hand-writing protocol:

```ts
connectRemoteMcp(options: RemoteMcpOptions, bounds: RemoteMcpBounds)
  → { listTools(signal?), callTool(tool, args, signal?),
      describe(), dispose() }
```

Guards (all exercised by the check):
- **Endpoint custody**: url+headers come only from server-owned config;
  https required (loopback http allowed for local fixtures); caller URL is
  structurally impossible — no parameter exists. Gateway request headers
  never enter the module, so the gateway bearer cannot be forwarded.
- **Header custody**: reserved transport headers (mcp-*, host, cookie,
  content-length, transfer-encoding) rejected in config.
- **No redirects**: `FetchHttpClient.RequestInit` provided with
  `redirect: "error"` (fetch otherwise follows silently).
- **Response bound**: `maxMessageBytes` caps JSON-RPC messages both ways.
- **Content bound**: post-call caps on content items and total text chars.
- **Time bound**: layer `timeout` bounds initialize+discovery; per-call
  `timeout` bounds every `callTool`.
- **Cancellation**: caller `AbortSignal` interrupts the Effect fiber, which
  aborts the in-flight request (verified < 1 s against a hanging server).

## 3. Regression — RED then GREEN, executed on fxbuilder only

Isolated snapshot: `fxbuilder:~/.cache/fxrun/workspaces/spike-auth-llmgw-maple-8365eef0cb0a8f89`
(rsync of the shared worktree; supervisor full-v9 tree untouched), serialized
under `~/.cache/stellarc-authgw-gate.lock` (flock, receipt `GATE_ACQUIRED`).
Fixture is a metadata-only local fake MCP server (`127.0.0.1`, v2025-11-25
handshake, no external endpoints, fixture credentials only).

- RED (check written first, implementation absent):
  `bun src/remote-mcp-check.ts` →
  `error: Cannot find module './remote-mcp' ... exit=1`
- GREEN (same command after implementation): all stages pass —
  connect / custody / call / describe / content bound / response bound /
  deadline / cancellation / url custody / redirect refusal —
  `REMOTE-MCP CHECK PASSED`, `exit=0`.

Stages assert in particular: only the server-configured
`authorization` header reaches the remote server; no
`x-stellarc-delegation` (gateway caller header) is ever forwarded; 302 on
initialize is refused; oversize `tools/list` rejected; per-call deadline
fires on a hanging endpoint; abort interrupts an in-flight call < 1 s;
non-loopback plain-http URL denied at connect.

Hashes (sha256, worktree copies, final):
- `apps/stellarc-gateway/src/remote-mcp.ts`
  `95f2ce04e6e48616cb54cc30569964af9bafadfcf42e3c54077279359ddce8ab` (162 lines)
- `apps/stellarc-gateway/src/remote-mcp-check.ts`
  `abd95c2e43a8914a4665aa783497c747b6674d1738e0f5c72de4d91f7a41f88c` (197 lines)

Typecheck: `bun x tsc --noEmit` on the same snapshot (repo root config) →
**0 errors in the owned files** (initial 5 errors — `McpClientError`
namespace import and the runtime's `R`/`ER` channels — fixed; GREEN re-run
after the fix). 3 pre-existing errors remain in `src/auth.ts` (not owned):
`Cannot find module 'jose'` from the repo root — `jose@6.2.12` installs only
under `apps/stellarc-gateway/node_modules`, so the root-config tsc run does
not resolve it; the app-local tsconfig should. Flagged for the supervisor,
untouched by this lane.

Worktree hygiene: this lane added only the two owned files plus this doc.
Note for supervisor: shared worktree also shows `M apps/web/vite.config.ts`
and `M bun.lock` from other lanes (not touched by this lane).

## 4. Next smallest integration (supervisor-owned)

1. Compose `connectRemoteMcp` into `mcp.ts` registrations behind a new
   authorize action (e.g. `mcp:remote`): `listTools`/`callTool` passthrough
   with the existing run/admission/terminal machinery (store.authorize →
   run → finish), config from server-owned env (URL + header handle), never
   request-derived.
2. Add the effect-class gate before `callTool` (Executor floor lesson:
   enforce outside any most-restrictive resolver) and the paused-result +
   executionId + single-claim resume contract (PG-backed, lease-length TTL —
   improving on Executor's 15-min non-atomic consume).
3. Re-run this check plus the supervisor's full gates on the frozen
   integration tree; only then point it at a real remote MCP endpoint
   (vantage needs its upstream credential fixed first — it is 401 today).
