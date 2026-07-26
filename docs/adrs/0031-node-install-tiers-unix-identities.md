# ADR 0031 — Node Install Tiers: Root Orbit, Per-User Unix Identities, Org Groups

- Status: Proposed
- Date: 2026-07-21 (amended 2026-07-26: §3a coexistence, §3b enrollment
  pinning, §3c non-Linux tiers)
- Relates to: ADR 0005 (org = hard boundary), 0008 (unit placement), 0011 §5
  (bwrap no-root), 0014 (unprivileged edge), 0015 (rootless podman), 0017
  (static OS identities), 0022 (human RBAC), 0024 (secret store), 0027
  (sharing, BYOK, shared nodes)
- Amended by: ADR 0034 (custodial storage layout, deletion approval, actor
  attribution), ADR 0036 (§3c rules 12-13: macOS/Windows tier cap becomes
  conditional on an implemented isolation mechanism, not the platform name)
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

Tiers coexist **on one host**, not just across a fleet (§3a): node identity is
the orbit's iroh keypair under `STELLARC_HOME`, not the machine, so a system
orbit can be added beside an existing user orbit without touching it.

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

## 3a. Mixed fleets and same-host coexistence

A fleet is expected to hold both tiers. A user-tier node is never blocked for
being unprivileged — it stays fully usable **by its owner** and is ineligible
only for work it cannot isolate.

7. **Scheduling is one eligibility predicate, not a tier branch.** Axis asks
   "may this node run work for principal P?" — a system node answers "any
   member of an org provisioned here", a user node answers "only my enrolling
   identity". Tier must not be pattern-matched at call sites; it is an input to
   the predicate. Same seam as `authorize_capability` (ADR 0012).
8. **Substituted identity is the hazard, not reduced privilege.** A user-tier
   node has one uid, so another principal's session there does not run as that
   principal with fewer rights — it runs *as the node owner*, with the owner's
   keys, agent config, and `$HOME`. A BYOK lease would materialize inside
   another human's account. This is why rule 1 is fail-closed rather than a
   warning.
9. **Two orbits may share a host** — a system orbit and a user orbit,
   registered as two nodes. Grant paths for the org route to the system node;
   the owner's existing sessions keep running on the user node out of
   `~/.stellarc`. This is the migration path for a shared dev box: add the
   system tier, drain nothing, re-point work at leisure.
   - Each install MUST get its own `STELLARC_HOME` and an explicit distinct
     `STELLARC_NODE_ID`. `orbit-bootstrap.sh` defaults `NODE_ID` to
     `hostname -s`; the registry is keyed by `node_id` while authentication is
     keyed by the iroh key, so two same-named orbits collapse into one fleet
     row and flap. Installer MUST refuse to reuse a `node_id` already bound to
     a different iroh key on that host.

## 3b. Scope is pinned at enrollment; `Hello` may only narrow

10. Tier and served-identity scope are **durable node facts written at
    enrollment** — the operator-authenticated moment — not values trusted from
    `Hello`. `Hello` arrives from the node on every reconnect; treating it as
    authoritative lets a compromised user orbit claim org-wide scope and be
    handed another user's credentials. Axis MUST intersect any `Hello`-reported
    scope with the enrolled record: narrowing is honoured, widening is rejected
    and audited. (`OrbitFrame::Hello` already tolerates unknown fields, so the
    field is additive; absence means user tier.)
11. The orbit determines its own tier from process reality — effective uid plus
    whether it can actually provision accounts — and Axis never infers it from
    hostname, path, or operator input. Same rule as the uid decision in ADR
    0031 §1: the node owns what it can enforce, Axis owns which identity to
    request.

## 3c. Non-Linux nodes (macOS, Windows)

The tier model is a claim about **kernel-enforced identity**, not about
systemd. It ports; the mechanisms differ, and one of them does not exist.

| Platform | System tier | User tier | Isolation primitive |
|---|---|---|---|
| Linux | root orbit + `systemd-run --uid`, per-org groups | user systemd, `~/.stellarc` | uid/gid, cgroup slices |
| macOS | `launchd` daemon as root + per-user accounts (`dscl`); no cgroups | `launchd` LaunchAgent in the user session | uid/gid, sandbox profiles |
| Windows | service as `LocalSystem` + per-user profiles, `CreateProcessAsUser` | per-user service/scheduled task | SID + ACL + job objects |

12. **macOS** supports the model with weaker resource accounting: uid isolation
    and file ACLs are real, per-user account creation is `dscl`/`sysadminctl`
    instead of `useradd`, and the cgroup-derived quota/OOM story (§1) has no
    equivalent — resource limits degrade to advisory. TCC/keychain prompts make
    unattended per-user provisioning fragile; treat macOS as user tier until a
    system-tier spike proves headless account creation.

    **Amended by ADR 0036.** macOS is system-tier-capable; SIP does not
    restrict `setuid`/`forkpty`/account creation. The cap is now the mechanism
    test (ADR 0036 §1), not the platform. The advisory-resource-limit ceiling
    above stands and is the accepted cost. The headless-provisioning spike is
    still unrun and gates implementation, not eligibility.
13. **Windows** has SIDs, ACLs and `CreateProcessAsUser`, which is a genuine
    boundary, but the ADR's Unix vocabulary (`initgroups`, setgid dirs, subuid
    ranges for rootless podman) has no mapping. Windows nodes are **user tier
    only** until a separate ADR defines the SID/ACL equivalent; ADR 0015's
    rootless-podman assumption does not hold there at all.

    **Superseded by ADR 0036** — that is the separate ADR this rule called for.
    Windows is system-tier-capable: `LogonUserExExW` + `CreateProcessAsUserW` +
    `conhost.exe --headless` for the console, `NetUserAdd`/`NetLocalGroupAdd`
    for accounts, job objects for containment. Job objects give a *stronger*
    process-tree kill than `killpg`, so Windows containment is not weaker than
    Linux — it is better. The remaining work is implementation. ADR 0015's
    rootless-podman assumption still does not hold.
14. **The permission fallbacks are currently unsound off Unix.** Today
    `auth_store::secure_permissions` is `#[cfg(not(unix))] -> Ok(())` and
    `capability::write_secret` applies no mode outside `#[cfg(unix)]`, so the
    installation token, session store, and capability **signing key** are
    written with inherited ACLs on non-Unix hosts. A silently-permissive
    fallback for a secret is a fail-open default and violates §2's "a UID is a
    boundary" premise. Before any non-Unix node is supported these MUST either
    implement a real ACL restriction or hard-fail; they must not no-op.
    Tracked as a prerequisite, not a follow-up.

## 4. Migration order (each step independently shippable)

0. Make the non-Unix permission fallbacks fail-closed (§3c.14) — required
   before any macOS/Windows node is enrolled, independent of tiering. No-op on
   Linux.
1. Node tier + served-scope written at enrollment, reported in `Hello`, and
   intersected (never widened) by Axis; fail-closed scheduling constraint
   (§3b.10). No behavior change on existing nodes — all are user-tier.
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
- SPIKE: headless per-user account creation on macOS (`sysadminctl`/`dscl`
  under a root `launchd` daemon) — does it complete without a TCC/GUI prompt,
  and does `launchd` accept per-uid submission from a system daemon?
- SPIKE: Windows equivalent of the spawn seam — `CreateProcessAsUser` +
  per-user profile + job object, and what replaces the setgid org tree. Decides
  whether Windows can ever be system tier or stays user tier permanently.

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
- **Blocking user-tier nodes on a system-tier fleet** — the node is correct and
  useful for its owner; only foreign-principal work is ineligible (§3a).
- **Converting a user install in place** — no uid surgery on live trees (§4.6);
  add a system orbit alongside it (§3a.9) and migrate work deliberately.
- **Emulating uid separation off Unix with directory permissions or a sandbox
  profile alone** — policy, not a kernel boundary; that is the mistake §2
  rejects for shared Linux nodes and it is no better on macOS or Windows.
