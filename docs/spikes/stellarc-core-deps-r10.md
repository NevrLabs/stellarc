# Stellarc core deps R10 — root-only lock and clean resolution

## Verdict

**PASS for the narrow normal-dependency gate.** Applied exactly one added root
`"jose": "6.2.12"` line to `bun.lock`. Bun **1.4.0** accepted this exact candidate
with `install --frozen-lockfile --ignore-scripts` in a fresh isolated install,
retaining its bytes. All original package records, versions, checksums and
platform/libc metadata are unchanged. Normal moved-core jose resolution, actual
jose import, the pinned resolution matrix and all **10 auth-memory groups** pass.

This is **not full-repository, integrated approval-expiry, built-host or deployed
acceptance**. No deployment, subagent, commit/push, services/restarts, PostgreSQL,
Maple, live IdP or inference occurred. This lane wrote only `bun.lock`, this new
report and private scratch/verification snapshots. Other manifests/source and old
R8/R9 reports were left untouched.

## Exact handles and identities

- Checkout `/home/rpw/.t3/worktrees/stellarc/spike-auth-llmgw-maple`, branch
  `spike/auth-llmgw-maple`, HEAD `2dce6d069db62ebf880ec0cb7c280f3a58a7034c`.
- Canonical remote inspected: `https://github.com/NevrLabs/stellarc.git`.
- Executor: authenticated `fxbuilder`, verified hostname `fxcompute-01`.
- Successful snapshot:
  `/mnt/deepvault/stellarc-coredeps-r10-20261109T063221Z-root-only-c`.
- Local receipt mirror:
  `/home/rpw/.hermes/cache/scratch/stellarc-coredeps-r10-receipts`.
- Successful prepare through independent closure: **2026-11-09 06:34:18–06:39:48 UTC**.
- Reusable donor retained at the snapshot's `source/node_modules`;
  `donor-metadata.json` records **1,300,587,520 allocated bytes** from
  `du -sB1 node_modules`, source path, toolchain and manifest/lock identities.

The snapshot was extracted from the **verified original R9 source.tar**, not its
subsequently mutated extracted tree. The archive contains **51 regular entries:
50 hashed inputs plus source-manifest.json**. All workspace manifests are present.
Only `bun.lock` was explicitly overridden, then a new manifest was minted.

| Identity | SHA-256 |
|---|---|
| Original R9 archive (`r9-source.tar`) | `6c2872a3004900c86cfba142349136f75968807be2b1377735dc97108c78e0e5` |
| Original R9 manifest | `6a13ac3cd9a17be8f35c77887f589f36011edf8ddba080f26278dfe954eb43bd` |
| Root package.json, already declaring jose, unchanged | `0cf1684512fcd7f6fcbb5cd52cdf96c37f12b36bc05d625895b56bc205e377d3` |
| Pre-R10 local/R9 frozen lock | `79c905e9d44fff28d5bedbd2b216272541bcce7a4cb91efe2821313571f2059e` |
| Rejected R9 generated lock | `f5b62ab1ac7d6a8cb6c871c78b8089ba3a101339ea1895cc23e506a37522f130` |
| Accepted R10 lock: local and after install/proofs | `3b32a80b105b93629e22e6efca3f47cc9b6a649fdbede4b9557d4595c7585b07` |
| R10 source manifest / final verified inputs | `f05b6d4ef1cc72c425480cf9d6818716324be761f15f057ce7d85e0840ad832c` |
| Independent final-readback.json | `a91a1ccaacf20484ed80d7c07dabc67e581cd7e98cadec056f001d14b37f0ff0` |

`provenance.json`, `r9-source-manifest.json`, `source/source-manifest.json` and
`prepare-verified.json` / `install-verified.json` / `proofs-cont-verified.json`
preserve the complete closure. The last three verified manifests have the identical
R10 hash above; final independent rehash found zero drift across all 50 inputs.

## Lock reconciliation proof

Private runnable `lock-proof.ts` uses **Bun.JSONC.parse** on original, generated
and candidate locks. No regex stripping or Python strict-JSON lock parsing.
It takes the generated root jose line, inserts it once into the original text,
then deep-compares the result to the original plus exactly
`workspaces[""].dependencies.jose = "6.2.12"`. The entire `packages` object is
separately deep-equal to the original, preserving every version, checksum and
platform field. Generated R9 output contained the root line **plus 26 libc
removals**; all those removals remain rejected.

Applied diff versus the pre-R10 local lock:

```diff
         "ioredis": "5.11.1",
+        "jose": "6.2.12",
         "nodemailer": "9.0.3",
```

The pre-existing `apps/stellarc-gateway` workspace delta against Git HEAD is
preserved, not attributed to R10. No upgrades or whole-generated-lock transfer.
`lockdiff.txt`, `lock-proof.json`, `install-lock-retained.json` and local lock
hash comparison retain the proof. Frozen install did **not** require libc rewriting.

## Actual child ledger

Every child below exited naturally with **0**, no product timeout/retry. Runner
refusals remain nonzero and separate in the next section.

| Child | Exit | Result / receipt |
|---|---:|---|
| Toolchain assertion `Bun.version === "1.4.0"` | 0 | `toolchain.log/.exit` |
| Bun JSONC semantic/package metadata proof | 0 | `lock-proof.log/.exit`, `lock-proof.json` |
| `bun install --frozen-lockfile --ignore-scripts` | 0 | **985 packages**, Bun reported **101.38s**; `install-frozen.log/.exit` |
| Exact R8 normal jose resolution command | 0 | `normal-jose-resolution.log/.exit` |
| Pinned package/subpath matrix | 0 | **18 entries**; `resolve.log/.exit`, runnable `resolve.ts` |
| Actual jose import from `packages/core-auth/src` | 0 | `SignJWT` / `jwtVerify` function assertions; `jose-import.log/.exit` |
| `bun packages/core-auth/src/auth-check.ts` memory adapter | 0 | **10 PASS groups**; `auth-memory.log/.exit` |
| `du -sB1 node_modules` | 0 | `install-size.log/.exit`, donor metadata |

Exact R8 replay, from snapshot source root:

```sh
bun -e 'console.log(Bun.resolveSync("jose",process.cwd()+"/packages/core-auth/src"))'
```

Both resolution and actual import selected the new install's
`source/node_modules/.bun/jose@6.2.12/node_modules/jose/dist/webapi/index.js`.
Actual import ran with CWD `source/packages/core-auth/src`, not a root-only import.

### Pinned matrix

All package files and six subpaths are inside the new snapshot's node_modules.
`resolve.ts` checks installed version/package identity and real-path containment;
independent closure rechecks all 18 real paths.

| Package | Installed version |
|---|---|
| better-auth | 1.6.25 |
| jose | 6.2.12 |
| pg | 8.22.0 |
| postgres | 3.4.7 |
| effect | 4.1.2 |
| @effect/opentelemetry | 4.1.2 |
| @opentelemetry/sdk-trace-base | 2.11.0 |
| @opentelemetry/sdk-metrics | 2.11.0 |
| @opentelemetry/sdk-logs | 0.203.0 |
| @opentelemetry/exporter-logs-otlp-http | 0.203.0 |
| @opentelemetry/exporter-metrics-otlp-http | 0.222.0 |
| @opentelemetry/exporter-trace-otlp-http | 0.222.0 |

Subpaths: `better-auth/oauth2`, `better-auth/plugins/generic-oauth`,
`better-auth/db/migration` from core; `effect/ai`, `effect/http` from toolgw;
`effect/encoding/Sse` from llmgw. Full absolute paths are in `resolve.log` and
`final-readback.json`.

**Filename disclosure:** the freshly installed pinned trace SDK exposes
`@opentelemetry/sdk-trace-base/build/src/index-shim.js`. This is inside the new
Bun-created package, not the R8 donor; this lane injected no shim, dependency file
patch or donor link. “No shim” means no lane-injected workaround, not a claim
that published package filenames never include that word. Telemetry runtime/export
behavior was not exercised by this dependency-only lane.

### Auth-memory groups

1. `library-code-pkce-nonce-session-and-replay`
2. `library-browser-binding-before-exchange`
3. `optional-callback-issuer-validated-when-present`
4. `library-signed-identity-negative-vectors-no-provider-token-storage`
5. `auth-route-allowlist-and-exact-origin`
6. `auth-lifecycle-audit-failure-withholds-session`
7. `post-create-acceptance-audit-failure-removes-session`
8. `fixed-lifetime-session-reads-never-refresh`
9. `authenticated-logout-deletes-session-with-durable-lifecycle-hooks`
10. `auth-drain-awaits-insert-and-aborted-session-cleanup`

Expected deliberate `audit unavailable` stack output remains in the log; the
corresponding denial assertion passes. These are local signed issuer/cookie
fixtures, not a human login; PASS groups are not assertion counts.

## Refusals and historical lineage

- R9 original runner 3027202 was absent. Its `gate.exit=1`, lock-only exit 0 and
  strict-JSON JSONDecodeError remain historical setup failure, not product RED.
- Unexpected concurrent R9 runner **3034977** (`r9b.py`), install **3034980**, and
  detached wait-loop **3035068** were discovered after the supplied task evidence.
  R10 did not launch, kill or modify any of them or their receipts. They disappeared
  independently. Later readback showed `gate2.exit=1`: its children had exited 0
  but its final capacity guard refused. It accepted the forbidden libc-stripped
  lock, so those children do **not** certify R10's root-only candidate. No widened
  R9 scope is adopted and no old R9 report is revised by this lane.
- First R10 path `/mnt/deepvault/stellarc-coredeps-r10-20261109T063221Z-root-only`:
  prepare exit 1, authgw lock refused after 20 seconds, no children. Preserved.
- Second path, suffix `-b`: prepare exit 1 after extraction because the harness
  incorrectly expected 51 manifest keys. Actual archive is 51 entries including
  the manifest, which has 50 keys. Corrected in a **new** `-c` snapshot; no product
  child ran in the failed attempt.
- Successful `-c` snapshot prepare exit **0**. Frozen-install child exit **0** and
  unchanged inputs/lock, but **install-gate.exit=1**: final I/O PSI some/full avg10
  **11.37/8.51** and CPU some **5.23** exceeded <5. Root **4,943,794,176 bytes** and
  MemAvailable **4,221,661,184 bytes** still passed.
- First proofs attempt exit **1**, authgw lock refused after 20 seconds, no product
  child started. After independent process/source/lock/headroom reconciliation,
  separately hashed `proofs-cont.py` acquired locks with 120-second bounds and ran
  **only missing proofs**. `proofs-cont-gate.exit=0`.
- First read-only closure exit **1**, memory PSI some/full **6.51/6.32**, I/O
  **7.33/6.99** exceeded floors. Diagnostic/exit retained as
  `close-attempt-1.log/.exit`. Second read-only closure exit **0**, healthy under-lock
  capacity, no product rerun; `close-attempt-2.log/.exit`, `final-readback.json`.

No aggregate zero is fabricated. Per-child exits and separately identified
continuation/closure receipts are authoritative. Failed receipts remain intact.
No resource changes, root cleanup, foreign process kill or cleanup of others.

## Execution controls and final closure

- Ordered locks: `/home/rpw/.cache/stellarc-authgw-gate.lock`, then
  `/home/rpw/ws/gate.lock`. Noninheritable descriptors; product children close FDs,
  own process groups and have actual `.pid/.log/.exit` receipts.
- Before each product phase, under both locks: root ≥4 GiB, MemAvailable ≥2 GiB,
  all memory/I/O/CPU PSI some/full avg10 <5. Install bounded **540 seconds**;
  resolver/import **30 seconds**; auth and size **120 seconds**. None timed out.
- Private DeepVault cache/TMPDIR and initially absent node_modules. No donor
  copy/link overlay or lane-created shim; only Bun's ordinary store/workspace
  linking. Scripts ignored. Registry access only via Bun. NPM_CONFIG_USERCONFIG
  points to owned empty `npmrc-empty`, hash
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
  No credential file read/printed.
- Bun executable `/home/rpw/.bun/bin/bun`, **1.4.0**. Its embedded process.version
  prints **v26.3.0**; this is not standalone Node. PATH also includes the existing
  Node-v22.23.1 directory, but no Node child ran.
- Final independent closure: **zero owned processes/CWD/argv or live child PGID
  members** under R10 snapshot. Both locks reacquired nonblocking in order and
  released. No R10 background runner or poller exists.
- Final root **4,838,408,192 bytes**, MemAvailable **4,190,576,640 bytes**; PSI avg10
  some/full memory **0.36/0.36**, I/O **0.67/0.66**, CPU **0.20/0.00**.

## Concurrent-source and acceptance boundary

Local final readback matches the R10 freeze except these concurrent approval files,
which were inventory only, not resolver/auth-memory execution dependencies:

| File | Frozen SHA-256 | Current concurrent SHA-256 |
|---|---|---|
| apps/toolgw/src/tool-approval-check.ts | `f4cfdd47e4452f6686d12f78567e92097a4401c65ab483334b087efd37051324` | `25948b1d9641cfaec87c7e6d25f7e70d0b2200787f21fe210cd526f9d59e1266` |
| apps/toolgw/src/tool-approval.ts | `615b871f5636439c4de27918200575d54b594601b640c93e738b5d5824d10ab7` | `5b529d48c8c1a5e651a21f6aae9f377fa8945b97a1ff6731535bbe781145a664` |

Both left untouched. GLM fullrepo R8 remains evidence for its old revision, not this
lock or approval-expiry revision. Parent owns independent lock/report verification,
integrated freeze and whole-repo gates. No fullrepo lint/typecheck/build claim is
made from this subset; the requested normal-dependency gate is closed.

## Critical receipt hashes

Full file/hash map is in `final-readback.json`; runnable harnesses and complete
source manifest are in snapshot and local mirror.

| Receipt | SHA-256 |
|---|---|
| r10.py | `fbac69d1a9d855b97c0644efa4bcafe8d4a2637d5697bcc8714cc6fe576a4c91` |
| proofs-cont.py | `69117249da39621b3736383ba914bc089ec337277a35c7adda34ee69047bf7a2` |
| lock-proof.ts | `02e75d2f626e1c715ab1371dc105eb218e6c30720c7853bd691fb0d829f6825b` |
| resolve.ts | `a682f25ebc994f4361f022ce476cbd0abe7cd82cb22c40767326655b10bb02ff` |
| close.py | `32d8b38564ad64daa03a7247133189cf324e6b6d549faf9d19e59e04f3adbd1d` |
| lock-proof.json | `e23e2addec76c91dd71d5236e33dcfe3f41e8781b7a93e9e081ebdaaf1777794` |
| lockdiff.txt | `14b4777c97cb58351cd3ddbe0bfb9c2d3a796d679a312348b1a4864dbcf5516b` |
| install-frozen.log | `02bc4c36e45b2999dbc72c2becc394ed5d10a17ab682b75a11c61e8b8da1d233` |
| normal-jose-resolution.log | `1cd56b1e60afa6575fb271c7f517926c197cfb18eb27688bb349b88a235c3ef8` |
| resolve.log | `3c5420c7eb5b663e7b3a90376ebf2ef37a32c6b1cd0d1b2cb563bcf295f48b14` |
| jose-import.log | `9aac14987f67880afbcf05ad4882a6be7e01795e83a024fe9510c3ca86932162` |
| auth-memory.log | `bf528eb15c464cb6f32fa552c33e59514c3e0be548ce94494234a9cd95353605` |
| donor-metadata.json | `7eb60a3e0424b7e7b5aa83ffda3e4218a5eae7af9a325820556246bc1327f6d8` |

Historical report hashes unchanged in local readback:

- `docs/spikes/stellarc-core-deps-r9.md`:
  `8e3ada1527e1b460d461a4d49d9b836048010cba33631a50fd26acb84892a513`.
- `docs/spikes/stellarc-host-gates-r8.md`:
  `0c97ae071f04beee3839fe8547a13d958ef0dec8b94a6d184a871c21acd922b9`.

`local-readback.json` records applied lock/root manifest hashes, concurrent-source
differences and preserved-report hashes. Parent can independently reconcile every
receipt without treating old R9 or GLM R8 evidence as combined acceptance.
