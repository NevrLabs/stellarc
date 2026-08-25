# CONTEXT.md — Stellarc v2 glossary (deep-dive 2026-08-25, branch replan/stellarc-groundup-rewrite)

Glossary only. Decisions live in tickets (#4–#13) until founding ADRs land.

- **Package** — installable, distributable, content-addressed artifact; may carry many contributions.
- **Plugin** — a package's executable component that extends stellarc internals through a typed extension class.
- **Extension class** — the typed slot a plugin fills (activity, trigger, resource, view, policy, storage, indexer, session-tool, runtime-adapter, embedded-app).
- **Managed app** — stellarc-supervised external service: own process, own datastore (own pg schema), arm's-length integration via MCP/CLI/HTTP.
- **Embedded app** — browser-only UI contribution in a sandboxed frame.
- **Capability grant** — org-ratified permission unit for plugin behaviour (e.g. `view:read:all`, `event:append`, `policy:evaluate`). Manifest declares; install surfaces; org allowlist is the ceiling; sensitive capabilities absent until org-enabled. In SaaS mode, installs additionally require Nevrlabs ratification/signature before org review.
- **Inertness (D4 sense)** — the CP never calls models or runs agent loops. The top grantable capability is `session:drive` (create/prompt/steer/stop sessions on harnesses): native to workflows, grantable to plugins. Stellarc commands harnesses; intelligence stays in the harness.
- **Hosting modes** — SaaS: Nevrlabs-operated CP, multi-tenant. PaaS: managed deployment of a customer's own instance (hard isolation). Apps always get their own DB.
- **Boot composition** — plugin membership is fixed at boot (changes apply on restart / blue-green flip); the config layer hot-reloads. Every registration is effect-shaped: carries its own unwind function. Scoped live mounts (per-org/per-session isolates) are a later stage.
- **Kernel** — the irreducible privileged core: plugin loader, capability check, event log (append/read/subscribe + schemas), identity/ACL enforcement, wire transit (HTTP/MCP/WS chokepoints). Resource kinds are opt-in: vaults, sessions, tables, nodes etc. ship as first-party plugins, not kernel tables. Allowlist config is kernel-read-only. Upgraded only by CP redeploy.
- **First-party plugin** — stellarc's own features shipped as plugins: same extension classes, manifests, capability grants, and venues as third-party. No privileged built-ins beyond the kernel.
- **Plugin venue** — where a plugin executes: `main` (inside the CP process — modifies actual system behaviour, full trust) or `isolate` (CP-owned sandboxed sub-component, scoped host API). Out-of-process is not a venue — that's an app.
- **Composition rule** — app contributes function; companion plugin contributes presence.
- **Template** — versioned, org-scoped, instantiable bundle (agent/project/workflow) [ticket #9].

## Decisions

- **D1 (rich ecosystem)** — full v1 extension taxonomy carries into v2; staged: contract+docs+stubs first, implement per stage.
- **D2 (plugin venues)** — definitional, not a knob: plugin = `main` (in-CP, behavioural) or `isolate` (CP sub-component). Out-of-process host = app by definition. No plugin `process` mode; escape hatch is reclassification to app + companion plugin. Trust boundary = process boundary.
- **D3 (trust model)** — capability grants (explicit ACL on what plugins can do) + org allowlist ceiling; SaaS deployments add operator (Nevrlabs) ratification/signature gate before org review. RBAC deferred: flat org allowlist day one.
- **D4 (inertness)** — CP never calls models or runs agent loops. Grantable top capability = `session:drive` (workflows native, plugins by grant). Stellarc commands harnesses; never generates content itself.
- **D5 (everything is a plugin)** — even ours: all first-party features ship as plugins under the same classes/manifests/grants/venues; no privileged built-ins. D4 "native" collapses to "first-party workflow plugin holding `session:drive`". Implementation reference: deepseek harness (mine in study phase).
- **D8 (tenancy of composition)** — plane-global install, per-org grants: one plugin tree per boot generation; orgs activate via grant layer (hot-reload). Custom per-org code = app (now) / isolate (later stage).
- **D7 (composition timing)** — membership at boot (restart/blue-green to apply), config hot-reloads; registrations effect-shaped (unwind on teardown); scoped live mounts (isolates) staged later. Mirrors dsh: boot-time bundles + hot cordis.patch.yml.
- **D6 (kernel boundary)** — kernel = boot + loader + capability check + event log + authn/z + transit chokepoints. Resources opt-in (plugin-provided): vaults, sessions, tables, nodes, harnesses, grants-as-resource. Auth plugin non-removable at runtime; CP refuses plugin routes without it. TCB = kernel; upgrades by redeploy only.
