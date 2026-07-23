# ADR 0033 — Hall Configuration Authority, Envoy Execution Authority, and Desktop Modes

- Status: Accepted
- Date: 2026-07-23
- Supersedes in part: ADR 0002/0003/0008 where Hall owns active session transcripts/runtime events; ADR 0032 §1–§4 where full Hall requires PostgreSQL and Hall owns the complete session record
- Amends: ADR 0010 (desktop Hall connections), ADR 0024/0027 (bounded execution authority), ADR 0031 (one Envoy installation per host), ADR 0032 (edition topology)

## 1. Decision

Olympus has three roles with one writable owner per fact:

| Role | Responsibility |
|---|---|
| UI | Presentation and client connection catalog; no product authority |
| Hall | Authoritative desired/configuration state and completed-history index |
| Envoy | Authoritative active session and job-run execution state |

Hall owns users, organizations, grants, Envoy enrollment and placement, workflow definitions and schedules, canonical vault state, projects/repository bindings, app/plugin packages and rollout policy, immutable execution assignments and budgets, and global query/search projections.

The assigned Envoy owns an active session or job run's event log, transcript, process/terminal state, workspace materialization, pending vault changes, usage accounting, and durable outbox until completion is admitted by Hall. Hall may project active state for global UI queries but that projection is not writable execution truth.

A session/run has exactly one Envoy owner for an assignment generation. There is no multi-writer active session and no transparent live-process migration.

## 2. Versioned assignments and bounded authority

Hall publishes immutable configuration revisions and signs a `RunAssignment` containing:

```text
run_id, owner_envoy_id, assignment_generation,
workflow/plugin/app/vault/model-policy revisions,
allowed tools/models/resources,
max cost/tokens/model calls/tool calls,
deadline, continuation policy
```

Envoy persists the assignment before execution. Its local provider/tool proxy enforces every quantitative limit outside the agent process. Envoy cannot mint a run, increase a budget, extend a deadline, install a Hall-managed package, or mutate canonical configuration.

When Hall is unreachable, Envoy may finish only work allowed by the persisted assignment, journal results, and permit local inspection/pause/stop. The default continuation policy finishes the current provider request and starts no new model call or workflow step. Larger disconnected permits are explicit configuration, never ambient authority.

Local control is subtractive only: inspect, pause, stop, reduce limits, export recovery data. Local start/resume, budget increase, grant change, package change, and canonical-vault mutation do not exist for Hall-managed work.

## 3. Reconciliation and replay

Each Envoy maintains a local SQLite event store and query projections for active sessions/runs. Mutations atomically append an event, update projections, and record an idempotent command receipt.

Envoy observations are identified by:

```text
(envoy_id, run_id, assignment_generation, envoy_sequence, event_id)
```

Envoy retains and retries unacknowledged observations. Hall validates owner/generation/assignment, admits them idempotently into its completed-history/global projection, then advances a durable acknowledgement. Hall projection loss is recoverable from Envoy snapshots and retained journals subject to retention policy; permanent Envoy loss requires that Envoy's backup.

Replay means deterministic reconstruction of control/history from recorded events, inputs, outputs, tool calls, usage, revisions, and artifacts. Re-execution is a new attempt because model/provider/external effects are nondeterministic.

Completion is a protocol transition: Envoy flushes the terminal event, transcript/run record, artifacts, and proposed vault changes; Hall admits them; only then may Envoy retire its authoritative active copy under retention policy.

## 4. Hall deployment and HA

Hall's reduced authority surface supports two modes over the same deterministic SQLite state machine:

| Mode | Topology | Guarantee |
|---|---|---|
| Standalone/lite | one Hall, local SQLite | restart/backup availability; no HA claim |
| Cluster/full | three Hall voters, one local SQLite per Hall, established replicated-log implementation | quorum-committed configuration authority; one Hall failure tolerated |

The replicated log orders control-plane mutations. It does not carry token streams, terminals, workspaces, active transcripts, provider process state, or large blobs. Each Hall applies committed typed commands deterministically to local SQLite. Package/vault/artifact bytes use digest-addressed replication referenced by the log.

Cluster writes require quorum. Followers may serve applied local projections and forward writes. Quorum loss is read-only: no new assignments, resumes, budget increases, ownership changes, grants, or configuration changes. Envoys continue only within existing bounded assignments, then pause.

Hall members have distinct Iroh endpoint keys and cluster-signed membership. UI and Envoys pin the Hall cluster identity, race known signed members, and resume streams by durable cursor. Consensus, snapshot transfer, membership change, and compaction use an established library; Olympus does not invent an election protocol.

## 5. Desktop modes

Olympus Desktop supports both modes concurrently:

1. **Local Hall mode:** UI plus one local standalone Hall using SQLite and an optional local user-tier Envoy. The local Hall appears in the normal connection catalog.
2. **Remote client mode:** dumb UI connecting independently to standalone or clustered external Halls. No local Hall or Envoy is implied by connection.

A connection record contains cluster ID, display name, pinned cluster key, signed member endpoints, account, selected organization, credential-store reference, and `local|remote` presentation mode. Credentials and selected organizations are independent per Hall; there is no global Olympus account.

Native desktop/mobile may connect to Hall through Iroh. Browser UI uses HTTPS or a transport bridge. Public UI deployment does not make Hall product state or execution authoritative.

## 6. Envoy installation and enrollment scope

An ordinary host has exactly one Envoy installation: one installation key, state root, service, and zero or one Hall enrollment. Installers must acquire a host-wide lock and refuse normal installation if any service, installation identity, state database, runtime lock, or responding socket indicates an existing or partial installation.

Existing installations are changed only by explicit `upgrade`, `repair`, `unenroll`, tier migration, or `uninstall`. A different Hall requires explicit unenroll/re-enroll; stale Hall capabilities, leases, assignments, and trusted keys are removed. Containerized multi-Envoy hosts are an explicit advanced topology with separate namespaces/state/identity, never an installer accident.

Each installation generates a non-exported Ed25519/Iroh key; `envoy_id` is its public key. Enrollment is one Hall cluster at a time and records tier, owner scope, capabilities, and enrollment epoch.

- User tier is bound to exactly one `(user, organization)` and runs as the installing OS user.
- System tier is root-installed, explicitly granted organizations, and runs assignments under per-user Unix identities.

Enrollment sets the ceiling; every signed assignment narrows it. Hall rejects scheduling outside the enrollment's user/org/tier/capability scope. Hostname and machine ID are collision signals, not identity authority.

## 7. Vaults, apps, and plugins

Hall owns canonical vault history and policy. Envoy materializes a pinned local workspace. Offline writes remain pending Envoy changes; Hall validates grants/base revision and admits or merges them into canonical history.

Hall owns package metadata, digest, signature, enabled version, grants, and rollout. Envoy owns only its content-addressed cache, installation observation, runtime process, health, and logs. Active runtimes may keep the last assigned version while disconnected only as allowed by their assignment.

## 8. Consequences

- Hall HA no longer replicates active execution data or processes.
- A fresh UI connects to any healthy Hall for the global projection and can route stop to the owning Envoy.
- A Hall outage cannot grant new work; Envoy-local budgets and the provider proxy bound consumption.
- Envoy loss affects its active runs; Hall loss affects configuration/admission but not local braking.
- Complete global active-state views may be stale for disconnected Envoys and must expose observation time/connectivity.
- Cross-node run movement is explicit pause/flush/new-generation/materialize/resume, not shared ownership.

## 9. Migration order

1. Add this authority matrix to protocol/storage tests and mark Hall active-session projections read-only.
2. Replace Envoy JSONL spool with SQLite event/projection/receipt/outbox storage, retaining the existing wire sequence/ACK contract.
3. Add immutable bounded `RunAssignment` and enforce it in Envoy provider/tool dispatch.
4. Move active session/job-run mutation authority to Envoy; Hall ingests projections/completion records only.
5. Add local subtractive Envoy API and verify stop under total Hall loss.
6. Add desktop connection catalog and local/remote Hall modes.
7. Add one-installation host guard and explicit enrollment lifecycle.
8. Add replicated Hall mode only after the standalone deterministic state-machine contract passes replay tests.

## 10. Rejected

- Hall-authoritative active process/transcript state — expands HA into live runtime replication and makes disconnection dangerous.
- Envoy-authoritative workflows/vault canonical state/packages/identity — turns global control into federation and partial query fan-out.
- One PostgreSQL authority — valid operationally, but rejected for the desired self-contained per-Hall replica topology.
- Independent writable Hall databases without consensus — split authority.
- Multi-leader/CRDT control state — configuration, grants, budgets, and ownership require one order.
- Multiple ordinary Envoys per host — ambiguous host authority and resource accounting.
- Reactive self-elected Cloudflare gateways — public ingress is UI deployment, not worker authority.
