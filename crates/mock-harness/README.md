# Olympus mock harness

A hermetic ACP/JSON-RPC harness used by the Hall↔Envoy integration gate. Run it as
`olympus-mock-harness scenario.json`; it reads newline-delimited ACP requests on
stdin and writes replies on stdout. No network or Hermes `state.db` is used.

## Scenario format

Each turn may assert the exact prompt with `expect`, then runs `actions` in order.
Supported actions are `chunk`, `reasoning`, `tool_call`, `tool_result`, `stall`,
`crash`, and `malformed`. A prompt mismatch returns a JSON-RPC error so stale test
expectations fail loudly.

## Checked-in scenarios

- `scenarios/stream.json` — two text chunks around a tool call/result, then Done.
- `scenarios/stall.json` — pauses mid-turn before completing; used for concurrency
  and node-disconnect coverage.
- `scenarios/crash.json` — emits one chunk and exits mid-turn.
- `scenarios/malformed.json` — emits an invalid ACP frame after one valid chunk.

The integration tests copy or generate tmpdir-scoped scenarios when they need a
specific prompt. Scenario files are data only; all state dies with the child.
