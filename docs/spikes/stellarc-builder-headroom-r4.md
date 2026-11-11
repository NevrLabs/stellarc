# Builder headroom recovery R4

## Result: memory recovered; root-disk gate remains blocked

Actual bounded recovery ran on authenticated `fxbuilder` (`fxcompute-01`) on
2026-11-09. Four proven-inactive, receipt-identified RAM verification trees were
preserved as verified private DeepVault PAX archives before removing their RAM
originals. One individually verified dangling Docker image was removed without
force. No heavy gate, test, build, product edit, deployment, workload kill,
service restart, reboot, trust change or compute/storage-policy change occurred.

**Parent must retain the heavy-gate HOLD.** Root still has only 667,512,832
available bytes at the second acceptance observation: **3,627,454,464 bytes
short of the required 4 GiB**. Memory and current pressure now meet their checks;
this is partial resource recovery, not a runnable-builder receipt.

## Measured before/after

All numbers below are actual guest counters, not Proxmox balloon estimates.
The observations were 20 seconds apart; UTC timestamps are recorded explicitly.

| Metric | Before, 03:19:36 UTC | After 1, 03:39:07 UTC | After 2, 03:39:27 UTC |
|---|---:|---:|---:|
| Root available bytes | 589,455,360 | 667,549,696 | 667,512,832 |
| MemAvailable bytes | 1,173,897,216 | 4,197,552,128 | 4,184,936,448 |
| `/dev/shm` used bytes | 4,426,924,032 | 1,458,892,800 | 1,458,892,800 |
| Memory PSI some/full avg10 | 0.00 / 0.00 | 0.00 / 0.00 | 0.00 / 0.00 |
| I/O PSI some/full avg10 | 1.52 / 1.49 | 0.21 / 0.17 | 0.21 / 0.21 |
| CPU PSI some avg10 | 0.24 | 0.06 | 0.12 |
| Swap total bytes | 0 | 0 | 0 |

RAM-backed `/dev/shm` occupancy fell by **2,968,031,232 bytes**, to 17.40% of
its configured 8,384,753,664-byte capacity. MemAvailable reached 3.90 GiB.
The kernel `oom_kill` counter was 6 in both post observations; memory PSI totals
did not increase between them. There is no claim that historical pressure
averages or the earlier OOM incident have been erased.

## Provenance, inactivity and preservation gate

The relocated trees identify Hermes verification HEAD
`17eb4dfee5fa8c40d85c5754d67e9857f21ecce5` and frozen snapshot/manifest
`6f520f66406758b117ea22842a59e3884c81546af46f3a0cd84938af11a07a78`.
They contain explicit owner PID/PGID receipts, terminal batch/completion records,
source identities and manifests. Their recorded owner processes were absent;
these were copied verification runs, not a main checkout or shared runtime.
All entries had UID/GID 1000, no special files, cross-device mounts, hardlinked
regular files, symlinks, or xattrs. Config-name screening found only copied
non-secret `.npmrc` source settings (engine/release-age controls), not credential
files; no credential values were emitted.

Before each archive and each relocation, a root-privileged whole-tree proof
checked every process's CWD/exe/root, argv, environment, FDs (path and inode),
and maps with exact path boundaries. Scanner/invoking ancestors were excluded.
The scan also checked owner PID receipts, `/proc/locks`, UNIX sockets, mount
references, loop backing files, special files and possible compiler/test jobs.
All relevant reference sets were empty, no permission gaps were reported, and
the shared `/home/rpw/ws/gate.lock` was acquired nonblocking. No lock was stolen
and no process was terminated. The scanner contains executable boundary checks,
including the `/target` versus `/target-dev` case.

Each archive streamed directly to DeepVault, not root or another RAM copy.
Every regular-file SHA-256, full member set, byte size, type, mode, UID/GID and
nanosecond mtime/atime was verified against a file manifest. Source stability
was rechecked. Before source removal, an independent readback rehashed the
archive and manifest and verified the source files against that manifest again.
Only then was the entire exact RAM tree removed. Receipts, logs, copied tools
and source bytes remain inside the archive; nothing was selectively discarded.

## Exact archive/action handles

On `fxbuilder`, private parent (UID 1000, mode 0700):
`/mnt/deepvault/stellarc-headroom-r4-20261109T0330Z-7e6ab8/`

Each directory below contains `payload.tar`, `files-manifest.json`,
`verified.json`, and `relocated.json`; files are mode 0600. Archive paths are
relative to that parent; original paths are under `/dev/shm/`.

| Original tree | Archive directory | Members | Logical file bytes |
|---|---|---:|---:|
| `final-20261108T191631Z-6f520f664067` | `final-20261108T191631Z-6f520f664067-pax2` | 30 | 346,878,655 |
| `final-20261108T191631Z-6f520f664067-b` | same as original basename | 66,434 | 1,335,056,588 |
| `timing-final-6f520f664067-20261108T1942Z` | same as original basename | 44,332 | 658,966,822 |
| `canonical-lint-original-ruff-6f520f664067-v1` | same as original basename | 22,217 | 334,643,496 |

Total: **133,013 members; 2,675,545,561 logical file bytes**. Allocation savings
are larger than logical file bytes because tmpfs allocates per-file pages.

Archive SHA-256 / manifest SHA-256, in table order:

1. `0a0831a28ef548594b47c7b740ebc206cffd6cd72f2710d792042deda5239cf6`
   / `018b8695ff09e4c006877706dca386fb6e5b4f7df05f05c6559356219126cf05`
2. `544dcf2690b95552978cef950c5c0cca71c4908f6d69808f2e0a12058046f621`
   / `59baf03c3254a39dfd2fcfa7fc88c059ee838b316586eee190d61b742b0a076b`
3. `5b45a8fdbd6d71e5df0a91a639354bf6daf622885009cad5232151bf27d3b20f`
   / `3c7bcc50f38dbe3660b78e493bca28e74133410fdbfad243d8302cd299ea773e`
4. `ff982ea43521bbdd25a8762816dcf49983489dee3fd4e1a3e6eda5310c85d413`
   / `63190fe5082659e346ae4299e14438dfff338e84ef59f832321e26c26f6ff57b`

Restore only to an explicitly chosen absent destination after fresh capacity and
inactivity checks; each PAX payload contains its original tree basename. Verify
payload/manifest hashes first, extract preserving numeric ownership/mode/mtime,
and use the manifest's nanosecond atimes if exact atime restoration is needed.
No automatic restore is armed. PAX preserves archive metadata; ctime/inode IDs
are filesystem identities and cannot be restored by ordinary copying.

An initial GNU tar attempt failed with `Operation not permitted` while opening
the NFS archive with `--atime-preserve=system`; it produced zero-byte payloads,
never authorized source removal, and was replaced by bounded stdlib PAX
streaming. Failed-attempt artifacts remain private in the unsuffixed first-tree
directory and `diagnostic.tar`; they are **not** recovery points. The `-pax2`
archive above is the verified first-tree recovery point.

## Docker/root recovery and honest residual blocker

Removed exactly this immutable ID with `docker image rm` (no force):
`sha256:0b9bd923bab0127b373544c9178781a0222f0fa60ffc0ecbedb0af170ac460a1`.
Immediately before removal it was dangling, had no tags and was referenced by
none of all six containers, including the stopped one. Immediate readback found
the image absent. Root availability rose from 580,780,032 to 667,553,792 bytes:
**86,773,760 bytes reclaimed**, much less than its 920,181,349-byte nominal size
because layers were shared. This was emergency space relief, not sufficient
budget to start a gate. No blanket image, system, container or volume prune ran.

Docker reports build-cache bytes **0**, so no speculative cache prune was run.
Post Docker inventory: 41 images, six containers (five running), 183 volumes;
volume bytes and all container identities were preserved. Its 7.596 GB of
"reclaimable" volumes and 7.989 GB of images are **not deletion authorization**.
Tagged images and Docker data remain untouched.

Root deleted-open regular-file inspection found **none**; no descriptor was
truncated or service bounced. `/run` used about 1.44 MB, `/run/lock` zero and
`/run/user/1000` 4 KiB. Maple's separate 1 GiB tmpfs used 92,839,936 bytes; the
pglite bind view refers to that same tmpfs and must not be double-counted.
Both Maple tmpfs mounts were preserved. Bounded root/home `du` scans timed out;
they are explicitly incomplete, and follow-up verified no `du` remained.
Narrow scans measured `/tmp` 1,468,256,256 bytes, `/var/tmp` 803,274,752 bytes,
`/var/log` 471,154,688 bytes and `/var/cache` 5,955,584 bytes. These inventories
are **not** owner/inactivity proofs or deletion lists.

Preserved untouched: `/dev/shm/native-delegate-v2` (860,905,472 allocated bytes),
`otel-consumer-v2-17eb4dfe`, `otel-producer-v2`, its logs/check script and tmp
prefix. Despite no observed process references, those trees have no sufficient
owner/completion receipts for this lane to authorize their relocation. Shared
Unix ownership and path names alone do not establish provenance. Moving more
RAM cannot solve root disk capacity anyway.

**Blocking decision:** an owner must identify/authorize additional root-backed
regenerable artifacts or a verified inactive root scratch relocation with at
least 3,627,454,464 additional bytes, plus allowance for ongoing writes. This
lane's permission covers proven RAM-tree preservation and narrowly verified
Docker dangling/cache cleanup, not tagged-image/volume deletion, foreign root
scratch removal, shared toolchains or repository relocation. No guessed approval
or request for speculative deletion was substituted.

## Continuity and closure

- Fresh normal authenticated `fxbuilder` SSH succeeded throughout and returned
  `fxcompute-01`; final uptime was 302,310 seconds, no guest reboot.
- All six Docker container IDs, running/stopped state, main PIDs, StartedAt and
  restart counts match baseline. No container or volume was removed.
- KFL PostgreSQL `pg_isready` returned 0. Maple fixture PostgreSQL initially
  returned 2 on the default/wrong socket probe; a follow-up derived its actual
  configured TCP port privately and `pg_isready` returned **0**, with its
  postmaster owning a listening socket. No fixture configuration was changed.
- Outline TLS/mock OIDC process identities remain alive unchanged; Mailpit's
  existing Docker health remains `healthy`. This is continuity evidence, not a
  fresh end-to-end Outline application test.
- SSH, guest-agent, journald and warp remain active with unchanged main PIDs and
  restart counts (journald's historical 36 and warp's historical 1 retained).
- 168 tracked non-ephemeral process identities remained alive with the same
  start ticks, including Stellarc, Maple telemetry, both dockerd processes and
  existing workers. No workload was killed by this lane.
- Maple Setup Health via the existing `talos:~/deploy/maple/bin/health.sh` returned
  0 at 03:41 UTC; transport and output retained privately, not printed.
- Post kernel journal query returned zero records in the lane window; coverage
  is limited, so that alone is not proof of no event. The stable sampled OOM
  counter and process identities are the stronger post-recovery evidence.
- Shared gate lock was reacquired/released as a final closure check. Remote
  probes returned; no own retry, watcher or detached recovery remains armed.
  **No heavy gates launched.**

## Private evidence

Local private scratch:
`/home/rpw/.hermes/cache/scratch/stellarc-builder-headroom-r4/`.
Sanitized JSON receipts: `before.json`, `ownership.json`, `activity-1.json`,
`disk-budget.json`, `provenance.json`, `pre-relocation.json`, `archive-plan.json`,
`lock-discovery.json`, `archive-v2-0.json` through `archive-v2-3.json`,
`relocated-first-two.json`, `relocated-last-two.json`, `docker-recovery.json`,
`post.json`, `final-check.json`, `service-check.json`, `maple-health.json`.
The existing sanitized transport helper was reused by a private R4 wrapper with
strict existing SSH trust, bounded remote execution and suppressed raw banners.
Raw transport files are 0600 in the private 0700 scratch directory; no argv,
environment or credential values were included in the report/JSON outputs.

Only this report was changed in the shared product checkout by this lane. Other
agents' pre-existing/concurrent changes remain untouched; no commit or push.
