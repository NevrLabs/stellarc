# 0070 — Operator terminal workloads throttled the Axis control plane

**Date:** 2026-07-18
**Impact:** Axis accepted TCP connections but `/api/health` and authenticated API requests timed out. Talos disconnected and could not reconnect reliably while the control plane was throttled.

## What happened

A long UI test suite was launched from an Stellarc Axis-local persistent terminal. The tmux server, shell, and test workers inherited `stellarc-dev-axis.service`'s cgroup. Their combined memory crossed Axis's 3 GiB `MemoryHigh`; systemd throttled the entire cgroup, including the control-plane process. The host still had roughly 19 GiB available, so host-level memory metrics looked healthy while Axis itself was starved.

Temporarily raising Axis's runtime `MemoryHigh` restored the health endpoint without killing the active test. After the test exited, Axis's cgroup dropped back to normal usage.

## Root cause

Axis directly owns operator PTY/tmux child processes. User workloads therefore share the control plane's resource-governance boundary. A workload launched through the product can starve the product that supervises it.

## Corrective direction

Persistent terminal workloads must run in a separate workload slice or transient user service, with Axis retaining only the transport/control handle. The control-plane cgroup must contain Axis itself and bounded helpers—not arbitrary shells, builds, or test workers.

## Prevention

- Add a terminal acceptance test that inspects the spawned shell's cgroup and rejects Axis/Orbit service cgroups.
- Give terminal workloads explicit memory, PID, and CPU limits in a dedicated slice.
- Monitor both host pressure and service-cgroup `memory.current`, `memory.high`, `memory.events`, and task counts.
- Do not treat a responsive listener socket as service health; the HTTP health request must complete within a bounded deadline.
