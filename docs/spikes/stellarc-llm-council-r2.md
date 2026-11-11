# LLM council R2 — independent review and exact-source verification

## Decision

**Standalone final-source verification PASS. Integration/replacement remains HOLD.** The exact local seam passed its 35-check fixture, strict TypeScript, Bun build and Biome on fxbuilder. Three separate deliberately broken copies failed for the intended assertions. Those receipts do not clear the five implementation/acceptance blockers below.

This is the independent GPT review lane under the Terminus supervisor. Owned changes: this report and private harness files only. No product source edits, supervisor-tree synchronization, dependency installation/editing, provider or credential reads, live inference, service/configuration/deployment/restart, commit/push or subagent work occurred. Other remote-MCP and audit-retention workers' files were not modified.

Read fully: `stellarc-replacement-map.md`, `stellarc-llm-replacement-r1.md`, `provider-routing.ts`, `provider-routing-check.ts`, adjacent `main.ts`, `store.ts` and `stream-check.ts`; manifests and the installed Effect SSE implementation were also inspected. Main/store findings below are source review, not a newly executed PostgreSQL/socket proof.

## Exact evidence and recovery reconciliation

Review checkout: `/home/rpw/.t3/worktrees/stellarc/spike-auth-llmgw-maple`, branch `spike/auth-llmgw-maple`. Pre-existing web/lock and gateway/spike work was preserved.

| Source | SHA-256 at final local readback |
|---|---|
| `apps/stellarc-gateway/src/provider-routing.ts` | `307a715bdc4974a537740c2505e340df6449c690de34bbb4b212884e7c0cec45` |
| `apps/stellarc-gateway/src/provider-routing-check.ts` | `ecd355da21a675b1d3edfc16e52ff07c89b11c3258ff927054d51b8eb71dedec` |
| `apps/stellarc-gateway/src/main.ts` | `5a0c017f87b3768269babb95616efab4bb14420586aafdba1f8006e33a194794` |
| `apps/stellarc-gateway/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `docs/spikes/stellarc-replacement-map.md` | `aac12f4a15ec4fbcad7f4b1225d8f47144acb4f7dfb827a766ebe0922e5e041f` |
| `docs/spikes/stellarc-llm-replacement-r1.md` | `f10d037bc47e9ca81912abbb7da27d9ca78fe0d8d6f02433636e19d5fbcc1db0` |

The task brief accurately warned against trusting the interrupted snapshot. At **this lane's subsequent read**, `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-r1-wire-safety-c9914bedb7489208` had already advanced: both final source hashes matched, `green.ts` no longer existed there, no matching `/proc` cwd process was found, and `resumed-receipt.log` contained the expected injection RED followed by 35 checks, typecheck, build, Biome and `GATE_PASS`. Its inspected `gate.sh` unconditionally creates a node_modules symlink, expects RED, then moves green.ts; it is **not idempotent and was not rerun**. The old source/logs were left untouched. The surviving local private `green.ts` hashes to the final module above.

Preserved reconciliation: `/home/rpw/.hermes/cache/scratch/stellarc-llm-council-r2/inspection.log` includes old file hashes, recovered receipt, dependency identities and the installed parser source. Historical receipt SHA-256: `015a2b93a573ae4641186dc341cd32670e93698d7da92dff35b4652791bf82c9`; historical RED log SHA-256: `5b566010a33da76b651ad7bd45f691c61066737082a76b550d04b22cda28db58`. These were reconciliation only, not substituted for this lane's independent run.

### Independent frozen snapshot and executed receipts

Remote: `/home/rpw/.cache/fxrun/workspaces/stellarc-llm-council-r2-307a715b-c813588a`.

Local harness/readback: `/home/rpw/.hermes/cache/scratch/stellarc-llm-council-r2/` (`gate.sh`, `probes.ts`, `gate.log`, `receipts/*.log`, `receipts/*.exit`, `inspection.log`, `validate-receipts.py`, `remote-path.txt`). All execution used `flock -w 600 ~/.cache/stellarc-authgw-gate.lock`; commands were individually time-bounded. Only the final module/check and private harness were copied into this new directory. GREEN source was never overwritten; each mutant lives in its own subdirectory.

Read-only donor: `/home/rpw/.local/share/stellarc-gates/full-v9/node_modules`. Only external dependencies resolve there; no supervisor workspace source is imported by these two standalone files. No install or donor writes. Verified versions: Bun **1.4.0**, Effect **4.1.2**, TypeScript **5.8.3**, Biome **2.4.6**, `@types/bun` **1.3.10**.

| Receipt | Actual command/result | `.exit` |
|---|---|---|
| `identity` | Assert both expected source hashes and dependency paths | 0 |
| `runtime` | `bun --version` → `1.4.0` | 0 |
| `contracts` | `bun provider-routing-check.ts` → `PASS provider-routing: 35 contract checks; fixture HTTP only; no inference` | 0 |
| `strict` | `node_modules/.bin/tsc --noEmit --strict --skipLibCheck --target ES2022 --module ESNext --moduleResolution Bundler --types bun provider-routing.ts provider-routing-check.ts` | 0 |
| `build` | `bun build provider-routing.ts --target bun --outdir dist` → 154 modules, 55.43 KB, 566 ms | 0 |
| `biome` | `node_modules/.bin/biome check provider-routing.ts provider-routing-check.ts` → `Checked 2 files in 158ms. No fixes applied.` | 0 |
| `probes` | `bun probes.ts` → bounded synthetic observations described below; `PROBES_PASS` | 0 |
| `mutations` | Independently run three negative copies; require exit 1 and the intended failure text, not an arbitrary error | 0 |
| `final_identity` | Read back both source hashes plus newly built artifact | 0 |
| `gate` | `GATE_PASS`, runner exit 0, durable `receipts/gate.exit` | 0 |

Mutation receipts (negative exits are **expected**, not GREEN):

- `event-injection.exit=1`: remove only the safe event-name regex; `Missing expected rejection`. Mutated module `73c28868d6a53e65d16da0d46af9afa90669885c1dd4c69854d3bdf0a665bc1e`.
- `messages-terminal.exit=1`: replace Messages `message_stop` recognition with an impossible name; `provider_incomplete`. Mutated module `b1b241c591d1c7c22f78914efc55ee4b5a4116f2c7ac06fdf10e6851f4496e8b`.
- `tls.exit=1`: disable only the HTTPS predicate; `Missing expected exception`. Mutated module `5f451c1cd134f1067b66c06d0d36c2098e42eedf447de857e48bd2f3c7e5465b`.

Readback `gate.log` SHA-256: `adb62cff8d073f95c8032ec6425e465d50ad3cf6a23366b264bea36d560c9f30`. New `dist/provider-routing.js`: `4201c97b87a349237796eb622e33fb2f0bf4f4589b27462ab91f30b785352713`. It is a new artifact with full-v9 dependencies; do not relabel it as R1's artifact. Harness `gate.sh`: `ef0ef8299ae0750f98bcb4d409b315c4e0e2c81ff909d003b995b6c4d8d349f3`; `probes.ts`: `5521c89ab37c81dbd3012f39c5e42b27a316fe13522e98f796734c0dece6571d`.

The local validator verified the exact named phase set, unique markers, all required zero receipts, all three intended RED assertions and receipt hash; result `VERIFIED_STANDALONE_ONLY`. Final local module/check hashes still match the remote frozen snapshot. No transport failure occurred in this independent run. Full-repository lint/typecheck/build, integrated PG/socket regressions, actual SDK acceptance and live-provider canaries were **not executed or claimed** by this lane.

## Prioritized council blockers — five, all open

### 1. P0 integration: native success is emitted without durable run completion

`provider-routing.ts:171,246,264-300,317-321` has no finish hook. JSON returns its whole successful body; SSE enqueues native terminal bytes after reader cleanup and authorization alone. Directly returning this Response, or marking completed after an outer consumer observes EOF, publishes success before durable audit. Main's existing `finish` helper (`main.ts:215-237`) and `store.finish` two-transaction decision/audit protocol (`store.ts:383-426`) are the correct existing boundary to reuse, not bypass. An outer stream byte scanner would duplicate parsing and invite another native-protocol bug.

**Minimum correction:** add an awaited terminal/finalization control hook inside the existing parser release boundary (or an equivalent structured internal callback before rendering is handed out). Await it once before terminal-containing output; for JSON before returning the body. Also settle every admitted failure/cancel/no-consumption path through the same server-owned finish decision. Keep all success-bearing bytes from a terminal-containing parsed chunk buffered until finalization commits.

### 2. P1 integration: authority must be checked after finalization; cancellation must settle independently of pulls

Main currently authorizes before `await finish("completed")`, then checks only abort before enqueue (`main.ts:539-559`). Credential/permission revocation while that awaited finalizer is held can commit without aborting the request, yet terminal output can still be released. The seam's final authorization is correctly placed before enqueue today, but adding finish **after** it would recreate this gap. Its authorize promises are not interruptible (`provider-routing.ts:213,216,318`); cancellation only calls the reader's cancel. Private probe confirmed a held authorize remained unsettled after abort until the synthetic callback was released. This is an acknowledged caller-owned constraint, not evidence that abort is bounded.

**Minimum correction:** finalization → fresh `authorize(admit=false)` → abort check → enqueue, with no asynchronous gap after the final checks. Make authorization bounded/cancellable at its owner; an abandoned raced promise must not continue untracked against closed pools. Request abort, stream cancel, deadline and shutdown must abort fetch immediately and invoke settlement even when nobody pulls the response. Track the settlement in the existing finalizers set and keep shutdown pools alive through its completion. Never wait for durable cancellation before stopping upstream work.

### 3. P1 bounds: the advertised SSE event ceiling is chunk-dependent

`provider-routing.ts:313-314` relies on `Sse.makeParser({ maxEventSize: 65536 })`. Inspected Effect 4.1.2 checks `pendingLength + data.length` only **after** the whole feed; a blank line clears data and invokes the callback first. A complete oversized event therefore bypasses the cap. Private probe on exact final source accepted a JSON data event containing a 70,000-character padding field in one read, then rejected the **identical wire** split into 10,000-character reads with `provider_frame_limit`.

The 16 MiB raw-response cap still holds; this is not an unbounded-memory claim. It is a real missing 65,536-unit per-event invariant and permits unexpectedly large parse/render allocations before rejection. Main uses the same installed parser and pattern (`main.ts:465-508`), so the next owner must fix the shared class, not only this seam's fixture.

**Minimum correction:** enforce per-complete-event size before JSON parsing/rendering as well as pending state, at a layer that counts actual SSE event state independently of transport chunking. Add single-read, split-read and multiline boundary regressions; do not weaken the claim or just split input into arbitrary fixed-size feeds (a terminated oversized event can still evade an end-of-feed-only check).

### 4. P1 before enabling JSON: incomplete/non-completion JSON is accepted as success

`provider-routing.ts:239-246` checks object/error plus failed/incomplete status, not protocol completion. Private probes returned HTTP-200 bodies unchanged for Chat `{}`, Messages `{}`, Responses `{ "status": "queued" }` and `{ "status": "in_progress" }`. Wiring that return to `finish("completed")` would falsely settle asynchronous or malformed output as a completed inference. Existing fixtures only establish opaque-field preservation, not valid completions.

**Minimum correction:** keep non-streaming disabled for the first stream-only direct-GLM slice. Before enabling it, validate the minimum native success envelope/status for each supported protocol; explicitly reject/defer asynchronous Responses modes unless there is a separately designed lifecycle. Unknown nested tool/usage fields can remain opaque; a full provider schema reimplementation is unnecessary.

### 5. P1 replacement acceptance: native API-key seams do not cover configured clients/providers

`main.ts:139-142,349-352,415-419` still accepts only the org-prefixed Chat stream path and its existing Bearer credential contract; it does not import the seam. The R1 inventory establishes native Claude Messages plus Hermes Chat clients, OAuth-backed `cx`/`cc` aliases, mixed-wire combos and catalog expectations (`stellarc-llm-replacement-r1.md:37-67`). API-key Messages/Responses preservation does not implement Claude/Codex OAuth binding/refresh, Chat↔Messages/Responses tool-call and usage translation, or real favorite/fallback strategies. No actual Claude/Hermes/T3 SDK acceptance was executed here. Executor parity belongs to the separate remote-tool lane and is not inferred from any LLM result.

**Minimum correction:** integrate one explicit direct-GLM native Chat stream, still live-disabled, as an intermediate slice. Then implement the actually required auth/translation adapters and authorized catalogs; use unchanged real client libraries against local socket fixtures before permitted provider canaries. No retirement recommendation until the replacement map's end-to-end gates and reversible migration pass.

## Additional reviewed boundaries (not extra blockers)

- Error privacy: upstream non-2xx bodies/cookies are cancelled, never forwarded; Retry-After is numeric and bounded (`provider-routing.ts:173-195`). Parser failures are converted to safe reasons, with unknown stream errors masked. A `ProviderRoutingError` supplied by the authorization callback is trusted and preserved; the integration must use server-owned constant reasons. Catch preparation/fetch/credential-callback failures at ingress; never serialize an arbitrary thrown exception or credential resolver message.
- Egress: `validateRoutes` rejects HTTP, URL credentials, query/fragment and path mismatch, and request bodies cannot choose endpoint/credential handles. The probe confirmed `https://127.0.0.1/v1/chat/completions` passes validation **without fetching it**. This is expected under the documented trusted-admin-config prerequisite, not a proven caller SSRF exploit. The integration must keep routes trusted and enforce intended provider destinations (including private/loopback/link-local denial where config is less trusted); apply `redirect: "error"` on actual fetch so keys never follow redirects. HTTPS alone is not an IP/DNS egress policy.
- Total response bytes are bounded to 16 MiB, JSON decoding is fatal UTF-8, native terminal/error/mismatch paths are covered, split UTF-8/CRLF fixtures pass, and terminal/trailing parsed events in one chunk are rejected. Bytes after native-terminal cancellation are not drained; that is a stated scope, not a resumption guarantee.
- The contract check is not wired into the gateway package's current test script, and main does not import the seam. The next integration gate must explicitly include it; a main-only build cannot be treated as coverage for unused source.

## Exact minimum integration contract

Use the existing admission, request AbortController, `finish` promise and store recovery, not a new task framework. First ship **one Chat streaming direct-GLM route**, with all other new protocol/JSON routes disabled until their own acceptance passes.

1. **Before provider I/O:** authenticate the gateway credential; derive/bind org from current authority, never caller org/identity headers. Parse the existing bounded/deadlined body, select only org-visible server-owned alias/protocol/endpoint/secret handle, reject unsupported stream modes, then admit exactly once. Preserve server-generated request/run/trace attribution and delegation budgets. After any awaited admission/credential step, recheck abort and current authority before fetch. A validation failure after admission still settles the admitted run. Apply prepared headers/body, `redirect: "error"` and the same abort signal to fetch; do not forward caller auth/cookies/provider URLs.
2. **Nonterminal delivery:** authorize around awaited upstream reads and immediately before byte release; check abort after every awaited boundary. Keep the existing raw limit, fix the independent event cap, validate safe native event names, preserve tool/usage payloads, never invent a success terminator or usage/billing claim. Backpressure must not imply completion or release tracking while an admitted run remains active.
3. **Native terminal or validated synchronous JSON success:** buffer terminal-containing output; check authority/abort; invoke memoized `finish("completed")` and await its durable audit transaction; then perform **another** fresh non-admitting authorization, check abort and enqueue/return success with no subsequent await. A failed finish or failed post-finish authority check releases no terminal/JSON success. Native Chat `[DONE]`, Messages `message_stop`, and Responses `response.completed` remain distinct; do not route them through main's Chat-only rewriter.
4. **Failure/cancellation:** before a completion decision is selected, provider/network/parse/size/authorization errors select `failed`; disconnect, explicit consumer cancel, deadline and shutdown select `cancelled`. Abort actual fetch/reader promptly, even during finalization and with no pending pull. Select exactly one memoized outcome and await its bounded durable settlement; safe error/closed stream only, no synthesized terminal and no provider replay. If settlement fails, retain durable terminal intent/running row for existing recovery and block new admission per backlog rules. Never silently change the decision or refund/reconsume admission.
5. **Race semantics:** once `store.finish` has persisted `terminal_choice="completed"`, later cancellation or revocation cannot rewrite it to cancelled. Withhold delivery nonetheless. Here `completed` must mean provider execution completed and durable audit committed, **not** proof that the client received success. If product policy requires delivery evidence, model it separately later; do not lie by overwriting the existing first-choice recovery semantics. Before completion selection, cancellation wins. No external I/O or auth lock may be held across provider reads/finalization waits.
6. **Lifetime:** keep the run/controller/slot alive until terminal delivery, failure or cancellation is resolved; settle no-consumption responses via abort/deadline, not only `pull`/`cancel`. Register finalizers before teardown can observe completion; shutdown stops admission, aborts upstream work, drains in-flight admissions/handlers and all finalizers, then closes runtime/pools. Honor current database timeouts/retry bounds; callback cancellation must not strand untracked database work.

### Required next-slice proofs, in order

- Fix bounds with RED/GREEN for the exact same oversized wire in single/split chunks; do not alter this review snapshot.
- On the supervisor's next frozen integration tree, extend existing `stream-check.ts`/socket checks: held finish has zero terminal bytes; audit INSERT failure has zero success bytes and bounded retries; revoke credential/delegation/permission while finish is held; abort during finish; cancel with no further pull; fetch abort before/after headers; malformed/error/EOF paths; shutdown drains held finish and late admission; one terminal audit, no provider replay. Use real disposable PG roles plus an actual socket where byte-release assertions matter.
- Explicitly run the seam's 35-check suite, new regressions, strict compile, gateway artifact check and full-repository lint/typecheck/build. Then independent integration review, unchanged actual client-library fixtures and only separately authorized live canaries/migration. Current standalone receipts clear none of these unexecuted gates.

**Next owner:** supervisor/source-integration lane. **Next slice:** fix complete-event bounds and add the terminal finish hook plus post-finalization authorization for live-disabled direct-GLM streaming. OAuth/translation/client parity follows as required replacement work, not as a claim attached to this API-key seam.
