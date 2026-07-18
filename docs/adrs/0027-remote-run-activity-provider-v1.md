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
- an Olympus `job.run` activity-provider adapter that runs as the package
  entrypoint on the Hall-selected JobRunner Envoy; and
- a standalone CLI whose controller reaches an explicitly configured worker by
  SSH and invokes the same worker-side binary.

Agent-facing Olympus calls select an activity and provider. They never accept an
SSH destination or unrestricted SSH command. SSH is only a standalone CLI
transport. In both modes the worker launches a local process directly; no shell
or nested SSH is introduced by the provider.

## Package contribution contract

The v1 manifest is:

```toml
[package]
id = "core.remote-run"
name = "Olympus remote run"
version = "1.0.0"
publisher = "olympus"
license = "Apache-2.0"

[compatibility]
olympus_api = "0.1"
platforms = ["linux"]

[capabilities]
required = ["host.process.execute"]

[[contributions.activity_provider]]
id = "remote-run"
provides = ["job.run"]
[contributions.activity_provider.definition]
backend = "jobs"
protocol = 1
entrypoint = ["bin/olympus-remote-run", "provider"]
```

This parses as `PackageManifest`; activation additionally requires the durable
`job.run = "core.remote-run"` provider binding because `core.jobs` owns the
built-in binding until replaced. `provides = ["job.run"]` advertises an activity;
it is not an authority grant. The package's sole required v1 capability is
`host.process.execute`, reviewed and granted separately through registry v2.

The installer computes the immutable package `(id, version, digest)` and
materializes a digest-verified package root. Every `entrypoint` element is a
literal argv element. The first element must be a normalized relative path
beneath that root and resolve, without symlinks, to an executable regular file
covered by the package digest. Envoy resolves it from the installed root; it
never searches `PATH` and never invokes a shell. Remaining elements are fixed
manifest arguments. A missing file, digest mismatch, symlink, path escape, or
non-executable file fails before attempt launch.

Activation stores the reviewed grant set. Resolution pins the active
contribution, immutable package identity, and exact granted set into the durable
`JobDispatchIntent`. The invocation body cannot supply or override package
identity, contribution identity, digest, grants, organization, principal,
secret values, node placement, or attempt identity. The JobRunner rejects a
dispatch unless its installed package identity, entrypoint, and grants exactly
match the pinned dispatch.

The provider protocol field must be the integer `1`. Missing or any other value
fails closed before execution.

## Durable dispatch and invocation

EXEC-1 additively extends `JobDispatchIntent` and `HallFrame::DispatchJob` in
protocol v1 with:

- `contributionId` and integer `providerProtocol`;
- exact `grantedCapabilities`;
- `organizationId` and `initiatingPrincipal`;
- declared `inputs`, `cacheDirectories`, and `artifacts`; and
- the fields already landed in JOBS-2: attempt, package identity, activity,
  argv, environment-policy names, cwd, timeout, and output bound.

`nodeId` and `initiatingSession` remain Hall-side. Node identity is bound by the
selected authenticated Envoy connection, not trusted from duplicate payload
data. The package entrypoint is read from the installed manifest rather than
copied from an agent-facing request. Secret values are never carried; the
worker resolves named non-secret environment policies from local configuration.

The provider receives this host-authored envelope. JSON names are illustrative
of the typed wire fields; unknown fields are rejected.

```json
{
  "protocol": 1,
  "attempt": {"jobId": "job-…", "epoch": 1},
  "organizationId": "org-…",
  "initiatingPrincipal": "operator:…",
  "package": {
    "id": "core.remote-run",
    "version": "1.0.0",
    "digest": "blake3:…",
    "contributionId": "remote-run",
    "grantedCapabilities": ["host.process.execute"]
  },
  "workspace": {
    "inputs": [
      {"path": "src/main.rs", "blob": "blake3:…", "size": 123}
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
- The worker chooses the per-attempt workspace from configured state and the
  authoritative attempt identity. No payload field selects a host path.
- Input, cwd, cache, and artifact paths are normalized relative paths. Absolute
  paths, `..`, symlinks, and any resolved path outside the attempt workspace are
  rejected.
- Workspace sync materializes only declared inputs and verifies size and BLAKE3
  digest before launch. Files are written to a sibling temporary path, fsynced,
  renamed atomically, and the workspace directory is fsynced. There is no
  implicit home-directory sync.
- Cache directories are explicit workspace-relative directories. They are
  retained by worker policy and are not artifacts.
- Artifact paths are explicit. After process exit the worker reads only those
  paths, rejects symlinks/non-files, and verifies size plus BLAKE3 digest before
  publishing them.
- `timeoutSecs` and `maxOutputBytes` must be positive and within worker policy
  ceilings.

## Content carriage

A digest string is not byte carriage. Protocol v1 therefore includes a bounded,
content-addressed blob exchange used before dispatch and for artifact return.
Blob identity is BLAKE3 over the decoded bytes; sizes and per-attempt aggregate
ceilings are enforced before allocation.

In Olympus mode Hall owns durable input and artifact blobs. Before
`DispatchJob`, Hall sends each missing input over the authenticated selected
Envoy connection as ordered `StageJobBlob` chunks containing attempt identity,
digest, byte offset, and base64 data. Envoy writes a temporary file under its
configured content root and acknowledges only after final size/digest
verification, file fsync, atomic rename to the digest path, and parent-directory
fsync. `DispatchJob` is rejected until every declared input blob exists and
verifies. The worker hard-links or copies those immutable blobs into the
attempt workspace atomically.

After execution, Envoy verifies each declared artifact and sends ordered
`JobArtifact` metadata/chunks through the same JOBS-2 spool before the terminal
result. Hall durably stores the verified blob, then exposes the opaque
`/api/jobs/:jobId/artifacts/:path` retrieval handle authorized by the job's
organization and principal policy. `JobResult.artifacts` contains only
`{path,size,digest,contentHandle}` entries whose bytes Hall accepted durably.
Artifact transfer failure makes the terminal result failed; metadata without
retrievable bytes is never reported as success. Hall and Envoy content roots,
blob ceilings, ownership, garbage collection, and retention are operator
policy, never invocation fields.

In standalone mode the controller opens the configured SSH argv and streams the
same envelope plus ordered `input` chunk records on stdin. The configured worker
path is invoked as `worker`; the caller cannot override host, user, key, binary,
or state root. The worker returns artifact metadata/chunks on stdout. The
controller verifies size and digest, atomically writes only explicitly requested
artifact destinations, and reports success only after verification. Wire chunk
data is base64 in both modes.

## Output, result, and sequence ownership

Process stdout and stderr are arbitrary bytes. Provider/core events therefore
carry `dataB64`; truncation and `maxOutputBytes` count decoded source bytes read
from stdout and stderr before base64 encoding, across one attempt-wide bound.
Reading continues after the bound solely to drain pipes; excess bytes are not
spooled. A terminal result follows all accepted output and artifacts and is
emitted once.

The execution core emits unsequenced `Output`, `Artifact`, and `Result` events.
There is exactly one durable sequence allocator per attempt:

- in Olympus mode, Envoy's existing JOBS-2 `EventSpool::append_next` assigns the
  sequence to each `JobOutput`, `JobArtifact`, and `JobResult`; and
- in standalone mode, the worker uses the same spool primitive beneath its
  configured state root and writes the resulting sequenced JSONL records.

The mandatory ordering is `spool allocation + fsync → frame sequence → Hall
durable acceptance → ACK`. The provider never supplies a sequence and Envoy
never rewrites a provider sequence. Hall ACKs only after durable acceptance.
The adapter adds no ACK, retry, epoch, or state machine. The standalone
controller validates exact protocol, attempt identity, contiguous ordering,
terminal uniqueness, and artifact integrity before returning the process exit
status.

## Cancellation, timeout, and recovery

The execution core starts each attempt in its own process group. Cancellation,
timeout, worker recovery, and output-channel failure signal and then kill the
complete process group. No layer claims exactly-once process effects.

Olympus mode uses the JOBS-2 attempt ledger and spool unchanged. Standalone
workers use an operator-configured state root (recommended
`/var/lib/olympus-remote-run`) containing `attempts/`, `spool/`, `workspaces/`,
and `blobs/`; it is not caller-selectable. Before inspecting or mutating an
attempt, a worker takes an exclusive per-`(jobId, epoch)` filesystem lock.
Ledger writes use temporary-file write, file fsync, atomic rename, and parent
fsync. The running record includes attempt identity, package digest, invocation
digest, state, process-group id, spool high-water mark, and terminal result.
The running record is durable before execution is reported as started.

A duplicate with the same attempt and invocation digest replays the durable
spool or observes the locked running attempt; a different invocation digest is
rejected. A newer epoch fences older output/results and kills an older recorded
process group. On worker invocation/restart, recovery locks each running
attempt, kills the recorded process group if it still exists, and records
`StepIndeterminate`; it never silently reruns. A durably completed attempt
replays its ordered output and terminal result. Completed attempts, workspaces,
and unreferenced blobs are removed only by configured retention after their
ledger/spool retention deadline; active or indeterminate attempts are not
collected automatically.

## Transport modes

- **Olympus:** Hall resolves identity/grants and chooses a JobRunner. Envoy
  launches the digest-bound provider entrypoint locally on that node. Nested SSH
  is forbidden.
- **Standalone:** the controller executes a configured SSH argv with no shell
  interpolation and invokes the configured worker binary. Configuration
  supplies host/user/key/worker path/state root; invocation data overrides none
  of them.

SSH remains an external transport and is not versioned by this protocol.

## Extension seam

A future shared execution-environment manager may replace local process launch
behind the worker core while preserving invocation, events, attempt ledger, and
artifact verification. No execution-environment selector or placeholder is
part of v1. The seam is documented, not implemented.

## Rejected

- A second remote-job protocol for the CLI: duplicates JOBS-2 semantics.
- SSH from an Olympus provider: bypasses Hall placement and identity.
- A PATH-resolved or shell-string package entrypoint: it is not digest-bound.
- Provider-owned output sequences: they conflict with the JOBS-2 durable spool.
- Metadata-only input/artifact declarations: they do not carry retrievable bytes.
- Treating `provides = ["job.run"]` as a grant: provision and authority differ.
- Implicit whole-home sync or artifact collection: violates explicit authority.
- Sandboxing/image/provider-acquire placeholders: speculative and outside EXEC-1.
- Protocol ranges or rolling-upgrade shims: pre-release v1 is exact-match only.
