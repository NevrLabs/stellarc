# ADR 0033 — Axis Configuration Authority, Orbit Execution Authority, and Desktop Modes

- Status: Accepted
- Date: 2026-07-23
- Supersedes in part: ADR 0002/0003/0008 where Axis owns active session transcripts/runtime events; ADR 0032 §1–§4 where full Axis requires PostgreSQL and Axis owns the complete session record
- Amends: ADR 0010 (desktop Axis connections), ADR 0024/0027 (bounded execution authority), ADR 0031 (one Orbit installation per host), ADR 0032 (edition topology)

## 1. Decision

Stellarc has three roles with one writable owner per fact:

| Role | Responsibility |
|---|---|
| UI | Presentation and client connection catalog; no product authority |
| Axis | Authoritative desired/configuration state and completed-history index |
| Orbit | Authoritative active session and job-run execution state |

Axis owns users, organizations, grants, Orbit enrollment and placement, workflow definitions and schedules, canonical vault state, projects/repository bindings, app/plugin packages and rollout policy, immutable execution assignments and budgets, and global query/search projections.

The assigned Orbit owns an active session or job run's event log, transcript, process/terminal state, workspace materialization, pending vault changes, usage accounting, and durable outbox until completion is admitted by Axis. Axis may project active state for global UI queries but that projection is not writable execution truth.

A session/run has exactly one Orbit owner for an assignment generation. There is no multi-writer active session and no transparent live-process migration.

## 2. Versioned assignments and bounded authority

Axis publishes immutable configuration revisions and signs a `RunAssignment` containing:

```text
run_id, owner_envoy_id, assignment_generation,
workflow/plugin/app/vault/model-policy revisions,
allowed tools/models/resources,
max cost/tokens/model calls/tool calls,
deadline, continuation policy
```

Orbit persists the assignment before execution. Its local provider/tool proxy enforces every quantitative limit outside the agent process. Orbit cannot mint a run, increase a budget, extend a deadline, install a Axis-managed package, or mutate canonical configuration.

When Axis is unreachable, Orbit may finish only work allowed by the persisted assignment, journal results, and permit local inspection/pause/stop. The default continuation policy finishes the current provider request and starts no new model call or workflow step. Larger disconnected permits are explicit configuration, never ambient authority.

Local control is subtractive only: inspect, pause, stop, reduce limits, export recovery data. Local start/resume, budget increase, grant change, package change, and canonical-vault mutation do not exist for Axis-managed work.

## 3. Reconciliation and replay

Each Orbit maintains a local SQLite event store and query projections for active sessions/runs. Mutations atomically append an event, update projections, and record an idempotent command receipt.

Orbit observations are identified by:

```text
(orbit_id, run_id, assignment_generation, orbit_sequence, event_id)
```

Orbit retains and retries unacknowledged observations. Axis validates owner/generation/assignment, admits them idempotently into its completed-history/global projection, then advances a durable acknowledgement. Axis projection loss is recoverable from Orbit snapshots and retained journals subject to retention policy; permanent Orbit loss requires that Orbit's backup.

Replay means deterministic reconstruction of control/history from recorded events, inputs, outputs, tool calls, usage, revisions, and artifacts. Re-execution is a new attempt because model/provider/external effects are nondeterministic.

Completion is a protocol transition: Orbit flushes the terminal event, transcript/run record, artifacts, and proposed vault changes; Axis admits them; only then may Orbit retire its authoritative active copy under retention policy.

## 4. Axis deployment and HA

Axis's reduced authority surface supports two modes over the same deterministic SQLite state machine:

| Mode | Topology | Guarantee |
|---|---|---|
| Standalone/lite | one Axis, local SQLite | restart/backup availability; no HA claim |
| Cluster/full | three Axis voters, one local SQLite per Axis, established replicated-log implementation | quorum-committed configuration authority; one Axis failure tolerated |

The replicated log orders control-plane mutations. It does not carry token streams, terminals, workspaces, active transcripts, provider process state, or large blobs. Each Axis applies committed typed commands deterministically to local SQLite. Package/vault/artifact bytes use digest-addressed replication referenced by the log.

Cluster writes require quorum. Followers may serve applied local projections and forward writes. Quorum loss is read-only: no new assignments, resumes, budget increases, ownership changes, grants, or configuration changes. Orbits continue only within existing bounded assignments, then pause.

Axis members have distinct Iroh endpoint keys and cluster-signed membership. UI and Orbits pin the Axis cluster identity, race known signed members, and resume streams by durable cursor. Consensus, snapshot transfer, membership change, and compaction use an established library; Stellarc does not invent an election protocol.

## 5. Desktop modes

Stellarc Desktop supports both modes concurrently:

1. **Local Axis mode:** UI plus one local standalone Axis using SQLite and an optional local user-tier Orbit. The local Axis appears in the normal connection catalog.
2. **Remote client mode:** dumb UI connecting independently to standalone or clustered external Axiss. No local Axis or Orbit is implied by connection.

A connection record contains cluster ID, display name, pinned cluster key, signed member endpoints, account, selected organization, credential-store reference, and `local|remote` presentation mode. Credentials and selected organizations are independent per Axis; there is no global Stellarc account.

Native desktop/mobile may connect to Axis through Iroh. Browser UI uses HTTPS or a transport bridge. Public UI deployment does not make Axis product state or execution authoritative.

## 6. Orbit installation and enrollment scope

An ordinary host has exactly one Orbit installation: one installation key, state root, service, and zero or one Axis enrollment. Installers must acquire a host-wide lock and refuse normal installation if any service, installation identity, state database, runtime lock, or responding socket indicates an existing or partial installation.

Existing installations are changed only by explicit `upgrade`, `repair`, `unenroll`, tier migration, or `uninstall`. A different Axis requires explicit unenroll/re-enroll; stale Axis capabilities, leases, assignments, and trusted keys are removed. Containerized multi-Orbit hosts are an explicit advanced topology with separate namespaces/state/identity, never an installer accident.

Each installation generates a non-exported Ed25519/Iroh key; `orbit_id` is its public key. Enrollment is one Axis cluster at a time and records tier, owner scope, capabilities, and enrollment epoch.

- User tier is bound to exactly one `(user, organization)` and runs as the installing OS user.
- System tier is root-installed, explicitly granted organizations, and runs assignments under per-user Unix identities.

Enrollment sets the ceiling; every signed assignment narrows it. Axis rejects scheduling outside the enrollment's user/org/tier/capability scope. Hostname and machine ID are collision signals, not identity authority.

## 7. Vaults, apps, and plugins

Axis owns canonical vault history and policy. Orbit materializes a pinned local workspace. Offline writes remain pending Orbit changes; Axis validates grants/base revision and admits or merges them into canonical history.

Axis owns package metadata, digest, signature, enabled version, grants, and rollout. Orbit owns only its content-addressed cache, installation observation, runtime process, health, and logs. Active runtimes may keep the last assigned version while disconnected only as allowed by their assignment.

## 8. Consequences

- Axis HA no longer replicates active execution data or processes.
- A fresh UI connects to any healthy Axis for the global projection and can route stop to the owning Orbit.
- A Axis outage cannot grant new work; Orbit-local budgets and the provider proxy bound consumption.
- Orbit loss affects its active runs; Axis loss affects configuration/admission but not local braking.
- Complete global active-state views may be stale for disconnected Orbits and must expose observation time/connectivity.
- Cross-node run movement is explicit pause/flush/new-generation/materialize/resume, not shared ownership.

## 9. Migration order

1. Add this authority matrix to protocol/storage tests and mark Axis active-session projections read-only.
2. Replace Orbit JSONL spool with SQLite event/projection/receipt/outbox storage, retaining the existing wire sequence/ACK contract.
3. Add immutable bounded `RunAssignment` and enforce it in Orbit provider/tool dispatch.
4. Move active session/job-run mutation authority to Orbit; Axis ingests projections/completion records only.
5. Add local subtractive Orbit API and verify stop under total Axis loss.
6. Add desktop connection catalog and local/remote Axis modes.
7. Add one-installation host guard and explicit enrollment lifecycle.
8. Add replicated Axis mode only after the standalone deterministic state-machine contract passes replay tests.

## 10. Rejected

- Axis-authoritative active process/transcript state — expands HA into live runtime replication and makes disconnection dangerous.
- Orbit-authoritative workflows/vault canonical state/packages/identity — turns global control into federation and partial query fan-out.
- One PostgreSQL authority — valid operationally, but rejected for the desired self-contained per-Axis replica topology.
- Independent writable Axis databases without consensus — split authority.
- Multi-leader/CRDT control state — configuration, grants, budgets, and ownership require one order.
- Multiple ordinary Orbits per host — ambiguous host authority and resource accounting.
- Reactive self-elected Cloudflare gateways — public ingress is UI deployment, not worker authority.
