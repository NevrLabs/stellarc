# ADR 0027 — Remote-run package and activity-provider protocol v1

Status: proposed · Date: 2026-07-18
Relates to: ADR 0008 (Hall/Envoy), ADR 0011 (jobs/capabilities), ADR 0012
(packages), ADR 0017 (durable jobs), ADR 0019 (CLI).

## Context

JOBS-2 supplies the authoritative attempt epoch, dispatch intent, ordered durable
output, cancellation, timeout, reconciliation, and JobRunner routing. EXEC-1
must add a reusable execution package without creating another job protocol or
an execution-environment abstraction.

Olympus is pre-release. This contract starts at protocol version `1` and accepts
exactly version `1`. There are no compatibility ranges, migration shims, or
feature thresholds.

## Decision

`olympus-remote-run` is one Rust package containing:

- a transport-independent worker-side execution core;
- an Olympus `job.run` activity-provider adapter that runs locally on the
  Hall-selected JobRunner Envoy; and
- a standalone CLI whose controller reaches an explicitly configured worker by
  SSH and invokes the same worker-side implementation.

Agent-facing Olympus calls select an activity and provider. They never accept an
SSH destination or unrestricted SSH command. SSH is only a standalone CLI
transport.

## Package contribution contract

The package manifest contribution is:

```toml
[package]
id = "core.remote-run"
version = "1.0.0"

[compatibility]
olympus_api = "0.1"

[[contributions.activity_provider]]
id = "remote-run"
provides = ["job.run"]
[contributions.activity_provider.definition]
protocol = 1
worker_command = "olympus-remote-run worker"
```

Installation computes and stores the immutable package `(id, version, digest)`.
Activation stores the reviewed grant set. Resolution pins the active
contribution and those stored values into the durable dispatch intent. The
invocation body cannot supply or override package identity, digest, grants,
organization, principal, secret values, node placement, or attempt identity.
The JobRunner rejects a dispatch unless its installed package identity and
grant set exactly match the pinned dispatch.

The provider protocol field must be the integer `1`. Missing or any other value
fails closed before execution.

## Invocation contract

The provider receives a host-authored envelope. JSON names are shown below;
unknown fields are rejected.

```json
{
  "protocol": 1,
  "attempt": {"jobId": "job-…", "epoch": 1},
  "package": {
    "id": "core.remote-run",
    "version": "1.0.0",
    "digest": "blake3:…",
    "grants": ["job.run"]
  },
  "workspace": {
    "root": "attempt",
    "inputs": [
      {"path": "src/main.rs", "digest": "blake3:…", "size": 123}
    ]
  },
  "argv": ["cargo", "test"],
  "environment": ["rust-build"],
  "cwd": "src",
  "cacheDirectories": ["target"],
  "timeoutSecs": 3600,
  "maxOutputBytes": 16777216,
  "artifacts": ["target/report.json"]
}
```

Rules:

- `argv` is non-empty and is executed directly; it is not a shell string.
- `environment` contains names of preconfigured, non-secret worker policies.
  The worker resolves names to environment maps. Callers cannot submit values.
  Secret mediation is not part of this contract.
- `workspace.root` is the per-attempt workspace selected by the worker. The
  caller-visible value is descriptive and cannot select a host path.
- Input, cwd, cache, and artifact paths are normalized relative paths. Absolute
  paths, `..`, symlinks, and any resolved path outside the attempt workspace are
  rejected.
- Workspace sync materializes only declared inputs and verifies size and BLAKE3
  digest before launch. There is no implicit home-directory sync.
- Cache directories are explicit workspace-relative directories. They are
  retained by worker policy and are not artifacts.
- Artifact paths are explicit. After process exit the worker reads only those
  paths, rejects symlinks/non-files, and reports size plus BLAKE3 digest.
- `timeoutSecs` and `maxOutputBytes` must be positive and within worker policy
  ceilings.

The first implementation may use a local source directory for standalone input
sync and the existing Hall dispatch payload for Olympus materialization. It must
not add image, sandbox, provisioning, provider-acquire, or deployment fields.

## Result and streaming contract

The worker emits JSON-lines records in increasing `sequence`, starting at zero:

```json
{"protocol":1,"attempt":{"jobId":"job-…","epoch":1},"sequence":0,"kind":"output","stream":"stdout","data":"…"}
{"protocol":1,"attempt":{"jobId":"job-…","epoch":1},"sequence":1,"kind":"result","exitCode":0,"truncated":false,"timedOut":false,"cancelled":false,"artifacts":[{"path":"target/report.json","size":42,"digest":"blake3:…"}]}
```

Output bytes count against one attempt-wide bound across stdout and stderr. A
terminal result follows all output and is emitted once. Artifact verification
failure is a failed terminal result, never a partial success.

In Olympus mode these records map onto JOBS-2 `JobOutput` and `JobResult` frames.
The Envoy spool assigns the authoritative sequence. Hall ACKs only after durable
acceptance. The adapter does not add another ACK, retry, epoch, or state machine.
In standalone mode the CLI forwards records over SSH and validates protocol,
attempt identity, ordering, terminal uniqueness, and artifact metadata before
returning the worker exit status.

## Cancellation, timeout, and recovery

The execution core starts each attempt in its own process group. Cancellation,
timeout, worker restart recovery, and output-channel failure kill the complete
process group. The durable attempt ledger is the JOBS-2 ledger in Olympus mode;
standalone worker mode uses the same ledger format and transitions.

Duplicate dispatch of the same `(jobId, epoch)` is idempotent. A newer epoch
fences older output/results. A restart marks an unprovable running attempt
`StepIndeterminate` after killing its recorded process group. A durably completed
attempt can replay its ordered output and terminal result. No layer claims
exactly-once process effects.

## Transport modes

- **Olympus:** Hall resolves identity/grants and chooses a JobRunner. Envoy calls
  the provider adapter in-process on that node. Nested SSH is forbidden.
- **Standalone:** the controller runs the configured SSH argv with no shell
  interpolation and invokes `olympus-remote-run worker`. Configuration supplies
  host/user/key/worker path; the invocation cannot override them.

SSH remains an external transport and is not versioned by this protocol.

## Extension seam

A future shared execution-environment manager may replace local process launch
behind the worker core while preserving invocation, records, attempt ledger, and
artifact verification. No execution-environment selector or placeholder is part
of v1. The seam is documented, not implemented.

## Rejected

- A second remote-job protocol for the CLI: duplicates JOBS-2 semantics.
- SSH from an Olympus provider: bypasses Hall placement and identity.
- Shell command strings: create quoting and injection ambiguity.
- Implicit whole-home sync or artifact collection: violates explicit authority.
- Sandboxing/image/provider-acquire placeholders: speculative and outside EXEC-1.
- Protocol ranges or rolling-upgrade shims: pre-release v1 is exact-match only.
