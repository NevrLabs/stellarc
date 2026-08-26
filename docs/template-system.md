# Template system design (#9)

Ratified 2026-08-26 (operator-delegated defaults; veto window open — D24 on the ticket).
Doctrine inputs: D3 (grants), D5 (first-party plugins), D6 (opt-in resource kinds),
D10 (events), D17 (desired state), D20 (workflow graphs). Field input: team-brain's
3-tier skill distribution, multica's refresh-from-source, dsh profiles→bundles.

## What a template is

A **first-class resource kind**, provided by a first-party plugin (per D6 — not a
kernel table, not a project-attached convention). Versioned, org-scoped, grantable.

Three template types, one mechanism:

| type | payload |
|---|---|
| **agent** | harness + model + skills + MCP servers + prompts bundle |
| **project** | context md + resource refs (arcdrive seeds, repo refs, agent-template refs) |
| **workflow** | TS manifest / node graph (D20 shape) |

A project template may reference agent/workflow templates — instantiation is
recursive. `stellarc new <template>` / MCP `template.instantiate` → working fleet.

## Versioning & instantiation semantics

- **Templates are frozen snapshots.** A template version is immutable,
  content-addressed. Publishing a new version never touches existing instances.
- **Instantiate = copy + explicit override map.** The instantiation event (D10)
  records `{templateId, version, overrides}` — full provenance, replayable. No live
  inheritance: an instance never silently changes because upstream changed.
- **Re-sync is explicit**: `template.diff` shows instance vs newer version;
  `template.apply` upgrades with the recorded overrides re-applied. Conflicts
  surface, never auto-merge. (multica's "refresh from source" + openship's
  config-frozen deploys, applied to templates.)
- Overrides are a flat JSON-merge-patch on the payload — no override DSL.
  ponytail: merge-patch can't express list edits; add targeted ops only if real
  templates hit it.

## Distribution — 3 tiers (team-brain model)

1. **org** — authored in the org, mutable by org members with the grant.
2. **installed** — imported from a source (git repo URL or another org via
   marketplace), **read-only**, updates flow from the source as new versions.
   Source ref pinned: `{url, ref, contentHash}`.
3. **marketplace** — published org templates; SaaS: Nevrlabs ratification gate
   applies (D3, same lever as plugins).

Git repo URL is the interchange format: a template source repo is a directory of
template manifests — reviewable, diffable, CI-able. No custom registry protocol in v1.

## Grants

`template:read` (instantiate), `template:write` (author org tier),
`template:publish` (marketplace). Installed tier is read-only by construction.

## Seed templates (in-box, v1)

- `agent/coding-agent` — one general coding agent (per supported harness via
  adapter-conformance matrix).
- `project/starter` — context md skeleton + one coding agent + review workflow.
- `workflow/review-gate` — session.completed → review step → notify (exercises
  D23 signals end-to-end).
- `workflow/heartbeat` — cron re-prompt into an existing session (paseo's
  heartbeat primitive as a template, not an engine feature).

Four, no more — each exists to prove one subsystem path, not to be a catalog.
