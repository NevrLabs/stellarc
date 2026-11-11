# Stellarc builder transport R1 — read-only diagnosis

## Verdict

**Builder transport remains blocked; do not resume the LLM gate. No verified usable builder handle was recovered.** The two reported builder aliases are the **same circuit**, not independent paths. Zephyr and Talos are reachable through an existing separate control route. Talos has a live management-interface route and a `REACHABLE` neighbor entry for the configured builder address, but the bounded SSH attempt from Talos also timed out before returning controlled builder output. This narrows the blocker beyond a generic Terminus outage; it does **not** prove the builder machine is down or identify a specific failed daemon.

Observation window: `2026-11-08T17:01:04Z` through `17:05:24Z`. Read R5, R4 recovery sections and replacement map; loaded both requested transport/offload skills. No new agent/thread, code gate, build/test, configuration/trust edit, restart, installation, remote state mutation, deployment, commit or push. Only this report and private sanitized receipts were written.

## Effective topology — private discovery, safe fields only

| Entry | Effective destination / path | Host-key alias | Proxy type |
|---|---|---|---|
| Terminus `fxbuilder`, `fxcompute-direct`, `fxcompute-01` | `rpw@localhost:22`; all same opaque endpoint/ProxyCommand | `fxcircuit` present | dumbpipe `connect`, stdio |
| Terminus `zephyr` | `rpw@localhost:22`, independent opaque endpoint | `zephyrcircuit` present | dumbpipe `connect`, stdio |
| Terminus `talos` | `rpw@192.168.69.1:22` via `fxdumb-ssh` | target has no explicit alias | ProxyJump |
| Terminus `fxdumb-ssh` | same opaque ProxyCommand as builder | **absent** | dumbpipe `connect`, stdio |
| Zephyr `talos` | `rpw@192.168.69.1:22`, no jump | absent; ordinary address-based checking | direct SSH |
| Talos `fxcompute-01` | `rpw@192.168.69.2:22`, no jump | absent; ordinary address-based checking | direct SSH |

Consequences:

- `fxcompute-direct` is not currently a direct-IP fallback; repeating it does not test an independent route.
- Terminus's default `talos` path depends on the very builder circuit being diagnosed. Its timeout is not evidence Talos is down.
- The verified independent **control** route is Terminus `zephyr` → Zephyr's existing `talos` alias. This reaches Talos, not builder compute. The nested Talos `fxcompute-01` hop did not succeed.
- Missing `HostKeyAlias` on `fxdumb-ssh` is a latent localhost known-host collision risk, not the observed blocker: no host-key failure was returned. No alias/trust repair was attempted.

Inspected configuration paths: `/home/rpw/.ssh/config`, `/etc/ssh/ssh_config`, `/etc/ssh/ssh_config.d/20-systemd-ssh-proxy.conf`; control-host alias facts came from each host's `/home/rpw/.ssh/config`. Builder identity-file path is `~/.ssh/terminus_to_fxcompute-01`; Zephyr uses `~/.ssh/terminus_to_zephyr`; existing downstream keys are `~/.ssh/zephyr_to_talos` and `~/.ssh/talos_to_fxcluster_ed25519`. Key contents, endpoint IDs, ProxyCommand argv, banners, environments and raw SSH/debug/config/process arguments were neither printed nor stored in receipts.

Effective local config uses `StrictHostKeyChecking=accept-new`; diagnostic SSH invocations explicitly requested `yes`, `UpdateHostKeys=no`, batch mode, one connection attempt, an eight-second connect timeout, and no multiplexed session. No known-host entries were changed: local config and known_hosts mtimes remained dated November 7, before this session.

## Executed bounded evidence

| Check | Result | Interpretation |
|---|---|---|
| Initial fresh `fxbuilder` SSH | exit255, 8.12 s; banner/proxy-stream timeout; no marker | No authenticated builder session |
| Initial default `talos` control | outer timeout recorded as exit124 at 25.02 s; no marker | Dependent on failed builder circuit; not independent host evidence |
| Initial fresh `zephyr` control | exit0, 0.81 s; controlled marker + `Fx-ZephyrusM16` | Independent circuit and SSH authentication work |
| Zephyr alias discovery | exit0 | Existing direct Talos alias retrieved, not guessed |
| Zephyr → Talos discovery | exit0 | Existing Talos builder LAN alias retrieved, not guessed |
| Single evidence-driven `fxbuilder` retry | exit255, 8.02 s; same banner/proxy-stream timeout | No recovery; no more builder-circuit retries |
| Zephyr → Talos → existing `fxcompute-01` alias | exit255, timeout classification, no builder JSON/identity | Independent management-route SSH also unusable; raw diagnostic phase was not retained, so do not call this definitively a TCP-connect versus SSH-banner timeout |
| Passive Talos route/neighbor read after failed LAN SSH | exit0; hostname `talos`; route `192.168.69.2 dev eth0`, source `192.168.69.1`; link `up`; neighbor `REACHABLE` | Management link and neighbor resolution exist. Does not prove SSH service health, actual host identity or builder workload state |

No polling loop or further active builder retry. The management address was obtained from Talos's existing effective SSH config before use. No subnet scan or guessed credentials/IPs. No T3 environment changes were necessary; linked-environment reachability was not mistaken for builder reachability.

### Local service/journal ownership

Local dumbpipe clients are spawned by SSH, not a discovered standalone builder-circuit service. PID/command-name and cgroup inspection (no argv/env) found a client in an existing Hermes worker scope and a client owned by `t3-forward-zephyr.service`. No local system/user service named dumbpipe/iroh/circuit was listed in the initial loaded-unit inventory.

`/home/rpw/.config/systemd/user/t3-forward-zephyr.service`: active/running, result `success`, main status0; active since November 7. `NRestarts=534` is a **cumulative historical counter**, not proof of current failure. Its last-45-minute journal query returned no entries. No journal text or secret-bearing transport banners were emitted. Talos loaded-unit discovery found no named dumbpipe/iroh/circuit service; this is not an exhaustive claim that Talos has no transport process. Builder service/journal inspection was unreachable.

## Full2 reconciliation boundary

Exact preserved target: `~/.cache/fxrun/workspaces/stellarc-integration-r3-full2-80c6e549aa4e`.

A read-only reconciliation payload was prepared for that target: archive digests, source-manifest checks, numeric child `.exit` receipts, terminal marker presence, process cwd inventory, narrowly named container inventory and read-only `/proc/locks` inspection. It produced **no controlled builder output**; none of those current states was verified. No lock was acquired/created, no snapshot synced or changed, and no runner/container/gate was launched.

R4's historical `format.exit=0`, `bounds.exit=0`, `seam.exit=124`, `gate.exit=141`, source hashes and free-lock/no-process observations remain historical. R5 launched no jobs. This report does not upgrade any historical receipt, assert an empty queue or prove the cancellation root cause.

## Required owner action / resume condition

**Owner: builder host/network operator, not the LLM implementation lane.** Use an already-authorized builder console or management access (not an assumed new route) to inspect, read-only:

1. Whether `192.168.69.2` is still the intended `fxcompute-01` host; interface/neighbor identity and any host/network ACL affecting Talos → TCP22. Talos sees a reachable neighbor but cannot establish the required authenticated SSH session.
2. `sshd` listener/service health, connection backlog/resource pressure and its recent connection logs. A common host-side SSH dependency could explain both routes, but is unproven.
3. Existing dumbpipe listener service, its loopback SSH target, pinned endpoint identity and sanitized session/relay failure logs. Do not rotate keys or restart it based solely on these timeouts.

No specific restart or config change is justified by this evidence. Exact daemon/relay root cause remains unresolved without builder-side evidence. If host-side SSH is healthy, the dumbpipe endpoint/session path needs owner investigation; independent Zephyr success rules out a blanket failure of all circuits, not a builder-specific relay/session fault.

Supervisor resumes only after a **fresh strict-host-key authenticated session** over the existing authorized builder route returns the expected builder identity and reads the exact full2 archive/source/exits/process/container/lock state. Then hand the usable transport to the LLM lane; this research lane launched no code gates.

## Private sanitized receipts

Directory `/home/rpw/.hermes/cache/scratch/stellarc-builder-transport-r1/` is mode0700; JSON receipts are mode0600:

- `discovery.json` — selected effective SSH fields, config paths, initial local unit inventory.
- `probe-batch.json` — bounded independent initial probes and classifications only.
- `control-discovery.json` — local forward state/journal classifications and Zephyr safe topology.
- `talos-control-discovery.json` — existing Talos builder alias metadata.
- `retry-and-builder-reconciliation.json` — one builder retry and independent LAN SSH failure, no remote receipt claim.
- `passive-management-route.json` — Talos hostname, route, link and neighbor state.
- `final-local-audit.json` — receipt modes and SSH-file metadata; no file contents.

Only allowlisted controlled remote JSON/markers and classified stderr were retained. No raw SSH/debug log, config, environment, key/token/endpoint banner or process argv is an artifact of this lane.
