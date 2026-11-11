# Builder root recovery R5

## Result: root and memory acceptance floors recovered

Executed on authenticated `fxbuilder` (`fxcompute-01`), 2026-11-09. Six
proven-inactive root-backed verification/generated trees were streamed into
private DeepVault archives, verified in full, independently read back, and only
then removed at their exact original paths. **No build/test gate was launched.**
The parent may resume **serialized** gates subject to a fresh per-gate capacity
check; this is a resource-recovery receipt, not product test evidence.

The supervisor explicitly expanded R4's RAM-only scope to root-backed copied
verification scratch with provenance/completion, whole-tree inactivity and
archive-before-removal. This lane did not expand beyond that authorization.
R4 was read in full and its strict-trust SSH/proof helpers reused. No repository,
shared toolchain, credentials, container, volume, tagged image, service data,
CPU/balloon/swap/disk configuration, deployment or inference workload was changed.
No restart, kill, reboot, commit or push occurred.

## Actual resource receipts

Guest counters; bytes are exact. The final acceptance pair is 20 seconds apart,
after a bounded quiet settling interval without bulk archive reads.

| Metric | Before, 04:17:08 UTC | Quiet 1, 05:07:44 UTC | Quiet 2, 05:08:04 UTC |
|---|---:|---:|---:|
| Root available bytes | 658,558,976 | 5,296,300,032 | 5,296,316,416 |
| MemAvailable bytes | 4,197,879,808 | 4,197,003,264 | 4,206,411,776 |
| Memory PSI some/full avg10 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00 |
| I/O PSI some/full avg10 | 0.16 / 0.14 | 0.34 / 0.33 | 0.59 / 0.41 |
| CPU PSI some avg10 | 0.17 | 0.08 | 0.28 |
| Swap total bytes | 0 | 0 | 0 |

Root at Quiet 2: **4.93 GiB available**, **1,001,349,120 bytes above the 4 GiB
floor** for ongoing writes. MemAvailable: **3.92 GiB**, above the 2 GiB floor.
Final closure at **05:08:56 UTC** still had **5,296,287,744 bytes available**.
Net root improvement at Quiet 2 versus baseline: **4,637,757,440 bytes**.
The sum of immediate measured action deltas is 4,737,998,848 bytes; concurrent
ordinary writes mean that sum is not the same as net guest improvement.

`/dev/shm` remained 1,458,892,800 used bytes of 8,384,753,664. Maple's separate
1 GiB tmpfs remained 92,839,936 used bytes; its pglite bind view is the same
memory and is not double-counted. `/run` used 1,425,408 bytes at final archive
readback. OOM kill counter remained 6. Bulk archive readback temporarily raised
memory/I/O PSI; quiet avg10 returned to the values above. Historical avg60/300
and cumulative PSI were not erased, and totals still advanced slightly with
ordinary activity. No claim of zero historical pressure or a load test is made.

## What was relocated, and why it was disposable scratch

| Exact source | Provenance/completion | Immediate root-byte gain |
|---|---|---:|
| `/home/rpw/maple-audit-evidence/mutation-tree` | Copied, Git-free Maple mutation-verification tree; sibling frozen manifest identifies HEAD `92355fc7a2b530c706d814d29d5fb69e27f52d77`; mutation logs name this exact tree. `mutations.exit` records three green phases, five killed mutants and `mutation-runner=0`. | 1,435,508,736 |
| `/home/rpw/fe-dev/node_modules` | Generated dependencies in a Git-free frontend verification copy. `fe_dev_verify.sh` installs here; `fe_dev.log` records install/typecheck/lint/tiles/build exits all 0 and completed build. Only generated dependencies moved; copied source remains. | 903,606,272 |
| `/home/rpw/fe-main/node_modules` | Same generated-copy classification via `fe_main_verify.sh` and `fe_main.log`; all five terminal exits 0 and completed build. Copied source remains. | 862,117,888 |
| `/home/rpw/fe-base/node_modules` | `fe_oom.sh` explicitly copies `/home/rpw/ucollect-dashboard-fe` to `/home/rpw/fe-base`; `fe_oom.log` records terminal `mine_exit=1` and `base_exit=1`. A failed but terminated verification run is not active work. Copied source remains. | 870,453,248 |
| `/var/tmp/acp-baseline-e08cf6f3` | `acp-baseline-compare.sh` explicitly populates this path with `git archive e08cf6f3`; no `.git`. Terminal comparison status and completed logs retained in `/home/rpw/ws`. | 333,467,648 |
| `/var/tmp/acp-candidate-2a4e8f92` | `acp-commit-barrier-probe.sh` explicitly populates this path with `git archive 2a4e8f92`; no `.git`. `acp-commit-barrier-status.txt` records baseline/candidate exit 1, and both completed logs remain. | 332,845,056 |

No classification rested on Unix UID or age alone. Provenance scripts/logs and
frozen manifests outside the removed trees were retained, not rewritten.
Maple evidence, patches and final receipts remain in their original parent;
only its terminated mutation copy moved. Old frontend dependency files named
`css-vendor/.env` were **byte-identical to the public npm css-vendor 0.3.8
package**, SHA-256 `c72cd83ed368f669eb3509e27f2b8fb714479a3684b0431832a418cec2d57563`;
they are public package content, not credentials. ACP `.npmrc` files contain
engine/release-age settings without auth syntax; `.envrc` was screened without
emitting values. No credential material was printed or selected for relocation.

## Inactivity and preservation gate

Before archive creation and again immediately before removal, root-privileged
whole-tree checks examined all processes' CWD/exe/root, argv, environment, FD
paths and device/inodes, mapped paths/inodes, and per-process mountinfo. Exact
path-boundary checks distinguish `/target` from `/target-dev`; only scanner and
invoking ancestors were excluded. Parent frontend paths were included so a
process using the copied app would also block dependency removal. `/proc/locks`,
UNIX sockets, mount/bind references, loop backing files, special files and
possible compiler/test jobs were checked. All relevant sets and permission-gap
sets were empty. The existing `/home/rpw/ws/gate.lock` was acquired nonblocking
through each operation and reacquired/released at closure; no lock was stolen.
A zombie process's `mountinfo` returned EINVAL; the scanner was corrected to
ignore only that confirmed-zombie EINVAL, not arbitrary read failures.

Sources resolved to their literal root-backed ext4 paths, without symlink
substitution or nested cross-device entries. All selected members had UID/GID
1000; no special files or xattrs/ACL xattrs were present. Literal symlinks and
full bytes of hardlinked regular files were explicitly supported. The manifest
records original device/inode/link count and ctime as evidence; copied files are
archived independently, not as references to a shared toolchain. External
hardlinks were never chased or removed. Thus the Maple tree's approximately
2.94 GB `du` size yielded only approximately 1.44 GB root relief: shared inode
blocks stayed with their other owners.

Every payload streamed directly to the approved NFS DeepVault mount, not into
root staging or another RAM copy. Complete manifests contain member paths,
types, regular-file SHA-256, sizes, numeric UID/GID, mode, nanosecond mtime/atime,
and literal symlink targets. Every member and metadata field was checked by
archive readback and the source was re-manifested unchanged. A separate remote
readback then rehashed payload/manifest, checked the entire member/content set
again and rechecked source stability. Fresh inactivity proof preceded exact
source removal. All six absence/relocation receipts and archive hashes were
read back after removal, including a final complete payload rehash.

## Exact recovery handles and hashes

Private parent on `fxbuilder` (UID 1000, mode 0700):

`/mnt/deepvault/stellarc-root-r5-20261109T0426Z-29c1ab-u/`

Each child contains mode-0600 `payload.tar`, `files-manifest.json`,
`verified.json`, `independent-readback.json`, and `relocated.json`. Child dirs
are 0700. The table lists paths relative to that parent.

| Archive child | Members | Logical regular-file bytes |
|---|---:|---:|
| `0-maple-audit-evidence-mutation-tree` | 157,514 | 2,483,056,936 |
| `1-fe-dev-node_modules` | 88,479 | 624,909,122 |
| `2-fe-main-node_modules` | 85,695 | 592,277,838 |
| `5-fe-base-node_modules` | 88,479 | 624,923,015 |
| `3-tmp-acp-baseline-e08cf6f3` | 24,770 | 273,002,842 |
| `4-tmp-acp-candidate-2a4e8f92` | 24,752 | 272,388,879 |

Total **469,689 members**, **4,870,558,632 logical regular-file bytes**;
PAX payloads occupy **5,709,690,880 bytes** before manifests/receipts.

Payload SHA-256 / manifest SHA-256, in table order:

1. `6163ce191372c91bdabcf4a736bb66c013b36a8f560ff2a2034645fe60c0c658`
   / `6bb550319e5c4c3cb41210f1b9e5d17f11534247be6945087181c80bd2cceb94`
2. `2b4300bc538000a7a30e2e9bcc14cc4f1564ab2b880734c0f2106007d4bd5a17`
   / `d45ba4c345d2739b37eecf8818f5827eb7aaabf665a767efbab2859c899d223d`
3. `d879eec1eee9b079235322ac635b1be4dc4b5bec93c447de24d68231cbff0d5f`
   / `836c418339fe3d2fedc87fdeb59f1debdc56ce648d686c9198d2bdcb9a418f93`
4. `243ec5841b0b66e4b792d5d20b9f023a177a42a2a8c46ddaa581fd9b1223cfb0`
   / `b086c6b27c87824a87eaa28f35bb0fcd8f6fcd44d447af49c57c65ef831fc9a7`
5. `a93c794db4b98732d2b0e0d23219014a3d9aa711d8f8c2364927981db8cfd790`
   / `ca1648499351109fbb89abf4235b37e8bfd5064495a2a9442e0b506a00892e30`
6. `3f9dc5293cd16db6c4aae3dcb7851b58d583c5c4d3da21ca9744c01d042ef354`
   / `6a4a9a639a752d2c7fe1d6f3453208470558f1f7f416b7400e242f35411679ab`

### Restore

Do not restore into a live or existing destination. Recheck capacity, inactivity
and ownership; choose an absent destination on approved storage. Rehash the
payload and manifest against the values above. The archive contains its source
basename (`mutation-tree`, `node_modules`, or the ACP tree basename): extract
into the chosen parent with PAX-aware tar preserving numeric ownership, modes
and mtime, e.g. `tar --numeric-owner --same-owner --same-permissions -xpf
ARCHIVE/payload.tar -C ABSENT_TREE_PARENT`. Verify full member/type/size/content
hashes against `files-manifest.json`; apply manifest atimes with `os.utime`
(`follow_symlinks=False`) in reverse depth order if exact atimes are required.
Symlinks retain their literal targets. Hardlinked file bytes are complete, but
ordinary extraction creates independent copies rather than reattaching foreign
shared inodes. Inode/ctime identity and original external hardlink topology
cannot be restored by ordinary copying. No automatic restoration is armed.

An initial parent-directory creation under NFS root-squash failed; no source
was removed. The unsuffixed `...29c1ab` location is not a recovery point. Creating
the `...29c1ab-u` parent as `rpw` solved it without export/policy changes. The
first large archive's small-buffer NFS I/O exceeded the local 300-second wrapper
budget; the live writer and lock were adopted, never duplicated or killed, and
its verified receipt was collected after completion. Subsequent archives used
bounded 1 MiB streaming buffers. A premature next archive attempt failed the
nonblocking gate lock and performed no write/removal. No failed receipt
substituted for verification.

## Continuity and things deliberately preserved

- All six Docker IDs, running/stopped states, main PIDs, StartedAt and restart
  counts match baseline in two final continuity readbacks. Five remain running;
  the stopped Maple container remains stopped. Mailpit remains healthy.
- KFL PostgreSQL `pg_isready` returned 0; Maple fixture PostgreSQL returned 0 on
  its actual configured TCP port and its postmaster owns the listening socket.
- Maple Setup Health `ssh talos ~/deploy/maple/bin/health.sh` returned 0 with
  existing strict SSH trust; output retained privately, no settings changed.
- SSH, guest-agent, journald and warp active state, main PID and restart counts
  are byte-identical to baseline. Historical restart counts 36/1 remain.
- All **159 tracked non-ephemeral/non-session process identities** were alive
  with identical start ticks in both final continuity readbacks, including
  Maple telemetry, KFL/Outline workers, Stellarc and both dockerd processes.
  Ten baseline per-connection SSH sessions ended during the hour; this is
  reported rather than falsely claiming every sampled session persisted. No
  non-SSH tracked process disappeared. This is continuity, not end-to-end
  application acceptance.
- Docker remained 41 images, six containers, 183 volumes, zero build-cache
  bytes. No dangling images remained at baseline, so **no Docker removal** ran.
- `/tmp/otel-spike`, `slice2-tree`, `slice3-tree` and related RAM trees were
  retained: gate scripts alone did not provide the same unambiguous full
  provenance/completion chain. No need to weaken that gate after sufficient
  verified space was recovered.
- `/home/rpw/tmp-go-build-tmp` contains actual `.git` repositories; preserved.
  `/home/rpw/stellarc-dev/target` measured 2,446,909,440 bytes but belongs to the
  shared development repository/runtime, not this disposable-copy permission.
  Shared caches/toolchains, service-owned `/srv`, pglite data and credentials
  were preserved. Broad root/home scans were not repeated; explicit bounded
  root-backed child measurements excluded network symlinks and mounts.
- Final own archive-process set and remaining `du` set were empty; all SSH
  probes returned, lock closed, no watcher/retry/gate remains armed.

## Evidence and checkout scope

Private local evidence:
`/home/rpw/.hermes/cache/scratch/stellarc-builder-root-r5/` (0700).
`recovery-index.json` is the compact handle/hash index. Detailed sanitized
receipts: `before.json`, `measure.json`, `provenance.json`, `links.json`,
`receipt-links.json`, `public-compare.json`, `base-completion.json`,
`acp-completion.json`, `credential-screen.json`, `archive-1b.json`,
`archive-2.json`, `archive-base.json`, `archive-3.json`, `archive-4.json`,
`await-archive.json`, `relocate-0.json` through `relocate-4.json`,
`relocate-base.json`, `final.json`, `quiet.json`, `closure-2.json`, and
`maple-health.json`. Raw transport is private, not pasted into this report.

Only this report was created/updated in the product checkout by this lane.
Pre-existing/concurrent app/config/package changes were left untouched.
