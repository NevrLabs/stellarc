# Stellarc host/core fixture gates R8

## Result

**All requested core/host fixture children PASS on the exact frozen source; normal moved-core dependency resolution FAILS without a disclosed private jose overlay.** No production source edits. No whole-repository, approval, replacement, real-human-login, live-provider or deployed acceptance is claimed.

Execution: authenticated `fxbuilder` → `fxcompute-01`, 2026-11-09, 05:53:12–05:57:12 UTC. Read replacement map, app-split council R5, LLM redgreen R6, current checks/manifests and host/core implementation before provisioning. Loaded offload, Effect-v4/Bun and TDD skills. Only this report and private scratch were written in the local checkout/control environment.

## Actual gate ledger

Every named product child exited naturally with 0. PASS counts are printed groups, not assertions or independent acceptance percentages. Build's embedded asset check and the standalone readback exercise the same checker; not two independent asset implementations.

| Gate | Status / child exit | PASS groups | Exact receipts under remote handle |
|---|---|---:|---|
| Auth memory | PASS / 0 | 10 | `auth-memory.log`, `auth-memory.exit` |
| Auth restricted PG (`AUTH_PG_CHECK=1`) | PASS / 0 | 10 | `auth-postgres.log`, `auth-postgres.exit` |
| Store / worker interruption / DB lock races | PASS / 0 | 17 | `store.log`, `store.exit` |
| Database privilege/pin negatives | PASS / 0 | 4 | `database-cont.log`, `database-cont.exit` |
| Audit export/outage | PASS / 0 | 5 | `audit.log`, `audit.exit` |
| Host HTTP (`SLOW_BODY_CHECK=1`) | PASS / 0 | 14 | `http.log`, `http.exit` |
| Host stream/lifecycle | PASS / 0 | 14 | `stream.log`, `stream.exit` |
| Host direct build + embedded asset check | PASS / 0 | 1 | `host-build.log`, `host-build.exit` |
| Standalone asset readback | PASS / 0 | 1 | `artifact-check.log`, `artifact-check.exit` |
| Source host CLI startup/assets/pin denial | PASS / 0 | 2 | `startup-source.log`, `startup-source.exit` |
| Exact built host CLI startup/assets/pin denial | PASS / 0 | 2 | `startup-built.log`, `startup-built.exit` |

- Source HTTP proves eight simultaneously stalled auth/LLM socket bodies receive 408 at the production 30-second deadline and slots recover; current MCP initialize/list/call, unknown tool denial, both protocol lifecycles, session principal binding, exact origin, cancellation persistence and credential revocation pass.
- Source stream proves pending-read revocation, chunk-independent 70k event refusal, EOF/error failure, terminal exactly once, post-finalizer revocation withholding, transient/sustained terminal-write outage, independent orphan recovery during OTLP outage, abort-before-headers, no-pull consumer/abort/30-second deadline settlement and shutdown waiting for held finalization plus late committed admission.
- Actual Better Auth memory and restricted-PG checks exercise locally signed RSA issuer responses, PKCE/nonce, cookies/replay, bad issuer/audience/nonce/expiry/azp/algorithm/signature and unknown membership, audit-failure session compensation, fixed lifetime/logout and underlying-operation drain. This is **local fixture issuer/signatures/cookies**, not a human IdP login. The auth audit callback is a deliberate fake; actual store/audit/host persistence is covered separately.
- Source and exact bundled CLI each served `/health` and three byte-identical assets over loopback with pinned Host, denied wrong Host and anonymous management, returned local login-begin cookies, exited 0 after SIGTERM, then rejected a mismatched client pin with a nonzero child exit and unchanged identity row. No code patched into the artifact. The private `startup.ts` asserts the actual CLI outcomes. Deep held-work drain is source `stream-check`, **not** a claim of held-work drain through the built CLI.
- Expected denied-operation stack output is retained: auth's deliberate `audit unavailable`, stream revocation `provider_stream_failure`, and startup `Installation OIDC binding mismatch`. Logs are not warning/error-free; their corresponding assertions and child exits pass.

## Real setup failures preserved; no fictional aggregate zero

Initial `gate.exit=1` and runner OS exit 1: CPU PSI some avg10 reached **5.36**, above the <5 budget, before `database-pg-identity`; root 4,993,748,992 bytes and MemAvailable 4,156,321,792 bytes remained above floors. That initial database fixture was removed, with logs and absence receipt, without executing its product check.

After independent process/container/ordered-lock reconciliation and a fresh healthy readback, `continue.py` adopted the **same unchanged snapshot**, executed only missing children (fresh `database-cont` cluster), and preserved all prior receipts. It passed database/audit/HTTP/stream/build/assets/source startup, then stopped before provisioning built startup because CPU PSI some avg10 was **5.32**. Its `continuation-gate.exit=1` and OS exit 1 remain intact.

After another independent clean reconciliation and healthy readback, separately hashed `built-only.py` verified source **and already-built artifact hashes**, executed only missing built startup with a fresh cluster, and returned `built-only-gate.exit=0`, OS exit 0. No product check timed out or was retried; no delayed poller, sleep/retry job or source re-extraction/overlay was used. Two resource refusals are infrastructure failures, not product RED. Final child-by-child ledger is authoritative, not any runner's single exit.

Root never fell below the execution floor on builder. The control host's initial local root/memory failed the floors and was not used for product execution. No cleanup of other lanes occurred.

## Isolation and dependency limits

- Ordered locks every execution segment: `/home/rpw/.cache/stellarc-authgw-gate.lock` **then** `/home/rpw/ws/gate.lock`; acquisition bounded to 120 seconds each. Descriptors noninheritable and closed in children. All gates serialized, including approval R7 via those locks.
- Before each phase: root ≥4 GiB, MemAvailable ≥2 GiB and memory/I/O/CPU PSI avg10 <5 (stricter than checking memory alone). Refusals stop new children; exact owned fixture cleanup remains allowed.
- Fresh **PostgreSQL 16 cluster per script**, not new databases on shared clusters. Existing pinned image `sha256:066167ff39c2a612402ce99b734ea1cff92a9d1f2ac52f697a5f0384f0d88d6b`, `--pull=never`, loopback-only listener, unique ports, 256 MiB memory+swap cap, 160 MiB private data tmpfs, 16 MiB shared buffers, bounded Docker logs, no persistent volumes. Owner DSNs are throwaway fixtures; scripts create their own restricted `gateway_runtime` roles and grants. No shared/live DB or configuration/credentials read.
- Fixture PG ports: auth 47985; store 60549; initially refused database 56735; executed database-cont 36951; audit 59955; HTTP 38987; stream 57843; source startup 52339; built startup 42101. Independent parsed PG logs verify these listeners.
- Product deadlines: auth memory 120 seconds; PG checks/HTTP/stream 180 seconds; host build/source and built startup 120 seconds; artifact readback 60 seconds. HTTP exceeds required 120 seconds. Per-child process groups and durable `.pid/.log/.exit` receipts; no timeout or runner kill needed.
- Bun **1.4.0**, Node **v22.23.1**. Exact source-parent resolver asserts installed Better Auth 1.6.25, jose 6.2.12, pg 8.22.0, postgres 3.4.7, Effect/@effect/opentelemetry 4.1.2 and pinned telemetry SDK/exporter versions. `resolve.log` contains actual paths. Existing telemetry sdk-trace-base resolves to donor `index-shim.js`; donor bytes were not modified or installed by this lane. This proof uses the existing installed donor, not a pristine reinstall.
- **Actionable integration failure:** `normal-jose-resolution.exit=1`, `Cannot find package 'jose'` from relocated `packages/core-auth/src`. Donor exposes jose at old host-package scope. The private run-tree root overlay links the **already installed pinned** jose 6.2.12 solely to permit behavior verification; `jose-shim.json` records it. Source/manifests/donor unchanged. Parent must reconcile normal manifest/install resolution and execute a clean resolver gate; these behavioral passes do not clear that gap. No install or root dependency patch performed.
- No formatter/source edit, full-repo lint/typecheck/build, Turbo cache-invalidation proof, candidate preflight, live candidate restart, IdP, Maple, providers/inference, external application network, deployment, commit/push or subagent. Direct host build intentionally avoids Turbo cache claims.

## Frozen identity and dependency closure

Remote immutable-input snapshot and durable receipts:

`/mnt/deepvault/stellarc-host-r8-20261109T055310Z-e4fc3ab3`

Local private receipt mirror:

`/home/rpw/.hermes/cache/scratch/stellarc-host-r8`

Source tar streamed directly to DeepVault (757,760 bytes), no bulk root/RAM staging. Extracted manifest inputs were chmod 0444. Donor `/home/rpw/.local/share/stellarc-gates/full-v9` only supplied read-only dependency links; source workspace links remapped to this snapshot. No installs.

- `source.tar`: `a42bdb08a17321e347ec55d118699e416619fa71281c57045b86d344a1b8f96e`.
- `verified-before.json`, `verified-after.json`, `continuation-verified-after.json`, `built-only-verified-after.json`: identical SHA-256 `f2111d0f3a68e83adec24de3c10a67026d048a284dc1db8c20431144353b3276`; **36 exact source/harness inputs unchanged**.
- `source/closure.json`: `316acea7f402561bbe35219bb8650c25fa3500d05f6cbe95e8e51041d909517f`.
- `gate.py`: `00a2ec2a1c5a61aa240cbb48af8dbc5d7411360f97e43601e7fbfc37048fccbc`.
- `continue.py`: `b0b86a6baa2c4c773ba1bd4bb375aa19af7d82d561bed13140ac03ecfcf79a0c`.
- `built-only.py`: `ef05923d452ca897d3f8ac5387bded4dc1ce1e22724929f80217e87991b40557`.
- `artifact-manifest.json`: `8daf7bf60572a9d13a5ab4a5d5658f957fbe43f1199fe274c05941d2a8093c71`.

Explicit host transitive relative-import closure: host `main.ts` → core `audit.ts`, `auth.ts`, `database.ts`, `store.ts`; telemetry `index.ts`; toolgw `mcp.ts` → same core `store.ts`; llmgw `provider-routing.ts` → `bounded-sse.ts`. **Nine implementation files**, no `tool-approval`/remote-MCP/OpenAPI import. Assets are separate runtime inputs and in the frozen manifest. Complete edge list is in `source/closure.json`.

Approval files were included as *unexecuted inventory*, not host dependencies: module `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7`, check `f4cfdd47e4452f6686d12f78567e92097a4401c65ab483334b087efd37051324`. At final local readback all 35 checkout inputs match freeze, including those approval bytes: zero drift in this lane's interval. This is not whole-repo stability or approval R7 acceptance. Parent still owns post-R7 integrated freeze.

### Built artifact identity (independently rehashed after execution)

| Artifact | SHA-256 |
|---|---|
| `apps/stellarc-gateway/dist/console.html` | `f0c3e85cbde749d9ccb1b972cbc7a778bc146ca69dfa4f24105714759bd50492` |
| `apps/stellarc-gateway/dist/console.css` | `1c10cc3367983814f1b484bcb9f63b4fced0e04fba6d4a63db514d0e326a8d43` |
| `apps/stellarc-gateway/dist/main.js` | `28f4e9456243e660f002247fff063a5726add0af6d6fba43df578e4229ed08c9` |
| `apps/stellarc-gateway/dist/console.js` | `b7c6fbb33c126ef9d399eeeda9f312bd2aac17503afc1ef7143bfcbd97da89e7` |

### Exact product/check log identities

Every filename below has same-stem `.exit=0` except `normal-jose-resolution.exit=1`; source tar/manifests/closure bind these logs to their inputs. Local mirror includes these logs plus `final-readback.json` (all remote receipt hashes/exits), `artifact-independent-readback.json`, complete source manifest and exact shared drift ledger.

| Log | SHA-256 |
|---|---|
| `auth-memory.log` | `93125b66cc69f0d52b1119392a109487fde2bc06d67be2f94f1d6d1760ba64ab` |
| `auth-postgres.log` | `93125b66cc69f0d52b1119392a109487fde2bc06d67be2f94f1d6d1760ba64ab` |
| `store.log` | `48b402d9f938ed2ab6023dd871eedc5ac5b45d027e1c92bb62ccded98df44d1b` |
| `database-cont.log` | `73466de99ad01e7b2515cfa3555fa38f3094ac205e8a029919d5dd2e1b406f00` |
| `audit.log` | `c00401441c7c300cf994f02a460722b697abab13077b88b3fe6a91ece160c78e` |
| `http.log` | `96af2a7b627042768d5b7642da216ddc0f05d90cc7d6e6b9cfd1dc18797156e4` |
| `stream.log` | `4bfe441bfb64cab8c71ef826179c223051e541cfc45ed3b348a34899652dec69` |
| `host-build.log` | `58edec593b8e73c7aead939a0b0dc8f242d6c993a54fd6bd05e62320b90d5ef6` |
| `artifact-check.log` | `6db7ce2f032615a61dafddb093c16453c2a1ebf50efb00fe5a82cbe275207ced` |
| `startup-source.log` | `e49a6b1479cc2b9a4d26e9a78acaebb7e188201b3892c1d943a975f1f5d5ed40` |
| `startup-built.log` | `6a6cc2944594f37fd4b94546718faa8d8eabafa0da13bc03c11fd453a84021d1` |
| `normal-jose-resolution.log` | `23bcdae0739eda54587ee2e25cc76378b8bdafaddd72f8acc554feb328fff301` |
| `resolve.log` | `86e8b510c32bad0831d3ecbb6da1e8608840724af4ec4360711e710586feb33f` |

## Final closure

Independent final readback: no process CWD/argv under snapshot, no live members of owned child process groups, zero remaining `stellarc.lane=host-r8` containers; each fixture has `*-pg-absent.json`, inspect exit 1 after removal. Source and built servers exited/joined; no fixture server/poller remains. Both locks reacquired nonblocking in required order and released. No other lane/container/service was stopped or cleaned.

Final builder root available **4,993,835,008 bytes**, MemAvailable **4,213,071,872 bytes**. Memory PSI some/full avg10 **0.00/0.00**, I/O **0.71/0.66**, CPU **0.52/0.00**. All requested floors recovered; no root cleanup or resource change performed.

**Parent handoff:** fixture behavior and exact host artifact startup/assets PASS with disclosed installed-dependency overlay. Fix/reconcile normal moved-core jose resolution, freeze after approval R7, then own full-repository and downstream release gates. No source fix or release recommendation from this lane.

## Full exact input SHA-256 manifest

| Input | SHA-256 |
|---|---|
| `apps/llmgw/src/bounded-sse-check.ts` | `22bd5e8d4478ea6fb33424fb0110548fe8b27372e1e345871fd1a1cdf73b3f9d` |
| `apps/llmgw/src/bounded-sse.ts` | `d38cb113e2a2187c6c15cfbf884ecd5aa0f00716fc1f8b561d29cb9466c6e30d` |
| `apps/llmgw/src/provider-routing-check.ts` | `fa6dd0320c2cf6ead424eeb02313fa08c815d3beb343569c7e6cf4282075d13e` |
| `apps/llmgw/src/provider-routing.ts` | `52d4a919f2e9cacf305789a5a917c371c01071ad81f2bf4c202e74939822837e` |
| `apps/stellarc-gateway/package.json` | `61fb4cc5ed7618ba58eea0b15dd0d678234ddf5346d463f114fb462d66ea9603` |
| `apps/stellarc-gateway/src/artifact-check.ts` | `d42dfec82d3839d9d430a8b5604499d9cc00b97ef049ef70a2e99763ba46203c` |
| `apps/stellarc-gateway/src/console.css` | `1c10cc3367983814f1b484bcb9f63b4fced0e04fba6d4a63db514d0e326a8d43` |
| `apps/stellarc-gateway/src/console.html` | `f0c3e85cbde749d9ccb1b972cbc7a778bc146ca69dfa4f24105714759bd50492` |
| `apps/stellarc-gateway/src/console.js` | `b7c6fbb33c126ef9d399eeeda9f312bd2aac17503afc1ef7143bfcbd97da89e7` |
| `apps/stellarc-gateway/src/http-check.ts` | `ac4ec1d631e97178807cbe0b856a1a5638270be1240e710df1f389df5017a01e` |
| `apps/stellarc-gateway/src/main.ts` | `023fcd2be11932d6502891adf2b575379dc7fadd68cb572c55ebf56cf88490df` |
| `apps/stellarc-gateway/src/stream-check.ts` | `48e12b867d27052f182edd2755eab34f63d20a5b48daefccc6c2a6daa1b444d2` |
| `apps/toolgw/src/mcp.ts` | `c78bad1bfdec570b82fa44f1bf74503620e44b663ca58d00322e52df5673e3d2` |
| `apps/toolgw/src/openapi-operation-check.ts` | `cf707a22e1660c8eaf33b660c76006998c021c4acbed991c022f04e3e861b573` |
| `apps/toolgw/src/openapi-operation.ts` | `a8fda8f605f9bc85920ba05ee76c23e59252775e5a53ca3b84fe9d7aafcb90f1` |
| `apps/toolgw/src/remote-mcp-check.ts` | `21111bdc4ab38e3382dc73404c5bde90581adfcab404f17e6a936156f7008166` |
| `apps/toolgw/src/remote-mcp.ts` | `6c2bc54768308f1395f4f45150784564e7852dbefde0bb917fcee12f13272adc` |
| `apps/toolgw/src/tool-approval-check.ts` | `f4cfdd47e4452f6686d12f78567e92097a4401c65ab483334b087efd37051324` |
| `apps/toolgw/src/tool-approval.ts` | `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7` |
| `biome.json` | `301af84f88b6590966352aee49b8240daf51c435eee600f8b9aaf76e2caf6ab5` |
| `bun.lock` | `79c905e9d44fff28d5bedbd2b216272541bcce7a4cb91efe2821313571f2059e` |
| `package.json` | `d344736d5de5a848e3e1d4edbdf5e3d9b544d2f3602b907556f8ada563137011` |
| `packages/core-auth/src/audit-check.ts` | `af3b82ea80d17885fd8e943d8aed612ebac1e4790dd77d0e9eee331c135b7aa7` |
| `packages/core-auth/src/audit.ts` | `beaa3b12b45ef6826404884ca57151be164faa3d1aedc81132af5be558652271` |
| `packages/core-auth/src/auth-check.ts` | `775b2e52a47a015c5fc479f45e70f8f27512fe5496fadb79c63ffcc5ba5932f4` |
| `packages/core-auth/src/auth.ts` | `fe3cdfc10b97701c404db033584974ed6044dc6323ef74fccabb75727973838c` |
| `packages/core-auth/src/database-check.ts` | `b8654e907ed865d535aca05e89a896119885bfade423228e3a3452f4c10ee4ea` |
| `packages/core-auth/src/database.ts` | `a254325dbb20cda499ace8a8c3edcd773c3ef4824881e6281ad7fadce7362b4c` |
| `packages/core-auth/src/migrate.ts` | `b2819a149f5fa380cbcaeefb08d437aa2c6757786517f7346cb98da65d8ff9bc` |
| `packages/core-auth/src/store-check.ts` | `a0ac1a28d925fefc20962cf9736d2b9e45cd8cf26b69cfee2bdbeacf54ab9279` |
| `packages/core-auth/src/store.ts` | `ee32a71c608028d3c886068dcc63e495473f3fa009054d68d436347df166bea6` |
| `packages/telemetry/src/index.ts` | `335f02cec44951f340bc4ffef508895e90aa5e9d0d1d215dd879ee6d688cc677` |
| `tools/spikes/auth-llmgw/split-checks.json` | `0d58016836abb4fae882df1d917bfdd9e924ae81d634c1485636e659b07c3f0b` |
| `tsconfig.json` | `b1f98bce374cbd63e8b4047fd7f37af5c01ee32cbf890f69bcb03068f385b95b` |
| `turbo.json` | `95c58311ee64d622363ccfcbe2fd4a8a19bef49b7b04fac22723a74162dd034b` |
| `startup.ts` | `43682b48fef1fc7155daf55e27dc7119f19f53bd18169980d798fdc183429c4f` |
