# ADR 0011: Bring-your-own-agent runtime (agents plugin + stellarc-node)

Status: **accepted** (2026-10-06, operator-directed: "agent-native Stellarc,
Multica as the reference, people bring their own agents").
Re-sequences the `dev` rewrite: the Kaneo-parity slices (STL-15…27) are parked
behind this milestone.

## Decision

The first product slice of v2 is **agents doing work**, not Kaneo parity.
It ships as two pieces:

| Piece | Where | Role |
|---|---|---|
| **agents plugin** | `packages/agents`, migration `0003_agents` | Plane side. Nodes, agents, task queue, transcript items. Events namespaced `agents:*` on the org log (D10). |
| **stellarc-node** | `apps/stellarc-node` | Runs on the agent owner's machine. Holds harness binaries and credentials, claims tasks for agents bound to it, drives the harness over **ACP**, reports items and outcomes back as node claims (D14). |

### The BYO contract

A *harness* is any local process that speaks ACP over stdio. `stellarc-node`
ships defaults for `hermes`, `goose`, `claude-code`, `codex`, `gemini`, and
`opencode`; any other ACP agent is one config entry (`command` + `args`).
There are **no in-tree adapters**: Multica's 23 compiled-in runtimes are on
the reject list (steal/reject matrix), and ACP is the adapter contract.

The plane never learns how to launch a harness, never holds its API key, and
never calls a model (D4). It learns a harness **name** from the node's `hello`,
and an agent is `(node, harness, model?, instructions, mcpServers)`.

- **Model choice:** requested, not imposed. If the harness advertises an ACP
  `configOptions` entry with `category: "model"`, the node selects it.
  Otherwise the harness keeps its own default. The transcript records
  `{model, applied}` either way.
- **MCP:** injected over `session/new` (stolen from Multica): config travels
  with the task and is never written into harness config files.
- **Permissions:** the node owner chose to run the agent unattended on their
  own machine, so the node answers `session/request_permission` with
  `allow_once`. Sandboxing is the harness's job.

### Task state machine (Multica-derived)

```
queued ──claim──▶ claimed ──start──▶ running ──finish──▶ completed | failed | cancelled
   ▲                 │                  │
   └── platform.* fault / lease expiry ─┘   (while attempt < max_attempts)
```

- **Leases:** every claim and heartbeat extends `lease_until` (default 60s;
  the node heartbeats every lease/3). An expired lease is reaped back to
  `queued` with `platform.lease_expired`. A node that went dark cannot report
  on a re-claimed attempt (`409`): reports are keyed `(task, attempt, node)`.
- **Two-tier failure taxonomy:** `platform.*` (harness unavailable or exited,
  protocol error, lease expired, node error) is retried. `agent_error.*`
  (refusal, max_tokens, max_turn_requests, prompt failed) is **never**
  retried, because retrying a refusal is how you burn money.
- **Cancel:** an operator cancel flips the row. The node learns of it on the
  next heartbeat and sends ACP `session/cancel`.

### Transcript

ACP `session/update` notifications fold into the ADR-0003 9-kind union.
Message and thought chunks coalesce into one item per run, because parts are
transport-only (D22). Tool calls and results map 1:1. Anything unrecognised
becomes `harness_meta` and is never dropped. Items are deduplicated on
`(task, attempt, seq)`, so re-delivery is idempotent. Raw wire stays on the
node (D21). The harness's native session id is stored as a pointer (paseo's
persistence-as-pointer).

## Interim choices (explicitly temporary)

| Choice | Why now | Replaced by |
|---|---|---|
| HTTP **long-poll** claim (`waitMs` ≤ 30s) | Works through Cloudflare and tunnels today, with no new infrastructure | iroh push (ADR 0004). The claim endpoint is the seam. |
| Static operator token (`STELLARC_OPERATOR_TOKEN`) | Identity (STL-15) is parked | `OperatorAuth` is a function seam. BetterAuth principals plug in without touching the store. |
| Mutable `agent_task` projection + event log | Matches the foundation's probe pattern | Projection rebuild from `agents:*` events once upcasters generalise |
| One task = one prompt turn | Smallest useful unit | Multi-turn sessions and follow-ups (reuse `nativeSessionId`) |

## Proof (on this branch)

- `tests/integration/agents.test.ts` (8 tests, real PG, real API server, real
  `stellarc-node`, ACP fake agent subprocess): authentication, harness gating,
  end-to-end transcript, refusal not retried, crash retried then failed, cancel
  through heartbeat, lease expiry with stale-node rejection, node routing
  isolation.
- Negative control: making `isRetryable` always true turns A4 red (a refusal
  gets requeued).
- Live: `bun tools/smoke-real-harness.ts hermes` drove a real `hermes acp`
  agent to `completed` and recorded its transcript and native session id.

## Next

1. Ticket ↔ task binding: `subjectRef` (`kaneo:KFL-123`) gets set when an agent
   is assigned a ticket, and status and transcript render on the ticket.
2. UI: an agents and runtimes page, plus a task transcript viewer.
3. Multi-turn: follow-up prompts on the same native session.
4. Workdir and repo isolation: a git worktree per task off a bare-repo cache.
