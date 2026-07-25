#!/usr/bin/env bash
# scripts/install-orbit.sh — one-time curl-able installer for an Stellarc Orbit.
#
# Builds the stellarc-orbit binary from source, installs it with git-hash suffix +
# symlink flip (same choreography as scripts/deploy.sh), installs the systemd
# user unit from the repo (systemd/stellarc-orbit@.service), enables + starts an
# instance, and verifies registration with the Axis by polling /api/nodes.
#
# Idempotent: re-running upgrades the binary and restarts the instance. It never
# duplicates systemd units.
#
# Usage:
#   scripts/install-orbit.sh --axis uds:/home/rpw/.stellarc/control.sock --instance 1
#   scripts/install-orbit.sh --axis iroh:<axis-node-id> --instance 2
#   scripts/install-orbit.sh --dry-run       # print actions without executing
#
# Environment:
#   AXIS_ADDR        same as --axis (flag takes precedence)
#   INSTANCE         same as --instance (default 1)
#   STELLARC_HOME     base dir (default $HOME/.stellarc)
#   STELLARC_AXIS_PORT  Axis API port (default 8799)
#
# Exit codes: 0 success, 1 usage/misuse, 2 prerequisite failure,
#             3 build failure, 4 registration timeout.
set -euo pipefail

# ── Globals ─────────────────────────────────────────────────────────────
DRY_RUN=false
AXIS_ADDR=""
INSTANCE="${INSTANCE:-1}"
STELLARC_HOME="${STELLARC_HOME:-$HOME/.stellarc}"
BIN_DIR=""
AXIS_PORT="${STELLARC_AXIS_PORT:-8799}"
REPO_DIR=""

# ── Pretty output ───────────────────────────────────────────────────────
log()  { printf '\033[1;32m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m⚠\033[0m %s\n' "$*" >&2; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
dry()  { printf '\033[0;90m  [dry-run]\033[0m %s\n' "$*"; }
die()  { err "$*"; exit "${2:-1}"; }

# Execute a command (skipped in dry-run).
run() {
    if $DRY_RUN; then dry "$*"; else "$@"; fi
}

# Execute a command even in dry-run (read-only state checks).
run_force() { "$@"; }

# ── Parse args ──────────────────────────────────────────────────────────
usage() {
    cat <<'EOF'
Usage: install-orbit.sh [OPTIONS]

  --axis ADDR        Axis address: uds:<path> or iroh:<node-id>
                     (env: AXIS_ADDR)
  --instance N       Orbit instance number (env: INSTANCE, default 1)
  --dry-run          Print actions without executing
  -h, --help         Show this help

Examples:
  install-orbit.sh --axis uds:$HOME/.stellarc/control.sock --instance 1
  install-orbit.sh --axis iroh:abc123def456 --instance 2
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --axis)         AXIS_ADDR="${2:-}"; shift 2 ;;
        --instance)     INSTANCE="${2:-}"; shift 2 ;;
        --dry-run)      DRY_RUN=true; shift ;;
        -h|--help)      usage; exit 0 ;;
        *)              err "unknown option: $1"; usage; exit 1 ;;
    esac
done

# Fall back to env, then defaults.
AXIS_ADDR="${AXIS_ADDR:-${AXIS_ADDR:-}}"
INSTANCE="${INSTANCE:-1}"

if [[ -z "$AXIS_ADDR" ]]; then
    die "no --axis address provided (or set AXIS_ADDR env)" 1
fi

BIN_DIR="$STELLARC_HOME/bin"

# ── 1. Platform check ───────────────────────────────────────────────────
check_platform() {
    local arch os
    arch="$(uname -m)"
    os="$(uname -s)"
    if [[ "$os" != "Linux" ]]; then
        die "unsupported OS: $os (Linux only for now)" 2
    fi
    if [[ "$arch" != "x86_64" ]]; then
        die "unsupported arch: $arch (x86_64 only for now)" 2
    fi
    log "Platform OK: $os/$arch"
}

# ── 2. Locate repo + verify build prerequisites ─────────────────────────
locate_repo() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    REPO_DIR="$(cd "$script_dir/.." && pwd)"

    if [[ ! -f "$REPO_DIR/Cargo.toml" ]]; then
        die "could not find Cargo.toml relative to $script_dir — is this inside the stellarc repo?" 2
    fi
    if [[ ! -d "$REPO_DIR/crates/orbit" ]]; then
        die "orbit crate not found at $REPO_DIR/crates/orbit — wrong repo?" 2
    fi

    log "Repo: $REPO_DIR"

    if ! command -v cargo &>/dev/null; then
        cat >&2 <<'MSG'
ERROR: cargo is not on PATH. Install Rust to build stellarc-orbit:

  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

Pre-built release binaries are not yet available (future CI work).
MSG
        die "cargo not found — cannot build stellarc-orbit" 2
    fi

    # tmux: required for persistent operator terminals (ADR 0021 cockpit).
    # Without it the orbit falls back to bare PTY (non-persistent) with a
    # visible badge, so this is a warning, not a hard failure.
    if ! command -v tmux &>/dev/null; then
        log "WARNING: tmux not found — operator terminals will be non-persistent."
        log "  Install tmux for persistent sessions:"
        log "    apt install tmux    # Debian/Ubuntu"
        log "    dnf install tmux    # Fedora/RHEL"
    fi
}

build_and_install() {
    log "Building stellarc-orbit (release)…"
    local target_dir
    target_dir="$(cd "$REPO_DIR" && cargo metadata --no-deps --format-version 1 \
        | python3 -c 'import json, sys; print(json.load(sys.stdin)["target_directory"])')"
    if $DRY_RUN; then
        dry "cd '$REPO_DIR' && cargo build --release -p stellarc-orbit"
    else
        (cd "$REPO_DIR" && cargo build --release -p stellarc-orbit) || die "cargo build failed" 3
    fi

    local git_hash
    if $DRY_RUN; then
        git_hash="dryrun0000000"
        dry "git rev-parse --short=12 HEAD → $git_hash"
    else
        git_hash="$(cd "$REPO_DIR" && git rev-parse --short=12 HEAD)"
    fi

    local target="$BIN_DIR/stellarc-orbit-$git_hash"
    local symlink="$BIN_DIR/stellarc-orbit"

    log "Installing $target"
    run mkdir -p "$BIN_DIR"
    run cp -f "$target_dir/release/stellarc-orbit" "$target"
    run ln -sfn "stellarc-orbit-$git_hash" "$symlink"
    log "  $symlink → stellarc-orbit-$git_hash"
}

# ── 3. Required CLI check ───────────────────────────────────────────────
check_required_clis() {
    # hermes — fail closed (orbit needs it to spawn agent sessions).
    if ! command -v hermes &>/dev/null; then
        err "hermes is not on PATH — orbit requires it to spawn agent sessions."
        err "  Install Hermes Agent: https://hermes-agent.nousresearch.com/docs"
        die "required CLI 'hermes' not found" 2
    fi
    log "Required CLI OK: hermes"

    # jj / gh / bunx — warn only.
    local cli
    for cli in jj gh bunx; do
        if ! command -v "$cli" &>/dev/null; then
            warn "optional CLI '$cli' not found (some agent features may be limited)"
        fi
    done
}

install_agent_adapters() {
    if ! command -v node &>/dev/null || ! command -v npm &>/dev/null; then
        die "Node.js >=22 and npm are required to provision the Claude ACP adapter" 2
    fi
    local node_major
    node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
    if [[ "$node_major" -lt 22 ]]; then
        die "Node.js >=22 is required for Claude ACP (found $(node --version))" 2
    fi

    local source="$REPO_DIR/adapters/claude-agent-acp"
    local target="$STELLARC_HOME/adapters/claude-agent-acp"
    [[ -f "$source/package.json" && -f "$source/package-lock.json" ]] \
        || die "locked Claude ACP adapter manifest is missing" 2
    log "Provisioning locked Claude ACP adapter…"
    run mkdir -p "$target"
    run cp -f "$source/package.json" "$source/package-lock.json" "$target/"
    if $DRY_RUN; then
        dry "npm ci --ignore-scripts --omit=dev --no-audit --no-fund --prefix '$target'"
    else
        npm ci --ignore-scripts --omit=dev --no-audit --no-fund --prefix "$target" \
            || die "Claude ACP adapter install failed" 2
        local installed
        installed="$(node -p "require('$target/node_modules/@agentclientprotocol/claude-agent-acp/package.json').version")"
        [[ "$installed" == "0.58.1" ]] \
            || die "Claude ACP adapter version mismatch: expected 0.58.1, got $installed" 2
        [[ -x "$target/node_modules/.bin/claude-agent-acp" ]] \
            || die "Claude ACP adapter executable missing after npm ci" 2
    fi
    log "  Claude ACP adapter: 0.58.1 (locked, install-time provisioned)"
}

# ── 4. Transport config validation ──────────────────────────────────────
validate_hall_addr() {
    case "$AXIS_ADDR" in
        uds:*)
            local path="${AXIS_ADDR#uds:}"
            if [[ ! -e "$path" ]]; then
                warn "UDS socket $path does not exist yet — axis may not be running"
            fi
            log "Transport: UDS ($path)"
            ;;
        iroh:*)
            local node_id="${AXIS_ADDR#iroh:}"
            if [[ -z "$node_id" ]]; then
                die "iroh transport selected but node-id is empty" 1
            fi
            log "Transport: iroh ($node_id)"
            ;;
        *)
            die "unrecognized --axis format: $AXIS_ADDR (expected uds:<path> or iroh:<node-id>)" 1
            ;;
    esac
}

# ── 5. Install systemd unit + start + verify ────────────────────────────
install_systemd_unit() {
    local unit_src="$REPO_DIR/systemd/stellarc-orbit@.service"
    local unit_dest_dir="$HOME/.config/systemd/user"
    local unit_dest="$unit_dest_dir/stellarc-orbit@.service"

    if [[ ! -f "$unit_src" ]]; then
        die "systemd unit template not found: $unit_src" 2
    fi

    log "Installing systemd user unit (from repo — not duplicated)"
    run mkdir -p "$unit_dest_dir"
    run cp -f "$unit_src" "$unit_dest"
    run systemctl --user daemon-reload
}

# Write a drop-in override for this instance number that sets the correct
# ExecStart args (transport-specific) + node id.
write_instance_override() {
    local node_id="orbit-$INSTANCE"
    local dropin_dir="$HOME/.config/systemd/user/stellarc-orbit@.service.d"
    local dropin_file="$dropin_dir/instance-$INSTANCE.conf"

    local exec_args=""
    case "$AXIS_ADDR" in
        uds:*)
            local socket_path="${AXIS_ADDR#uds:}"
            exec_args="--socket $socket_path --node-id $node_id"
            ;;
        iroh:*)
            exec_args="--axis $AXIS_ADDR --node-id $node_id"
            ;;
    esac

    if $DRY_RUN; then
        dry "write drop-in: $dropin_file"
        dry "  [Service]"
        dry "  ExecStart="
        dry "  ExecStart=$BIN_DIR/stellarc-orbit $exec_args"
        dry "  Environment=STELLARC_NODE_ID=$node_id"
    else
        mkdir -p "$dropin_dir"
        cat > "$dropin_file" <<EOF
# Auto-generated by install-orbit.sh for instance $INSTANCE.
# Do not edit — re-run install-orbit.sh to update.
[Service]
ExecStart=
ExecStart=$BIN_DIR/stellarc-orbit $exec_args
Environment="STELLARC_NODE_ID=$node_id"
EOF
        log "  drop-in: $dropin_file"
    fi
}

enable_and_start() {
    local unit="stellarc-orbit@$INSTANCE.service"
    log "Enabling + starting $unit"
    run systemctl --user enable "$unit"

    # If already running, restart to pick up the new binary/override.
    if run_force systemctl --user is-active --quiet "$unit" 2>/dev/null; then
        log "  already running — restarting to pick up upgrade"
        run systemctl --user restart "$unit"
    else
        run systemctl --user start "$unit"
    fi
}

# Poll Axis /api/nodes for the new orbit node-id (orbit-<INSTANCE>).
verify_registration() {
    local expected_node="orbit-$INSTANCE"
    local token_file="$STELLARC_HOME/token"
    local token=""

    if $DRY_RUN; then
        dry "poll /api/nodes for '$expected_node' (up to 30s)"
        return 0
    fi

    if [[ -f "$token_file" ]]; then
        token="$(cat "$token_file")"
    else
        warn "token file $token_file not found — cannot verify registration via API"
        warn "check manually: curl -H 'Authorization: Bearer <token>' http://127.0.0.1:$AXIS_PORT/api/nodes"
        return 0
    fi

    log "Polling /api/nodes for '$expected_node' (up to 30s)…"

    local i online
    for ((i = 0; i < 30; i++)); do
        online="$(curl -sf -H "Authorization: Bearer $token" \
            "http://127.0.0.1:$AXIS_PORT/api/nodes" 2>/dev/null \
            | grep -c "\"nodeId\":\"$expected_node\"" || true)"

        if [[ "$online" -gt 0 ]]; then
            log "✓ Registered: $expected_node is online"
            return 0
        fi
        sleep 1
    done

    err "orbit '$expected_node' did not register within 30s."
    err "Diagnose with:"
    err "  systemctl --user status stellarc-orbit@$INSTANCE"
    err "  journalctl --user -u stellarc-orbit@$INSTANCE --no-pager -n 50"
    die "registration timeout" 4
}

# ── Main ────────────────────────────────────────────────────────────────
main() {
    log "Stellarc Orbit installer — instance $INSTANCE"
    log "  axis:  $AXIS_ADDR"
    log "  home:  $STELLARC_HOME"
    if $DRY_RUN; then
        log "  mode:  DRY-RUN (no changes will be made)"
    fi

    check_platform
    locate_repo
    check_required_clis
    install_agent_adapters
    validate_hall_addr
    build_and_install
    install_systemd_unit
    write_instance_override
    enable_and_start
    verify_registration

    log "Done. Orbit '$INSTANCE' is installed and registered."
    if $DRY_RUN; then
        warn "dry-run complete — no services were started."
    fi
}

main "$@"
