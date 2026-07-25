set shell := ["/usr/bin/bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Show all development and production-runner services on fxcompute-01.
dev-status:
    systemctl --user --no-pager --full status stellarc-dev-axis.service stellarc-dev-orbit.service stellarc-dev-ui.service stellarc-prod-job-runner.service fxcompute-01-tunnel.service

# Restart the isolated development stack only.
dev-restart:
    systemctl --user restart stellarc-dev-axis.service stellarc-dev-orbit.service stellarc-dev-ui.service

# Fast local verification loop.
check-fast:
    CARGO_HOME=/var/lib/stellarc/cargo-home CARGO_TARGET_DIR=/var/lib/stellarc/cargo-target-dev RUSTUP_HOME=/home/rpw/.rustup cargo check --workspace
    CARGO_HOME=/var/lib/stellarc/cargo-home CARGO_TARGET_DIR=/var/lib/stellarc/cargo-target-dev RUSTUP_HOME=/home/rpw/.rustup cargo nextest run --workspace
    cd ui && bun run build

# Promote a clean origin/main release to Terminus. Terminus never builds.
promote:
    ./scripts/promote-production.sh
