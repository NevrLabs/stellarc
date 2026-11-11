# Stellarc lifecycle council — R8 (cross-model semantic review of the LLM gateway lifecycle repair)

Lane: GLM review sub-agent, Terminus supervisor cross-model council. Shared worktree
`spike/auth-llmgw-maple` @ `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`. Owns ONLY this
report. No edits/tests/build/tsc/formatter/network/builder/DB/service/provider
calls/secrets/deploy/commit/push/subagents/polling were performed. Skills loaded:
`code-review`, `stellarc-architecture`.

## Verdict

**Source verdict for the llmgw repair: PASS.** The repaired lifecycle in
`apps/llmgw/src/provider-routing.ts` (`52d4a919…`) / `provider-routing-check.ts`
(`fa6dd032…`) is race-correct under the traced invariants, and the claimed regression
coverage exists semantically in the check source (not just in hashed logs). No
high/blocking source defect found. Two narrow scope/proof gaps and one explicit
remaining-integration gate are recorded as findings F1–F3 below (none is a source
defect). Host restricted-PG stream/HTTP, 30-second deadline/shutdown/drain, host
artifact/assets and full-repository acceptance remain **pending parent**, exactly as
`stellarc-llm-redgreen-r6.md:134` declares — this review does not clear them.

Historical record discipline: **full2's `seam.exit=124` timeout cause remains
UNPROVEN.** Original unchanged module/check bytes now pass (48 checks, natural exit)
and the synthetic held-hook probe (`probe-held`, exit 1) proves only that a held
underlying `cancel()` can block the original terminal path — not that full2's
string/fetch bodies held cancellation. R4's await-`reader.cancel()` hypothesis
(`stellarc-llm-council-r4.md:79`) stays retired as history. This council does not
resurrect it and adds no new historical claim.

## Frozen inputs (verified by sha256 at review time, before writing this report)

| File | SHA-256 | Matches |
|---|---|---|
| `apps/llmgw/src/provider-routing.ts` | `52d4a919f2e9cacf305789a5a917c371c01071ad81f2bf4c202e74939822837e` | r6 final table |
| `apps/llmgw/src/provider-routing-check.ts` | `fa6dd0320c2cf6ead424eeb02313fa08c815d3beb343569c7e6cf4282075d13e` | r6 final table |
| `apps/llmgw/src/bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` | r6 + R4 council (unchanged) |
| `apps/llmgw/src/bounded-sse-check.ts` | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` | r6 + R4 council (unchanged) |
| `apps/stellarc-gateway/src/main.ts` (adjacent host, read-only) | `023fcd2be11932d6502891adf2b575379dc7fadd68cb572c55ebf56cf88490df` | current tree |
| `apps/stellarc-gateway/src/stream-check.ts` (adjacent host, read-only) | `48e12b867d27052f182edd2755eab34f63d20a5b48daefccc6c2a6daa1b444d2` | app-split-r5 table (unchanged since split) |

Approval-lane drift record (NOT reviewed this lane): `apps/toolgw/src/tool-approval.ts`
= `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7` and
`apps/toolgw/src/tool-approval-check.ts` =
`f4cfdd47e4452f6686d12f78567e92097a4401c65ab483334b087efd37051324` — these equal
r6's "Current handoff" column byte-for-byte (`stellarc-llm-redgreen-r6.md:128-129`).
So the GLM approval r7 lane has introduced **no new drift beyond what r6 already
recorded** as of this freeze. The llmgw module/check/helper import graph does not
reach either file (verified: `provider-routing.ts:1` imports only `./bounded-sse`).
This review is not blocked by, and does not review, those moving r7 bytes.

Check-count cross-check (semantic, not hash-only): 48 original checks + 8
lifecycle modes + 4 finalizer modes + 5 real-fetch modes = **65**, matching the
verify4 seam/artifact-check claim (`stellarc-llm-redgreen-r6.md:73,80`); the bounds
child is 4 lengths × 3 widths × 2 shapes (24) + 3 wires × 2 widths (6) + 1
BOM/CRLF/`\r\r` wire = **31**, matching `bounded-sse-check.ts:65`.

## Semantic review (race correctness and proof scope)

### 1. Memoized bounded cleanup (100 ms grace) — correct; grace is legitimate vs lingering fetch IO

`provider-routing.ts:216-236`. One memoized `cleaning` promise is shared by
interruption (via `settle`), terminal (`provider-routing.ts:340`), failure
(`provider-routing.ts:355`) and consumer cancellation (`provider-routing.ts:366`) —
no duplicate cancel/release races. Sequence: `reader.cancel()` with a rejection
handler attached at creation (`:221`), await `reader.closed` (`:222`), await the
in-flight `reading` promise (`:223`), `Promise.race` against a 100 ms timer
(`:226-231`), then `clearTimeout` + `releaseLock` in `finally` (`:232-235`) — the
lock is released even if the hook promise later rejects.

Legitimacy of the bounded grace: per the streams contract, cancel() closes the
stream and settles `reader.closed` and pending reads **immediately**; only the
returned promise tracks the underlying source's cancel algorithm. So after the
grace the reader is closed and the lock released; the only thing left hanging is
the source-owned hook promise, which has a catch attached from creation (no
unhandled rejection) — exactly the "cannot forcibly complete arbitrary
source-owned background work" boundary r6 states (`stellarc-llm-redgreen-r6.md:62`).
This is NOT lingering fetch IO: the check proves the real transport closes
independently of hook settlement — the loopback fixture server's `cancel()` callback
is observed before the persistence barrier releases in finalizer mode
(`provider-routing-check.ts:493-500`) and within every settle mode
(`provider-routing-check.ts:508`), and the real host additionally binds the fetch to
the abort signal (`main.ts:499`). `reader.releaseLock()` while the cancel promise
pends is legal on a closed stream.

### 2. reader.closed / pending-read join — correct, with one recorded interface invariant (finding F2)

Join order is right: closed first, then the pending read (`:222-223`), and the
`within()` 1000 ms deadline in every check mode is comfortably above the 100 ms
grace. `reading` is registered at `provider-routing.ts:262` and cleared at `:264`;
pull is the only caller and the streams machinery does not re-enter `pull`
concurrently (its promise is pending), so registration is single-flight.

One window traced: cleanup snapshots `reading` once at start (`:223`). If a `read()`
call is parked between `await control.authorize()` (`:260`/`:265`) and the
assignment at `:262` when cleanup starts, that read escapes the join. Today this is
unreachable-with-harm because every cleanup path that can run concurrently with a
live pull either already aborted `control.signal` (interrupt `:253-257`, pull-catch
`:352-354`, consumer-cancel `:363-366` → host `abort: () => abort.abort()`,
`main.ts:536`) — so the parked read resumes into `throwIfAborted` (`:261`/`:266`)
and never reaches `reader.read()` — or is the terminal path inside pull's own frame
(`:340`, no concurrent read). Even if a future host passed an `abort` that does not
abort the signal, the worst case is a `TypeError` on a released reader caught by the
pull catch with durable outcome already memoized. This is an implicit interface
invariant ("`control.abort()` must abort `control.signal`"), not a defect — F2.

### 3. Late-rejecting / unresolved cancel hook — covered

Reject-at-cancel (`reject` mode), rejection after settlement and grace
(`late-reject`, hook rejected post-assertions with a macrotask tick,
`provider-routing-check.ts:317-320`), and never-settling hook (`cancel`/`terminal`
modes hold `heldCancel` until fixture teardown, `:235`, `:333`) all assert:
settlement within deadline, lock released, exactly one upstream cancel, exactly one
`settled`, first-choice outcome (`:308-325`). No unhandled rejection is possible
from the module side (catch attached at `:221`).

### 4. Cancellation started before track registration — covered both levels

Pre-aborted signal at call time: `provider-routing.ts:256-257` (listener added, then
`aborted` checked) with check mode `preaborted` (`provider-routing-check.ts:269`).
Host level: `controllers.add(abort)` happens at `main.ts:202` before any stream
work, with already-aborted re-checks at `main.ts:205`, `:443-444` and `:528-531`;
shutdown aborts every tracked controller first (`main.ts:611`). The abort listener
`{ once: true }` + removal in `notify` (`:240`) leaves no listener leak.

### 5. Exactly-once settled — verified at both module and host

Module: `notified` flag (`provider-routing.ts:213`, `:237-242`) makes `settled`
fire once across every combination, including terminal-path racing interrupt — the
finalizer-`abort` mode exercises double settlement pressure and asserts
`settlements === 1` (`provider-routing-check.ts:386-393`). Host: `settled: release`
(`main.ts:537`) plus the `released` guard (`main.ts:207-215`); pre-reader throws
(non-ok / content-type / json-disabled at `provider-routing.ts:180-206`) never call
`settled` and are covered by the host's `if (!transferred) release()`
(`main.ts:602-604`) with outcome recorded through the Effect catch
(`main.ts:552-558`).

### 6. Finish-first abort path vs terminal cleanup-first — ordering verified

Terminal: cleanup (I/O stopped) → awaited durable `finish("completed")` → fresh
authorization → abort check → synchronous enqueue/close/notify
(`provider-routing.ts:338-349`); no await between the final checks and delivery.
Transport-cancel-before-persistence is asserted on the real fetch path
(`provider-routing-check.ts:493-500`), and the host socket check proves zero
terminal bytes escape a held finisher over a real socket with post-finish
revocation withholding `[DONE]` (`stream-check.ts:285-335`).
Abort during finish: `interrupted` → `settle(finish("cancelled"))` but `finish` is
first-choice memoized (`provider-routing.ts:214-215` + host memoization
`main.ts:221-243`), so both callers await the same durable promise; terminal bytes
are withheld while the durable outcome stays the first choice
(`provider-routing-check.ts:342-409`, `stream-check.ts:478-507`). Late
abort/revocation withholds terminal bytes without rewriting a durable completed
choice (`provider-routing-check.ts:568-591`).

### 7. Fresh authorize / no abandoned authority during shutdown — verified

Read cadence is exactly the architecture-required one: authorize + throwIfAborted
before the read, re-authorize + throwIfAborted after the pending read, before
releasing bytes (`provider-routing.ts:259-266`); terminal re-authorize before
enqueue (`:343-344`); post-read revocation withholds bytes
(`provider-routing-check.ts:647-658`; host pending-read revocation stops output
with no replay, `stream-check.ts:132-159`). Host `authorize` registers the promise
in `authorities` in the same synchronous block (`main.ts:466-471`) — never
abandoned — and dispose joins authorities (`main.ts:613`) before draining
finalizers (`:616`) and closing both pools (`:622-623`). The module's `settle`
observes durable failure while cleanup is in flight (`void completion.catch`,
`provider-routing.ts:245`) so a fast persistence failure cannot become an unhandled
rejection during the 100 ms grace.

### 8. Whole event / chunk cap invariants — verified (unchanged bytes, re-derived independently)

`bounded-sse.ts` bounds the **whole event wire state** (fields, comments, colons,
internal line terminators — `size` accumulates all chars and +1 per internal
newline, resetting only at a blank line, `bounded-sse.ts:32-41`), counted in UTF-16
units, segmentation-invariant by per-code-point iteration (`:22-30`), with BOM
skipped only at stream start (`:23-26`), CRLF pairs consumed together even split
across feeds and lone CR a terminator (`:27-35`), plus a dispatched-parsed-data cap
(`:15`) and the installed parser's own pending cap (`:43`). The module adds the
16 MiB cumulative body cap counted before bytes are released
(`provider-routing.ts:267-268`). Executed boundaries: 65,536 accepted vs 65,537
rejected with zero dispatch across 4 lengths × 3 widths × 2 shapes
(`bounded-sse-check.ts:5-33`), comment/event-field-only oversized wires (`:34-52`),
BOM+CRLF+`\r\r` wire (`:53-65`), 70k complete events chunk-independent at module
(`provider-routing-check.ts:538-567`) and host (`stream-check.ts:170-189`), a
65,537-unit single-line event (`provider-routing-check.ts:646`), and a 257 × ~65.5k
comment stream that is per-event legal but breaches the 16 MiB total cap
(`provider-routing-check.ts:659-673`).

### 9. Host control.stop / transport closure / drain — traced robust (execution remains a parent gate)

`main.ts` stop path: SIGTERM/SIGINT → `server.stop(true)` (force-closes the actual
listening transport, `main.ts:646-650`) → `dispose()` in fixed order: `stopping`
gate → abort all tracked controllers → join handler promises → join authority
promises → `auth.drain()` → `mcp.dispose()` → join finalizers (durable terminal
writes) → runtime dispose → both pools end (`main.ts:609-625`). The 30 s production
deadline (`main.ts:206`) interrupts the actual body reader through the module's
cleanup (reader.cancel on the real fetch body), not just a controller flag, and the
host check exercises the real 30 s deadline to a settled `cancelled` outcome with
exactly one `call.cancelled` audit row (`stream-check.ts:522-565`). Shutdown drains
a held terminal audit and persists late-admission cancellation before pool close
(`stream-check.ts:566-656`). Interface compatibility of these host checks with the
repaired module bytes is established by trace here; their execution against
`52d4a919…`/`fa6dd032…` is finding F3.

## Findings (≤4; class: source defect vs scope gap)

**F1 — scope gap (low; explicit remaining proof). Unguarded `settle` on the
downstream consumer-cancel path.** `provider-routing.ts:366` — `await
settle(completion)` inside the response stream's `cancel()` is the only settle call
site without a `.catch` (compare `:254` and `:355`). If the durable
`finish("cancelled")` rejects during a consumer-initiated cancel, the rejection
propagates as a rejected stream-cancel promise to whoever canceled the body — in the
host that is runtime-internal cancel on client disconnect, whose observation of that
rejection is unproven, and no check covers consumer-cancel + failing finish. Not an
established source defect (propagating persistence failure to the canceler is a
defensible semantic; the module itself cannot produce an unhandled rejection from
`:221`/`:245`). Minimum fix: one regression case (cancel-mode variant with a
rejecting `finish`, asserting either an observable cancel rejection or a clean
settle with a process-level unhandled-rejection trap), plus one line in the host
wiring contract stating cancel-path terminal failure surfaces only via the
`finalizers` shutdown log (`main.ts:616-620`).

**F2 — interface invariant, non-blocking (record; no code change required).**
The pending-read join is snapshot-based (`provider-routing.ts:223`) and is safe only
under the implicit invariant that `control.abort()` aborts `control.signal`
(satisfied by `main.ts:536`). A control implementation that aborts nothing opens a
narrow window where cleanup releases the reader while a parked `read()` has not yet
called `reader.read()` (`:260-266`); the consequence is bounded (TypeError caught by
the pull catch; durable outcome already memoized; stream already canceled).
Minimum fix: one source comment at `:216` naming the invariant, and one line in the
host integration obligations. No behavior change.

**F3 — remaining integration proof (blocking only for acceptance, not for the
source verdict).** Every host-level lifecycle proof (`stream-check.ts`,
`http-check.ts` slow-body, restricted-PG, host artifact/assets, full-repo
lint/typecheck/build) predates the repaired module bytes; verify4 executed the
module seam only. This review traced `main.ts`/`stream-check.ts` interface
compatibility with the repair (settled=release coverage of pre-reader throws,
control.abort wiring, authorities/finalizers drain, socket-level terminal
withholding) and found no seam mismatch, but trace is not execution. Minimum fix:
parent runs the existing host checks + full-repo gates against the frozen
`52d4a919…`/`fa6dd032…` bytes under the ordered lock discipline, then mints the
integrated snapshot after the approval lane lands.

## Approval F1–F3 closure (interface semantics only; host unintegrated)

The production-fix approval findings are defined and repaired in
`stellarc-approval-redgreen-r6.md:80-94`: **F1** commit-refusal sentinel (`{refused:
Denied}` returned after commit, Denied thrown after commit, covering expired +
claim-denied), **F2** proof-first recovery (conditional `UPDATE … RETURNING` before
audit append, same transaction), **F3** owner validation before the idempotent
no-op (`claimed_by === worker`). Regression closure 20/20 groups green is recorded
there (`:96-99`); this council did not re-review those bytes (they are the moving
GLM r7 lane; current hashes recorded above equal r6's handoff values — no new
drift).

Closure statement limited to interface semantics: all three fixes are internal to
the tool-approval store/module contract (`decide`/`claim`/`report`/`recover`); the
temporary host imports only `mcpGateway` from toolgw (`main.ts:9`) and
`tool-approval.ts` is not reachable from any host route (consistent with
`stellarc-app-split-council-r5.md:62` — tool-approval remains unwired outside its
checks, and `gw_tool_approval` is applied by no owner CLI). Therefore F1–F3 closure
is **seam-level only**: it changes no host, auth, LLM or audit-runtime behavior, and
the approval integration HOLD (executor dispatch, tx-scoped recheck seam,
authentication of callers) remains open with its owning lane. No runtime clearance
is claimed or implied.

## Remaining acceptance (unchanged, parent-owned)

- Host restricted-PG stream/HTTP, 30 s deadline/shutdown/drain execution against the
  repaired bytes (F3).
- Host artifact/assets and full-repository lint/typecheck/build (frozen-manifest
  discipline; approval-lane bytes to be re-frozen after r7 lands).
- Upstream status/retry fidelity (LLM F1), OAuth/translation/catalog parity (B5),
  approval integration HOLD — unchanged owners, unchanged status.
- Historical full2 root cause stays open/unproven; preserve `seam124`/`gate141`
  receipts as-is.
