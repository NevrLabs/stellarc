# Spike: cross-harness handover demo (phase-0, #13)

**Branch:** `spike/phase0-handover` · **Date:** 2026-08-26 · **Verdict: works.**

## What was done

1. **Source session:** Hermes `~/.hermes/state.db` (READ ONLY, `mode=ro` URI),
   session `20260814_220506_dfb32bde` ("Size RAM for tempo-ingester workload",
   model `gpt`, 16 rows, 9 tool calls, ends mid-task waiting on AWS SSO
   device auth — a good handover shape: open loop, clear next step).
2. **Mapping:** `map_session.py` (python3 — bun is blocked on this host) folds
   the `sessions` + `messages` rows into the 9-kind union →
   `20260814_220506_dfb32bde.events.jsonl` (26 events:
   1 config, 2 message, 4 thinking, 9 tool_call, 9 tool_result, 1 harness_meta).
3. **Replay prompt:** rendered from the events per design rule 1 (lossy by
   design) → `20260814_220506_dfb32bde.replay-prompt.md` (~10 KB).
4. **Second harness:** `claude` CLI 2.1.220, run as
   `claude -p --model haiku --max-turns 1 --disallowedTools "*"` — cheapest
   model, one turn, no tools. Codex was tried first for a genuinely different
   harness family but its ChatGPT auth is dead (`refresh_token_reused`,
   interactive re-login needed) — receipt in
   `continuation-codex-auth-failed.log`; `opencode` is not installed.
5. **Verification rerun (2026-08-26):** every artifact re-derived from source
   by an independent pass — mapper re-executed and diffed field-by-field
   against the committed events (only random uuid7/ingested_at differ), and
   the continuation re-run once more on haiku. Trail:
   `verification-evidence.md`.

## Continuation transcript (receipt)

### Original run
Prompt tail: *"The user has now completed the AWS SSO device authentication.
State, in one short paragraph, what you would do next and why."*

> Now that SSO is authenticated, I'll verify the AWS credentials work, then
> query the Kubernetes cluster to inspect the current tempo-ingester resource
> requests/limits and OOM events, pull its actual memory usage patterns and
> peak from Prometheus/Grafana (to correlate with ingestion rate and trace
> volume), and cross-reference any recent OOM kills with pod restart logs—this
> gives me the workload profile needed to calculate proper RAM sizing with
> headroom for traffic spikes.

### Verification rerun (primary receipt)

Same prompt, same flags, structured JSON output (`--output-format json`),
committed raw in `continuation-claude-haiku.verify.json`: exit=0,
`num_turns: 1`, subtype `success`, cost $0.0121, 10 s.

> Once AWS credentials are active, I'd verify the tempo-ingester deployment
> in the `noov-prod-admin` cluster to see its current memory requests/limits
> and any recent OOM events … Then I'd query Grafana's Prometheus metrics for
> the actual peak memory consumption over the last 7–14 days … With both the
> current config and observed peak usage, I can recommend proper memory
> sizing that accounts for headroom and Kubernetes eviction thresholds.

Stronger than coherence: **`noov-prod-admin` appears nowhere in the replay's
prose** — only inside a `[tool call] kubectl --context noov-prod-admin …`
argument. The model demonstrably consumed the structured transcript.

**Coherent.** Haiku correctly recovered: the original goal (RAM sizing for
tempo-ingester), the blocker that was just cleared (SSO), the environment
(EKS + Prometheus/Grafana — inferred from tool results in the replay, never
stated in prose), and the right next actions. Cross-harness handover through
the canonical transcript works with zero shared state.

## What mapped cleanly

- **user / assistant text → `message`**, `finish_reason` → `stop_reason`.
- **`tool_calls` JSON → `tool_call`**: `call_id`, name, parsed args; ACP
  `ToolKind` from a small name→kind table. Parallel calls in one assistant
  row collapse to sibling items in `seq` order — exactly the schema's
  "parallel streams collapse to items + ordering" rule.
- **tool rows → `tool_result`** correlated by `tool_call_id`; `is_error`
  derived from the payload (`exit_code`/`error`/`success:false`). Two real
  failed results in this session mapped to `status: failed` correctly.
- **`reasoning` → `thinking`** with `provider_opaque: true` — Hermes stores
  only the provider's one-line reasoning *summary*; the full chain never
  leaves the provider. The flag models this exactly (design rule 7).
- **sessions row → `config`**; unknown `session_meta` role → `harness_meta`
  (rule 3: never dropped, never an error).
- **D21 held with zero effort:** `raw_ref` = `sqlite://…#messages/<rowid>`,
  `raw_format` = `hermes/state.db@26` (schema_version from the DB itself).

## What was lossy (by design)

- Thinking: only the summary line survives, flagged and excluded from replay
  as full reasoning ("[thinking summary — … excluded]").
- Tool results truncated to 1200 chars, args to 400 — the 36 KB skill_view
  dumps did not need to travel; Haiku still recovered the environment.
- `config` / `harness_meta` not replayed at all — machine context, not
  conversation.

## Union gaps found (feed back to #8)

1. **Dual content per message.** Hermes stores `content` (what the user
   typed) *and* `api_content` (what actually hit the LLM — with injected
   mode/system amendments appended). The union has one `message` body and a
   boolean `in_context`; it cannot represent "displayed text ≠ context text"
   for the *same* item. Options: `body.context_content?` on `message`, or a
   sibling `harness_meta` carrying the delta. Today the adapter silently
   drops `api_content` — that's information loss the schema doesn't flag.
2. **`stop_reason` orphaned on tool-only turns.** Assistant rows with tool
   calls but no text produce no `message` event, so their
   `finish_reason: tool_calls` lands nowhere. Harmless here, but the union
   has no home for per-completion metadata (usage, stop_reason) when a
   completion emits only tool_calls. Possibly: allow `message` with empty
   `content` as the completion carrier.
3. **Turn boundaries confirmed heuristic-only for Hermes** — no turn marker
   in the DB; the adapter opens a turn per user message. This is exactly the
   `deterministic_turn_end: false` capability case; no schema change needed,
   just confirmation the flag earns its keep on the very first real adapter.
4. **No gap for the rest**: 16/16 rows mapped, nothing needed a 10th kind.
   `harness_meta` absorbed the one unknown (`session_meta`) as intended.

## Self-review (mandatory)

### Verified with receipts

- Session exists read-only in `state.db`; row counts/distribution match the
  events file exactly (SQL receipts in `verification-evidence.md`).
- Mapper output reproduces committed `.events.jsonl` deterministically;
  only per-run uuid7s and `ingested_at` differ across runs.
- Replay prompt faithful to DB rows (verbatim match on the closing assistant
  turn; thinking summaries match `reasoning` column lengths).
- One-turn continuation on claude-haiku: exit=0, success, no tools
  (`--disallowedTools "*"`), coherent recovery incl. tool-arg-only facts.
- "bun is blocked on this host" claim: true — symlink to `compute-denied`
  wrapper exits 126; suggested `fxrun` offloader absent. The python3 choice
  stands despite the ticket's bun/TS preference (deviation documented here
  rather than shipping a cosmetic TS port that adds no proof).
- No credential-pattern matches in committed artifacts.

### Unverified / inherited

- The original 09:38Z claude-haiku run (`.run.log`, first commit) predates
  the audit and cannot be proven post-hoc; its conclusion is independently
  reproduced by the rerun above, which is the primary receipt.

### Known weaknesses

- n=1 session, n=1 usable second harness (codex auth dead, opencode absent);
  "cross-harness" is currently claude-over-hermes only.
- Turn boundaries are a per-user-message heuristic (`deterministic_turn_end:
  false`) — untested against compaction/rewind sessions (`compacted=0` here).
- `in_context` mirrors only Hermes' `active` flag; `superseded_by` never
  exercised.
- `.events.jsonl` inlines full normalized bodies (incl. 36 KB skill dumps) —
  D21 tension between normalized bodies and journal-only raw; fine for a
  spike artifact, but the production adapter needs truncation/journal policy.
- Internal identifiers travel with the artifacts (AWS account IDs, EKS
  hostnames, expired SSO device code). Acceptable private-repo tradeoff;
  would need redaction policy before any wider sharing.
- Replay-prompt task line ("user has now completed SSO") is hand-authored by
  the mapper script — a real planner must generate it from session state.

## Files

- `handover/map_session.py` — mapper + replay-prompt generator (stdlib only;
  bun hard-blocked on this host, see self-review).
- `handover/20260814_220506_dfb32bde.events.jsonl` — 26 canonical events.
- `handover/20260814_220506_dfb32bde.replay-prompt.md` — the handover artifact.
- `handover/continuation-claude-haiku.txt` — first-harness continuation text.
- `handover/continuation-claude-haiku.run.log` — original run receipt.
- `handover/continuation-claude-haiku.verify.log` / `.verify.json` — verified
  rerun receipt (primary).
- `handover/continuation-codex-auth-failed.log` — codex attempt, auth dead.
- `handover/verification-evidence.md` — audit trail: SQL receipts, rerun diff,
  secret scan, environment checks.
