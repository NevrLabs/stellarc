# Phase-0 spike (a): harness adapter probes

Ticket: NevrLabs/stellarc#13 · Probed 2026-08-26 on terminus (Linux).
Method: minimal stdio drivers (`docs/spikes/adapter-probes-receipts/`), one-liner prompts
on the cheapest reachable models. All frames captured verbatim to
`docs/spikes/adapter-probes-receipts/`; excerpts inline are unedited.

Harnesses on PATH: `hermes` (Hermes Agent v0.20.2), `claude` (Claude Code
2.1.220), `codex` (codex-cli 0.144.4). **Not installed: `opencode`, `pi`** —
no probes, no claims.

## Summary matrix

| capability | hermes (`hermes acp`) | claude (`-p --*-format stream-json`) | codex (`app-server`) |
|---|---|---|---|
| wire protocol | **ACP v1, stdio, native** | proprietary stream-json over stdio | proprietary JSON-RPC over stdio (`thread/*`, `turn/*`) |
| steer mid-turn | **true** — 2nd `session/prompt` injected into live turn | **true** — stdin user msg injected mid-turn | **true** — first-class `turn/steer` |
| deterministic_turn_end | **yes** — prompt request resolves w/ `stopReason` | **yes** — `result` frame per turn | **yes** — `turn/completed` notification |
| per-session MCP | **yes** — `mcpServers` at `session/new` | **yes** — `--mcp-config file` (+`--strict-mcp-config`) | per-process `-c` overrides; per-thread untested |
| per-session model | **yes** — `session/set_model` (verified persisted) | **yes** — `--model` per invocation | **yes** — `-c model=…`/`-c model_provider=…` per process; `turn/start` accepts overrides (untested) |
| native resume | `session/load(sessionId)`; store `~/.hermes/state.db` (sqlite) | `--resume <uuid>`; store `~/.claude/projects/<cwd-slug>/<uuid>.jsonl` | `thread/resume` / `codex exec resume <id>`; store `~/.codex/sessions/Y/M/D/rollout-*-<uuid>.jsonl` |

---

## hermes — Hermes Agent v0.20.2, `hermes acp`

### 1. Wire protocol — native ACP v1 over stdio

`initialize` → `protocolVersion: 1`; capabilities advertise
fork/list/resume:

```json
<- {"jsonrpc":"2.0","id":1,"result":{"agentCapabilities":{"loadSession":true,
    "promptCapabilities":{"image":true},
    "sessionCapabilities":{"fork":{},"list":{},"resume":{}}},
    "agentInfo":{"name":"hermes-agent","version":"0.20.2"},"protocolVersion":1}}
```

`session/new` returns the sessionId plus `_meta.hermes.sessionProvenance`
(acp/root/parent ids, sessionKind, compressionDepth) **and the full
`models.availableModels` list** — model inventory arrives free at session
creation. Streaming is `session/update` notifications
(`agent_message_chunk`, `usage_update`, tool events) — parts are transport
only, matching D22.

### 2. steer-mid-turn — `steer: true`

Turn 3 running (`sleep 15` via terminal tool); sent a second
`session/prompt` (id 4) mid-turn. Injected into the live turn:

```json
-> {"id":4,"method":"session/prompt","params":{...,"text":"STEER: stop sleeping, just reply STEERED."}}
<- {"method":"session/update","params":{...,"update":{"content":{"text":"Redirected the active turn with your correction."},"sessionUpdate":"agent_message_chunk"}}}
<- {"jsonrpc":"2.0","id":4,"result":{"stopReason":"end_turn"}}
<- {"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn","usage":{...}}}
```

Note: id 4 resolves before id 3 — the adapter must tolerate out-of-order
completion of prompt requests. `session/cancel` also clean: in-flight
prompt resolves `stopReason:"cancelled"`.

### 3. deterministic_turn_end — yes

Every `session/prompt` resolves exactly once with
`{"stopReason":"end_turn"|"cancelled","usage":{...}}`. The JSON-RPC
response *is* the turn-end event; maps 1:1 to `turn.closed`, usage included.

### 4. per-session config injection — yes

- **MCP**: `session/new {mcpServers:[{name,command,args,env}]}` — probe
  passed a marker script; hermes spawned it (marker file created), no
  changes to `~/.hermes/config.yaml`.
- **Model**: `session/set_model {sessionId, modelId}` → `{}`. Verified in
  the store: probe session row shows `model=gpt-mini`, siblings `gpt`.

### 5. native resume

- Handle: the ACP `sessionId` (uuid) — same value is the primary key in the
  store.
- Store: `~/.hermes/state.db` — SQLite (`sessions`, `messages`, FTS).
  `select id,source,model,message_count from sessions` →
  `d6f426bc-…|acp|gpt|2`. (`~/.hermes/sessions/` is a legacy mirror, not
  authoritative.)
- `session/load {sessionId, cwd, mcpServers}` works; `fork` and `list`
  also advertised.

**Verdict:** `steer: true`, `deterministic_turn_end: true`,
`native_resume: true`. Native ACP — adapter is near pass-through; work is
mapping `session/update` variants to the 9-kind union + provenance `_meta`.

---

## claude — Claude Code 2.1.220, `claude -p --input-format stream-json --output-format stream-json`

### 1. Wire protocol — proprietary NDJSON over stdio (not ACP)

Frames: `system` (subtypes `init`, `task_started`, `task_notification`),
`assistant`/`user` (Anthropic Messages API shape inside `message`),
`result`. Init carries session identity + effective config:

```json
<- {"type":"system","subtype":"init","session_id":"d6bb9352-d956-4bbf-8e9b-abf1bc07cf04",
    "model":"cc/claude-haiku-4-5-20251001","mcp_servers":[],"permissionMode":"dontAsk",...}
<- {"type":"assistant","message":{"content":[{"type":"text","text":"PONG"}],...}}
<- {"type":"result","subtype":"success","result":"PONG","num_turns":1,"total_cost_usd":0.0735,...}
```

`--include-partial-messages` adds streaming deltas;
`--replay-user-messages` echoes stdin back as acks. ACP is available only
via the separate `claude-code-acp` adapter (not installed here) — the
native surface is this stream-json dialect.

### 2. steer-mid-turn — true

Bash `sleep 15` running; wrote a second `user` message to stdin mid-turn.
It was injected — agent abandoned the task and answered the steer, one
`result` frame, `num_turns: 2`:

```
-> {"type":"user","message":{...,"text":"Run this bash command: sleep 15 && echo done..."}}
<- {"type":"assistant",...[tool_use Bash]}
-> {"type":"user","message":{...,"text":"STEER: stop, just reply STEERED."}}   # sent while Bash ran
<- {"type":"assistant","message":{"content":[{"type":"text","text":"STEERED."}]}}
<- {"type":"result","subtype":"success","result":"STEERED.","num_turns":2}
```

(Interrupt: stream-json also has a `control_request`/`interrupt` channel —
not probed; steering via plain user message already suffices.)

### 3. deterministic_turn_end — yes

One `result` frame per completed prompt cycle, with `stop_reason`,
usage/cost, `num_turns`. Caveat: with continuous stream-json input the
`result` arrives per assistant-completion; the steer case above emitted a
single `result` covering both stdin messages — turn attribution in the
adapter must key on message ids, not on counting `result` frames.

### 4. per-session config injection — yes

`--mcp-config <file-or-json>` + `--strict-mcp-config` (ignore host config
entirely): marker-script MCP server was spawned (marker created), host
`~/.claude.json` untouched. `--model`, `--permission-mode`,
`--allowedTools`, `--setting-sources` all per-invocation; one process = one
session, so process flags are session config.

### 5. native resume

- Handle: `session_id` uuid from the `init`/`result` frames.
- Store: `~/.claude/projects/<cwd-slug>/<session-uuid>.jsonl` (e.g.
  `-tmp-adapter-probes/d6bb9352-….jsonl`). Store is **cwd-scoped**.
- `claude -p --resume <uuid>` recalled turn 1 verbatim ("Reply with
  exactly: PONG"). `--fork-session` gives copy-on-resume; `--session-id`
  lets the caller pin the uuid up front (adapter-friendly).

**Verdict:** `steer: true`, `deterministic_turn_end: true` (with the
attribution caveat), `native_resume: true`. Adapter = stream-json translator;
process-per-session.

---

## codex — codex-cli 0.144.4, `codex app-server` (stdio JSON-RPC)

### 1. Wire protocol — proprietary JSON-RPC over stdio (not ACP)

`codex app-server` speaks JSON-RPC with a large method surface —
`thread/start|resume|fork|archive|list|read`, `turn/start`, `turn/steer`,
`turn/interrupt`, `model/list`, `mcpServer/*`, `account/*`… (full list in
the probe log — the error message enumerates every variant).
`thread/start` returns the thread + its on-disk rollout path:

```json
<- {"id":2,"result":{"thread":{"id":"01a03bdb-d7ce-…","sessionId":"01a03bdb-d7ce-…",
    "modelProvider":"probe9","status":{"type":"idle"},
    "path":"/home/rpw/.codex/sessions/2026/08/26/rollout-2026-08-26T09-17-38-01a03bdb-….jsonl",...}}}
```

Notifications: `turn/started`, `item/started`, `item/agentMessage/delta`,
`item/completed`, `turn/completed`, `thread/tokenUsage/updated`,
`hook/started|completed`… `codex exec --json` is a simpler batch variant
(`thread.started` / `turn.started` / `item.completed` / `turn.completed`
NDJSON events).

### 2. steer-mid-turn — true, first-class

`turn/start` acks immediately (`status:"inProgress"`) returning the turn id;
`turn/steer {threadId, expectedTurnId, input}` injects into the running
turn. Model was counting 1..40; steer landed; final message "STEERED",
**one** `turn/completed` — the steer joins the same turn (unlike hermes,
where the steer prompt gets its own response):

```json
-> {"id":4,"method":"turn/steer","params":{"threadId":"01a03bdb-d7ce…","expectedTurnId":"01a03bdb-d874…","input":[{"type":"text","text":"STEER: stop counting, reply STEERED only."}]}}
<- {"id":4,"result":{"turnId":"01a03bdb-d874-7a50-84f5-0c5f1e5ddd05"}}
<- {"method":"turn/completed","params":{"threadId":"…","turn":{"id":"01a03bdb-d874-…","status":"completed","startedAt":1787710658,"completedAt":1787710669}}}
```

`expectedTurnId` is a compare-and-set guard — the CP can steer without
racing turn rollover. `turn/interrupt` also exists (not probed).

### 3. deterministic_turn_end — yes

`turn/completed` notification with turn id, status, timestamps, duration.
In `exec --json`: `turn.completed` with usage. Explicit and unambiguous.

### 4. per-session config injection — partial (per-process proven)

`-c key=value` overrides layer over `~/.codex/config.toml` per invocation —
proven end-to-end by pointing codex at a local OpenAI-compatible gateway
with a provider that does not exist in the host config:

```
codex exec --json --skip-git-repo-check -s read-only \
  -c 'model_providers.probe9={name="probe9", base_url="http://127.0.0.1:20128/v1", env_key="OPENAI_API_KEY", wire_api="responses"}' \
  -c model_provider="probe9" -c model="gpt-mini" 'Reply with exactly: PONG'
→ {"type":"item.completed","item":{"type":"agent_message","text":"PONG"}}
```

Same `-c` flags work on `app-server` (probe threads show
`"modelProvider":"probe9"`). Per-*thread* (not per-process) MCP/model:
`thread/settings/update` and `config/mcpServer/reload` exist on the wire
but were not probed — for stellarc's process-per-session arclet model,
per-process is sufficient. Gotchas: `wire_api="chat"` was removed
(responses-only now); custom providers need `env_key` + env var; unknown
models emit a warning `item` but still run.

### 5. native resume

- Handle: thread/session uuid (v7, time-ordered).
- Store: `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl` — richest
  raw journal of the three (`session_meta` incl. cwd+originator,
  `response_item`, `event_msg` with `turn_id`). The T3 study's 180MB+
  rollouts are these files.
- `codex exec resume <uuid> <prompt>` (global flags must precede the
  subcommand) resumed and recalled turn 1 verbatim; `thread/resume` +
  `thread/fork` on app-server.

**Verdict:** `steer: true`, `deterministic_turn_end: true`,
`native_resume: true`. Auth note: this host's ChatGPT-mode tokens were
stale (refresh-token reuse error) — a real deployment should route via
aiproxy/gateway keys per D16, which the probes validated works.

---

## Cross-harness design consequences (from probes, not assumptions)

1. **All three probed harnesses support live steering** — the adapter
   contract's `steer: none|interrupt|true` has three `true` data points but
   with *different* turn semantics: hermes gives the steer its own
   prompt-response (out-of-order completion), claude folds it into a shared
   `result` (`num_turns:2`), codex folds it into the same turn under an
   `expectedTurnId` CAS. Normalizing "what turn did the steer land in" is
   adapter work; the schema's adapter-emitted `turn.closed` (D22) is the
   right call — none of the three boundary models can be inferred uniformly
   downstream.
2. **deterministic_turn_end holds everywhere probed** — but the *event
   shape* differs (RPC response vs `result` frame vs notification). The
   flag can likely default true for tier-1 harnesses; keep it per-adapter
   anyway for the untested ones (opencode, pi).
3. **Per-session config injection is universal at process granularity.**
   Arclet should assume process-per-session (claude/codex) with hermes ACP
   able to multiplex sessions in one process. MCP injection without host
   config mutation works on hermes (`session/new`) and claude
   (`--mcp-config`); codex per-thread injection needs a follow-up probe if
   we ever multiplex threads in one app-server.
4. **Native resume handles are all uuid-shaped, stores all node-local**
   (sqlite / cwd-sloped jsonl / dated jsonl). Fits D14/D21: transcripts are
   node claims, journal stays node-local, `raw_ref` points into it.
   claude's store being **cwd-scoped** matters: the arclet must pin
   workspace cwd or resume silently misses.
5. **`raw_format` versioning is earned again**: codex removed
   `wire_api="chat"` between versions; claude renamed model aliases;
   probes hit both within an hour.

## Probe inventory (receipts)

| log | what |
|---|---|
| `docs/spikes/adapter-probes-receipts/hermes-basic.jsonl` | ACP init/new/prompt, PONG turn |
| `docs/spikes/adapter-probes-receipts/hermes-cancel.jsonl` | `session/cancel` → `stopReason:cancelled` |
| `docs/spikes/adapter-probes-receipts/hermes-steer.jsonl` | mid-turn 2nd prompt injection |
| `docs/spikes/adapter-probes-receipts/hermes-config.jsonl` | MCP marker, `set_model`, `session/load` |
| `docs/spikes/adapter-probes-receipts/claude-basic.jsonl` | stream-json PONG |
| `docs/spikes/adapter-probes-receipts/claude-steer.jsonl` | stdin steer during Bash sleep |
| `docs/spikes/adapter-probes-receipts/claude-resume.jsonl` | `--resume` recall |
| `docs/spikes/adapter-probes-receipts/codex-basic.jsonl` | `exec --json` PONG via injected provider |
| `docs/spikes/adapter-probes-receipts/codex-resume.jsonl` | `exec resume` recall |
| `docs/spikes/adapter-probes-receipts/codex-app-basic2.jsonl` | app-server `thread/start`+`turn/start` |
| `docs/spikes/adapter-probes-receipts/codex-app-steer2.jsonl` | `turn/steer` with `expectedTurnId` |

Probe drivers: `acp_probe.py`, `acp_steer.py`, `acp_config.py`,
`claude_probe.py`, `codex_app2.py` (same dir). Throwaway per spike doctrine;
logs are the durable artifact and are quoted above.
