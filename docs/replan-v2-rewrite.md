# Stellarc v2 — replan from the ground up (2026-08-25)

Wayfinder map: [issue #3](https://github.com/NevrLabs/stellarc/issues/3).
Tickets #4–#13 carry the decisions; this doc is the working triage that
seeded them.

## Why a rewrite

v1 (38 ADRs, axis+orbit) converged on the right doctrine but the wrong
substrate history: Convex→Rust pivots, REdb→SQLite, edition splits. The
2026-08-19 doctrine session settled a cleaner split and it was never landed.
v2 starts from that settlement with a smaller founding ADR set and a new
requirement: **templates** — a working fleet in minutes, not a weekend.

## Doctrine (unchanged, restated)

Stellarc is a harness-agnostic control plane — the k8s of harnesses.
Durable truth (sessions, resources, config) in one Postgres event log;
context materialized into per-session workspaces; harness runs scheduled
across P2P-connected nodes. Inert: never calls a model, never runs an agent
loop. LLM-touching context work is done by agents THROUGH stellarc's
MCP/CLI surface. One designated orchestrator agent (Hermes by default).

## Topology under ratification (ticket #5)

| Component | Runtime | One job |
|---|---|---|
| stellarc | Bun/TS | truth + API + BetterAuth + MCP + scheduler + workflows + SSE/WS + UI |
| arclet | Rust | host effects: harness supervision, adapters' process ends, workspace CoW/symlink |
| tunnel | Rust lib+bin | capability-scoped, harness-aware iroh exposure (standalone wedge, later arclet's transport) |
| UI | React/Vite | operator console |

Carry-overs already settled: schema-per-org Postgres, ACP-shaped transcript
union + raw sidecar, capability-flagged adapter contract, DBOS-model
workflow tables, IPv6-preferred routing + self-hosted iroh DNS discovery.
Full synthesis: `~/stellarc-research/SYNTHESIS.md` (mirrored into the repo
when ADRs land — see ticket #11).

## Adjacent systems triage (tickets #6, #7)

The market gap holds. None of these is the k8s-of-harnesses; each validates
a piece of the design:

| System | What it is | Steal | Reject / gap |
|---|---|---|---|
| **multica** (47k★, Apache-2.0+conditions) | Kanban + local daemons spawning 23 CLIs; Go/Next.js | agents-as-assignees lifecycle (enqueue/claim/block/complete), unified activity feed, runtime auto-detect, skills-as-shared-library framing | single-tenant board without our resource/grant model; no canonical transcript; no P2P; conditions-on-Apache license |
| **paseo** (known from ops) | local-first orchestrator over ACP | worktree-per-session UX, mobile/remote follow | single-node; no fleet truth; no workflows |
| **comet/Zeron** (MIT) | local-first engine per device, optional multi-device sync; Rust; 6 harnesses | **study whole architecture** (ticket #6): local-only-by-default profile boundary, engine-per-device + sync model, Rust workspace layout | sync model competes with event-sourced Postgres truth; control plane is thin | 
| **team-brain** (.com SaaS; netlify site = Apache-2.0 git-backed team memory) | AI workspace SaaS / shared harness memory via git | memory-as-reviewed-markdown-in-repo discipline (maps to our vault+memory via MCP) | it's a SaaS suite, not a control plane; OSS variant is memory-only |
| **openship** (11k★, Apache-2.0) | self-hosted deploy platform w/ agent surface | ops UX: point-at-repo → running, desktop/web/CLI parity, local control plane driving servers over SSH | different domain (deploys); its "agent" surface is a client of something like stellarc, not a competitor |

Confirms: **nobody has multi-node daemon model + canonical normalized
transcripts + typed DAG + harness-agnostic resource model in one inert
control plane.** The slot is still empty.

## Rewrite plan (the map)

Frontier now: #4 doctrine, #5 topology, #6 comet study, #7 steal/reject
matrix, #8 transcript schema, #9 template system → then #10 primitives,
#11 founding ADRs → #12 scaffold on main, #13 phase-0 spikes.

**Templates (#9) is the new load-bearing decision.** Candidate shape:
versioned org-scoped template resources (agent bundles = harness+model+
skills+MCP+prompts; project templates = context md + resource refs;
workflow templates = TS manifests), instantiable with overrides; git URL as
distribution source; seed set shipped in-box. Decides whether template is a
first-class resource kind before #10/#11 freeze the primitive inventory.

## Repo mechanics

- v1 stays on `main` until #12 scaffolds v2; v1 ADR corpus moves to
  `docs/adrs-v1/` as reference (decision in #12).
- This branch (`replan/stellarc-groundup-rewrite`) carries planning docs
  only.
- Dev stack on fxcompute-01 is broken (orphaned worktree) — fix when
  implementation starts, per `stellarc-dev-stack` skill.
