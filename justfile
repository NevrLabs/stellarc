set shell := ["/usr/bin/bash", "-euo", "pipefail", "-c"]

default:
    @just --list

# Show all development and production-runner services on fxcompute-01.
dev-status:
    ./scripts/assert-dev-worktree.sh
    systemctl --user --no-pager --full status olympus-dev-hall.service olympus-dev-envoy.service olympus-dev-ui.service olympus-prod-job-runner.service fxcompute-01-tunnel.service

# Install tracked development units, rebuild Envoy from dev, and restart the stack.
dev-install-services:
    ./scripts/install-dev-services.sh

# Restart the isolated development stack only.
dev-restart:
    ./scripts/assert-dev-worktree.sh
    systemctl --user restart olympus-dev-hall.service olympus-dev-envoy.service olympus-dev-ui.service

# Fast local verification loop.
check-fast:
    CARGO_TARGET_DIR=$HOME/.cache/olympus-cargo-target flock $HOME/.cache/olympus-cargo.lock cargo check --workspace
    CARGO_TARGET_DIR=$HOME/.cache/olympus-cargo-target flock $HOME/.cache/olympus-cargo.lock cargo nextest run --workspace
    cd ui && bun run build

# Promote a clean origin/main release to Terminus. Terminus never builds.
promote:
    ./scripts/promote-production.sh
