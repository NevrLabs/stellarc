# Stellarc development and production operations

## Authority and boundaries

- Source authority: `fxcompute-01:/home/rpw/stellarc`
- Development URL: `https://stellarc-dev.entelechia.cloud`
- Production URL: `https://stellarc.entelechia.cloud`
- Production runtime/state: Terminus under `/home/rpw/.stellarc`
- The Terminus repository is a retained runtime/migration snapshot. Do not edit or build there.
- `fxbuilder` is only an SSH compatibility alias. Active services and fleet records use `fxcompute-01`.

## Development services

```bash
cd /home/rpw/stellarc
just dev-status
just dev-restart
just check-fast
```

| Service | Purpose |
|---|---|
| `stellarc-dev-axis.service` | Cargo Watch-managed development Axis on `127.0.0.1:8799` |
| `stellarc-dev-orbit.service` | Isolated AgentRuntime + JobRunner using `/srv/stellarc-dev/jobs` |
| `stellarc-dev-ui.service` | Vite/HMR on `127.0.0.1:5177` |
| `fxcompute-01-tunnel.service` | Restricted reverse forwards to Terminus ports 2223 and 8800 |
| `stellarc-prod-job-runner.service` | Production Axis JobRunner using `/srv/stellarc-prod/jobs` |

Development state is `/home/rpw/.stellarc-dev`; its browser credential is in the mode-0600 file `/home/rpw/.config/stellarc-dev/admin-credentials`. The development operator token is `/home/rpw/.stellarc-dev/token`. Use `stellarc-dev-job` for isolated dev jobs.

Cargo targets are separated:

- `/var/lib/stellarc/cargo-target-dev`
- `/var/lib/stellarc/cargo-target-prod`

Both are bounded by `stellarc-build.slice` and use mold plus the local sccache directory `/var/lib/stellarc/sccache`.

## Production promotion

```bash
cd /home/rpw/stellarc
just promote
```

Promotion refuses unless the branch is `main`, the worktree is clean, and `HEAD` exactly equals freshly fetched `origin/main`. It runs Rust formatting, clippy, nextest, UI install/tests/build, and release builds on fxcompute-01. It transfers an immutable checksummed bundle to Terminus; Terminus only verifies, backs up SQLite, switches symlinks, restarts services, and runs health gates. Failed health rolls back the release and database backup.

Do not build with Cargo, rustc, Bun, npm, or Vite on Terminus.

## Recovery

```bash
systemctl --user restart stellarc-dev-axis stellarc-dev-orbit stellarc-dev-ui
systemctl --user restart fxcompute-01-tunnel
```

If the reverse tunnel is down, inspect `fxcompute-01-tunnel.service` on fxcompute-01. Terminus sshd detects vanished clients in 30 seconds, allowing the reverse ports to rebind after a VM restart.
