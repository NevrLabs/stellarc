# Canonical transcript schema v2 (#8)

Ratified 2026-08-26. Sources: T3 study (`~/stellarc-research/reports/transcript-formats.md`,
four-harness evidence: claude-code / codex-cli / hermes / pi), decisions D21–D23 (issue #8),
doctrine D10/D14/D19/D22 (charter). ACP types used verbatim where noted (Apache-2.0).

## Identity spine (D22)

`session → turn → item`. Parts (streaming fragments) are **transport only** — WS fan-out,
never individual log rows.

- **Turn** = one prompt→completion cycle, closed by an explicit adapter-emitted
  `turn.closed` event, gated by the adapter's `deterministic_turn_end` capability flag.
  Turn boundaries live in the log; downstream never infers them.
- **Item** = message / tool-call / tool-result / etc. within a turn.
- **Trace support**: items carry optional `parent_item_id` (causality ref, span-tree /
  OTel-compatible). Trace views (dsh / Cloudflare-OS-harness style) are projections over
  items — no separate trace store.
- Branching = session fork (v1 hard rule). Parallel tool streams collapse to items +
  ordering metadata.

## Event envelope

```
# identity / ordering
event_id        uuid v7          # sortable, ours
session_id      uuid
seq             bigint           # per-session monotonic; ordering is ours, not the harness's
turn_id         uuid?            # D22 spine
item_id         uuid?
parent_item_id  uuid?            # causality/span edge (trace views)
source_uid      text?            # harness-native id; unique (session_id, harness, source_uid)
# provenance (D10/D12/D14)
plugin_ns       text             # D10: owning plugin namespace (adapter)
schema_version  int              # D19: upcaster chain input
actor           text             # D12: principal (node claims carry the node)
node_id         text             # arclet host — this event is that node's claim (D14)
harness         text
harness_version text?
agent_id        text?
# payload
kind            text             # 9-way union below
body            jsonb            # normalized, kind-specific
raw_ref         text?            # D21: reference into node journal / retained blob — NEVER inline
raw_format      text?            # versioned, e.g. "claude-code/jsonl@2.1.207"
# time
occurred_at     timestamptz      # harness's own clock
ingested_at     timestamptz      # plane clock
# context flags
in_context      bool             # participates in LLM context
superseded_by   uuid?            # compaction/rewind pointer — never delete
```

Amendment vs the T3 draft: **no inline `raw jsonb` column** (D21). Raw verbatim wire
lives in the node-local journal; the org-grantable raw-retention policy ships journal
segments async to plane blob storage; `raw_ref` points either way.

## `kind` union — v1 inventory (9 kinds)

| kind | body (normalized) | source evidence |
|---|---|---|
| `message` | `{role, content:[block], model?, provider?, usage?, stop_reason?}` | all four harnesses |
| `thinking` | `{text?, redacted, provider_opaque}` | Anthropic thinking/redacted, Codex reasoning, Pi thinking |
| `tool_call` | `{call_id, name, kind: ToolKind, title?, input, locations?}` | tool_use, function_call, local_shell_call, Pi toolCall |
| `tool_result` | `{call_id, status, content:[block], is_error, usage?}` | tool_result, function_call_output, Pi toolResult |
| `file_change` | `{path, old_text?, new_text, source_call_id?}` | ACP diff; derived from edit tools |
| `approval` | `{call_id?, decision, policy, sandbox?, actor}` | Codex turn_context, Claude permission-mode, ACP pending |
| `checkpoint` | `{reason: compaction\|branch_summary\|rewind, summary, tokens_before?, retained_tail}` | Pi compaction (the model); Claude summary; Hermes compacted |
| `config` | `{model?, provider?, thinking_level?, cwd?, git_branch?, system_prompt_hash?, mcp?}` | Pi model_change, Codex session_meta, Hermes session cols |
| `harness_meta` | `{subtype, data}` | everything unknown — never dropped, never an error |

Content blocks: `text | image{data|uri, mime} | resource_link{uri} | terminal{id}`.
`ToolKind` (`read|edit|delete|move|search|execute|think|fetch|switch_mode|other`) and
`ToolCallStatus` (`pending|in_progress|completed|failed`) **verbatim from ACP**.

Plus the D22 lifecycle events (adapter-emitted, not payload kinds): `turn.opened`,
`turn.closed`, `session.started|completed|failed|needs-input`.

## Design rules (earned, see T3 §receipts)

1. **Normalization is a projection; the raw journal is the record** (D21; comet's
   view/journal split). Same-harness resume = native handle (paseo's
   persistence-as-pointer); cross-harness handover = structured replay prompt,
   lossy by design — never native-format synthesis (encrypted reasoning content is
   provider+org-bound; lossless replay is impossible by construction).
2. **`raw_format` is versioned including harness version** — harnesses change shape
   without notice; the tag enables re-projection when a field's meaning is learned later.
3. **Unknown record types → `harness_meta`, with a drift metric + alert.** A strict
   parser would have failed on every harness studied.
4. **Dedupe on source identity, not arrival**: unique `(session_id, harness, source_uid)`;
   ingest is idempotent (Claude re-delivers on retry; Codex double-emits user turns).
5. **`in_context`/`superseded_by` never delete** — compaction and rewind are projections.
   Showing history the agent no longer sees is the product differentiator.
   Context-compression *normalization* across harnesses: parked per D21.
6. **Stream ingest** — line-at-a-time fold with persisted byte-offset cursor (180MB+
   rollouts exist).
7. **Provider-opaque state is flagged (`provider_opaque`), not hidden** — the handover
   planner keys on it to refuse replay.

## What the workflow engine consumes (D23)

Curated **lifecycle signals** — an independently versioned first-party projection:
`turn.closed`, `session.completed|failed|needs-input`, filtered `item.tool-result`,
plus D20 triggers (timer/webhook/manual/chain). Raw-union subscription is grant-gated
(D3), never the default. Workflows never pattern-match the 9-kind union directly.

## Adapter conformance

Pinned per `(harness, version-range)`. Capability flags in the adapter contract:
`steer: none|interrupt|true`, `deterministic_turn_end: bool`, `native_resume: bool`.
Conformance = the adapter maps its harness's wire to this union + emits lifecycle
events correctly; the drift metric (rule 3) is the regression signal.
