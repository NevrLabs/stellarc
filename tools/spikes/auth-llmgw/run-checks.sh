#!/usr/bin/env bash
# Runs every check in split-checks.json from the repository root. A check that
# needs PostgreSQL gets its own throwaway cluster, because each one creates the
# same gateway_runtime role. Needs bun, jq and PostgreSQL server binaries.
#   PG_BIN=/usr/lib/postgresql/16/bin tools/spikes/auth-llmgw/run-checks.sh [id ...]
set -uo pipefail
cd "$(dirname "$0")/../../.."
PG_BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
PORT=${PG_PORT:-54329}
LIMIT=$(command -v timeout || command -v gtimeout || true)
root=
stop() {
	[ -n "$root" ] || return 0
	"$PG_BIN/pg_ctl" -D "$root/data" -m immediate stop >/dev/null 2>&1
	rm -rf "$root"
	root=
}
trap stop EXIT

passed=() failed=()
while IFS=$'\t' read -r id path fresh deadline vars; do
	if [ $# -gt 0 ] && [[ " $* " != *" $id "* ]]; then continue; fi
	echo "::group::$id ($path)"
	env=()
	if [ "$fresh" = true ]; then
		root=$(mktemp -d)
		printf 'owner-disposable' >"$root/pw"
		"$PG_BIN/initdb" -D "$root/data" -U owner -A scram-sha-256 --pwfile="$root/pw" -E UTF8 --no-locale --no-sync >/dev/null &&
			"$PG_BIN/pg_ctl" -D "$root/data" -l "$root/log" -o "-p $PORT -k $root -c listen_addresses=127.0.0.1" -w start >/dev/null ||
			{ cat "$root/log" 2>/dev/null; echo "::endgroup::"; failed+=("$id(postgres)"); stop; continue; }
		env+=("SPIKE_OWNER_DSN=postgres://owner:owner-disposable@127.0.0.1:$PORT/postgres"
			"SPIKE_RUNTIME_DSN=postgres://gateway_runtime:disposable-only@127.0.0.1:$PORT/postgres")
	fi
	# shellcheck disable=SC2086 # vars is a space-separated NAME=value list from the manifest
	env ${env[@]+"${env[@]}"} $vars ${LIMIT:+$LIMIT -k 10 $deadline} bun "$path" </dev/null
	code=$?
	echo "::endgroup::"
	if [ $code -eq 0 ]; then passed+=("$id"); else failed+=("$id(exit $code)"); fi
	stop
done < <(jq -r '.checks[] | [.id, .path, .freshPostgresCluster, ([.minimumDeadlineSeconds // 0, 300] | max),
	((.environment // {}) | to_entries | map("\(.key)=\(.value)") | join(" "))] | @tsv' \
	tools/spikes/auth-llmgw/split-checks.json)

echo "passed (${#passed[@]}): ${passed[*]:-none}"
echo "failed (${#failed[@]}): ${failed[*]:-none}"
[ ${#failed[@]} -eq 0 ] && [ ${#passed[@]} -gt 0 ]
