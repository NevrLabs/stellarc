# Stellarc tools replacement — council round 2 (hardening lane, GLM)

Independent council review + bounded hardening of the R1 remote-MCP slice.
Executed 2026-11-08 on worktree `spike/auth-llmgw-maple` by the review
sub-agent. Owned files (nothing else edited):
`apps/stellarc-gateway/src/remote-mcp.ts`,
`apps/stellarc-gateway/src/remote-mcp-check.ts`, this doc.

## Supervisor disposition after delayed handback

Final module/check hashes in §5 match the current worktree; supervisor read the
module and this report. The 17-stage GREEN is worker-reported intermediate-byte
evidence, not a final consolidated gate pass. Final strict typecheck, formatting
and runtime verification remain OPEN; alleged baseline errors are not waived.
No builder retry or execution of the old staged script is authorized by this
handback. Reconcile frozen source, runners and receipts before any eventual run;
do not automatically import formatter output over newer shared files.

The cause attribution in §3 ("starved or wedged") is unproven. Later management
inspection confirmed VM6970 running but SSH and guest agent unavailable; this
does not establish guest failure or authorize a bounce/resource change. Read
[management R2](stellarc-builder-management-r2.md) for the current blocker.

The §6 approval sketch predates the actual primitive: human acceptance transitions
`pending → approved`, then a separate atomic claim transitions
`approved → dispatching`. It is not a direct claim from `pending`. Council R2
found unresolved approval defects; [approval council R2](stellarc-tool-approval-council-r2.md)
and [regression R3](stellarc-tool-approval-regressions-r3.md) control that boundary.
This transport remains unintegrated and privileged external dispatch disabled.

## 1. Review verdict on R1

R1's custody architecture is sound and unchanged: endpoint + credential
headers are structurally server-owned (no caller parameter exists), the
Effect `McpClient.layerHttp` transport is reused (no hand-rolled protocol),
redirects are refused, and `maxMessageBytes` provably caps messages in BOTH
directions (verified in installed `effect@4.1.2` source:
`encodeMessage` checks outgoing JSON, `parseMessage` + `readBody`
`Stream.limitBytes` cap incoming JSON bodies, SSE `maxEventSize` caps events
— `dist/ai/McpClient.js:491-694,816-878`).

The R1 claim "`timeout` bounds initialize+discovery; per-call `timeout`
bounds every `callTool`" is confirmed by the installed source (layer
`timeout` wraps initialization and each complete discovery scan;
`callTool`/`getPrompt` have no deadline unless given one — R1 supplies it).

Five concrete defects found and fixed (all proven with the local fixture,
RED on the R1 module bytes, GREEN after the fix — receipts in §3):

| # | Finding | Disposition |
|---|---|---|
| F1 | **Raw upstream errors forwarded verbatim.** `Cause.squash` → `failure instanceof Error ? failure : …` rethrew `McpClientError`s whose messages embed remote-controlled body text (`HttpError.message` = `"MCP HTTP status <s>: " + <JSON-RPC error message from body>`; `ToolError.message` = remote tool text; `TransportError` carries fetch causes). Worse: on a failed layer build (first call to a dead/hostile remote) `ManagedRuntime.runPromise` REJECTS with the raw error and `.then(finish)` never ran — the sanitizer-free path R1 shipped. Proven: fixture 500 with `SECRET-MARKER-7f31c9` body reached the caller as `MCP HTTP request failed`/marker-bearing messages. | **Fixed.** All failures now map through `toDenied`: only this module's own `Denied` passes through; `TimeoutError`→`504 remote_timeout`, `HttpError`→`502 remote_http_status` (status digits only), `LimitError`→`502 remote_limit`, everything else →`502 remote_failure`. The rejection path gets the same mapping. Check asserts the marker never appears and the exact reason. |
| F2 | **Config bounds unvalidated.** `messageBytes: 0/NaN/1.5/2^53`, `timeoutMillis: 0/NaN`, `contentItems: -1/Infinity` were accepted at connect and surfaced later as opaque library `ConfigurationError`s at first I/O (or instant-timeout weirdness), never as a custody denial. | **Fixed.** `validateBounds` at connect: every bound must be a positive safe integer under explicit ceilings (messageBytes ≤ 16 MiB = the library's own default ceiling, contentItems ≤ 1000, contentChars ≤ 1e6, timeoutMillis ≤ 300 000). `Denied(400, "remote_bounds_invalid")` before any runtime exists. Ceiling-inclusive value still connects (boundary test). |
| F3 | **URL credentials/query/fragment accepted.** `https://user:pass@host/mcp` (fetch forwards basic auth from URL), `?token=…` (keys land in upstream logs), `#frag` all passed `loopbackHttp`. | **Fixed.** Non-empty `username`/`password`/`search`/`hash` → `Denied(400, "remote_url_denied")`. |
| F4 | **Header validation was an exact reserved-set check only.** `"mcp-custom"`/`"mcp-method"` (transport-owned family on the 2026-07-28 revision) passed; names with whitespace, empty names, and values with CR/LF/NUL (request-smuggling shape) passed; `"cookie "` was caught only by accident of `trim()`. | **Fixed.** Names must be RFC 9110 tokens (`^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$`), values must not contain CR/LF/NUL, and the entire `mcp-*` prefix is transport-owned. |
| F5 | **`listTools` aggregate unbounded by config.** Effect defaults (100 pages × 10 000 items) let a hostile remote pull up to 100 × `messageBytes` of metadata per discovery (time-bounded only by the layer timeout). | **Fixed.** Explicit tight `discoveryLimits: { maxPages: 25, maxItems: 1000 }` (ponytail: fixed values, no new config knobs). Fixture paging forever now fails fast with `remote_limit`. |

Additionally fixed by inspection (not externally reproducible — see §4):
**abort-vs-success ordering.** R1's `finish` checked `Exit.isSuccess`
before the aborted flag, so an abort landing between fiber completion and
the settlement microtask returned success bytes to a caller who had already
aborted. Now `signal?.aborted` is checked before BOTH the failure mapping
and the success return — abort always wins, matching the `mcp.ts`
`stellarc_status` precedent. The window is microtask-thin; the deterministic
adjacent cases (pre-aborted signal rejects before any I/O and no request
leaves the fixture; abort-during-hang returns `cancelled` < 1 s) are
regression-asserted.

Reviewed and rejected as non-bugs (do not "fix" these):
- `messageBytes` semantics — confirmed bidirectional by installed source;
  the R1 doc's claim stands.
- Reserved `accept`/`content-type` in config — the transport spreads its
  own values AFTER config headers, so config cannot override them.
- `dispose()` during an in-flight un-aborted call can reject that call's
  promise — caller contract (abort, then dispose), documented here, not
  code.

## 2. Ownership and boundary discipline

- Only the three owned files changed. `mcp.ts`/`store.ts`/`main.ts`/
  `auth.ts`/audit/manifests/lock/deployment untouched (other agents own
  them). No dependency, manifest or lock changes; no install (deps reused
  read-only); no production tool/provider calls; no live MCP endpoints; no
  commits, pushes or subagents.
- The gate snapshot is lane-private; the supervisor full-v9 donor tree was
  only read through the frozen R1 lane snapshot's `node_modules`.

## 3. Receipts (fxbuilder, serialized under `~/.cache/stellarc-authgw-gate.lock`)

Snapshot: `fxbuilder:~/.cache/fxrun/workspaces/spike-auth-llmgw-maple-r2-4c19e7ab`
(owned files copied; `node_modules` symlinked read-only to the frozen R1
lane snapshot `…-8365eef0cb0a8f89`, donor full-v9 untouched). Bun 1.4.0.

- **RED** (R1 module `95f2ce04…` + hardened check): `gate-r2-red.log` —
  check runs to `STAGE response bound` and fails with the RAW
  `MCP response exceeds maxMessageBytes` message forwarded verbatim
  (assertion demands `remote_limit`) — direct runtime proof of F1.
  `CHECK_EXIT=1`, `.exit-red=1`.
- **GREEN** (fixed module + check): `gate-r2-green2.log` — module
  `54f38cb9f6fb…dcaa3d8`, check `4cf6a645115c…f098c`; **all 17 stages
  pass**: connect / custody / call / describe / content bound / response
  bound / deadline / cancellation / pre-aborted signal / url custody /
  url credentials-query-fragment / header validation / bounds validation /
  redirect refusal / hostile error redaction / pagination bound.
  `REMOTE-MCP CHECK PASSED`, `CHECK_EXIT=0`, run 2026-11-08T16:41Z.
  Runtime deltas between those bytes and the final worktree bytes are
  zero: module differs only by `type` import modifier; check differs only
  by an explicit array type annotation restoring a loop header.
- **Static (partial, `gate-r2-static.log`)**: strict `tsc --noEmit` at repo
  root on the snapshot: 3 pre-existing `auth.ts` jose errors (the known
  R1 baseline) + 1 error in `main.ts` caused by the lean snapshot lacking
  `packages/telemetry` (present in the full worktree; the final script
  copies it in) + 1 error in my check file (TS2552, a patch slip) — the
  last two are fixed in the final worktree bytes. Biome flagged one
  `useImportType` in `remote-mcp.ts` (fixed in final bytes) and formatting
  diffs (pending the consolidated re-run).
- **BLOCKED — final consolidated run**: fxbuilder (fxcompute-01 over the
  dumbpipe iroh circuit) became unreachable mid-closeout (~14:40Z:
  dumbpipe dial succeeds, sshd never completes banner exchange — host
  starved or wedged; zephyr circuit unaffected). The prepared
  `r2-final.sh` (check + tsc + biome on the FINAL bytes, biome
  `--write`, exports formatted files back) is staged at
  `fxbuilder:/tmp/r2-final.sh` completes §3/§5, PRECEDED by one re-upload
  of the final check (`scp apps/stellarc-gateway/src/remote-mcp-check.ts
  fxbuilder:/tmp/r2-check.ts` — the staged copy predates the loop-restore
  fix; `/tmp/r2-module.ts` already holds final bytes). The supervisor owns
  the fxcluster lane and can bounce the host if needed.

## 4. Known limits of this slice (honest, not blockers)

- The abort-vs-success window fix is verified by inspection + adjacent
  deterministic regressions; no public-API test can deterministically land
  an abort in that microtask window.
- Effect's default fiber reporter prints unhandled layer-build failures
  (e.g. the redirect fixture) to stderr — log noise on failed connects, no
  exit-code or custody impact (probe exited 0).
- Remote transport remains a bounded client wrapper. Per the R1 inventory
  (8 Google OAuth + 1 Resend OpenAPI active, vantage MCP expired 401, zero
  GraphQL), **the next slice must be OpenAPI/OAuth credential custody +
  approval/policy, not more remote-MCP hardening.** Do not overbuild
  remote-only as an Executor replacement.

## 5. Final source hashes (worktree)

- `apps/stellarc-gateway/src/remote-mcp.ts` — `57ed8c8b00a0e093c7f836ca5ae4737c86fd2ab8f9dc98b4573ca0e04dad6c4b`
- `apps/stellarc-gateway/src/remote-mcp-check.ts` — `21111bdc4ab38e3382dc73404c5bde90581adfcab404f17e6a936156f7008166`
- `docs/spikes/stellarc-tools-council-r2.md` — recomputed at close-out.

GREEN-run snapshot hashes (pre-format bytes, runtime-identical): module
`54f38cb9f6fb85e9…2dcaa3d8`, check `4cf6a645115cad5f…f098c`. If the
consolidated re-run applies Biome formatting, the exported
`/tmp/r2-module-final.ts` / `/tmp/r2-check-final.ts` become canonical and
these two lines update accordingly (behavior-neutral diffs only).

## 6. Minimum next integration contract (supervisor-owned)

For the current server policy floor, in priority order (matches the actual
inventory, not the remote-MCP tail):

1. **Before-tool authorization (all transports)**: resolve policy for the
   (principal, org, integration, tool, effect-class) tuple BEFORE any
   upstream request; effect-class floor enforced outside any
   most-restrictive resolver (Executor lesson: a user match replaces the
   plugin default — the floor must not live in the resolver). Denials emit
   a denied-call audit event.
2. **Durable PG single-claim approval**: paused tool result + `executionId`
   + `accept|decline|cancel` resume; approval rows in PG with lease-length
   TTL (not Executor's 15 min), single-claim via atomic
   `UPDATE … WHERE state='pending'` consume (not get-then-delete), frozen
   server-built arguments so resume cannot widen the grant; late/second
   resume attempts get the settled outcome, never re-execute.
3. **Credential custody parity for OpenAPI/OAuth** (the 8 Google + Resend
   path): server-held encrypted credentials, injected at call time,
   per-identity connection/token refresh, callers never see values; OAuth
   refresh failure must surface as a bounded denial, not a raw provider
   error (same redaction contract as this slice).
4. **New privileged tools stay disabled**: any gateway meta-tools beyond
   the existing surface land registered-but-disabled until the approval
   queue and effect-class gate are live.
5. Only after 1–4: re-point `remote-mcp.ts` at a real remote endpoint
   (vantage needs its upstream credential fixed first — it 401s today).
