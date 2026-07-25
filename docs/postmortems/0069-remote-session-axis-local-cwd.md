# 0069 — Remote managed sessions inherited Axis-local workspace paths

**Date:** 2026-07-18
**Impact:** A managed session explicitly assigned to Talos accepted the first message but could not start Hermes ACP. The UI remained unusable for basic agent turns.

## What happened

Axis created the session directory under its own development root:

`/home/rpw/.stellarc-dev/<organization-id>/sessions/<session-id>`

It then serialized that absolute path as `RuntimeSpec.cwd`. Talos received the runtime request and tried to spawn `hermes acp` with the Axis path as its current directory. The command and interpreter both existed and `hermes acp --check` passed under the Orbit service PATH, but the current directory did not exist on Talos. Process creation therefore returned `ENOENT`, reported as if the `hermes` executable were missing.

## Root cause

The control plane treated a host-local absolute path as portable protocol state. That violated ADR 0005: Axis owns session intent; the selected node's Orbit owns physical session spaces and all host effects.

The Orbit also hard-coded `~/.stellarc` for its identity and spool instead of honoring `STELLARC_HOME`, weakening the dev/prod state boundary.

## Corrective action

- Carry the authoritative organization identity in `RuntimeSpec`.
- Version the workspace contract. Legacy payloads deserialize as version zero;
  a new Orbit returns an explicit `workspace protocol upgrade required` error
  instead of guessing.
- On `EnsureRuntime`, validate the organization and session path components.
- Materialize the workspace on the Orbit under that node's own `STELLARC_HOME/<organization>/sessions/<session>`.
- Replace the Axis-supplied `cwd` before spawning the runtime.
- Make Orbit identity/spool state honor `STELLARC_HOME` as well.
- Preserve deterministic paths so ACP resume and Axis restarts reuse the same node-local session space.
- Serialize first-start per session so retries cannot spawn two ACP children against the same workspace.
- If an explicitly selected Orbit disconnects before spawn, persist a visible error and fail closed; never substitute Axis's local runtime.

## Prevention

- Protocol tests must prove runtime specs tolerate version skew while retaining organization identity.
- Orbit tests must prove unsafe components are rejected and workspaces are node-local.
- Live acceptance requires a real explicit `node=talos` turn before and after a Axis restart.
- Runtime spawn errors must include the current directory separately from command lookup so `ENOENT` is diagnosable.

## Dev rollout

This is a coordinated development-plane protocol cutover, not a silent mixed-
version compatibility shim:

1. Install Axis that emits workspace version 1. Old Orbits ignore the new JSON
   fields but remain unable to start remote sessions during this short window.
2. Install the matching Orbit build on each dev node.
3. Nodes enrolled before environment-specific homes must be explicitly
   re-enrolled with `STELLARC_HOME=~/.stellarc-dev`. Do not copy a production
   identity into development; re-enrollment creates a distinct dev identity
   and updates the dev Axis allowlist.
4. Prove a real explicit-node turn, restart Axis, and repeat it.

The bootstrap service now persists the chosen `STELLARC_HOME`; upgrades no
longer fall back to `~/.stellarc` after the installer exits.
