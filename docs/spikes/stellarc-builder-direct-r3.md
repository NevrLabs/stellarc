# Builder direct Proxmox diagnosis R3

## Result

Direct owner-side diagnosis via existing Terminus → Zephyr → Proxmox management
verified VM6970 on `thinkcentre-01`. QMP console capture succeeded. During this
inspection the existing guest agent responded again, allowing real guest reads;
subsequent normal `fxbuilder` SSH authenticated and returned `fxcompute-01`.
No restart, resource change, cleanup or trust change was performed.

This supersedes the earlier **access** blocker, not the outstanding product gates.
Do not launch heavy gates yet: builder headroom is unsafe.

## Confirmed guest failures and present constraints

- Kernel journal records six OOM victims in the inspected 12-hour window:
  `tsrs` at 2026-11-08 22:31 WIB; `stellarc` at November 9 03:03 and 06:14;
  `at-spi-bus-laun`, `dbus-daemon`, and `warp-svc` also at 06:14 WIB.
  This is actual guest OOM evidence, not inference from host counters.
- Proxmox console shows repeated `systemd-journald` startup timeouts, restart
  count through 36, and journal-file corruption-or-unclean-shutdown warnings.
  Guest reads subsequently show journald active with NRestarts=36; SSH and
  guest agent active. No journal-file deletion or repair was attempted.
- Guest RAM about 7800 MiB, no swap. Current MemAvailable about 1087–1124 MiB.
  `/dev/shm` holds 4,426,924,032 bytes (about 4.12 GiB); major consumers are
  copied verification snapshots/toolchains, not merely process RSS. Sampled
  large files have no open descriptor/map references, but that does NOT prove
  entire directories inactive or authorize deleting another worker's artifacts.
- Root `/dev/sda1`: 101,281,816,576 bytes total, 96,520,138,752 used,
  607,125,504 available (579 MiB), `df` reports 100%. Inodes 57% used.
  `/var/lib/docker` uses 17,248,481,280 bytes; Docker reports 8.062 GB images
  and 7.596 GB volumes reclaimable. Reclaimable is NOT deletion authorization;
  volumes may contain evidence/data. No prune was executed.
- VM current balloon remains 8 GiB against 16 GiB maximum, cpulimit=2.
  Owner samples have around 7.5 GiB MemAvailable, no sampled host swap activity
  or OOM increment. These do not authorize changing protective resource policy.
- Actual guest-local SSH greeting, owner→192.168.69.2 SSH greeting and normal
  authenticated `fxbuilder` SSH all succeed now. No guest reboot occurred:
  uptime remains over three days.

**Diagnosis:** real guest memory exhaustion and service disruption occurred;
large RAM-backed verification trees and critically low root-disk headroom are
confirmed hazards. The precise contribution of each workload to every previous
SSH timeout is not reconstructed. Journal warnings do not prove filesystem or
physical-disk corruption. Avoid claiming a pure dumbpipe failure or a proven
single-workload cause.

## Existing Stellarc snapshot reconciliation (read-only)

`~/.cache/fxrun/workspaces/stellarc-integration-r3-full2-80c6e549aa4e` exists.
Recovered receipts: format=0, bounds=0, seam=124, gate=141. No process references
that exact snapshot were found by CWD/argv scan. Running containers are unrelated
named Maple/KFL/Outline fixtures; none was stopped. Source tar SHA-256:
`4a83a40012c70d304b4cadccc3598e6150e487ca5c76f304437604d6928452c7`;
owned tar SHA-256:
`80c6e549aa4eeeeeaab0e49b082e6cbae7dbdbcd42a87b17273ac785cb57cc43`.
This is partial reconciliation: full source/member validation, locks, resource
closure and final gates still required. No new gate launched.

## Next safe work

Establish ownership and whole-tree inactivity of the RAM-backed verification
artifacts, preserve required receipts on DeepVault, and use a specifically scoped
cleanup decision before deleting them. Inventory Docker image/volume ownership
separately; never prune volumes indiscriminately. Bound future verification RAM
and serialize heavy gates so control services retain headroom. Disk cleanup and
resource policy must be verified before resuming builds. No speculative reboot,
balloon increase or quota removal is needed to regain current access.

## Evidence

Private sanitized receipts and scripts:
`/home/rpw/.hermes/cache/scratch/stellarc-builder-management-r2/`:
`direct-console-r3.json`, `console-r3.png`, `fresh-health-r3.json`,
`guest-disk-r3.json`, `guest-cause-r3.json`, `guest-oom-r3.json`,
`guest-shm-r3.json`, `builder-ssh-r3.json`, `full2-r3-reconcile.json`.
Raw SSH transport output was suppressed. Guest-agent request logs can echo the
exec script: cause attribution uses kernel messages only, not keyword counts
from guest-agent exec-request logs. No secrets, process arguments or unit
ExecStart/environment values were included in the reported guest evidence.
