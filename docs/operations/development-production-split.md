# Olympus development and production operations

## Authority and boundaries

- Git/source authority: `fxcompute-01:/home/rpw/olympus`
- Stable release checkout: `/home/rpw/olympus` on branch `main`
- Live development checkout: `/home/rpw/olympus-dev` on branch `dev`
- Development URL: `https://olympus-dev.entelechia.cloud`
- Production URL: `https://olympus.entelechia.cloud`
- Production runtime/state: Terminus under `/home/rpw/.olympus`
- The Terminus repository is a retained runtime/migration snapshot. Do not edit or build there.
- `fxbuilder` is only an SSH compatibility alias. Active services and fleet records use `fxcompute-01`.

## Development services

```bash
cd /home/rpw/olympus-dev
just dev-status
just dev-restart
just check-fast
```

`/home/rpw/olympus-dev` is a permanent linked worktree of the authoritative
repository, not a second repository. The tracked development units all run from
that worktree and refuse startup unless both worktrees are clean,
`/home/rpw/olympus-dev` is on `dev`, and the stable checkout remains on `main`.
Install or refresh those units with:

```bash
cd /home/rpw/olympus-dev
just dev-install-services
```

The install path requires at least 8 GiB free, runs the locked UI install,
rebuilds Envoy from the committed `dev` source, copies it to an immutable
SHA-qualified path under `~/.olympus-dev/bin`, atomically updates the controlled
dev symlink, installs the tracked units, and restarts only the development
stack. Unit backups are retained under `~/.config/olympus-dev/unit-backups`.
The installer rechecks worktree cleanliness and the captured commit after the
build so a concurrent branch update cannot be mislabeled as that commit.
Failed health or startup restores the previous units and Envoy target before
attempting to restart the prior stack.
The live Playwright suite runs while rollback is still armed; a browser
regression is a failed cutover, not an optional follow-up check.
The same boundary checks every unit independently and verifies that listeners on
8799 and 5177 belong to the Hall and UI systemd cgroups before browser traffic
is accepted.
Hall's static UI fallback and all service working directories point at the dev
worktree. The development UI receives `VITE_OLYMPUS_ENV=dev`; production does
not, so only the development top bar renders the `dev` environment pill.

| Service | Purpose |
|---|---|
| `olympus-dev-hall.service` | Cargo Watch-managed `dev` Hall on `127.0.0.1:8799` |
| `olympus-dev-envoy.service` | `dev` AgentRuntime + JobRunner using `/srv/olympus-dev/jobs` |
| `olympus-dev-ui.service` | `dev` Vite/HMR UI on `127.0.0.1:5177` |
| `fxcompute-01-tunnel.service` | Restricted reverse forwards to Terminus ports 2223 and 8800 |
| `olympus-prod-job-runner.service` | Production Hall JobRunner using `/srv/olympus-prod/jobs` |

Development state is `/home/rpw/.olympus-dev`; its browser credential is in the mode-0600 file `/home/rpw/.config/olympus-dev/admin-credentials`. The development operator token is `/home/rpw/.olympus-dev/token`. Use `olympus-dev-job` for isolated dev jobs.

Cargo targets are separated:

- `/var/lib/olympus/cargo-target-dev`
- `/var/lib/olympus/cargo-target-prod`

Both are bounded by `olympus-build.slice` and use mold plus the local sccache directory `/var/lib/olympus/sccache`.

## Production promotion

```bash
cd /home/rpw/olympus
just promote
```

Feature and integration work lands on `dev`. A production candidate is promoted
from `dev` to `main` through reviewed Git history; development services never
change checkout to follow that promotion. Any emergency `main` hotfix is merged
back into `dev` immediately after release so the branches cannot silently
diverge. Promotion refuses unless the stable
checkout is on `main`, the worktree is clean, and `HEAD` exactly equals freshly
fetched `origin/main`. It runs Rust formatting, clippy, nextest, UI
install/tests/build, and release builds on fxcompute-01. It transfers an
immutable checksummed bundle to Terminus; Terminus only verifies, backs up
SQLite, switches symlinks, restarts services, and runs health gates. Failed
health rolls back the release and database backup.

Do not build with Cargo, rustc, Bun, npm, or Vite on Terminus.

## Recovery

```bash
cd /home/rpw/olympus-dev
./scripts/assert-dev-worktree.sh
systemctl --user restart olympus-dev-hall olympus-dev-envoy olympus-dev-ui
systemctl --user restart fxcompute-01-tunnel
```

If the reverse tunnel is down, inspect `fxcompute-01-tunnel.service` on fxcompute-01. Terminus sshd detects vanished clients in 30 seconds, allowing the reverse ports to rebind after a VM restart.
