# Stellarc builder management R2 — read-only owner-side diagnosis

## Verdict

**Independent Proxmox management works. Builder compute remains blocked.** Live cluster inventory twice identifies **QEMU VM6970 `fxcompute-01`, currently owned by `thinkcentre-01`**. The owning node is reachable through existing Zephyr management access with strict existing host-key trust. QEMU reports running and its uptime advances; the guest's existing QEMU agent does **not** answer (`qm agent 6970 ping`: exit255, classified `guest-agent-not-running`). This is not proof that the guest OS is down, nor proof that the agent service is stopped rather than stalled.

**No guest exec was attempted:** the required agent-health prerequisite failed. Guest hostname, SSH listener/services, dumbpipe listener, guest connection/OOM logs and full2 workload state remain unverified. Do not resume gates or claim a recovered builder SSH handle.

Observation receipts: `2026-11-08T17:09:58Z` through `17:12:03Z` (November 9 WIB). Full R1 was read. Required Proxmox, dumbpipe and Linux resource-pressure skills were loaded. Historical VM/node details were used only as lookup hints; live inventory preceded all VM-specific reads. No repeated builder-alias probes or Talos→builder SSH workstream.

## Verified management handle and trust

- Existing management entry: `pve-tc01`, effective destination `root@192.168.2.21:22`; authenticated remote hostname **`thinkcentre-01`**.
- Independent route: **Terminus → existing `zephyr` circuit → `pve-tc01`**. The task's `ssh -o ProxyJump=zephyr pve-tc01` route was implemented with an explicit SSH `-W` jump so strict options also apply to the jump. No SSH configuration was edited.
- Both jump and destination used `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, batch mode, one connection attempt, 8-second connect timeout, 5-second keepalive/one missed keepalive, and no multiplexed session. Existing trust only; no new key acceptance or trust repair.
- Effective local config was parsed privately for `zephyr`, `pve-tc01`, `akasha`, `pve-tc02`. Default PVE aliases still depend on `fxcompute-direct`; using them without the existing Zephyr override would not test independent management. Other PVE nodes were **not** separately contacted once live ownership resolved to tc01.
- Transport output was captured privately in memory. Only controlled post-marker JSON and allowlisted fields/classifications were retained. No proxy argv, key material, environment, endpoint ID, banner, raw SSH errors or process argv was displayed or saved in receipts.
- Four bounded owner-side sessions succeeded: cluster discovery 5.38 s; owner-state 14.93 s; agent classification/status 7.99 s; final ownership/counter check 9.28 s. Each constituent command had a timeout; no polling loop.

## Current ownership, status and resources

| Evidence | Current observation |
|---|---|
| Cluster node inventory | `thinkcentre-01`, `thinkcentre-02`, `akasha`: online in PVE inventory; this is not exhaustive cluster/storage health certification |
| Cluster guest inventory, first and final | VM6970, name `fxcompute-01`, node `thinkcentre-01`, type qemu, running |
| Owner status | `status=running`, `qmpstatus=running`; uptime 264586 → 264629 → 264670 seconds |
| Existing agent configuration | `enabled=1,fstrim_cloned_disks=1`; enablement is not liveness |
| Agent liveness | Initial ping exit255; second bounded ping exit255 in 4.50 s, classified from suppressed diagnostic as `guest-agent-not-running` |
| Configured CPU | 4 cores × 1 socket, `cpulimit=2`, `cpuunits=50` |
| Configured memory | `memory=16384` MiB, balloon floor `8192` MiB |
| Current balloon | actual 8589934592 bytes; max 17179869184 bytes; guest-reported total 8179572736 bytes |
| Balloon free-memory series | 181899264 → 177545216 → 173600768 bytes (last ≈165.56 MiB); **free**, not guest `MemAvailable` |
| Balloon major-fault series | 8388947 → 8428301 → 8459807; +70860 over 84 s of balloon timestamps, ≈843.57/s |

Balloon timestamps and fault counters advance despite the agent failure. Balloon telemetry and QEMU agent RPC are different channels. QEMU being scheduled and the VM being marked running do not establish usable guest services. No guest identity was verified by `hostname`; `fxcompute-01` above is the PVE inventory/config name.

Historical skill notes about a 24 GiB maximum and a previously applied 12 GiB floor do **not** match the current configuration. No historical fix was reapplied. Low free memory and rising major faults support a guest-memory/reclaim hypothesis, but cannot establish available memory, swap, OOM, per-workload attribution or causality without guest evidence.

## Owning host and QEMU pressure

Two owner-host snapshots were separated by 5 seconds; a later QEMU cgroup pair spans 5.002 seconds.

| Scope | Measured evidence | Interpretation / limit |
|---|---|---|
| Host RAM | total 40960536 KiB; `MemAvailable` 6354608 → 6299972 KiB (≈6205.67 → 6152.32 MiB) | Host had available RAM in this window; not proof that a resource increase is safe under later load |
| Host swap | total 18628736 KiB; used 2573628 KiB; priority100 device held the used pages, lower-priority device unused | Occupancy alone is not active swapping; no device-health claim |
| Host swap activity | `pswpin=2738112`, `pswpout=3322307` unchanged across samples | No sampled swap-in/out delta |
| Host memory pressure | some avg10 0.02 → 0.01; full avg10 0.00; `oom_kill=0` unchanged | No sampled host OOM or significant current host memory stall; not guest OOM evidence |
| Host CPU | load1 6.77 → 6.31 on 4 logical CPUs; CPU PSI some avg10 ≈59% | CPU contention is present |
| Host I/O PSI | some avg10 0.40 → 0.45%, avg60 13.91 → 13.04%; full avg10 0.00% | Longer-window contention, little current full stall; no Ceph/disk-specific cause established |
| QEMU cgroup RAM/PIDs | memory max/high `max`; OOM/high/max/sock-throttled counters zero; 12 tasks, limit43759, PID-limit events zero | No observed host-side QEMU memory/PID limit hit |
| QEMU cgroup CPU | `cpu.max=200000 100000`; 1.948 CPU cores consumed over 5.002 s; +34 throttled periods out of +50, +2918464 throttled µs | Existing 2-core quota is actively binding. Cgroup CPU PSI some avg10 ≈50–51%, full ≈32–33%. This does not authorize relaxing the protective quota |
| QEMU cgroup memory/I/O PSI | avg10 some/full zero in samples | Host QEMU cgroup pressure is not guest-internal memory/I/O pressure |
| Owner kernel journal, last30 min | query exit0; **zero records returned** | OOM/blocked-task/I/O-error pattern counts were zero **because no records were returned**; not a clean-log or no-incident guarantee |

The API's instantaneous VM `cpu=0` values are not treated as idle evidence: direct cgroup deltas prove CPU consumption. No raw journal text, process arguments, environments or service definitions were collected. No additional cluster-wide storage sweep was needed to establish this bounded management result.

## Required next operator action / repair boundary

**Management is accessible; guest-internal observability is the blocker.** The next owner action is an existing authorized **Proxmox console for VM6970 on thinkcentre-01** (not another builder SSH alias). Authenticate privately using existing operator access. Read-only console inspection should establish:

1. Actual guest `hostname`, uptime, `MemAvailable`, swap, memory/CPU/I/O PSI and OOM/resource counters.
2. TCP22 listener (`ss -ltn 'sport = :22'`), then allowlisted `systemctl show` fields for existing `ssh`/`sshd`, `qemu-guest-agent` and discovered existing dumbpipe listener units: `LoadState`, `ActiveState`, `SubState`, `Result`, `MainPID`, `NRestarts`, `ExecMainStatus`, `MemoryCurrent`, `TasksCurrent`. Do not dump `ExecStart`, environment, status process trees or unit contents.
3. Sanitized recent connection/listener/OOM counts only; no raw journals, command lines, keys or tokens. If the console is also unresponsive, record that fact and current owner counters; it still does not authorize reboot.

**No narrow repair is established yet.** There are two measured candidate constraints—small actual balloon allocation with rising guest major faults, and active CPU quota throttling—but neither isolates the SSH/agent failure. Do not replay the historical balloon command, increase memory/CPU, kill a workload, restart SSH/agent/dumbpipe or reboot from this evidence. The supervisor must obtain current console proof, then seek a native decision for an exact scoped repair with host-headroom and active-work risks stated. Console authentication is an operator prerequisite, not permission to provision a new route or change credentials.

## Full2 boundary and forbidden actions

Preserved target: `~/.cache/fxrun/workspaces/stellarc-integration-r3-full2-80c6e549aa4e`.

No guest `hostname`/service recovery was proven, so full2 archive/source/exits/process/container/lock reconciliation was **not** attempted. R1/R4 historical receipts remain historical. No claim of completed gates, empty queues, unlocked workspace, stopped jobs or natural recovery.

No guest exec, package installation, service start/restart, VM/host restart, resource/balloon change, kill, snapshot, migration, storage/disk/EBS action, ACL/firewall/trust/config write, source edit, build/test, deploy, DB/provider/inference action, commit or push. No compute-host switch, child agent or top-level thread. Other workers' artifacts were not changed. The only repository write is this report; scratch contains the sanitized evidence and diagnostic sources.

## Private sanitized evidence

Directory: `/home/rpw/.hermes/cache/scratch/stellarc-builder-management-r2/` (mode0700; files mode0600, verified recursively).

- `effective-management-config.json`: safe effective destinations/trust/routing classifications only.
- `cluster-discovery.json`: live allowlisted node/guest inventory.
- `owner-state.json`: current VM configuration/status, initial ping result, paired host/cgroup counters and kernel-event count coverage.
- `agent-liveness.json`: classified agent failure and independent fresh status read.
- `owner-final.json`: ownership recheck, final balloon/status and paired QEMU cgroup CPU/resource counters.
- `derived.json`: computed deltas, rates and unit conversions.
- `probe.py`, `cluster.py`, `owner.py`, `liveness.py`, `owner-final.py`, `derive.py`: read-only diagnostic/receipt sources; no credentials or raw transport traces.

Final handback: **verified owner-management handle via Zephyr; no verified usable builder-compute handle. Escalate to existing VM console inspection, not speculative repair.**
