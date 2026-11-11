# LLM hang bisect and lifecycle R6

## Result

**Executed RED → GREEN lifecycle repair; original full2 timeout cause remains unproven.** Current original module/check bytes complete naturally on the recovered builder (48 checks). Real string, single-fetch and split-fetch terminal probes also pass unchanged. Therefore R4's claim that string/fetch cancellation explains full2's hang is not established and must not be treated as the diagnosis of that historical run.

A real `ReadableStream` with a held underlying `cancel()` promise deterministically blocks the original terminal path before `finish`. Regression-first execution also found duplicate `settled` callbacks, no-pull reader-lock retention, and missed already-aborted signals. These defects are fixed and executed GREEN on the exact current owned sources. **This is seam acceptance, not host/PG/shutdown/full-repository or replacement approval.**

Only `apps/llmgw/src/provider-routing.ts`, `provider-routing-check.ts`, this report and private scratch were edited. No bounded-SSE, core, approval, host, manifest or service changes. No installs, credentials, provider calls/inference, PG, deployment, restarts, resource changes, pruning, delegation, commit or push.

## Investigation and observed RED

Read full council R4, blocked R5, integration R3, extraction R4, app-split council R5, builder-root R5, current module/check/helper, host lifecycle callbacks, manifests and historical runner/probe. Loaded systematic-debugging, TDD, Effect-v4/Bun and fxbuilder-offload skills.

Read-only historical reconciliation confirmed full2's `seam.exit=124`, `gate.exit=141`, one seam PASS line, exact original module/check hashes, and no process CWD under that historical workspace. Nothing in full2 was resumed or changed.

Private local evidence: `/home/rpw/.hermes/cache/scratch/stellarc-llm-r6/`.

### Original-byte bisect

Builder snapshot: `/mnt/deepvault/stellarc-llm-r6-bisect3-540e6fbb1bde`.
Source archive SHA-256: `540e6fbb1bde6592bea62c3c94dc32a77894f3a3fa1ad35e12482014a1e21bde`.

| Child | Actual exit | Observation |
|---|---:|---|
| resolve | 0 | Effect 4.1.2, jose 6.2.12, Better Auth 1.6.25 resolved from exact source parents |
| probe-string | 0 | cancel settled, lock released, finish and terminal delivered |
| probe-fetch | 0 | real loopback fetch; same ordering |
| probe-split | 0 | real byte-written loopback fetch; same ordering |
| probe-held | **1** | 1-second assertion: stuck after `cancel.begin, source.cancel`, before release/finish |
| probe-reject | 0 | rejecting cancel observed, no leak/unhandled rejection |
| original-seam | **0** | original current check: 48 checks, natural process exit |

Held probe releases its fixture barrier in `finally`, drains the reading promise, and exits naturally with assertion failure—not outer timeout. Logs show release/finish **after** the failure deadline because fixture teardown releases the held hook; that teardown is not a pass. No `process.exit` was added.

### Regression before production edit

Snapshot `/mnt/deepvault/stellarc-llm-r6-red1-006f42ede43c`, archive `006f42ede43cdd5a63d7acd8cbd02d26738c7a3b618be18c4e8922b211868726`.
Original production module unchanged; expanded check executed with `seam.exit=1`.

Collected exact failures (not abort-on-first-failure):
- terminal: `stalled: terminal` while underlying cancellation held;
- consumer cancel / pending read: `settled once`, actual 2 versus expected 1;
- no-pull abort / deadline: reader still locked at settlement;
- preaborted: `stalled: preaborted`;
- finalizer revocation / abort / failure: actual 2 settlement callbacks versus 1.

Rejecting cancellation and successful held finalization already passed. Failure ledger preserved in local `red1-log.txt` and remote `seam.log`. Original full2 receipts remain historical, not superseded into a fictional GREEN.

## Minimal production repair

`apps/llmgw/src/provider-routing.ts:208-269`:

- Memoize one cleanup promise shared by interruption, terminal, failure and consumer cancellation.
- Invoke reader cancellation promptly. Await actual reader closure and any in-flight read **before** releasing its lock.
- Give the underlying cancellation hook a bounded **100 ms grace period**, clear the timer, then release the reader. Observe its promise rejection from creation, including rejection after the grace period. An uncooperative source hook cannot own durable settlement indefinitely.
- Keep cleanup joined to settlement rather than detaching it. Notify `settled` once, after cleanup and the memoized durable finish promise; remove the abort listener once. Observe durable promise failure while cleanup is in flight.
- Handle a signal already aborted at registration. Keep independent no-pull abort settlement and the host's existing finalizer/authority ownership unchanged.

`provider-routing.ts:338-366` retains successful ordering: cleanup → durable completed finish → fresh authorization → abort check → synchronous enqueue/close. First-choice finish is still memoized; a late abort/revocation withholds terminal bytes without rewriting a durable completed choice. Authorizations are not raced/abandoned; their host-owned bounds/tracking are untouched.

The cancellation hook itself may remain unresolved after the grace period; this is explicitly not a claim that arbitrary source-owned background work can be forcibly completed. The reader has closed, pending reads have settled, and the bounded cleanup owner has released the lock before reporting settlement. Late rejection remains observed. No new detached I/O/finalizer worker is introduced.

## Final executed GREEN

Exact frozen builder snapshot:
`/mnt/deepvault/stellarc-llm-r6-verify4-5d0d8d1b105d`.

| Phase / child receipt | Exit | Actual result |
|---|---:|---|
| resolve | 0 | strict source-parent resolution; installed donor only |
| format | 0 | only the two owned files; final run made no changes |
| seam | 0 | **65 contract checks**; real streams and loopback HTTP |
| probe-string / fetch / split / held / reject | 0 each | exact original bisect now GREEN; held hook remains pending until fixture teardown |
| bounds | 0 | **31 exact-boundary/pending/CRLF checks**, helper unchanged |
| tool-version | 0 | Node v22.23.1; Bun resolution receipt reports 1.4.0 |
| strict | 0 | strict no-emit TypeScript over module/check/helper/helper-check; empty diagnostic log |
| biome | 0 | `Checked 2 files ... No fixes applied.` **No warnings or errors** |
| artifact | 0 | bundled module and check, Bun target |
| artifact-check | 0 | bundled executable check: **65 checks**, natural exit |
| gate | 0 | phase aggregate and final source-integrity check complete |

Regression matrix includes held/immediately rejecting/late-rejecting cancellation, no-pull consumer cancel/abort/deadline, already-aborted signals, genuinely pending read cancellation, held successful/failing finalizers, abort/revocation during finalization, first-choice outcome and exactly-once callbacks. Native string bodies cover finalizer ordering. Real loopback fetch bodies cover no-pull cancel/abort/deadline, pending read and finalizer revocation; the pending-fetch test instruments the real reader without replacing its reads, waits for the second actual read, then aborts. Real server cancel callbacks confirm upstream transport cancellation, including before releasing the persistence barrier. Existing all-protocol/limits/malformed/error/JSON-disabled checks run unchanged after the new cases.

### Exact source/artifact identity

Final shared local owned bytes were compared with the remote post-format manifest: both match exactly. The frozen 33-file snapshot is intact remotely. At the first local readback all 31 nonowned inputs matched the initial freeze; final handoff then detected concurrent approval-lane changes to `apps/toolgw/src/tool-approval.ts` and `tool-approval-check.ts` (see below). The other 29 nonowned local inputs still match accepted snapshot hashes. LLM module/check/helper imports do not reach either approval file; these are not claims that the full shared tree has one accepted identity.

| File | SHA-256 |
|---|---|
| `apps/llmgw/src/provider-routing.ts` | `52d4a919f2e9cacf305789a5a917c371c01071ad81f2bf4c202e74939822837e` |
| `apps/llmgw/src/provider-routing-check.ts` | `fa6dd0320c2cf6ead424eeb02313fa08c815d3beb343569c7e6cf4282075d13e` |
| unchanged `bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| unchanged `bounded-sse-check.ts` | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` |
| `artifact/provider-routing.js` | `96d80cd984509eaa30cbaf3b996afcbdfaf224c18385c46143aba83897ba4211` |
| `artifact/provider-routing-check.js` | `3b8d09d405d97da1c4867263ffa3d9d88717d690f536357164abf2240841198e` |

Snapshot handle files under that remote directory:
- `source.tar`: `5d0d8d1b105d71f6c068d06108923ac12c56ab461c6cba1868a7be873b2f214e`;
- `verified-manifest.json` (33 exact inputs): `f9b98cf8209a2063db4e244f1c8005f5cb511de8a42c0bc52482a03fbeb500bc`;
- `artifact-manifest.json`: `8ce2f41f28588bca395e17bfa1790b47ef7385cad0518ab02a5065e7d528131f`;
- frozen `gate.py`: `3df8a07c48caf35c7a216c946c1280dfea6761f66d8107512585d7706e8aa60d`;
- `seam.log` and `artifact-check.log`: `d9ac165e8b9e50f997563beba64561d08638eeb5bcc063dff5875e4a4f216c27`;
- `strict.log`: empty SHA `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, backed by strict exit 0.

Local `formatted-verified-manifest.json`, `verify4-manifest.json`, `verify4-launch.log`, `closure4.txt` and `historical.txt` retain final identity, all individual child exits, receipt hashes, process/lock closure and historical comparison. Archive includes the private bisect probe. Exact accepted runnable source command in snapshot: `bun apps/llmgw/src/provider-routing-check.ts`; accepted bundled check: `bun ../artifact/provider-routing-check.js` from its `source/` directory. Run only under the same ordered locks and capacity guard.

## Execution discipline, harness failures and closure

All actual checks ran on authenticated `fxbuilder`/`fxcompute-01`, serially. Every runner acquired `~/.cache/stellarc-authgw-gate.lock` **then** `/home/rpw/ws/gate.lock`, each bounded to 120 seconds (within requested 600-second ceiling). Lock descriptors were noninheritable and closed in every test child. No lock was held during edits/thinking. Source-only tar streamed to DeepVault; extraction and dependency overlays under lock; no RAM tree/install/credential transfer. Existing donor `/home/rpw/.local/share/stellarc-gates/full-v9` remained read-only, workspace links remapped to current snapshot.

Before every child, guard required root available >=4 GiB, MemAvailable >=2 GiB, memory PSI some/full avg10 <1.0. Actual execution used outer 30 seconds for narrow probes and 120 seconds for seam/compiler/artifact. Each child got a separate process group and immediate exit receipt. No R6 command hit its outer timeout, so no process-group kill was needed. SSH stayed foreground to collect completion; the runner itself was `setsid`, stdin closed, with all output durably redirected before execution. No SSH polling, duplicate runner, background poller, parallel-heavy test or old-runner resumption.

Harness failures retained, not mislabeled product RED:
- bisect1: builder's Python lacks `tarfile.extractall(filter=...)`; gate 1, no child check. Replaced with explicit safe regular-member/path validation before extraction in a newly named runner/snapshot.
- bisect2: exact core-source resolution failed for jose (resolve 1), because the existing donor exposes jose under the old host package, not root. Added a **private overlay link** from root to the already-installed pinned host jose; donor/manifests unchanged. Parent should reconcile normal moved-core dependency resolution separately; no manifest change was authorized here.
- verify1: Biome launcher exit 127, `/usr/bin/env: node: No such file or directory`; corrected the runner PATH to the existing explicit Node v22.23.1 toolchain. No install.
- verify2: behavior/compiler/artifact passed, Biome exit 0 with four new non-null warnings. Warnings were fixed in owned tests; verify3 then warning-clean. verify4 strengthens the real-fetch pending-read barrier and is the final authority, not a retry-until-green of an unexplained failure.

At independent final readback: all 33 source hashes verified, no process CWD in any R6 run workspace, both locks acquired nonblocking in the required order and closed. No owned fixture/server/runner remains. Final root available **5,072,674,816 bytes**, MemAvailable **4,226,465,792 bytes**, memory PSI some/full avg10 **0.00/0.00**. Local `git diff --check` passes. Pre-existing shared dirty/untracked work remains; no broad staging or source mutation outside ownership occurred.

## Remaining acceptance / supervisor handoff

Final local drift ledger (concurrent GLM-owned approval changes; not edited or executed by this lane):

| File | Frozen verify4 SHA-256 | Current handoff SHA-256 |
|---|---|---|
| `apps/toolgw/src/tool-approval.ts` | `9927bbf59b9c178998f7e57f4e25edda750d366d60513e50bf37e6692bdf9629` | `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7` |
| `apps/toolgw/src/tool-approval-check.ts` | `e14504b6cf70f53af508428c01253a9ff122dae87f9aa5c908b843dc603f171f` | `f4cfdd47e4452f6686d12f78567e92097a4401c65ab483334b087efd37051324` |

Parent must mint its integrated snapshot after both lanes finish. No full gate was run against these new approval bytes. The private Python runner's OS exit is not the aggregate authority (caught errors write `gate.exit`); read the explicit individual `.exit` and `gate.exit` receipts, including the preserved setup failures. Final verify4 has all of those at zero.

- Historical full2's actual runtime cause is still unresolved: unchanged bytes passed now, and the held-hook defect is not proof that historical string/fetch bodies held cancellation. Preserve seam124/gate141 rather than claiming retrospective root cause.
- Host restricted-PG stream/HTTP, 30-second production deadline/shutdown/drain, host artifact/assets and full-repository lint/typecheck/build remain supervisor gates. No full-lifecycle acceptance follows from this seam matrix.
- Upstream status/retry fidelity F1, OAuth/translation/catalog/unchanged-client parity, approval defects and release HOLD remain with their existing owners. No live-enablement or replacement recommendation.
