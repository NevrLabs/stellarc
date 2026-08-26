# Verification evidence — phase-0 handover spike (#13)

Audit rerun 2026-08-26 by the second (verification) agent. Every claim below was
re-derived from source on this date; commands are reproducible as written.
Hermes state accessed strictly via `mode=ro` SQLite URIs throughout.

## 1. Source session exists (read-only)

```
sqlite3 'file:$HOME/.hermes/state.db?mode=ro' "SELECT id, title, model,
message_count, tool_call_count FROM sessions WHERE id='20260814_220506_dfb32bde';"
→ 20260814_220506_dfb32bde | Size RAM for tempo-ingester workload | gpt | 16 | 9
```

Row distribution (`GROUP BY role`): user=1, assistant=5 (4 with `tool_calls`,
arrays totalling 9 calls), tool=9, session_meta=1 → 16 rows. Matches the
committed events: 1 config + 2 message + 4 thinking + 9 tool_call +
9 tool_result + 1 harness_meta = 26.

## 2. Mapper reproduces committed artifacts

`python3 map_session.py 20260814_220506_dfb32bde /tmp/rerun` then field-by-field
diff of all 26 events vs committed `.events.jsonl`, excluding per-run random
fields (`event_id`, `ingested_at`, and the random `item_id`/`turn_id` uuid7s):

- **51 diffs total — every one is `item_id` or `turn_id`.**
- Zero diffs in kind, body, seq order, source_uid, raw_ref/raw_format,
  occurred_at, in_context, actor/node/plugin_ns.

The mapping is deterministic given the DB; committed JSONL is genuine output of
the committed script, not hand-edited.

## 3. Replay prompt faithful to DB

Final assistant row (messages.id=298029) matches the replay prompt's closing
assistant turn verbatim (AWS SSO device-auth text). Thinking summaries in the
prompt match `reasoning` column heads (43/39/45/35 chars on the four
tool-calling rows).

## 4. Continuation receipts

- **claude-haiku rerun (this audit):** `continuation-claude-haiku.verify.log`
  + `.verify.json` — exit=0, `num_turns: 1`, subtype success, cost $0.0121,
  10 s. Answer names cluster `noov-prod-admin`, which appears in the replay
  prompt **only** inside a `[tool call]` argument — evidence the model consumed
  the structured transcript, not just the prose.
- **codex attempt:** failed pre-model-call; ChatGPT refresh token reused
  (`refresh_token_reused`), interactive re-login required → not usable without
  user action. Receipt: `continuation-codex-auth-failed.log`.
- Prior commit's original claude-haiku run (`continuation-claude-haiku.run.log`,
  untracked at audit start, now committed) is consistent in format but was
  executed before this audit and is **not independently verifiable**; the rerun
  above supersedes it as primary receipt.

## 5. Environment claims checked

- `bun` is hard-blocked on this host: `~/.local/bin/bun` symlinks to
  `~/.local/libexec/compute-denied`; execution prints "BLOCKED … disabled on
  Terminus" and exits 126. Suggested offloader `fxrun` does not exist on PATH.
  The ticket's "Bun fine locally" does not hold here → python3 stdlib mapper
  stands (ticket said bun/**TS** *preferred*, not required).
- Harnesses present under `~/.local/bin`: claude 2.1.220, codex-cli 0.144.4
  (auth dead), hermes v0.20.2. `opencode` absent.

## 6. Secret scan

`grep -riEn '(sk-…|ghp_|xox[bp]-|AKIA…|PRIVATE KEY|api[_-]?key…)'` over
`docs/spikes/handover/` → no credential-pattern matches. Note: artifacts do
contain internal identifiers (AWS account IDs 656280953066/307946680298, EKS
endpoint hostnames, an expired one-time SSO device code) — acceptable in a
private repo; flagged in self-review.
