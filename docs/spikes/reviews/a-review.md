# Adversarial review — spike (a) harness adapter probes (#13)

Branch `spike/phase0` @ `23b633c` (single commit off `v2-main` @ `d79b346`).
Diff is docs-only: `docs/spikes/adapter-probes.md` + 5 probe drivers + 10 JSONL
receipts. No code, tests, or dependencies touched → no false-green surface, no
Rust build needed (fxcompute offload not required; nothing compiled changed).

## VERDICT: BLOCK

One overstated probe claim (claude per-session MCP injection) presented as
verified with no receipt, no driver path, and no host artifact. Everything else
verified against on-disk evidence. Fix is doc-only (or one cheap re-probe).

## Blocking findings

### B1 — claude per-session MCP injection claimed as probed; no evidence exists

- Claim: `docs/spikes/adapter-probes.md:19` (matrix cell "`per-session MCP` …
  **yes** — `--mcp-config file` (+`--strict-mcp-config`)"),
  `:141-143` ("marker-script MCP server was spawned (marker created), host
  `~/.claude.json` untouched"), and `:262-263` (design consequence #3: "MCP
  injection without host config mutation works on hermes (`session/new`) and
  claude (`--mcp-config`)"). Method statement `:4-6` says "All frames captured
  verbatim to receipts".
- Reproduction (all run 2026-08-26 on terminus, the probe host):
  - `grep -rn "mcp-config\|strict-mcp-config" docs/spikes/adapter-probes-receipts/`
    → no hits. No receipt shows a claude `init` frame with non-empty
    `mcp_servers` (all three claude receipts show `"mcp_servers":[]`).
  - Committed driver `claude_probe.py` has no mode that passes `--mcp-config`;
    only `basic | steer | resume` exist.
  - Host store sweep: `grep -rl '"mcp_servers":[{' ~/.claude/projects/` → no
    hits in **any** project dir (store is cwd-scoped; checked all dirs,
    including `-tmp-stellarc-probe`). A `-p` run persists an init record per
    session — no marker-MCP session ever ran on this host.
- Impact: "per-session config injection" is a named probe question of ticket
  #13; the matrix reports a verified **yes** for claude that is actually
  CLI-documentation knowledge, not a probe. This is exactly the
  design-from-assumptions failure the spike exists to prevent (Olympus lesson,
  issue #13).
- Required fix (either):
  1. Run the marker probe (`claude -p --mcp-config <marker-json>
     --strict-mcp-config`), commit the receipt, update the inventory table; or
  2. Reword `:19`, `:141-143`, `:262-263` to "documented CLI flags, **not
     probed**" and drop the "marker created" assertion.

## Non-blocking findings

1. **Dangling receipt reference** — `adapter-probes.md:167-168`: "(full list in
   the probe log — the error message enumerates every variant)". No such log is
   committed; the codex method surface beyond receipts (`thread/resume|fork|
   archive|list|read`, `turn/interrupt`, `model/list`, `thread/settings/update`,
   `config/mcpServer/reload`) rests on an unarchived artifact. Same for the
   `wire_api="chat"` removal gotcha (`:223-224`). Commit the log or strike the
   parenthetical.
2. **Hermes MCP marker outcome not archived** — `:70-72` asserts "marker file
   created". `hermes-config.jsonl` shows `session/new` accepting `mcpServers`,
   and `acp_config.py:10-12,56` contains the check (unlink-then-stat), but the
   stdout result was not captured and `/tmp/adapter-probes/` is gone. Frames +
   driver logic make it plausible; the outcome record is missing.
3. **Claude steer §2 wording overstates** — `:115-118` "agent abandoned the
   task": the Bash ran to completion (`claude-steer.jsonl:6-8` —
   `task_notification completed`, `tool_result "done"`); the steer changed the
   final reply (STEERED. instead of DONE), it did not abort the tool. §3's
   single-`result` caveat (`:130-136`) is accurate.
4. **Unprobed claims phrased as fact** — `:108-109`
   (`--include-partial-messages` / `--replay-user-messages` behavior; driver
   passes neither flag, receipts show neither deltas nor echoes) and
   `:152-153` (`--fork-session`, `--session-id`).
5. **Hermes "tool events" inferred, not observed** — `:42-44` lists tool events
   among `session/update` kinds; no `tool_call` update appears in any hermes
   receipt (the only tool-invoking turns were steered/cancelled first).
6. **"excerpts inline are unedited" is slightly overstated** — several excerpts
   silently drop fields (`authMethods` at `:33-36`; `"type":"text"` at `:53`).
   Cosmetic.
7. **Driver/probe nits (throwaway code, no action needed)** —
   `claude_probe.py:51` expects 2 `result` frames in steer mode; 1 arrived
   (this *supports* the doc's single-`result` finding; the driver then rode its
   90 s deadline). `codex_app2.py:7` reads the provider key from
   `~/.hermes/config.yaml` at runtime — no secret is committed (verified).
8. **Receipts embed host-internal details** (serverName, installationId, hook
   paths) — acceptable for a private repo; noting for awareness.

## Verified claims (independent checks, terminus, 2026-08-26)

| Doc claim | Check | Result |
|---|---|---|
| Versions: claude 2.1.220, codex 0.144.4, hermes 0.20.2 (`:8-9`) | `claude --version`, `codex --version`, `hermes --version` (in `~/.local/bin`) | exact match, all three |
| opencode/pi not installed (`:9-10`) | PATH + `~/.local/bin` scan | absent — honest |
| claude store cwd-scoped, `d6bb9352` exists (`:149-150`) | `ls ~/.claude/projects/-tmp-adapter-probes/` | `d6bb9352…jsonl` + `8c43f2b2…jsonl` present |
| claude `result` frames: success/PONG, num_turns 1→0.0735, steer 2, resume recall (`:105,:124,:151`) | parsed all 3 receipts' final frames | `subtype:"success"`, results/costs/num_turns match doc verbatim |
| codex rollouts on disk (`:229-230`) | `~/.codex/sessions/2026/08/26/` | `01a03bd9-5c10` rollout contains PONG ×5 + `model_provider":"probe9"`; `01a03bdb-d7ce` contains "Count from 1 to 40" + STEERED ×5 + probe9 — receipts are faithful captures of real sessions |
| hermes store row `d6f426bc…\|acp\|gpt\|2` (`:81-82`) | sqlite `~/.hermes/state.db` sessions | exact row present; plus `58d71453`, `334a15a8`, `69123f10` |
| `set_model` persisted (`:73-74`) | same query | `69123f10 → model=gpt-mini`, siblings `gpt` — exact |
| probe9 provider absent from host config (`:209-211`) | `grep probe9\|20128 ~/.codex/config.toml` | no hits; local gateway live on `127.0.0.1:20128` |
| host configs untouched (`:72,:142-143`) | mtimes | `~/.claude.json` 07-27, `~/.hermes/config.yaml` 08-24, `~/.codex/config.toml` 08-04 — all predate probe day |
| hermes steer out-of-order completion (`:58-59`) | `hermes-steer.jsonl:11,17` | id 4 result precedes id 3 — real, and a genuinely valuable adapter finding |
| codex steer joins same turn, one `turn/completed` (`:185-194`) | `codex-app-steer2.jsonl:20-21,109-123` | single turn id throughout; steer item materialized at 1787710665682, same-turn STEERED, one completed at 669 |
| 180MB+ rollouts (`:231-232`) | `~/stellarc-research/reports/transcript-formats.md:150,524` | claim traced to T3 source |
| D14/D16/D21/D22 usage | `CONTEXT.md:49,52,57,59`; `docs/transcript-schema-v2.md` | all resolve; consistent with 9-kind union, adapter-emitted `turn.closed`, parts-transport-only |
| No secrets committed | `grep sk-\|api_key\|Bearer` over receipts | clean (only `env_key` config reference) |
| Receipt JSON validity | parsed every line of all 10 receipts | all valid; timestamps internally coherent (same morning) |

Not run: `bun test` / `typecheck` / cargo — diff touches no code; suites are
orthogonal to a docs-only change.

## Merge recommendation

**BLOCK, one-doc-fix away from PASS.** The spike's evidence quality is
otherwise excellent: 10 receipts cross-verify against three independent
on-disk stores, and the cross-harness steer-semantics analysis
(out-of-order RPC completion vs shared `result` vs `expectedTurnId` CAS) is
exactly the design-driving output #13 asked for. Address B1 (re-probe + receipt,
or reword three passages to "not probed"), optionally fold in non-blocking #1
(dangling "probe log" reference), and this merges.
