# ADR 0031 — Node Install Tiers: Root Orbit, Per-User Unix Identities, Org Groups

- Status: Proposed
- Date: 2026-07-21
- Relates to: ADR 0005 (org = hard boundary), 0008 (unit placement), 0011 §5
  (bwrap no-root), 0014 (unprivileged edge), 0015 (rootless podman), 0017
  (static OS identities), 0022 (human RBAC), 0024 (secret store), 0027
  (sharing, BYOK, shared nodes)
- Amends: ADR 0008 (system vs user units per tier), 0011 §5 (where root
  lives), 0015 (per-user subuid ranges), 0017 (its four static identities
  become the pre-provisioned subset of this scheme)

## 1. Decision

Nodes have two tiers:

| Tier | Install | Process identity | Scope cap | For |
|---|---|---|---|---|
| **user** (today; was "personal") | rootless; user-mode systemd; `~/.stellarc` | everything as the installing user | **exactly 1 user, 1 org** | single-human nodes; unprivileged LXC/WSL |
| **system** (new; was "tenant") | root-installed; orbit = root system daemon; `/var/lib/stellarc` | per-user Unix accounts + per-org groups | multi-user, multi-org | shared nodes, BYOK, team orgs |

**The scope cap is structural, not a license flag.** A user install has one
uid and no way to create accounts or groups — there is no mechanism to
isolate a second user or a second org. So it doesn't offer them: enrollment
registers the node bound to the installing user's identity and its single
org; Axis rejects scheduling any other principal's work there (rule 1
below already implies this; now it's total, not just BYOK/multi-user
sessions). Multi-org on one host = system install, or two user installs
under two real Unix accounts.

System-tier identity mapping:

- **Unix user per (registered user × node)** — `stellarc-u-<user_slug>`,
  lazily created by the orbit on that user's first execution on the node.
- **Unix group per org** — `stellarc-o-<org_slug>`; member accounts join it.
- **A session runtime runs as the session owner's account.** Drive grants
  (ADR 0027 §1) never change process identity; attribution stays in
  `sender_id` at the event layer (ADR 0027 §2).
- **Org resource tree is group-owned** (setgid, `g+rw`): repos, vaults,
  session spaces. In-org sharing keeps working because the org is the
  content trust boundary (ADR 0005 §3, ADR 0027 §1).
- **Per-user runtime dir** (`0700`) holds materialized credentials and
  ADR 0024 leases — BYOK isolation is enforced by the kernel, not by
  sandbox-profile discipline.
- **Orbit is root** (kubelet precedent) and drops privileges at spawn:
  sessions launch as `systemd-run` transient units
  (`--uid --gid --slice stellarc-u-<user>.slice`). Per-user cgroup
  accounting, quotas, and OOM attribution (ADR 0002 §11.1) fall out of the
  slice tree.

Filesystem (system tier; replaces `~/.stellarc` on such nodes; interior
layout per ADR 0005 unchanged):

```text
/var/lib/stellarc/
├── orbit/                    # root-owned orbit state (spool, index, token)
├── orgs/<org_slug>/          # ADR 0005 tree; root:stellarc-o-<org>, setgid
│   └── repos/ vaults/ sessions/ workflows/ ...
└── users/<user_slug>/        # 0700 stellarc-u-<user>; creds, leases, caches
```

## 2. Why (compressed)

ADR 0027 promises BYOK "even on shared nodes." Under one shared Unix user
with `HostDirect` as the default sandbox (ADR 0002 §12.2), any co-resident
agent can read any other user's leased credential, the orbit spool, and the
installation token. bwrap profiles are policy; a UID is a boundary.
Per-user accounts are the smallest mechanism that makes ADR 0027 true; the
org group preserves the declared content trust boundary.

k8s analogy, corrected: Axis=apiserver, Orbit=kubelet (root node daemon),
session=pod, bwrap=runtime — but k8s anonymizes workload UIDs. Durable
per-human state on shared machines is the classic multi-user Unix model;
that is the simpler, correct model here, supervised by systemd.

## 3. Normative rules

1. Tier is a node fact carried in `Hello`. Axis schedules **fail-closed**:
   a user-tier node serves exactly one (user, org) pair — its enrolling
   identity. BYOK leases, axis-managed creds, other users' or orgs'
   sessions never land there.
2. Account/group **names** are the stable key; numeric uid/gid are per-node
   and never cross a node boundary. No cross-node FS sharing exists (ADR
   0005 sync is jj/event-level), so there is no uid-mapping problem.
3. The orbit's privileged surface is internal and minimal: `ensure_user`,
   `ensure_org_group`, `spawn_as`, `set_quota`. Argument arrays only, no
   shell strings; one audit event per call.
4. ADR 0011 §5 stands: bwrap needs no root *inside* the user account; root
   lives only in the supervisor.
5. Edge stays unprivileged (`stellarc-edge`, ADR 0014/0017). Managed apps
   (ADR 0015) run under the owning user's account; subuid/subgid ranges are
   provisioned at account creation for rootless podman.
6. Dynamic accounts: nologin shell, no `/home` entry, `stellarc-` prefix;
   removal tombstones the account (uid never reused while files remain).

## 4. Migration order (each step independently shippable)

1. Node tier field in `Hello` + fail-closed scheduling constraint in Axis
   (no behavior change on existing nodes — all are user-tier).
2. Orbit spawn seam: `spawn_as` via `systemd-run` behind the tier flag;
   user tier keeps the direct-spawn path.
3. System installer: root install, `/var/lib/stellarc`, `sysusers.d`/
   `tmpfiles.d` fragments, orbit system unit (hardened: `ProtectSystem=
   strict` + explicit `ReadWritePaths`).
4. Org groups + setgid tree materialization; per-user runtime dirs; move
   credential materialization there.
5. BYOK lease delivery gated on system tier (completes the ADR 0027 §3
   matrix).
6. Existing shared dev nodes migrate by re-enrollment as system tier; no
   in-place uid surgery on live trees.

## 5. Spike flags

- SPIKE: `systemd-run --uid` from a root daemon with delegated slices on
  Debian 12/13 — verify cgroup writes and `memory.peak` visibility.
- SPIKE: jj + setgid group-shared repos — does the colocated git store need
  `core.sharedRepository=group` / umask handling?
- SPIKE: dynamic subuid allocation (`/etc/subuid` contention; podman
  storage migration cost when ranges are assigned late).
- SPIKE: account provisioning mechanism — `useradd` vs `sysusers.d`
  fragments; confirm NSS/getent behavior is acceptable on shared hosts.

## 6. Rejected

- **Per-user file ownership *within* an org for content** — contradicts ADR
  0027 §1 (org trust boundary, no per-viewer redaction). Users isolate
  credentials; the org group owns content.
- **`DynamicUser=` for session runtimes** — ephemeral UIDs break durable
  ownership of session spaces. Kept for transient build jobs (ADR 0017).
- **Rootless-only via user namespaces on shared nodes** — cannot provision
  durable per-user identities or quotas; remains the user tier, not the
  shared-node answer.
- **Separate setuid/root helper binary** — a second protocol surface with
  its own auth story; v1 runs the orbit itself as root with systemd
  hardening. Revisit if the orbit's parsing surface grows.
- **Root-mandatory everywhere** — user installs and unprivileged
  LXC/WSL nodes stay rootless; multi-tenancy is a tier, not a prerequisite.
