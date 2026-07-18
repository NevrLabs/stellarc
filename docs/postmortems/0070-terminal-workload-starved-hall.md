# 0070 — Operator terminal workloads throttled the Hall control plane

**Date:** 2026-07-18
**Impact:** Hall accepted TCP connections but `/api/health` and authenticated API requests timed out. Talos disconnected and could not reconnect reliably while the control plane was throttled.

## What happened

A long UI test suite was launched from an Olympus Hall-local persistent terminal. The tmux server, shell, and test workers inherited `olympus-dev-hall.service`'s cgroup. Their combined memory crossed Hall's 3 GiB `MemoryHigh`; systemd throttled the entire cgroup, including the control-plane process. The host still had roughly 19 GiB available, so host-level memory metrics looked healthy while Hall itself was starved.

Temporarily raising Hall's runtime `MemoryHigh` restored the health endpoint without killing the active test. After the test exited, Hall's cgroup dropped back to normal usage.

## Root cause

Hall directly owns operator PTY/tmux child processes. User workloads therefore share the control plane's resource-governance boundary. A workload launched through the product can starve the product that supervises it.

## Corrective direction

Persistent terminal workloads must run in a separate workload slice or transient user service, with Hall retaining only the transport/control handle. The control-plane cgroup must contain Hall itself and bounded helpers—not arbitrary shells, builds, or test workers.

## Prevention

- Add a terminal acceptance test that inspects the spawned shell's cgroup and rejects Hall/Envoy service cgroups.
- Give terminal workloads explicit memory, PID, and CPU limits in a dedicated slice.
- Monitor both host pressure and service-cgroup `memory.current`, `memory.high`, `memory.events`, and task counts.
- Do not treat a responsive listener socket as service health; the HTTP health request must complete within a bounded deadline.
