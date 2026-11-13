# Isolated Stellarc gateway candidate

**v84 development candidate deployed; replacement cutover remains gated.**
Current source is newer than the deployed artifact and is not runtime-accepted.
This Effect/Bun process is Stellarc Gateway. The model gateway (`apps/llmgw`)
and the tool gateway (`apps/toolgw`) are its subsystems, and it consumes
`packages/core-auth`. It is not an addition to the running Kaneo API. No legacy auth/domain entrypoint is imported. Rust arclet is
unchanged.

## Client paths

| Path | Org comes from |
|---|---|
| `POST /orgs/<org>/v1/chat/completions` | the path, checked against the credential |
| `POST /v1/chat/completions` | the credential |
| `GET /v1/models` | the credential |

The two `/v1` paths are for clients that only accept a base URL
(`<origin>/v1`). Both need a credential granted `llm:stream`; a caller-supplied
org header is ignored. `GET /v1/models` lists only the models the chat path
accepts (one, today) and admits no run.

## Runnable checks

Use the repository-pinned Bun and dependencies. Run compilation and tests on
the build host, never on Terminus. The PG checks require a **fresh disposable
PostgreSQL cluster/role namespace per script** (they create a login role):
`SPIKE_OWNER_DSN` is its owner connection,
and `SPIKE_RUNTIME_DSN` connects as the `gateway_runtime` role that the script
creates. Never supply an existing application database. Do not print either
connection string.

From this package:

- `bun run test`: actual pinned Better Auth endpoints with signed local IdP.
- `bun run test:store`: restricted PG role, credentials/delegations, audit and
  deterministic concurrent revoke/admit lock barriers.
- `bun run test:http`: real sockets, fixture streaming and Effect MCP protocols,
  session binding, exact origin, unknown-tool denial and denial audit.
- `bun run test:audit`: local OTLP receiver, malformed/partial acknowledgements,
  uncertain replay, checkpoint failure and bounded capacity decisions.
- `bun run test:stream`: intercepted local upstream; revoke during a pending
  read must stop output. This does not call a real inference provider.

A named check is not a passing receipt. Consult the source-hashed receipts in
`../../docs/spikes/auth-llmgw-receipts/` and the active delivery ledger at
`../../docs/spikes/stellarc-gateway-delivery.md` for actual outcomes.

## Terminal outcome when a stream is cancelled

If recording the terminal outcome still fails after three attempts while a
stream is being cancelled, the request path does not report it. The run is not
lost: the 5-second recovery loop finishes it, with the outcome already chosen if
that much was stored, or as `interrupted` once the two-minute grace has passed.
It logs `terminal recovery pending` for as long as that keeps failing. A
terminal write still in flight at shutdown is awaited and, if it fails, logged
as `shutdown terminal audit unavailable`.

## Activation boundary

From this package, `bun ../../packages/core-auth/src/migrate.ts` is the
owner-only CLI; runtime never migrates or bootstraps. It requires
`GATEWAY_OWNER_DATABASE_URL`, `GATEWAY_BOOTSTRAP_SUBJECT`, exact
`GATEWAY_RUNTIME_ROLE=stellarc_gateway_runtime`, and the configured origin/OIDC/auth
variables read by the CLI. Do not rerun it against an existing deployment merely
because its source path moved. Prepare a separate candidate database and roles,
loopback listener, environment file and
service unit. Verify runtime cannot access the frozen application database,
change schema or mutate/delete audit evidence before activation. A migration
success message alone does not establish these privileges.

The provider defaults to **LOCAL FIXTURE ONLY**. No paid/subscription canary is
authorized. External MCP proxying, trusted run attribution, public human login,
Maple candidate persistence and full-repository release gates remain separate
acceptance requirements. Do not remove Cloudflare Access or replace routing
until the candidate's current-auth denial behavior and exact rollback are
verified. Never borrow another app's OIDC client or upstream credentials.
