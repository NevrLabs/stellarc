# Adversarial review — spike-c phase-0 handover demo (#13)

**Reviewed:** branch `spike/phase0-handover`, `HEAD` 223fb9b, diff `v2-main...HEAD`
(11 files, +574). **Reviewer run:** 2026-08-26 (host TZ WIB/UTC+7). Worker
implementation and `docs/spikes/handover-demo.md` untouched.

## VERDICT: PASS

Every material claim re-derived from primary sources; no fabricated receipts,
no zero-test false green, no schema-doctrine violation, no stale artifacts.
Three findings below are precision/robustness issues, none blocks merging a
phase-0 spike artifact.

## Blocking findings

None.

## Non-blocking findings

1. **`tool_result` error detection fail-opens on parse failure; "Two real
   failed results" undercounts.**
   `map_session.py:147-151`: `is_error` derives from `json.loads(payload)` with
   an `except → is_error = False` fallback. The kubectl result (msg 298025)
   stored by Hermes is JSON **plus** an appended tool-loop warning (2571 bytes,
   `JSONDecodeError: Extra data` at byte 2080); the fallback classifies an
   actually-failed call (`aws` exit 255, SSO token expired, kubectl could not
   reach the cluster API) as `status: completed` / `is_error: false`
   (`.events.jsonl` seq 20). The session contains **three** failing invocations
   (seq 13, 19, 20), not the two claimed at `handover-demo.md:75`. The demo's
   conclusion survives (handover worked), but an error classifier that defaults
   to success when the payload is non-JSON is the wrong bias for a transcript
   downstream workflows may gate on — carry the strict-parse-else-`failed`
   decision into the production adapter and out of the spike. Reproduction:
   `sqlite3 'file:~/.hermes/state.db?mode=ro' "SELECT content FROM messages WHERE id=298025;" | python3 -m json.tool` → fails; mapper emits `completed`.

2. **"only inside a `[tool call]` argument" is imprecise.**
   `handover-demo.md:57`: `noov-prod-admin` also appears in the replay prompt's
   `[tool result — ERROR]` payload (replay-prompt line 31: the `kubectl config
   get-contexts` output). The substantive claim — absent from all user/
   assistant *prose* — holds and the coherence inference stands; the sentence
   just over-narrows where the fact lives.

3. **Minor doc precision.** `handover-demo.md:135` "09:38Z" is WIB-local time
   of receipt `02:38:16Z` (UTC) in `continuation-claude-haiku.run.log`; and
   `.run.log` was first committed in d92fb40 (second commit), not "first
   commit". Both immaterial to the disclosed conclusion (pre-audit run, not
   independently verifiable, superseded by the rerun). Also "10 s" vs
   `duration_api_ms` 11851.

4. **Reproducibility nit.** `verification-evidence.md:22` runs the mapper into
   `/tmp/rerun` but `map_session.py` never mkdirs its outdir — the command
   fails verbatim if `/tmp/rerun` does not pre-exist.

## Verification commands / results (all executed this review)

| Claim | Check | Result |
|---|---|---|
| Session exists, read-only | `sqlite3 'file:$HOME/.hermes/state.db?mode=ro'` — `sessions` row, `GROUP BY role` | 16 rows (user 1, assistant 5, tool 9, session_meta 1); model `gpt`, `tool_call_count` 9, `user_id` 6301291523; matches events exactly |
| `raw_format` = `hermes/state.db@26` | `SELECT * FROM schema_version;` | 26 (Hermes' own table; `PRAGMA user_version` is 0 — claim source is correct) |
| Mapper determinism | `python3 map_session.py 20260814_220506_dfb32bde /tmp/rerun` + field diff | 26 events, kinds `{config:1, message:2, thinking:4, tool_call:9, tool_result:9, harness_meta:1}`; **zero** diffs excluding `event_id`/`ingested_at`/`item_id`/`turn_id`; the 51 diffed fields are exactly 26 `item_id` + 25 `turn_id`; replay prompt byte-identical |
| Replay faithfulness | DB rows vs `.replay-prompt.md` | Final assistant turn (msg 298029) verbatim; thinking summaries `length(reasoning)` = 43/39/45/35 (incl. `**`); 4 reasoning rows are the 4 `finish_reason=tool_calls` rows; 298029 only text row |
| claude continuation | Re-ran `claude -p --model haiku --max-turns 1 --disallowedTools "*" --output-format json` on committed prompt | exit 0, `num_turns: 1`, `is_error: false`, `stop_reason: end_turn`; coherent: recovered RAM-sizing goal, cleared SSO blocker, EKS/Grafana/Prometheus environment from tool content only |
| codex auth dead | Re-ran `codex exec --ephemeral ... -m gpt-5-mini -s read-only` | Reproduced `refresh_token_reused` 401 pre-model-call (`continuation-codex-auth-failed.log` genuine) |
| Environment claims | `claude --version` / `codex --version` / `hermes --version` / `ls ~/.local/bin` | 2.1.220 / codex-cli 0.144.4 / Hermes 0.20.2 / opencode absent; `bun → compute-denied` prints BLOCKED, exit **126**; `fxrun` absent |
| Secret scan | `grep -riEn '(AKIA…|ghp_|sk-…|PRIVATE KEY|api[_-]?key…)' docs/spikes/handover/` | No credentials; only the doc's own quoted pattern and `AWS_SECRET_ACCESS_KEY` as an env-var name inside a skill dump (false positive). Internal identifiers (AWS account IDs, EKS hostname, expired device code) acknowledged in self-review |
| Union gaps (schema feedback) | DB columns vs claims | Gap 1 real: msg 298015 `content` 116 B vs `api_content` 5346 B (injected ponytail-mode amendment) silently dropped; gap 2 real (`finish_reason tool_calls` orphaned on 4 content-less rows); gap 3 real (no turn marker column; heuristic confirmed); gap 4 holds (16/16 rows, no 10th kind) |
| Schema-doctrine conformance | Events vs `docs/transcript-schema-v2.md` | Envelope fields per ratified schema (`event_id` uuid7 confirmed, seq/turn/item spine, `plugin_ns`, `schema_version 1`, actor/node, `raw_ref`/`raw_format`, `in_context`, `superseded_by`); kinds/mapping per union; D21 raw pointers, not inlined wire — self-disclosed tension that bodies inline normalized dumps is accurate |

## Merge recommendation

**Merge.** The spike's purpose — replay a real Hermes session through the
canonical transcript into a second harness with coherent recovery — is
demonstrated end-to-end and independently reproducible; the `is_error`
fail-open (finding 1) should feed #8's adapter guidance before the production
adapter is written, but does not invalidate the spike's evidence or verdict.