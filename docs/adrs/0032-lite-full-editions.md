# ADR 0032 — Lite/Full Editions, Forgejo-Backed Full Deployment, Postgres, and Session Workspaces

- Status: Accepted
- Date: 2026-07-22
- Supersedes: ADR 0026 §7–§10 (native cr-sqlite board backend, `github_issues` board backend) and the ADR 0026 §15.4 cr-sqlite substrate gate — Boards move to Forgejo (full) / none (lite). ADR 0026's home-vault, project-layout, discovery/import, and authority-matrix sections stand.
- Supersedes in part: ADR 0025 — PR/issue/review authority in a full deployment is the bundled Forgejo, not a provider-backed GitHub entity model. GitHub remains an external sync target (mirroring/connector), not the board/PR authority.
- Amends: ADR 0031 (tier ↔ edition mapping, §3 below), ADR 0008 (orbit transport gains TCP-loopback listener), ADR 0014 (edge also serves `stellarc.localhost` app routing)
- Affirms: ADR 0013 (workflow kernel — the "embedded n8n" requirement IS Option 3; no external engine)
- Relates to: ADR 0004/0016 (vault), 0017 (JOBS-2), 0024 (auth broker), 0027 (sharing), 0028 (context attachments)

## 1. Decision

Stellarc ships as two editions of one codebase, split by a storage/identity seam — never a fork.

| | **Lite** | **Full** |
|---|---|---|
| Install | desktop app (Tauri shell bundling Axis+Orbit+UI); user-tier per ADR 0031 | Linux host installer; root at install, never at runtime; system-tier per ADR 0031 |
| Axis storage | SQLite | Postgres + pgvector |
| Users/orgs | exactly 1 user, 1 org (structural, per 0031) | multi-user, multi-org, Authentik OIDC |
| Nodes | N (iroh + TCP-loopback) | N (same transports) |
| Harnesses | all ACP adapters | same |
| Boards/issues/PRs/CI | none (GitHub direct-connector for repo/issue/PR/wiki read-sync) | bundled Forgejo (mandatory): boards, issues, PRs, Actions, OIDC |
| Agent runner | Orbit | Orbit (never act_runner) |
| CI runner | — | Forgejo act_runner, label-designated, dials out via iroh |
| Embeddings / vault index / agent memory | ✗ | pgvector |
| Workflow | ADR 0013 chains over JOBS-2, SQLite checkpoints | same engine, PG checkpoints |
| Web UI | Axis serves SPA; LAN-exposable for mobile browsers | same |
| Mobile app | connects to any external Axis (lite or full); separate track | same |

Multi-node ≠ multi-user: lite allows N orbit nodes attached to one single-user Axis. The lite/full line is drawn at identity (second human → full), never at node count.

**Lite→full migration: PROVISIONAL — clean re-setup, no in-place upgrade.** Storage traits must match semantically, not byte-wise. Revisit if a real lite deployment needs to carry state into full; the exporter then becomes a deliverable.

## 2. Storage seam

One trait layer (`SessionStore`, `EventLog`, and successors), two impls (rusqlite / tokio-postgres). Extraction site: `crates/axis/src/log.rs`. Every new subsystem (workflow checkpoints, artifacts, manifests) programs against the seam from day one. JSON-blob columns (`capabilities`, `context_projects`, `attempts`, project `vaults/repos/boards`) become real columns/join tables in the same migration that introduces PG — not before, not twice.

Org machinery is full-only: lite builds pin `org_id` to a constant; no org tables, routes, or RBAC surface are compiled into lite behavior.

## 3. Orbit

One binary, three listeners (UDS, iroh QUIC, TCP-loopback), two spawn strategies behind one trait:

| Edition | Unit | Spawn strategy |
|---|---|---|
| Lite | user systemd unit | spawn-as-self |
| Full | system unit, unprivileged `stellarc-orbit` daemon | systemd transient units via D-Bus: per-session Unix account (0031), `MemoryMax=`/`CPUQuota=` cgroups |

Root exists only in the full installer (creates system user, session-account pool, polkit rule, unit). Container isolation (nspawn/podman) is deferred until untrusted multi-org tenancy is real.

WSL nodes: desktop app auto-installs orbit into the WSL distro and attaches over TCP-loopback (WSL2 localhost forwarding). No iroh required on the same machine.

## 4. Sessions: manifest, workspaces, artifacts

**Session manifest** (Axis-owned record, Orbit-materialized at `ensure_runtime`): `repos[{slug,rev}]`, `vaults[{slug,mode}]`, `context[]` (0028), `setup` (existing table). Fork copies the manifest. Project-level saved manifests are workspace templates (`project.json`, 0026 §6).

**Workspace rules (normative):**
1. Workspace-per-session, materialized at initialization. A session never opens a shared checkout.
2. Vault access = session-private jj workspace; convergence is jj merge at completion/handover (0004). No vault locks.
3. Per-node shared object store for repos; workspaces reference it. Full-tier nodes format the workspace volume XFS; materializer uses `cp --reflink=auto` (falls back silently on ext4). No CoW software layer.
4. Orbit cleanup sweep (heartbeat loop): workspace of a completed/handed-over session older than N days → delete; workspace with no Axis session row → delete. Durable refs (pushed bookmarks/branches) are the only thing that survives teardown.

**Artifacts:** `artifacts(session_id, path, kind, sha256, created_at)` manifest table + completion/handover sweep of declared artifacts into `projects/<slug>/artifacts/<session-id>/` in the home vault. No CAS, no dedup, no GC until two sessions provably duplicate large blobs.

**Session authority matrix** (field → owner) is a prerequisite deliverable of the seam extraction, in 0026 §4 style: Axis log | Hermes state.db | orbit spool | workspace. No session field may acquire two writable owners.

## 5. Workflow

ADR 0013 stands. The product requirement "durable DAG-walker / embedded n8n" is exactly its Option 3: definitions are data (YAML DAGs), durable event-sourced runs, recovery by projection, effects through fenced JOBS-2 dispatch. Build order: JOBS-2 substrate → scheduler loop + run projections → trigger wiring (0008 `fireAt`) → activity catalog via packages (0012) → editor UI last (after YAML proves the model).

sayiir (github.com/sayiir/sayiir) evaluated 2026-07-22 and rejected for now: code-shaped continuations conflict with the capability-checked dispatch authority model; pre-1.0 single-team; no native SQLite backend. It is the named shortlist candidate if 0013's exit clause is ever exercised — vendor, don't fork; contribute the SQLite backend upstream.

## 6. Naming, apps, SSH

- `stellarc.localhost` (RFC 6761, resolves loopback everywhere, zero DNS setup) is the one hostname. Axis-side proxy owns it: `/` → Axis SPA, `/app/<slug>` → managed app upstream over iroh. Path routing first; per-app subdomains only when an app's root-absolute assets break.
- `resolve(name) → NodeId` is one shared registry lookup (Axis node list). Consumers: the HTTP proxy and the SSH connector.
- SSH to nodes: `ProxyCommand stellarc-iroh-connect %h` — one small binary opening one iroh stream, stdio-piped. No tunnel daemon, no listener, no MagicDNS.

## 7. Migration order

1. Storage seam extraction (`log.rs` → traits) + session authority matrix. Extract services out of `routes/sessions.rs` during, not before.
2. Session manifest + Orbit materializer + workspace cleanup sweep (sweep first has a live customer: fxcompute at 95% disk).
3. TCP-loopback listener + WSL orbit auto-install.
4. Tauri desktop shell (bundle, supervise, first-run).
5. GitHub direct connector (lite): repo/issue/PR/wiki read-sync; writes later.
6. Vault sync repair track (jj remote to GitHub) — independent.
7. JOBS-2 → 0013 scheduler → triggers.
8. Serialize the append-then-apply seam (0020 debt) before any allocation-bearing feature.
9. Full-edition track: PG impl of the seam + pgvector, Forgejo bundling + OIDC, act_runner provisioning, cards-subsystem deletion after Forgejo board migration.

## 8. Rejected alternatives

- **cr-sqlite/CRDT native boards, keypair board authority, P2P board network** — superseded scope; Forgejo (full) covers boards; no user needs offline no-forge kanban today.
- **Piper as separate crate/product** — its remaining value is field-mapping reference for the GitHub connector.
- **Auth proxy for SSO** — rejected outright; Forgejo OIDC native, Axis per 0010/0024.
- **Rebuilding GitHub Projects UI; Plane; standalone board apps** — buy (Forgejo) beats build; nothing GitHub-native meets SSO+perf+self-host.
- **rift/CoW software layer** — filesystem decision (`mkfs.xfs` + reflink), not code.
- **sayiir adoption/fork now** — §5.
- **netbird/tailscale/MagicDNS for app naming** — one loopback hostname + proxy suffices.
- **Postgres in lite** — pgvector is the only forcing function and it's full-only.
- **act_runner as agent runner** — different lifecycle/scheduler; Orbit owns agents.
