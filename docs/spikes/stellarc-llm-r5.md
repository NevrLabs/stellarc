# LLM implementation recovery R5

## Verdict

**BLOCKED before remote reconciliation or bisect. No production/check changes; no R5 test/build passes.** Both permitted SSH aliases failed during banner exchange. R4's awaited-cancel diagnosis remains a hypothesis, not an executed root-cause proof. Integration/replacement remains HOLD.

This lane wrote only this report in the repository and private R5 evidence files. No commit, push, delegation, deployment, restart, live inference, credential access or provider/IdP/CF/Maple/database changes. No remote runner, lock waiter, snapshot or container was launched by R5. Existing full2 and supervisor full-v9 were not modified.

## Context and local reconciliation

Loaded systematic-debugging, test-driven-development, effect-ts-v4-on-bun and terminus-fxbuilder-offload. Read the complete R4 council report, R3 integration report, current provider-routing/check, bounded-sse/check, main/stream/http, gateway/root manifests and the private R4 probe1.ts. Inspected the preserved full2 runner; it is starting harness material, not a successful gate.

Live local branch: `spike/auth-llmgw-maple`. Shared status remained: modified `apps/web/vite.config.ts`, `bun.lock`; untracked `apps/stellarc-gateway/`, `docs/spikes/`, `tools/spikes/`. These broad untracked directories are not lane-owned changes.

Programmatically verified all 11 source hashes below against the complete hashes in R3: every hash matched. This is local byte identity only, **not new verification of remote receipts or source**.

## Executed transport results

One bounded read-only reconciliation attempt per existing alias; no third attempt or alternate transport. Each used outer `timeout 35`, SSH `ConnectTimeout=8`, `ConnectionAttempts=1`. Sensitive `using secret key` banner lines were removed before tool output/evidence storage.

| Alias | SSH exit | Controlled remote output | Diagnostic |
|---|---:|---|---|
| `fxbuilder` | 255 | None | `Connection timed out during banner exchange`; `Connection to UNKNOWN port 65535 timed out` |
| `fxcompute-direct` | 255 | None | Same |

Receipt timestamp: `2026-11-08T16:57:37.378982+00:00` (UTC). Both calls returned in approximately eight seconds. Failed commands attempted hostname, full2 archive hashes/child exits/source-manifest verification, run-related process/container inventory and a nonblocking shared-lock probe. None produced a hostname or controlled marker, so **remote identity, surviving processes, containers, lock state and receipts were not reconciled in R5**. R4's earlier “nothing active” finding must not be promoted to current state.

Private evidence:

- `/home/rpw/.hermes/cache/scratch/stellarc-r5/transport-reconciliation.json` — exact bounded alias failures, status and timestamp; banner-free.
- `/home/rpw/.hermes/cache/scratch/stellarc-r5/final-source.sha256` — local final manifest below.

## Gate accounting

| Phase | R5 status |
|---|---|
| Remote reconciliation | BLOCKED by SSH banner timeout |
| Bounded bisect: string/fetch bodies and synthetic held cancel promise | NOT STARTED |
| RED/GREEN lifecycle regression | NOT STARTED; production intentionally unchanged |
| Helper, full seam, strict compilation | NOT STARTED |
| Actual restricted-PG stream/HTTP including deadline/fetch-abort/finalizer-revocation | NOT STARTED |
| Gateway artifact, full lint/typecheck/build | NOT STARTED |
| Natural fixture exit / no forced exit masking leaks | NOT VERIFIED |
| New child `.exit`, terminal gate receipt | None: no child launched |

Historical evidence is explicitly second-hand in R5: R4 reports full2 `format.exit=0`, `bounds.exit=0` (31 checks), `seam.exit=124` after one PASS and `gate.exit=141`; later phases absent. Those receipts were not read remotely in R5 and are not new passes. There is no R5 `GATE_PASS`.

## Root-cause disposition and exact recovery boundary

`provider-routing.ts:221-226` still awaits `reader.cancel()` before releasing the reader lock, and terminal delivery still awaits cleanup before finish. This source shape makes unresolved cancellation a valid hypothesis. It does **not** establish that the first post-PASS string-body scenario is where full2 stalled; the R4 probe has no executed R5 receipt. Do not apply the suggested fire-and-forget edit without the requested runtime bisect and pending-read/release-lock evidence.

On the next authorized recovery, reconcile full2 hashes, receipts and live processes/containers/lock first. Preserve full2 and full-v9. Use a newly named private immutable snapshot under `~/.cache/stellarc-authgw-gate.lock`; start with the existing complete R3 archive/runner, verify exact inputs, and adopt reusable successful phases only by exact source identity. Do not rerun the old non-idempotent gate.

Before production edits, execute independently bounded string-body, actual loopback fetch-body and synthetic unresolved-cancel cases, with stage evidence around authorization, read, cancel initiation/settlement, lock release and finish. Determine the actual stuck await after the first seam PASS. Cover pending reads and rejecting cancellation as well as held cancellation; prove I/O cancellation starts promptly, lock release/read errors are observed safely, durable settlement/drain does not depend on hostile cancellation settlement, and success remains behind durable finish, fresh authority and abort checks. Preserve first-choice outcomes. Only then make the minimal proven fix with RED/GREEN.

Any new runner must detach with `setsid`, stdin closed and all output durably redirected before SSH can disconnect; close inherited lock fd9 in child commands, retain per-child exits and a terminal receipt, and demonstrate fixtures exit naturally without adding `process.exit`. Run affected/missing gates on that new snapshot, including the full restricted-PG and repository gates above.

## Final local source manifest

Paths are relative to the shared worktree. No listed file changed in R5; protected entries are identity checks only, not edits.

| File | SHA-256 |
|---|---|
| `apps/stellarc-gateway/src/main.ts` | `24c76609991b68c19c1abc80e555de7f437b29977de78d646d5ca3f4630925ab` |
| `apps/stellarc-gateway/src/provider-routing.ts` | `eabd5f69b9e3c0c2011bf627a480e7939f34b624d3854313c3df91c93707b75f` |
| `apps/stellarc-gateway/src/provider-routing-check.ts` | `78888393c67f14c56cce0a12dfccb57d65493879306adf4533b44f7bd18df827` |
| `apps/stellarc-gateway/src/stream-check.ts` | `43838f9feb04070ed1328b221074472f01f45f4fea2f2b2ddeaf486b939e395a` |
| `apps/stellarc-gateway/src/http-check.ts` | `ad8f577058bd82f39c9953bc9d42b68daeae80e0d28dac6e8a257410be778d1e` |
| `apps/stellarc-gateway/src/bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| `apps/stellarc-gateway/src/bounded-sse-check.ts` | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` |
| `apps/stellarc-gateway/src/store.ts` (protected) | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `apps/stellarc-gateway/src/auth.ts` (protected) | `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c` |
| `apps/stellarc-gateway/src/audit.ts` (protected) | `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271` |
| `apps/stellarc-gateway/src/mcp.ts` (protected) | `fc8b7e37af782140579a7fc2cb4d41c17d28afc891b3af7f07839aa3126db099` |

OAuth, translation and unchanged-client parity remain open. No integration or deployment approval is implied by this report.
