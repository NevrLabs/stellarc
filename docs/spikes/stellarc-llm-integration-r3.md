# LLM integration R3 — source integration and exercised receipts

## Result

**Implementation present; final integration acceptance BLOCKED by fxbuilder SSH transport failure. Replacement/deployment HOLD.** Do not deploy these bytes on the basis of intermediate runtime passes. Final-source full lint/typecheck/build and the expanded socket/deadline tests are not verified.

Read fully: council R2, replacement R1, replacement map, main/provider-routing/provider-routing-check/stream-check/store, HTTP check, manifests, installed Effect 4.1.2 parser. Loaded TDD, systematic-debugging, Effect-v4/Bun and fxbuilder offload skills. This implementation child started no agents and made no commits, pushes, live inference, IdP/Maple/CF/live-database writes, deployments, restarts, credential movements or forbidden-file changes. All database mutations below target disposable PG on fxbuilder.

## Dispositions — five

1. **SSE bound: fixed and exercised, final boundary check observed passing.** First reproduced the exact 70,033-byte complete Chat wire (70,000-character padding plus framing/DONE) accepting in both unchanged main sibling and seam. New `bounded-sse.ts` retains installed Effect parsing and adds a constant-memory preflight of whole event wire state, including pending lines, fields/comments and CR/LF/BOM handling. It rejects above 65,536 UTF-16 units before parsing/rendering, independently of network reads; complete parsed data has a second bound. This is a deliberately stricter whole-event wire ceiling than the old pending-data-only claim. No arbitrary feed splitting. Same single/split/multiline oversized wire passes rejection; exact 65,535/65,536/65,537 boundaries, one-character reads, pending comments/names/data and CRLF covered in 31 helper checks.
2. **Native finalizer ordering: implemented; intermediate PG/socket proof passed.** `providerResponse` awaits the server-owned successful finish hook inside the native-terminal release boundary, then fresh nonadmitting authorization and abort checks directly before enqueue. Main's separate parser/terminal rewriter is removed: configured Chat and the default synthetic fixture share this seam and existing memoized finish/store protocol. A held finalizer and post-finish permission revocation withheld terminal on a real socket in green2. Durable completed remains completed despite withheld client success; no new delivery claim is invented. Final expanded raw-socket and default-fixture sibling regressions remain unverified after transport loss.
3. **Cancellation/lifetime: implemented; intermediate no-pull/abort/shutdown proofs passed.** Consumer cancellation/failure aborts actual upstream before waiting for settlement. Main registers independent abort settlement immediately after admission, including late admission returning during shutdown. Existing finalizers set tracks memoized persistence; owner tracks nonadmitting authorization promises and drains them before pool closure rather than abandoning raced DB work. Existing DB statement/lock/connect bounds remain. Intermediate tests passed abort during finish, no-next-pull consumer cancel/request abort, held shutdown finalizer, late admission, audit outage/recovery and no replay. Expanded no-pull 30-second deadline and pre-header fetch abort tests are authored but final run incomplete.
4. **First integration only: implemented, acceptance incomplete.** Existing scoped Chat STREAM ingress only; no new endpoint, OAuth, live enablement or dependency. Server-owned model/endpoint/key-handle configuration feeds `validateRoutes`/`prepareProviderRequest`, actual fetch uses prepared headers/body plus `redirect:error` and the request signal, fresh authorization after admission/pre-fetch, and existing request/response limits. Live still requires the existing explicit `GATEWAY_ENABLE_LIVE=approved`; no real config changed. Default local fixture remains. JSON response module now explicitly rejects `provider_json_disabled` for all protocols, including `{}`, queued and in-progress envelopes. Ingress continues rejecting nonstream before admission; new HTTP regression pending final execution.
5. **Replacement parity: OPEN.** API-key native transport is not Claude/Codex subscription auth, mixed-wire translation, unchanged-client acceptance or Executor parity. Exact remaining work below.

## Final owned files / SHA-256

All paths below start `apps/stellarc-gateway/src/`. Formatted bytes returned from the lane-private full1 tree only; nothing was copied into supervisor full-v9.

| File | SHA-256 |
|---|---|
| `main.ts` | `24c76609991b68c19c1abc80e555de7f437b29977de78d646d5ca3f4630925ab` |
| `provider-routing.ts` | `eabd5f69b9e3c0c2011bf627a480e7939f34b624d3854313c3df91c93707b75f` |
| `provider-routing-check.ts` | `78888393c67f14c56cce0a12dfccb57d65493879306adf4533b44f7bd18df827` |
| `stream-check.ts` | `43838f9feb04070ed1328b221074472f01f45f4fea2f2b2ddeaf486b939e395a` |
| `http-check.ts` | `ad8f577058bd82f39c9953bc9d42b68daeae80e0d28dac6e8a257410be778d1e` |
| `bounded-sse.ts` (new) | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| `bounded-sse-check.ts` (new) | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` |

Unchanged protected files readback: store `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6`, auth `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c`, audit `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271`, mcp `fc8b7e37af782140579a7fc2cb4d41c17d28afc891b3af7f07839aa3126db099`. These match full1 input manifest. No remote-MCP file edits. Shared tree still has original web/lock changes and untracked gateway/docs/tools work; do not broad-stage it.

## Execution identity and RED/GREEN receipts

All heavy execution on fxbuilder (`hostname=fxcompute-01`), under `flock -w 600 ~/.cache/stellarc-authgw-gate.lock`; no local builds/tests or dependency installations. Read-only dependency donor is `/home/rpw/.local/share/stellarc-gates/full-v9/node_modules` and gateway child dependencies. Full tree uses private symlink overlays, remapping workspace packages to the frozen source, not donor source. Bun 1.4.0 / installed Effect 4.1.2.

Local evidence root: `/home/rpw/.hermes/cache/scratch/stellarc-r3/`. `receipt-source-index.json` binds every archive to every gateway source hash. Preserve original receipts; older runs are not final-source acceptance.

| Snapshot under `/home/rpw/.cache/fxrun/workspaces/` | Captured child results |
|---|---|
| `stellarc-integration-r3-red-c5f5ceaea8e3` | First Docker bridge setup failed exit125 (`docker0` absent), not RED. Host-network retry initially lacked gateway `jose`, not RED. Corrected donor gateway link, fresh disposable PG: seam exit1 and main exit1, both **Missing expected rejection** for single complete 70k event. Runner exit0 only means both expected RED assertions verified. `receipts-main-red/` preserves exact source/exits. |
| `stellarc-integration-r3-bounds-e221fcd303ca` | seam exit0, 39 checks; main passed oversized single/split/multiline and existing EOF/error/exactly-once checks, then exit1 **Missing expected rejection: revoked during finish must withhold terminal**. This is finalizer-authority RED, not a full GREEN. Its runner's reused end marker says complete-70k; the assertion/exit above is the actual meaning. |
| `stellarc-integration-r3-hook-red-93883512169d` | Seam exit1 **Missing expected rejection: finish then reauthorize before terminal delivery** before implementing finish hook. `red.exit`, `source.sha256`, `red.log` preserved. |
| `stellarc-integration-r3-green1-dddf795a570a` | Outer SSH wait timed out while our runner still waited for the shared lock; no receipts directory/phases started. Reconciled process IDs and stopped only our obsolete lock waiter before green2. No pass claimed. |
| `stellarc-integration-r3-green2-aba547ca62d0` | `bounds.exit=0` (31 checks), `seam.exit=0` (48 checks), `main.exit=0` (PG/real-socket finalizer/revocation, audit INSERT transient/sustained failures/recovery, abort during finish, no-pull cancel/abort, shutdown held finish + late admission, one terminal/no replay). `strict.exit=2`, gate exit2: new assertion passed `undefined` where Node AssertPredicate was required. Corrected to ProviderRoutingError in final source. Expected stream-error stack printed by Bun's socket server is preserved, not concealed. |
| `stellarc-integration-r3-full1-4a83a40012c7` | Complete 2,279-file repository archive. `format.exit=1`, `gate.exit=1`: one `noAssignInExpressions` error in the new test; 38 warnings / 15 infos. Corrected offset increment. Full1 did not reach behavior/full gates. |
| `stellarc-integration-r3-full2-80c6e549aa4e` | Same complete archive plus exact final seven-file owned delta. Observed `format exit=0` (38 warnings / 15 infos; not warning-clean), `bounds exit=0` (31 checks), then SSH transport corrupted during seam. Local process exit255. Remote seam/strict/stream/http/artifact/lint/typecheck/build/gate exits **not recovered**. Do not infer whether the remote runner survived or completed. |

RED source identities: original main `5a0c017f87b3768269babb95616efab4bb14420586aafdba1f8006e33a194794`, original seam `307a715bdc4974a537740c2505e340df6449c690de34bbb4b212884e7c0cec45`; RED checks main `92c67580abf8072c54bd10e0dbcbab360cf3af866e791eeba6aa5d356f8834d7`, seam `eb6c5f3d89419f80aacf1414a167fa2719936f0e08324e1351519aef4033fdbf`.

Green2 production identities (not final formatting): main `f704f1b325da32560bac0129bc7fe5bcf062c3d7a2a0997e335ec442190ba9f9`, seam `78558b463639f841537a9e97361e00c34af510a201f13aa82b0f63246a4843a6`, helper `c4aa3c61b7332b5c711aa7f744ba555dd5773be9fc5a4453ae6aa38015e31979`; green2 stream check `34ed4265be4175e4646f102ce5ce300b8fe4f6bf694c002db3560556d0744b6d`.

Receipt/archive SHA-256:
- `red-main.log`: `7c62627edffb5184ef6ed8b8af59311ba97a37de7046af3f3a2fc6b3abfd8197`.
- `bounds.log`: `879411e412bf450257733c770950301a67b0ab1d48f03edb6de00c733573f269`.
- `hook-red.log`: `36045bc5a79ea6a4d05f8f39af1ca14ad032435747acd67a6336dffc032dbc39`.
- `red.tar`: `c5f5ceaea8e3f95815c1153ebb8e0cbdf5cae14f11a4a37f18869fab7ec96f71`.
- `green2.tar`: `aba547ca62d01a33da18d4b7c315345b07cc9d313e639928585441a34404f559`.
- complete `full1.tar.gz` / remote `source.tar`: `4a83a40012c70d304b4cadccc3598e6150e487ca5c76f304437604d6928452c7`.
- final `full2-owned.tar` / remote `owned.tar`: `80c6e549aa4eeeeeaab0e49b082e6cbae7dbdbcd42a87b17273ac785cb57cc43`.
- `full2-safe.log` (banner removed): `79add56d580242d7a881a3b31736a55505dbd970f6dc6214d3cb86f6b186b271`.

## True blocker and exact resume boundary

Full2 transport reported `Bad packet length 2827386489` and `ssh_dispatch_run_fatal: Connection to UNKNOWN port 65535: Connection corrupted`. Repeated read-only recovery through both configured `fxbuilder` and `fxcompute-direct` aliases produced no controlled hostname marker and SSH exit255. No service/network restart or replacement transport was attempted. SSH startup banners contain sensitive material; only controlled-marker output and the banner-free safe logs were surfaced. Raw transport files are private scratch, not report attachments.

**Before any rerun:** recover host identity and inspect full2's `receipts/*.exit`, logs, `source.sha256`/`final-source.sha256`, source and archive hashes, run-owned processes/container and lock. It may still be running. Do not overwrite source, rerun non-idempotent `gate.sh`, or resync into an active tree. Resume only absent/failed phases with a newly named immutable runner under the same lock. Full2 runner records each child immediately and stops on failure; its `gate.exit` is required separately from SSH. `full2-gate.sh` is preserved locally. Focused full gates expressly include provider-routing-check (still not in package test script), bounded helper, strict compilation, fresh PG stream and real HTTP/socket checks including slow bodies, gateway artifact check, then full-repository lint/typecheck/build. **None of final strict/stream/http/artifact/full-repo gates are claimed PASS.**

## Exact remaining replacement acceptance

- Codex account-bound OAuth headers/refresh and permissions for `cx/gpt-6.1-sol`, `cx/gpt-6-luna[1m]`; Claude account-bound OAuth for configured `cc` models. No subscription-forwarding permission inferred.
- Required Chat↔Responses and Chat↔Messages conversion preserving tool-call deltas, usage, errors, cancellations and native terminal semantics; direct native API-key tests do not prove translation.
- Authorized model catalogs, aliases, model/context metadata, configured favorites and fallback/selection strategies, OpenCode/antigravity/unknown `oc` mapping and actual needed providers.
- Unchanged Hermes Chat clients (stream and nonstream), Claude Messages clients and T3 configured routes against local socket fixtures; JSON stays disabled until its separate lifecycle/envelope acceptance. Native Codex usage not established by prior inventory.
- Independent council review of exact integrated final bytes and receipts, separately authorized provider canaries and private credential provisioning, reversible migration plus rollback/user acceptance. No old-product retirement recommendation. Remote-tool/OpenAPI/approval parity belongs to the separate Executor lane.
