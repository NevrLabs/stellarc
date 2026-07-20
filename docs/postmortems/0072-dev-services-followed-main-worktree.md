# 0072 — Development services followed the production-candidate checkout

**Date:** 2026-07-20
**Severity:** High
**Status:** Resolved on `dev`

## Impact

`olympus-dev-hall.service`, `olympus-dev-envoy.service`, and
`olympus-dev-ui.service` all used `/home/rpw/olympus` as their working tree. That
same checkout is the fail-closed `main` checkout used to build production
promotion bundles. Any operator or integration worker changing its branch could
silently move the complete development frontend and backend to a different
revision. Conversely, keeping development changes loaded made the stable
promotion checkout unsuitable for release.

The UI gave no persistent visual indication that the operator was using the
development environment.

During cutover preparation, the tracked UI unit was inactive while an ad-hoc
Vite process from `/home/rpw/olympus/ui` still owned port 5177. That made service
status disagree with the public development UI's actual source provenance.

## Root cause

The original development/production split separated runtime state, ports,
credentials, and Cargo targets, but it did not separate Git worktrees or branch
roles. Development services were created as host-local units rather than
tracked units, so their source path was not reviewed with repository changes.

## Resolution

- `/home/rpw/olympus` remains on the stable `main` branch.
- `/home/rpw/olympus-dev` is a permanent linked worktree on the integration
  `dev` branch.
- All three tracked development units use `/home/rpw/olympus-dev` and run an
  `ExecStartPre` branch assertion.
- The development service installer rebuilds Envoy from `dev`, installs a
  SHA-qualified immutable binary, and atomically moves a controlled dev symlink
  before restart; changing only a static binary's working directory would not
  change its code.
- `olympus-dev-ui.service` sets `VITE_OLYMPUS_ENV=dev`, which renders a quiet
  `dev` pill beside the Olympus mark. Production receives no environment label.
- Port 5177 is returned to the tracked UI unit; ad-hoc Vite processes are not a
  supported development serving path.
- Cutover verifies each unit independently and rejects HTTP listeners outside
  the expected Hall/UI systemd cgroups.
- Operations and browser-QA documentation now use the development worktree.

## Prevention

Development startup fails closed unless both worktrees are clean, the dev
worktree is on `dev`, and the stable worktree is on `main`. Service files are
versioned and installed through `just dev-install-services`, rather than being
maintained only as mutable host state. Port 5177 belongs exclusively to
`olympus-dev-ui.service`.
