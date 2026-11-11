# LLM replacement lane — R1

## Result and scope

**Handoff: bounded direct-provider seam exercised on final source. Final 35-check fixture, strict TypeScript, Bun build and Biome gates PASS; no live-provider or integrated replacement claim.**

Implemented a bounded **direct-provider request/response seam**, not a deployed replacement. Only the new `apps/stellarc-gateway/src/provider-routing.ts`, `provider-routing-check.ts`, and this report belong to this lane. Main/store/auth/manifests/locks were not edited. No inference, quota request, credential migration, live write, restart, deployment, commit, push or agent delegation was performed.

The current main single-route parser remains unchanged and does **not** use these functions. This slice does not require 9router in its code path, but the existing application still does not replace 9router end-to-end.

## Read-only discovery: exact evidence

Checkout: `spike/auth-llmgw-maple`, HEAD `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`, origin `https://github.com/NevrLabs/stellarc.git`. Existing dirty work included gateway/spike files and unrelated web/lock changes; it was preserved.

`systemctl show 9router.service -p FragmentPath -p WorkingDirectory -p MainPID -p ActiveState` established the active **system** unit `/etc/systemd/system/9router.service`, active PID `3132034`, directory `/home/rpw/.local/share/9router-v0.5.112-sol-context-staged`. ExecStart uses Node v24.15.0 and that directory's `custom-server.js`. Deployed package is 0.5.112; `.next/BUILD_ID` is `t0f9pbNdubZ77YOgSxpAo`.

Verified source on fxbuilder: `/home/rpw/src/9router-local`, clean status at discovery, commit `3cf2973d4366d5b75805c798e19140321c62a407`. Its `custom-server.js` hash matches the deployed file. This is **not** a proof that every bundled serving byte equals that checkout; the full compiled-to-source lineage remains open.

SHA-256 evidence:

| File | Hash |
|---|---|
| deployed/source `custom-server.js` | `c3b4f23acd30384d814ac16f729cc956db717a342abc68a74153f87bbe45ff3f` |
| deployed `package.json` | `765f303a617cf9554ed8be1279daca1968d1775f6944af7094a0b495dafe149d` |
| source `src/app/api/v1/chat/completions/route.js` | `1ad8cb10de0da68e7c1146385dd6c7a1a5611957e4f9e9b011f687dfeb3c6ebf` |
| source `src/app/api/v1/messages/route.js` | `e2c345c56bf9869222d2ba8fd41e2de72cb405e24966869568ec498a79e16d74` |
| source `src/app/api/v1/responses/route.js` | `57dad78737bb3b6ce7598f926a9d4c14a0c9a35806a8e495e614793b3e3f322b` |
| source `src/sse/handlers/chat.js` | `e4230784b5f13a20a6393923d50891bdff20bd7e219b99fb657053a8d1d34f78` |
| source `src/app/api/v1/models/route.js` | `95b0bc0bea5f3f3c4407b9ddc06662df992c7b0128986c4e90a07075eed149ba` |
| source `open-sse/translator/formats.js` | `b4c19ebca578c553da8403c4a1743f8c201d3b932da9ce5758bf16eb05b26a09` |
| source `open-sse/executors/default.js` | `4aa1d6500595a9ae419a283b614dcf8015d9bff86d771a9d193aa00e6af5a7a1` |
| source `open-sse/executors/codex.js` | `1c9cfbece8e29bb3921a232a9b3d84cb55c2b3a24ebddf76feba3db4dbf43298` |
| source `open-sse/translator/response/openai-responses.js` | `c94f22d0fef2ecc8b255ea1aa27f3b825dfd8e7a8821905bff37b35218974177` |

Only allow-listed metadata was selected from local client config and the read-only SQLite URI `file:/home/rpw/.9router/db/data.sqlite?mode=ro`. No credential columns/data blobs, conversation logs, user prompts or tool payloads were selected. No `/v1/models` request was issued because source shows dynamic catalog discovery can contact providers.

### Actual required client surface

- Local Claude settings point at `http://127.0.0.1:20128/v1`, with models `cc/claude-opus-5-5`, `cc/claude-sonnet-5`, `cc/claude-haiku-4-5-20251001`; the auth setting's **name** is `ANTHROPIC_AUTH_TOKEN` (value never inspected/output). Thus native Messages compatibility is required, not hypothetical.
- Hermes config metadata includes the 9router loopback base, auxiliary aliases `glm`, `gpt`, `gpt-mini`; its current top-level default is direct `zai` / `glm-5.3` at `https://api.z.ai/api/coding/paas/v4`. This does not prove every Hermes call uses 9router.
- T3 `/home/rpw/.t3/userdata/settings.json` favorites are Hermes custom routes for `opus`, `glm`, `gpt`, `gpt-mini`, `fable`, `deriver`, `glm-flash`, `deepseek`, `generic`, `smart`, `free`; default `opus`, fallback `free`. These are configured selections, not usage-history claims. Current task runtime explicitly identifies `custom:9router:gpt`.
- Local Codex config has no top-level model/provider or model_providers entries. Native Codex→9router usage is **not established**; do not claim it is configured.
- Hermes source `/home/rpw/.hermes/hermes-agent`, commit `bf0203a794a07aac3ff764972ab9087baa4e4f4e`, `agent/auxiliary_client.py:7120,7126,7138` calls `.chat.completions.create()` in both streaming and non-streaming paths. `:5422` documents native Responses/Anthropic adapters behind this facade. `agent/model_metadata.py:1570-1587` consumes `/v1/models`, `data[].id`, context metadata. Hashes: auxiliary `053078416f2b2d94256584a5c1ed6176bfbd3f3de88a8ca858e8257274a04bb5`; model metadata `497f2342915b0c7f23e56c2ec7e191a122d6255a6d12e660e570a4013895ab3d`.
- Ingress auth differs: `src/sse/services/auth.js:353-358` extracts Bearer or Anthropic `x-api-key`; Stellarc `main.ts:139-142` currently accepts only a 43-character Bearer gateway credential, and `:349-352` exposes only `/orgs/:org/v1/chat/completions`. Native `/v1/*` paths and Claude's header require deliberate secure adaptation, not shared-key reuse or trusting caller tenant headers.
- All three 9router POST route files delegate to `handleChat`. `open-sse/translator/formats.js:25-38` selects Responses/Messages by endpoint, not merely body shape. `src/sse/handlers/chat.js:95-116` gates keys before combo expansion and selects fallback/fusion strategies; `:345` supplies endpoint-derived source format. Replacement cannot silently reduce every alias to a single OpenAI stream.
- `src/app/api/v1/models/route.js:400-424` publishes aliases and context metadata, including explicit combo caps. Those caps are configured claims, not measured provider maxima.
- `open-sse/executors/codex.js:220-249` has account-bound OAuth headers/refresh; `:464,472` forces stream and `store=false`; `:534-557` strips unsupported body fields. Native Responses protocol support alone does **not** implement Codex subscription transport.

### Active provider/auth and alias disposition

Read-only `SELECT provider,authType,isActive FROM providerConnections WHERE isActive=1` found LLM providers `codex/oauth`, `opencode-go/apikey`, `glm/apikey`, `antigravity/oauth`, `groq/apikey`, two `claude/oauth` connections, `anthropic/apikey`. Also configured: firecrawl, tavily, exa, jina-ai and fish-audio (tool/audio lanes; not implemented here). Enabled configuration is not proof of recent use.

| Alias | Configured members | R1 disposition |
|---|---|---|
| glm | glm/glm-5.3 | Direct native Chat seam is a candidate; no credentials loaded/live proof |
| gpt | cx/gpt-6.1-sol | OAuth + Chat↔Responses translation remain required |
| gpt-mini | cx/gpt-6-luna[1m] | Same; preserve literal `[1m]` token |
| fable | cc/claude-fable-5-1 | Claude OAuth + Chat↔Messages translation open |
| opus | cc/claude-opus-5-5 | Same; direct API-key Messages is not subscription parity |
| deriver | glm/glm-5.3-flash; ocg/deepseek-v4-flash; cx/gpt-6-luna[1m]; ocg/gpt-6-luna | Multi-provider selection/fallback open |
| glm-flash | glm/glm-5.3-flash | Native Chat candidate, capability/catalog validation open |
| deepseek | ocg/deepseek-v4-flash-vision-exp | OpenCode Go transport/permissions open |
| generic | ag/gemini-3.8-flash; cx/gpt-6-luna; glm/glm-5.3-flash; cc/claude-sonnet-5 | Mixed native wire/strategy parity open |
| smart | cc/claude-fable-5-1; cx/gpt-6.1-sol; glm/glm-5.3 | Strategy semantics open; no autonomous council inference added |
| free | oc/muse-spark-1.3-contributor-free; oc/deepseek-v4-flash-free | Resolve `oc` provider/auth path; not in enabled connection query |

No subscription-forwarding permission is inferred from technical source compatibility.

## Implemented contract

`validateRoutes(unknown)` rejects malformed/oversized/duplicate config, unknown fields (including inline secret fields), non-HTTPS endpoints, URL credentials/query/fragment, protocol/path mismatches and inconsistent alias catalog metadata. Routes are immutable, at most 64; upstream models and public aliases remain literal. Server config—not requests—owns endpoints and credential handles. HTTPS is not an egress/IP allowlist: supervisor must supply trusted admin-owned routes. The bounded consistency scan is O(n²) over at most 64 routes; no database/config service was added.

`prepareProviderRequest()` selects an exact alias+native protocol for only `/v1/chat/completions`, `/v1/messages`, `/v1/responses`; validates envelope/stream flag, replaces model without mutating the caller body, retains opaque tool/usage/provider fields, obtains a secret by server callback, and constructs only content/accept/auth headers. Messages uses API-key header and pinned version `2023-06-01`; Chat/Responses use Bearer. It returns `redirect: "error"` for integration; it does not perform network I/O. No implicit fallback, OAuth, cross-wire translation or client auth/header passthrough.

`providerResponse()` accepts JSON or SSE only as requested. JSON remains bounded; SSE uses installed Effect 4.1.2 parser with 65,536-code-unit pending event and 16 MiB raw response ceilings. It preserves JSON payloads (including usage/tool deltas) and protocol event names, handles split UTF-8/CRLF frames, requires native completion (`[DONE]`, `message_stop`, `response.completed`), rejects malformed/error/incomplete/mismatched events and unsafe event-name characters (prevents SSE line injection), and cancels upstream readers. It never appends OpenAI `[DONE]` to Anthropic/Responses. Errors are constant safe reasons; only bounded numeric Retry-After is surfaced, never upstream error bodies/cookies. Authorization callback runs around reads and before SSE delivery; abort cancels a held reader.

No claimed schema-perfect provider response validation, usage aggregation, billing estimate, durable finalization, retries or SDK/client end-to-end compatibility. The authorize callback must itself be bounded/cancellable by its owner; this module does not race or interrupt an arbitrary callback promise. Empty/minimal JSON objects are not a proof of semantically valid provider completions. Payload bodies remain in memory only, no logging. A terminal and trailing event in one parsed chunk is rejected; bytes arriving after native terminal cancellation are deliberately not drained. There is no protocol resumption/replay support (`id:`/`retry:` are not propagated).

## Execution and receipts

All builds/tests ran on **fxbuilder**, in lane-private `fxrun` roots, under `flock -w 600 ~/.cache/stellarc-authgw-gate.lock`. No sync was made into the supervisor full-v9 tree. Existing installed dependencies were referenced read-only from the supervisor workspace's node_modules (no install or dependency edits). Bun 1.4.0.

1. RED snapshot `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-red-b51affd7e89f78f4`: runnable contract check before module existed; fails `Cannot find module './provider-routing'`. Check hash `6f43a97e228da44be8554256e14fc5a0ba947b4623ef7b9d37323ead124db26a`. Process receipt `proc_ed8276c9ac0d`.
2. Green1 snapshot `.../stellarc-llm-r1-green1-70b2a7f662b3ea4d`: 31 fixture contract checks passed; explicit typecheck caught the return body's inferred narrow type. Corrected with `Record<string, unknown>`; do not treat this round as a full pass.
3. Green2 snapshot `.../stellarc-llm-r1-green2-e14b02e7094627a1`: 34 fixture checks + strict typecheck + Bun build passed; Biome caught import order/useless escape. Fixed in final snapshot; earlier lint result remains failed.
4. Final snapshot `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-final-4986b5b94c914c50`, gate script `gate.sh`: formats only private files, mutates native Messages terminal recognition to an impossible event, runs check RED (`exit=1`, `provider_incomplete`), restores source, then runs GREEN. Mutation log `red-native-terminal.log` is preserved there and pulled locally. This proves the same wire check detects a Chat-only completion assumption, not merely a missing import.

Final commands (inside private snapshot while lock held):

```sh
bun provider-routing-check.ts
node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types bun provider-routing.ts provider-routing-check.ts
bun build provider-routing.ts --target bun --outdir dist
node_modules/.bin/biome check provider-routing.ts provider-routing-check.ts
```

Final mutation receipt `proc_61f06ba8d6c8` completed: `PASS provider-routing: 34 contract checks; fixture HTTP only; no inference`, `TYPECHECK_PASS`, Bun bundled 154 modules (54.97 KB), Biome `Checked 2 files ... No fixes applied`, `GATE_PASS`. The following intermediate formatted bytes passed before the subsequent SSE event-name injection guard:

- Intermediate `provider-routing.ts`: `73c28868d6a53e65d16da0d46af9afa90669885c1dd4c69854d3bdf0a665bc1e`
- Intermediate `provider-routing-check.ts`: `35eed7db7231b5ac941f78d8902f6e1b71a90edeb8607ddf7991c5fc50fbdf17` (one comment clarified synthetic authorization evidence after the mutation round).
- Local private receipt/runner root: `/home/rpw/.hermes/cache/scratch/stellarc-llm-r1-final/` (including `gate.sh`, `red-native-terminal.log`). Remote artifact: final snapshot `dist/provider-routing.js`.

Intermediate source re-verification: `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-verified-6fc13da4275021d9`, receipt `proc_484c62e9498b`: 34 checks, `TYPECHECK_PASS`, 154-module Bun build, Biome clean, `GATE_PASS`. Both intermediate hashes above match that output. Final SSE injection regression and guard were subsequently added; the final gate is separate below.

Full-repository gates are supervisor-owned and were not claimed by this standalone module run. Wire fixtures use a real loopback HTTP server for protocol cases and a deterministic in-memory pending reader for abort; the post-read authorization rejection is a synthetic callback, not a PostgreSQL membership/revocation race proof. No provider credentials or externally billed calls were used. The plan fixtures contain public API URLs but do not fetch them; the only fixture HTTP fetches target `127.0.0.1` on an ephemeral test port.

### Final wire-safety delta

Review found that rendering unbounded `value.type` into an SSE `event:` line could introduce a newline when the upstream omitted its explicit event field. Added a negative wire regression first, then restricted Messages/Responses event type to a bounded safe token. Private RED-before-GREEN snapshot: `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-wire-safety-c9914bedb7489208` (receipt `proc_016a6e1c72ca`). Final source hashes: module `307a715bdc4974a537740c2505e340df6449c690de34bbb4b212884e7c0cec45`, check `ecd355da21a675b1d3edfc16e52ff07c89b11c3258ff927054d51b8eb71dedec`. **Final verification PASS after transport recovery.** The first attempts lost SSH (`Bad packet length` / `Connection corrupted`); read-only retries initially timed out through both configured aliases. On explicit continuation, reconciliation recovered the TLS-validation RED log, confirmed restored source hashes and no running lane processes, and established the wire-safety gate had not started. No source was resynced into a running snapshot.

Resumed the existing private `gate.sh` under the same `~/.cache/stellarc-authgw-gate.lock`. Receipt `proc_97faef38f5ea` exited **0**. Exact target readback `resumed-receipt.log` proves:

- RED before the event-name guard: `Missing expected rejection (ProviderRoutingError)`, exit 1.
- Restored final module/check hashes match this worktree: `307a715bdc4974a537740c2505e340df6449c690de34bbb4b212884e7c0cec45` / `ecd355da21a675b1d3edfc16e52ff07c89b11c3258ff927054d51b8eb71dedec`.
- GREEN: `PASS provider-routing: 35 contract checks; fixture HTTP only; no inference`.
- `TYPECHECK_PASS`; Bun bundled 154 modules in 388 ms, 55.0 KB; Biome `Checked 2 files ... No fixes applied`; `GATE_PASS`.
- Remote artifact `dist/provider-routing.js` SHA-256: `86ec05a063d1901d5190c05caf006c7ac905819029a83e72d88de4dce2bc044a`.
- Exact readback copied locally to `/home/rpw/.hermes/cache/scratch/stellarc-llm-r1-wire-safety/resumed-receipt.log`.

The separate TLS mutation snapshot `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-negative-7cbc879d65577d23` contains the expected RED `Missing expected exception` after removing HTTPS validation; its source was restored. Its interrupted outer run did not supply a GREEN receipt and is not used as final acceptance. The final source's negative configuration checks pass in the 35-check gate above.

Transport failure did not justify lock bypass, local builds, service restarts or provider calls. Full integrated replacement, deployment and live acceptance remain open as listed below.

## Minimal next integration and remaining gates

1. Supervisor/council review this seam, then wire the smallest **direct GLM API-key Chat** route behind existing authorization/admission/finalization. Keep live disabled by default; no fallback to 9router masquerading as replacement. Resolve configured credentials privately by handle, apply plan.redirect and signal to actual fetch, authorize before fetch, preserve ingress bounds/deadline. `providerResponse` owns only its reader, not fetch cancellation, run finalization, tenant model visibility or shutdown tracking.
2. Integrate per-org alias visibility and authorized `/v1/models`; reconcile caps from actual provider evidence. Main currently supports only streamed calls and rewrites every terminal as OpenAI SSE; do not plug native Messages/Responses into that parser unchanged. Non-streaming needs separate accepted action/budget/finalization treatment.
3. Preserve durable terminal audit **before terminal bytes are released**. Current seam has no finish hook; supervisor must add or compose it explicitly. Keep revocation check after awaited finalization. Test disconnect, deadline, audit failure, shutdown and held-finalizer races with the integrated store/socket path.
4. Implement/prove required Chat↔Messages and Chat↔Codex Responses tool-call/usage conversions; OAuth account binding/refresh and provider permission gates; Claude API-key identity/beta stripping must be reconciled against existing source patches. Native API-key pass-through here is deliberately not those adapters.
5. Recover alias strategy/settings metadata selectively, full serving source identity, OpenCode/antigravity transport and unknown `oc` mapping. Prove configured favorites and fallbacks through real clients. Add only required extra APIs (Claude count_tokens/Responses compact/usage hub are not established by this lane).
6. Re-run full repository gates in a frozen integrated tree, independent council review, then separately authorize live-provider canaries and a reversible client migration. Replacement/retirement remains HOLD.
