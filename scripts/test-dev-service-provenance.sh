#!/usr/bin/env bash
set -euo pipefail

root=$(mktemp -d "${TMPDIR:-/tmp}/olympus-service-provenance.XXXXXX")
trap 'rm -rf "$root"' EXIT
mkdir -p "$root/proc/4242" "$root/bin"

cat >"$root/bin/systemctl" <<'EOF'
#!/usr/bin/env bash
case "$*" in
  "--user is-active --quiet active.service") exit 0 ;;
  "--user is-active --quiet inactive.service") exit 3 ;;
  "--user show --property=ControlGroup --value active.service") printf '/user.slice/active.service\n' ;;
  "--user show --property=MainPID --value active.service") printf '111\n' ;;
  *) exit 1 ;;
esac
EOF
cat >"$root/bin/ss" <<'EOF'
#!/usr/bin/env bash
printf 'LISTEN 0 128 127.0.0.1:5177 0.0.0.0:* users:(("node",pid=4242,fd=9))\n'
EOF
chmod +x "$root/bin/systemctl" "$root/bin/ss"

export OLYMPUS_SYSTEMCTL_BIN="$root/bin/systemctl"
export OLYMPUS_SS_BIN="$root/bin/ss"
export OLYMPUS_PROC_ROOT="$root/proc"
source "$(dirname "$0")/dev-service-provenance.sh"

assert_dev_unit_active active.service
if assert_dev_unit_active inactive.service >/dev/null 2>&1; then
  printf 'Provenance test failed: inactive unit was accepted\n' >&2
  exit 1
fi

printf '0::/foreign.service\n' >"$root/proc/4242/cgroup"
if assert_dev_listener_owner active.service 5177 >/dev/null 2>&1; then
  printf 'Provenance test failed: foreign listener was accepted\n' >&2
  exit 1
fi

printf '0::/user.slice/active.service/child\n' >"$root/proc/4242/cgroup"
assert_dev_listener_owner active.service 5177
printf 'Olympus dev service provenance tests passed\n'