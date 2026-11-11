# Client parity R1 — source-only next implementation contract

## Disposition

**Design/source evidence only; no verified interoperability. Replacement HOLD.**
Read replacement R1, integration R3 and replacement-map fully. Builder execution
remains paused under the supervisor; no builder probes, tests/builds on any host,
provider/catalog requests, credential/config reads, refresh/login, service or DB
changes were made. Only this report is owned by this lane. Approval/MCP sources
are untouched. This is not clearance of the R3/R4 cancellation hang or LLM gates.

### Evidence identity and citation convention

- `H` = `/home/rpw/.hermes/hermes-agent`, Git
  `bf0203a794a07aac3ff764972ab9087baa4e4f4e`. Read local source, not configs.
  `agent/auxiliary_client.py` and `agent/model_metadata.py` hashes still match
  replacement R1: `053078416f2b2d94256584a5c1ed6176bfbd3f3de88a8ca858e8257274a04bb5`
  and `497f2342915b0c7f23e56c2ec7e191a122d6255a6d12e660e570a4013895ab3d`.
- `N` = **immutable Git objects**, available locally in
  `/home/rpw/projects/9router`, commit
  `3cf2973d4366d5b75805c798e19140321c62a407`. Every `N:path:line` below
  means `git -C /home/rpw/projects/9router show <commit>:<path>`, **not that
  checkout's HEAD** (`a84da1796cbb9d9d0f18e12f55b5cc981e2bd1ea`). No builder
  retrieval or claim of full serving-bundle lineage. Responses translator,
  Codex executor and models route object hashes match replacement R1 exactly.
- `P` = installed Python SDK source under `H/venv/lib/python3.11/site-packages`:
  `openai` **2.24.0**, `anthropic` **0.87.0** (respective dist-info `METADATA:3`).
  Anthropic Python is a reference/acceptance client, **not proof of the bundled
  Claude Code client's implementation/version**; readable local Claude CLI SDK
  source was not established.
- `S` = this worktree. `apps/stellarc-gateway/src/main.ts` hash
  `24c76609991b68c19c1abc80e555de7f437b29977de78d646d5ca3f4630925ab` and
  `provider-routing.ts` hash
  `eabd5f69b9e3c0c2011bf627a480e7939f34b624d3854313c3df91c93707b75f`
  match R3. These are source identities, not new executed receipts.

## Actual consumer boundary (reuse prior safe inventory)

No repeat live inventory. Configuration facts below come from
[replacement R1:35–67](stellarc-llm-replacement-r1.md#actual-required-client-surface),
not model-name inference or recent-usage evidence.

| Consumer | Unchanged contract to preserve | Present Stellarc gap |
|---|---|---|
| Hermes custom 9router | Loopback base `http://127.0.0.1:20128/v1`; OpenAI Chat client, POST base + `/chat/completions`, Bearer credential. Auxiliary aliases include `glm`, `gpt`, `gpt-mini`. | Only scoped `/orgs/:org/v1/chat/completions`, one exact configured model, stream only. |
| Claude settings | Base `http://127.0.0.1:20128/v1`; auth keyname `ANTHROPIC_AUTH_TOKEN`; model values `cc/claude-opus-5-5`, `cc/claude-sonnet-5`, `cc/claude-haiku-4-5-20251001`. | No Messages ingress. Do not mistake the token keyname for `x-api-key`: auth-token clients use Bearer; API-key clients use `x-api-key`. |
| T3 favorites via Hermes custom routes | `opus` (default), `glm`, `gpt`, `gpt-mini`, `fable`, `deriver`, `glm-flash`, `deepseek`, `generic`, `smart`, `free` (fallback). Current task identifies `custom:9router:gpt`. | These route selections must keep resolving; T3 is not established as a direct Responses client. Replacing two aliases is not replacement of all favorites. |
| Hermes top-level default | Direct `zai` / `glm-5.3`, base `https://api.z.ai/api/coding/paas/v4`. | Out of 9router migration; do not rewrite it. |
| Native Codex | No configured gateway provider established. | Do not add a public Responses endpoint solely for presumed Codex use. Responses is required **upstream of Hermes Chat** for `cx`. |

Client-source anchors: `H:agent/chat_completion_helpers.py:2947–2959` dispatches
Chat streaming with `stream_options.include_usage=true`; `:760–790` also dispatches
nonstream. `H:agent/auxiliary_client.py:7082–7148` makes streaming and plain calls,
and may fall back to plain on a streaming-specific rejection. Nonstream is a real
requirement, not optional because the current gateway rejects it.
`P:openai/resources/chat/completions/completions.py:1205` posts
`/chat/completions`; `P:openai/_client.py:331–336` sets Bearer.

**Path/header acceptance must be measured, not guessed:** installed Python
Anthropic posts `/v1/messages` (`P:anthropic/resources/messages/messages.py:997,1110`)
and appends relative paths to the base path
(`P:anthropic/_base_client.py:474–485`). Giving that Python client the recorded
Claude base ending `/v1` produces `/v1/v1/messages`, unlike OpenAI's join.
The unchanged Claude CLI may normalize it differently; its exact emitted path
is an explicit socket-capture gate. Do not globally strip duplicate path segments
or call a Python request a Claude CLI acceptance. A documented, exact legacy-path
compatibility route is permissible only after capture, behind identical auth.
`P:anthropic/_client.py:157–181` defines `X-Api-Key` vs Bearer and
`anthropic-version:2023-06-01`. Prior 9router accepts either auth style;
`S:apps/stellarc-gateway/src/main.ts:145–148,352–425` accepts only its 43-character
Bearer and scoped Chat path. New `/v1/*` compatibility must resolve org from a
valid Stellarc credential (or validate scoped org against it), never caller
attribution headers; no acceptance of old provider/shared credentials by default.

## Minimal translation contract

### Request/history deltas

| Chat field | Messages (`cc`) | Responses (`cx`) |
|---|---|---|
| system/developer instructions | Top-level `system` blocks; preserve instruction order, do not turn developer into assistant. | `instructions` / developer message input; preserve every instruction-bearing turn. |
| user/assistant text | `content:[{type:"text",text}]` | `message` input item; user `input_text`, assistant `output_text`. |
| function declaration | `tools:[{name,description,input_schema}]` | Flat `{type:"function",name,description,parameters,strict?}`, not nested `function`. |
| assistant tool call | `tool_use` with original id/name and **parsed object** input | `function_call` with `call_id` and **JSON string** arguments. Item `id` is separate from `call_id`. |
| tool result | User `tool_result` block immediately following matching assistant use; preserve parallel pairs, error flag and content. | `function_call_output` with matching `call_id`, string output for this lane's text tools. |
| choice | auto→auto, required→any, forced function→tool(name); none must actually prohibit tool use. | Flatten forced function name; retain auto/none/required only if selected transport supports them. |
| image content | Data URL→base64 source or allowed URL source, preserving MIME; tool-result images must not disappear. | `input_image` with string image_url/detail; Codex transport separately handles remote-image limitations. |
| reasoning | Capture intent **before** rebuilding body: map effort to proven model policy, not name heuristics; separate thinking/signatures from visible text. | `reasoning:{effort,summary}`; opaque encrypted continuity is not summary text. |

Source examples, **not wholesale adoption**:
`N:open-sse/translator/request/openai-to-claude.js:16–195,231–354`,
`request/claude-to-openai.js:14–93,144–281`,
`request/openai-responses.js:22–249,282–462` (all under `open-sse/translator/`).
The old source silently changes some semantics: Chat `tool_choice:"none"` becomes
Claude auto (`openai-to-claude.js:334–337`), later instruction messages disappear
(`openai-responses.js:345–353`), missing tool results are fabricated
(`claude-to-openai.js:61–64`), and unknown Responses content becomes text
(`openai-responses.js:380–382`). **Do not reproduce these as the new contract.**
Reject unrepresentable/invalid input before fetch; do not repair IDs, invent tool
results, silently weaken forced/no-tool policy or stringify unknown blocks.

Native Claude→Claude traffic should retain native content/cache/thinking blocks,
not round-trip through Chat. Chat→Responses is mandatory for `gpt/gpt-mini`;
reverse request/output conversions are defined here for symmetry but **new native
Responses ingress and Messages→cx cross-routing are deferred** until an actual
consumer/alias requires them. Do not build a universal protocol framework.

### Streaming, finish, usage, failure and cancellation

- **Chat consumer:** stable `id/model`, `object:"chat.completion.chunk"`, choice
  index 0; role once, text in `delta.content`, reasoning in
  `delta.reasoning_content` (not visible `<think>` text). Tool-open delta contains
  stable integer index, id, complete name, type=function; following arguments are
  **fragments appended exactly once**, not repeated full snapshots. Parallel
  calls get distinct indices. Usage-only `choices:[]` is valid. Final
  finish/usage plus `[DONE]` only after validated native terminal and durable
  finish + fresh authorization. Hold translated finish until then, not just DONE:
  Hermes treats finish_reason as evidence of clean termination.
- **Messages→Chat:** map native block index→Chat tool index; ignore neither a
  nonempty initial tool input nor subsequent JSON fragments. Text/thinking deltas
  remain separate. `end_turn/stop_sequence→stop`, `tool_use→tool_calls`,
  `max_tokens→length`, `refusal→content_filter`. Preserve native stop details
  separately where representable; unknown stops fail closed, never default stop.
  Require matching block lifetime and `message_stop`, not only `message_delta`.
- **Responses→Chat:** correlate `response.output_item.added` function calls by
  item id to `(Chat index,call_id,name)`; argument deltas key by `item_id`, **not
  latest call/output position**. Done full arguments are a fallback only if no
  argument deltas were emitted; validate against accumulated content, never append
  again. Unknown/dangling correlators or conflicting duplicates fail closed.
  `response.output_text.delta→content`; `reasoning_summary_text.delta→reasoning_content`.
  Only `response.completed` with completed status produces stop/tool_calls.
  Failed/incomplete/error is failure under current R3 policy, **not a successful
  length/stop**. Native completed with function calls is completed generation,
  not proof the external tools ran.
- **Reverse rendering, if needed:** Chat→Messages opens message then indexed
  text/thinking/tool blocks, emits input_json_delta, closes blocks before
  message_delta + message_stop. Chat→Responses opens response/items, emits text/
  argument deltas and done items; terminal response.output repeats the completed
  items without duplicating the consumer's deltas. Usage trailers must be read
  before output terminal. No OpenAI DONE marker on either native wire.
- **Usage:** keep raw upstream usage separate from normalized client fields and
  estimates. Messages input_tokens excludes cache reads/creation: Chat prompt =
  input + cache_read + cache_creation; completion = output; total = prompt + output;
  cached/cache_creation live in prompt_tokens_details. Responses input_tokens
  already includes cached tokens; do **not** add cache again. Preserve
  output_tokens_details.reasoning_tokens as completion_tokens_details.reasoning_tokens,
  not extra completion tokens. Missing usage is unknown, not zero measured usage.
  Reverse Messages input subtracts only explicitly known cache components; reject
  negative/inconsistent values. No display reserve or invented billing totals.
- **Errors:** before headers, safe protocol-appropriate non-2xx JSON, bounded
  numeric Retry-After, no provider body/cookies/credentials. After headers, safe
  native error event (Chat data.error; Messages event:error), then close, no
  success terminal. Never translate provider failure into assistant prose.
  Disconnect/abort/deadline cancels the actual fetch/reader, discards pending
  translated output, records cancelled/failed once, no replay or success marker.
  Keep current before/after-read and post-finish authorization checks; transport
  cleanup hang remains an independent blocked execution issue.

Evidence: `H:agent/auxiliary_client.py:7171–7307` assigns id/name and concatenates
arguments **by index**, records choices-empty usage and reasoning; its finish()
can default missing finish to stop. Main accumulator
`H:agent/chat_completion_helpers_tool_calls.py:8–114` also assembles indexed tools.
Therefore lax SDK EOF behavior is **not** gateway terminal validation.
`P:openai/_streaming.py:55–129` parses SSE/DONE, raises on data.error and closes
response; `P:openai/types/chat/chat_completion_chunk.py:52–110` defines delta/index/
finish fields. `P:anthropic/_streaming.py:83–121` dispatches named native events,
ignores ping and raises on error. Its accumulator
`P:anthropic/lib/streaming/_messages.py:433–518` requires message_start, accumulates
partial JSON/thinking/signature and merges output-only usage updates.

Prior translator evidence: `N:open-sse/translator/response/claude-to-openai.js:26–185`,
`response/openai-to-claude.js:71–256`, `response/openai-responses.js:50–61,339–477,510–703`,
`concerns/usage.js:3–25`, `concerns/finishReason.js:6–19,55–64`.
Important differences: old Responses fallback can flush success without terminal,
turn errors into `[Error] ...` + stop, and omit reasoning-token details in inbound
usage (`response/openai-responses.js:511–530,637–687`). Old Messages renderer misses
choices-empty usage (`openai-to-claude.js:72`). These are regression vectors, not
behaviors to preserve. Current `S:provider-routing.ts:179–194,249–343` (under
`apps/stellarc-gateway/src/`) already rejects JSON, provider errors/incomplete and
premature EOF, and owns terminal/finalizer/abort ordering; extend this seam rather
than adding a second streaming lifecycle.

### Reasoning continuity: an explicit unresolved limit

Visible reasoning is solved by the mapping above; signed/encrypted multi-turn
continuity is **not**. Native Messages preserves genuine signed blocks. An
unchanged Hermes custom Chat route strips `anthropic_content_blocks` and Codex
private history fields; localhost/custom normally replays only reasoning and
reasoning_content, not arbitrary reasoning_details
(`H:agent/transports/chat_completions.py:37–46,527–547`;
`H:agent/message_sanitization.py:654–673,710–726`). Do not assume an invented
sidecar will return on the next tool turn. The old Responses streaming translator
also does not expose encrypted output continuity in the inspected path.

**Fail-closed default:** do not claim thinking-tool multi-turn parity or enable
an alias requiring opaque replay until source + unchanged-client fixtures prove
its supported continuity path (or prove omission is accepted by the selected
transport). Do not forge Claude signatures, fabricate reasoning, switch client
api_mode, or silently add a server conversation store to evade this gap.
Unknown-model/manual-vs-adaptive effort and forced-tool constraints likewise
stay explicit. `N:providers/capabilities.js:97–133` (under `open-sse/`) declares
adaptive thinking and Opus forced-tool restrictions; these are source claims,
not provider verification. Capture original thinking intent as existing
`N:open-sse/translator/concerns/thinkingUnified.js:48–125` already does.

## OAuth transport is a different task from the codecs

| Route resolved from actual aliases | Required transport evidence / minimum contract |
|---|---|
| `gpt→cx/gpt-6.1-sol`; `gpt-mini→cx/gpt-6-luna[1m]` | `N:open-sse/providers/registry/codex.js:39–63` explicitly marks **both Responses Lite**; `[1m]` is public route identity, upstream Luna id is `gpt-6-luna`. No inference from names. Executor `codex.js:220–254,414–557` binds OAuth account/workspace header, server-owned session and refresh; forces stream/store=false; selects Lite header `x-openai-internal-codex-responses-lite:true` absent hosted search, puts `additional_tools` and developer instructions in input prefix, tools=null, instructions empty, parallel_tool_calls=false, reasoning.context=all_turns. Removes unsupported output limits/sampling/stream_options and applies final body allowlist. Ordinary OpenAI Responses API-key forwarding is not this transport. |
| `opus/fable` and direct `cc/...` settings | `N:open-sse/providers/registry/claude.js:4–51,61–68` maps cc→claude OAuth, native Messages URL with `?beta=true`, Bearer vs API-key split and first-party/version/beta headers. `executors/default.js:200–242` merges selected betas and aligns session header with metadata. `translator/formats/claude.js:495–563,755–759` applies request policy/session transforms. Two configured Claude accounts were previously observed: selection/token/refresh/session must remain bound to one authorized server connection, never mutable singleton cross-account state. |

Codex URL is `https://chatgpt.com/backend-api/codex/responses`, not
`https://api.openai.com/v1/responses`. Claude OAuth and metered Anthropic API-key
routes are distinct even if both speak Messages. Current generic route validator
rejects query strings and current Messages planner injects x-api-key
(`S:provider-routing.ts:84–89,152–155`); do **not** loosen global URL/auth validation
for OAuth. Use narrowly pinned server-owned transport constants and credential
handles. Fail closed for absent/mismatched account metadata, expired/unavailable
credentials and unknown effects; refresh implementation/permission is a separate
supervisor-owned gate, not exercised here. No caller Authorization, beta, account
or session metadata is upstream authority. Do not adopt spoofing/decoy behavior
as a protocol requirement: `N:open-sse/utils/claudeCloaking.js:22–30,56–77` derives
fake identity and injects tools. Technical old-source behavior does not authorize
it or establish subscription forwarding permission. Keep the API-key identity/
beta stripping separate (`N:executors/default.js:226–233`,
`translator/formats/claude.js:511–525`, both under `open-sse/`).

## Alias/catalog contract and remaining favorites

Use authorized GET `/v1/models`, with `{object:"list",data:[...]}`, exact alias
ids and positive **proven/configured** `context_length`, `max_completion_tokens`,
capability metadata only where known. No inference, dynamic provider discovery,
placeholder capability-true flags or cross-org catalog leakage. Existing
`S:provider-routing.ts:98–114` already deduplicates alias/context catalog shape;
reuse it, adding only required fields/visibility. Hermes reads `data[].id`,
context fields (including nested meta) and separate output cap; see
`H:agent/model_metadata.py:417–419,811–834,943–946,1570–1587`.

`N:src/app/api/v1/models/route.js:400–425` publishes combo ids/owned_by=combo,
conservative member minima, then explicit combo cap override. Do not flatten
multi-member aliases into one model. Static **source claims**, not measured limits:
`cx/gpt-6.1-sol`: context 272000/output 128000;
`cx/gpt-6-luna[1m]`: context **872000**, not one million by name/output 128000
(`N:open-sse/providers/capabilities.js:226–230,302–313`). Opus/Fable/Sonnet selected
rows claim 1000000/128000 (`:97–133`); exact live combo overrides/synced catalog
and Haiku effective values remain unknown. Omit unconfirmed numeric metadata,
never borrow another model's limits.

Carry the R1 safe alias inventory forward unchanged:

| Favorite | Required configured members / disposition beyond this codec slice |
|---|---|
| glm / glm-flash | `glm/glm-5.3` / `glm/glm-5.3-flash`; native Chat candidate, capability/live proof open |
| gpt / gpt-mini | cx pair above; Lite/OAuth + codecs + continuity gate |
| opus / fable | `cc/claude-opus-5-5` / `cc/claude-fable-5-1`; OAuth + Messages/Chat |
| deriver | `glm/glm-5.3-flash`; `ocg/deepseek-v4-flash`; `cx/gpt-6-luna[1m]`; `ocg/gpt-6-luna`; strategy/config and ocg transport open |
| deepseek | `ocg/deepseek-v4-flash-vision-exp`; ocg transport open |
| generic | `ag/gemini-3.8-flash`; `cx/gpt-6-luna`; `glm/glm-5.3-flash`; `cc/claude-sonnet-5`; strategy/ag transport open |
| smart | `cc/claude-fable-5-1`; `cx/gpt-6.1-sol`; `glm/glm-5.3`; strategy open; name does not authorize council calls |
| free | `oc/muse-spark-1.3-contributor-free`; `oc/deepseek-v4-flash-free`; oc mapping/auth open, no enabled connection established |

Required ordering/fallback/fusion strategies, live alias caps and account selection
settings were not captured in R1. Default **unavailable**, not random selection,
silent fallback or catalog advertisement of a working route. Final migration must
exercise every configured favorite and default/fallback selection or obtain an
explicit user disposition; this lane cannot clear that gate.

## Concrete payload vectors — SYNTHETIC, never real provider output

These are **specified expected transforms**, not executed fixtures/results. Model
names are literal configured identifiers; prompt/tool content, ids and usage are
invented. Ticket 1 should turn these into loopback fixtures after builder recovery.
SSE rendering: Chat `data: <JSON>\n\n`; native `event: <type>\ndata: <JSON>\n\n`.

### V1: identical tool history on the three wires

Chat ingress (`model:"opus"` for cc; substitute `"gpt"` for cx):
```json
{"model":"opus","stream":true,"messages":[{"role":"system","content":"Synthetic fixture."},{"role":"user","content":"Echo x."},{"role":"assistant","content":null,"tool_calls":[{"id":"call_a","type":"function","function":{"name":"echo","arguments":"{\"s\":\"x\"}"}}]},{"role":"tool","tool_call_id":"call_a","content":"x"}],"tools":[{"type":"function","function":{"name":"echo","parameters":{"type":"object","properties":{"s":{"type":"string"}},"required":["s"]}}}],"tool_choice":"auto","stream_options":{"include_usage":true}}
```
Messages **codec-only** body (explicit fixture output cap; no OAuth identity):
```json
{"model":"claude-opus-5-5","stream":true,"max_tokens":64,"system":[{"type":"text","text":"Synthetic fixture."}],"messages":[{"role":"user","content":[{"type":"text","text":"Echo x."}]},{"role":"assistant","content":[{"type":"tool_use","id":"call_a","name":"echo","input":{"s":"x"}}]},{"role":"user","content":[{"type":"tool_result","tool_use_id":"call_a","content":"x"}]}],"tools":[{"name":"echo","input_schema":{"type":"object","properties":{"s":{"type":"string"}},"required":["s"]}}],"tool_choice":{"type":"auto"}}
```
Responses **codec-only** body (NOT the final required Lite transport body):
```json
{"model":"gpt-6.1-sol","stream":true,"store":false,"instructions":"Synthetic fixture.","input":[{"type":"message","role":"user","content":[{"type":"input_text","text":"Echo x."}]},{"type":"function_call","call_id":"call_a","name":"echo","arguments":"{\"s\":\"x\"}"},{"type":"function_call_output","call_id":"call_a","output":"x"}],"tools":[{"type":"function","name":"echo","parameters":{"type":"object","properties":{"s":{"type":"string"}},"required":["s"]}}],"tool_choice":"auto"}
```
Lite transport then relocates tools/instructions into the prefix described above;
fixture must assert tools=null, instructions="", stream=true, store=false,
parallel_tool_calls=false and model-specific reasoning policy. No invented
`[1m]` body knob: old registry only establishes its literal route/upstream mapping.

### V2: interleaved function deltas must not merge or duplicate

Responses native synthetic events, in order (each array entry one event):
```json
[{"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_a","call_id":"call_a","name":"echo","arguments":""}},{"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc_b","call_id":"call_b","name":"echo","arguments":""}},{"type":"response.function_call_arguments.delta","item_id":"fc_a","output_index":0,"delta":"{\"s\":"},{"type":"response.function_call_arguments.delta","item_id":"fc_b","output_index":1,"delta":"{\"s\":\"y\"}"},{"type":"response.function_call_arguments.delta","item_id":"fc_a","output_index":0,"delta":"\"x\"}"},{"type":"response.output_item.done","output_index":0,"item":{"type":"function_call","id":"fc_a","call_id":"call_a","name":"echo","arguments":"{\"s\":\"x\"}"}},{"type":"response.completed","response":{"status":"completed","usage":{"input_tokens":60,"input_tokens_details":{"cached_tokens":20},"output_tokens":7,"output_tokens_details":{"reasoning_tokens":3},"total_tokens":67}}}]
```
Expected Chat deltas (wrap each in stable Chat chunk envelope, choice index 0):
```json
[{"tool_calls":[{"index":0,"id":"call_a","type":"function","function":{"name":"echo","arguments":""}}]},{"tool_calls":[{"index":1,"id":"call_b","type":"function","function":{"name":"echo","arguments":""}}]},{"tool_calls":[{"index":0,"function":{"arguments":"{\"s\":"}}]},{"tool_calls":[{"index":1,"function":{"arguments":"{\"s\":\"y\"}"}}]},{"tool_calls":[{"index":0,"function":{"arguments":"\"x\"}"}}]}]
```
No arguments emitted for done snapshot. Expected final choice
`{"index":0,"delta":{},"finish_reason":"tool_calls"}`, usage
`{"prompt_tokens":60,"completion_tokens":7,"total_tokens":67,"prompt_tokens_details":{"cached_tokens":20},"completion_tokens_details":{"reasoning_tokens":3}}`,
then DONE **after** native terminal/finalizer/authorization. Add B's done event and
full terminal response envelope for SDK Responses-helper acceptance; this compact
vector specifies the correlator transform, not a complete native SDK transcript.

### V3: Messages tools/usage + native terminals

Synthetic Messages event sequence:
```json
[{"type":"message_start","message":{"id":"msg_fixture","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":10,"cache_read_input_tokens":20,"cache_creation_input_tokens":30,"output_tokens":0}}},{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call_a","name":"echo","input":{}}},{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"s\":"}},{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\"x\"}"}},{"type":"content_block_stop","index":0},{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":7}},{"type":"message_stop"}]
```
Expected Chat tool-open + two argument fragments at index 0, `tool_calls` finish,
prompt=60/completion=7/total=67; details cached=20/cache_creation=30. Do not reset
input/cache when the final delta contains output only. Reverse transform restores
Messages input=10, not 60. No Chat success before message_stop. Native Claude
pass-through preserves this named stream and adds **no DONE**.

### V4: mandatory negative/edge variants (synthetic)

- Replace completed with `{"type":"response.failed","response":{"status":"failed","error":{"code":"fixture_failure","message":"DO_NOT_LEAK"}}}`:
  safe failure, never content=`[Error]...`/stop/DONE. Same for Messages error event.
- `{"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"}}}`:
  fail under current policy; do not relabel completed. Unknown stop/type, missing
  terminal, malformed final arguments, unknown item_id, repeated/conflicting call
  id, argument delta before open: reject; no invented repair.
- Finish chunk followed by `choices:[]` usage before DONE: retain usage. Split
  UTF-8/CRLF, fragment inside escaped JSON string, empty `{}` args, nonempty initial
  tool input, two same-name parallel tools, done-only args, duplicate done: exact
  ids/content once. Bound event/total/tool state independent of chunk grouping.
- Text/thinking/text block sequence: reasoning goes only to reasoning field;
  preserve native signature_delta unchanged on native cc path. An opaque-replay
  requirement with no unchanged-client return carrier is **unsupported**, not a
  synthetic signature. Tool result `is_error:true` is a tool outcome, not gateway
  failure; do not silently discard it across wires.
- Abort while read/finalizer held, post-finalizer revoke, no-next-pull cancel,
  nonstream/invalid JSON/queued response: no success bytes and no untracked work.

## At most two next implementation tickets (not tracker writes)

### 1. Bounded client codecs at the existing provider stream seam

**Scope:** Chat→cc Messages and Chat→cx Responses requests/history;
cc/Responses→Chat output; native cc pass-through. Add only bounded per-call maps
for blocks/items/tool fragments and held finish/usage. Keep codec state separate
from transport credentials/account and reuse `bounded-sse.ts`/providerResponse
lifetime/finalizer. Do not copy 9router's registry, fallback framework, decoy
identity, repair helpers or generic provider router. If extracting substantial
MIT source, retain `N:LICENSE:1–21` attribution.

**Reuse:** Python OpenAI/Anthropic SDKs already solve their own SSE parsing,
objects, partial JSON and native response assembly; Hermes already contains
`anthropic_message_convert.py:144–164` and `codex_responses_adapter.py:404–420,569–732`
for client-side request conversion and native adapters
(`auxiliary_client.py:1704–1824`). They do **not** translate an unchanged custom
Chat request in the TS gateway; switching clients to them changes the requirement.
No OpenAI/Anthropic server-codec dependency is declared in `S:package.json` or
`apps/stellarc-gateway/package.json`. Effect SSE is already integrated; no new SSE
parser or SDK install is justified. Native→native requires **no content codec**.

**Done after builder recovery:** V1–V4 fixtures through unchanged installed Python
Chat SDK and Hermes main/aux accumulators, including second tool turn and explicit
continuity disposition; strict compile and full gates on frozen source, no provider
traffic. Fail-closed unsupported content/effort/choice/replay has explicit errors.
Do not mark aliases usable until ticket 2 supplies transport + consumer boundary.

### 2. Consumer ingress/catalog + pinned cx/cc account transport

**Scope:** authenticated compatibility Chat/Messages paths, exact aliases/catalog,
and only the pinned transport transforms above. Resolve per-org credential→account
server-side; account/session state is request-local, refresh concurrency belongs
to that account. Keep ingress credential separate from upstream OAuth. Preserve
all authority, admission, bounds, abort and durable finish hooks; no loosening of
generic URL policy or caller header passthrough. Unknown strategy/provider/account
is unavailable. No count_tokens, compact, GraphQL, hosted search auto-injection,
usage hub or native Codex ingress inferred from names. Other favorites remain
explicit migration blockers until their existing strategy/transport is recovered.

**Acceptance harness — execute ONLY after supervisor recovers builder:**

1. Reconcile R3/R4 exact snapshot/jobs/receipts first, resolve deterministic hang,
   then freeze source under the existing serialized builder gate. Copy SDK/source
   versions into an isolated fixture environment; never import runtime credential
   resolution or write client settings. Temporary fixture-only clients use dummy
   Stellarc credentials; no old gateway/provider network access or refresh.
2. Loopback upstream sockets emit V1–V4; a request sink asserts actual method/path,
   content-type/auth **names and dummy bindings**, transformed body, selected
   account and cancellation. Use two dummy accounts with interleaved requests to
   expose shared session/header leakage. Refuse absent/mismatched account binding,
   redirects, expiry and client-supplied account/URL/credential fields. Stub refresh
   failure/serialization without contacting token endpoints.
3. Unchanged `openai.OpenAI(base_url=<fixture>/v1)` Chat streaming and Hermes
   main/aux paths must assemble tool ids/names/arguments/reasoning/usage exactly;
   close SDK stream while upstream is held and prove fetch abort + one terminal
   bookkeeping result. SDK's acceptance of EOF/default stop is not sufficient.
4. `anthropic.Anthropic(auth_token=<dummy>,base_url=<fixture root>)` exercises
   native Messages create/stream/get_final_message using version 0.87.0. Separately
   run the **installed Claude Code client** with process-local fixture settings
   matching recorded safe model/base metadata, no persistent settings writes or
   fallback internet access. Capture its real request path and Bearer/header
   names (never real header values); test its three configured cc models. This
   closes the `/v1` join ambiguity; Python alone cannot. T3 favorites are tested
   through their Hermes route identities, not by spoofing T3 as an OpenAI client.
5. Catalog fixtures assert every visible literal favorite/direct configured cc/cx
   id, correct known limits, no one-model fallback to unrelated alias, no upstream
   discovery, no org leakage and no false capability advertisement. Exercise
   default opus/fallback free selection only after actual strategy metadata is
   available; otherwise record blocked, not pass.
6. **Nonstream remains disabled now:** assert `stream:false` or omitted is denied
   before admission and seam returns provider_json_disabled. Then implement its
   separate authorization/budget/complete-envelope/finalization contract before
   claiming unchanged Hermes parity: plain Chat .create and auxiliary fallback
   must return choices[0].message/tool_calls/usage; upstream cc/cx may still stream
   internally, bounded aggregation waits for native terminal. No successful `{}`,
   queued/in_progress or partial tool args. The stream-only milestone cannot
   clear migration, and do not enable nonstream merely for this test.
7. Run full repository lint/typecheck/build plus focused codec/SDK/PG/socket gates,
   with receipts bound to final bytes; supervisor council reviews exact output.
   Real provider permission, private credential provisioning/canary, user-visible
   T3/Claude migration and rollback are later separately authorized gates.

**Open, specifically:** effective live alias strategy/caps; exact Claude CLI
wire/path; permitted subscription identity behavior; credential refresh lifecycle;
opaque reasoning replay on unchanged Chat; all non-cx/cc favorite transports;
R3/R4 final runtime gates and nonstream lifecycle. None is silently resolved by
this report. Supervisor retains paused LLM gates; no substitute compute used.
