#!/usr/bin/env bash

assert_dev_unit_active() {
  local unit=$1
  "${OLYMPUS_SYSTEMCTL_BIN:-systemctl}" --user is-active --quiet "$unit" || {
    printf 'Dev service provenance failed: %s is not active\n' "$unit" >&2
    return 1
  }
}

assert_dev_listener_owner() {
  local unit=$1 port=$2
  local systemctl_bin=${OLYMPUS_SYSTEMCTL_BIN:-systemctl}
  local ss_bin=${OLYMPUS_SS_BIN:-ss}
  local proc_root=${OLYMPUS_PROC_ROOT:-/proc}
  local control_group main_pid output pid pid_group
  local -a listener_pids=()

  assert_dev_unit_active "$unit"
  control_group=$("$systemctl_bin" --user show --property=ControlGroup --value "$unit")
  main_pid=$("$systemctl_bin" --user show --property=MainPID --value "$unit")
  [[ -n $control_group && $control_group != / && $main_pid =~ ^[1-9][0-9]*$ ]] || {
    printf 'Dev service provenance failed: %s has no live cgroup/MainPID\n' "$unit" >&2
    return 1
  }

  output=$("$ss_bin" -H -ltnp "sport = :$port")
  mapfile -t listener_pids < <(printf '%s\n' "$output" | grep -o 'pid=[0-9]\+' | cut -d= -f2 | sort -u || true)
  ((${#listener_pids[@]} > 0)) || {
    printf 'Dev service provenance failed: port %s has no visible listener PID\n' "$port" >&2
    return 1
  }

  for pid in "${listener_pids[@]}"; do
    [[ -r "$proc_root/$pid/cgroup" ]] || {
      printf 'Dev service provenance failed: listener PID %s disappeared\n' "$pid" >&2
      return 1
    }
    pid_group=$(awk -F: '$1 == "0" { print $3 }' "$proc_root/$pid/cgroup")
    [[ $pid_group == "$control_group" || $pid_group == "$control_group/"* ]] || {
      printf 'Dev service provenance failed: port %s PID %s belongs to %s, expected %s\n' "$port" "$pid" "$pid_group" "$control_group" >&2
      return 1
    }
  done
}