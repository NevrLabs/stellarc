# Adjacent systems — steal/reject matrix (#7)

Synthesized 2026-08-26 from studies in `~/stellarc-research/reports/`:
deepseek-harness, comet-zeron, multica, paseo, team-brain, openship.
Doctrine references: D1–D20 (issue #4/#5, `docs/v2-charter.md`).

## The field

| System | What it is | Closest to stellarc in | License | Code liftable? |
|---|---|---|---|---|
| **dsh** (deepseek-harness) | plugin-native harness (Cordis) | everything-is-a-plugin (D5) | MIT | yes |
| **multica** (47k★) | issue tracker with agent assignees, inert Go server + node daemon | inert-CP split (D4/D14) | source-available w/ strings | **no** |
| **paseo** (15k★) | local orchestration daemon over agent CLIs, ACP seam | arclet's job (D14/D15) | AGPL-3.0 | **no** (ideas only) |
| **comet/zeron** (1.1k★) | Rust multi-device controller UI, CRDT sync | local-first sync, command queue | MIT | yes |
| **openship** (11.7k★) | self-hosted PaaS, Bun/TS control plane | Bun CP ergonomics, MCP surface | Apache-2.0 | yes |
| **team-brain** | closed SaaS, Notion-with-agents | JS sandbox recipe, trigger taxonomy | proprietary | no (ideas only) |

Nobody is the k8s-of-harnesses. Multica proves the inert-CP thesis at scale;
paseo proves the ACP-seam daemon; dsh proves everything-is-a-plugin. Stellarc
is the intersection none of them occupy.

## STEAL (by stellarc subsystem)

### Kernel / plugin system (D2/D5/D6/D7)
- **dsh**: Cordis effect-shaped registrations (unwind on unload), boot-time
  bundles + hot `cordis.patch.yml` — already ratified as D7's reference.
- **paseo**: explicit plugin lifecycle contract — cleanup-on-reload,
  failed-reload-stays-failed-with-error.
- **team-brain**: `s16` proxy-host API — single seam for sandboxed code to
  reach the host; the shape for the freestyle-runner isolate boundary (D20).
- **team-brain**: sandbox hardening checklist — worker + vm isolate,
  no-net-except-broker, heap cap, priority demotion.

### Event log / transcripts (D10/D18/D19, ticket #8)
- **comet**: transcript = view, run journal = record — synced doc is a
  render-only view; full tool I/O stays in the host's local journal. Adopt for
  plane-synced vs node-local split.
- **comet**: durable command queue as data (host-executes,
  mark-processed-before-execute, dedupe/TTL/supersede) — mini event-sourced
  control plane; maps onto log→arclet dispatch.
- **paseo**: persistence-as-pointer — `{provider, sessionId, nativeHandle}`;
  harness owns its native transcript, CP stores the reference. Directly D14
  ("transcripts are node claims") made concrete.
- **multica**: session-poisoning rules — enumerate which failures allow
  resume vs force fresh session (context overflow ⇒ new session, same workdir).

### Arclet / node runtime (D14/D15/D17)
- **multica**: task-state machine with named TTLs + env knobs; documented
  heartbeat/offline thresholds.
- **multica**: two-tier failure taxonomy — platform codes vs `agent_error.*`
  harness codes; keeps CP-blame and harness-blame separable for retry policy.
- **multica**: retry split — auto-retry infra-transient only, never
  agent-semantic; retry targets the runtime that ran the task.
- **multica**: MCP config injected over the session protocol
  (`session/new`), never written into harness config files — config travels
  with the task; pairs with D17 desired-state.
- **multica/paseo**: git worktree off bare-repo cache as spawn-time isolation
  primitive ("wrong eviction costs a clone, not a failure").
- **comet**: `deterministic_turn_end`-style per-harness capability flags —
  honesty descriptors let the engine drop watchdogs selectively.
- **comet**: native-wire-per-harness warning — their measured ACP retirement
  ("adapters held prompt turns open… manufacturing done-status bugs") says:
  ACP as the *default* seam (paseo proves it), but the adapter trait must
  allow native drivers per harness.

### Transit / API surface (D11/D12)
- **openship**: MCP exposure rules — opt-in routes only, per-call permission
  recheck, credential routes can never become tools.
- **paseo**: caller-scoped MCP endpoint + per-agent bearer; generic endpoint
  401s — ambient authority solved per-spawn. Anti-pattern receipt in the same
  repo: all-or-nothing tool injection costs 6-7k tokens/agent (issue #1231) →
  scope tool exposure per grant (D3).
- **comet**: in-proc transport = same wire protocol, zero shortcuts — keeps
  local/remote parity testable.
- **comet**: dumb relay — server stores opaque update rows, never
  materializes state; strongest external receipt for D4 inertness.

### Workflows / triggers (D18/D20)
- **team-brain**: trigger taxonomy (manual / event / cron / webhook / chain)
  — minimal complete set for engine entry points.
- **paseo**: heartbeat vs schedule as distinct primitives ("continue this
  conversation on cadence" ≠ "standalone cron job").
- **openship**: pinned per-run plan snapshot (jsonb, "mid-run repo change
  cannot rewrite history") + config-frozen deploys — determinism instinct for
  workflow-run manifests.
- **openship**: degraded-not-failed post-steps ("action required", never a
  failed run) — for CP-side side effects that shouldn't poison run status.

### Hosting / ops (D8/D9)
- **openship**: one-flag SaaS/self-host role split (`OPENSHIP_TARGET`) —
  matches SaaS/PaaS (D8) cheaply.
- **openship**: Bun+dockerode hijack fix, process-tree kill (setsid +
  negative pgid), exit-code honesty — battle-tested Bun exec primitives.
- **multica**: inert-server boundary table (two columns: CP holds vs node
  holds) — clearest way to document/sell D4+D14; write ours in the charter.

## REJECT (patterns the field keeps shipping)

- **Mutable state as source of truth** — multica (Postgres rows), paseo
  (flat JSON, no provenance), openship (pruned audit table). Every one of them
  loses history; the append-only log (D10) is the moat. No exceptions.
- **Compiled-in integrations / no plugin system** — comet, multica, openship
  all hardcode harnesses/integrations (multica: 23 in-tree adapters with
  per-runtime env-var quirks). Violates D5; the per-harness special-casing in
  multica's daemon is the disease the arclet adapter contract must prevent.
- **Polling dispatch** — multica's 3s poll; stellarc pushes over iroh.
- **CRDT as session substrate** — comet's Loro doc bloat forced thin-docs +
  dumb relay retrofits; log + single-writer discipline is simpler and enough.
- **Flat/ambient tokens** — team-brain's read-everything workspace token;
  violates D3/D12.
- **CP touching the substrate** — openship's API container mounts the Docker
  socket (host-privileged); D4/D14 forbid it — arclet executes, CP authorizes.
- **SSH as node transport** — openship; "can't kill the remote process"
  timeout semantics by their own admission.
- **Vendor-locked sync backend** — comet's Cloudflare DO/R2-only story.
- **Unsandboxed plugins in a multi-tenant plane** — paseo (fine for personal
  tool, non-starter for us); D20's isolate runner is the answer.
- **License traps** — multica's source-available-with-strings and paseo's
  AGPL: ideas only, never vendor code from either.

## Consequences for open tickets

- **#8 transcript schema**: adopt comet's view/journal split + paseo's
  persistence-as-pointer; ACP-shaped canonical view, native harness record
  referenced as node-local sidecar (matches ratified topology).
- **#9 templates**: team-brain's 3-tier distribution (workspace /
  installed-read-only / marketplace) is the provenance model to beat.
- **#10 primitives**: multica's failure taxonomy + state-machine TTLs belong
  in the resource-kind contracts.
- **Workflow-engine design session (D18)**: openship's plan-snapshot and the
  definition-DAG vs run-DAG separation are direct inputs.
